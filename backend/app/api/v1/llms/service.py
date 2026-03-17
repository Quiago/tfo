"""
llms/service.py — lógica de dominio para gestión de modelos.

Qué hace este módulo (y qué NO hace):
  ✓ Define el catálogo de modelos disponibles
  ✓ Descarga modelos desde HuggingFace al startup
  ✓ Valida que un modelo existe antes de cargar
  ✓ Persiste el estado (último modelo usado)
  ✓ Expone health + memory stats formateados para HTTP
  ✗ NO sabe cómo cargar tensores en memoria (eso es engine.py)
  ✗ NO sabe nada de HTTP (eso es router.py)
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path

import psutil
import torch

from fastapi import HTTPException, status

from app.api.v1.llms import exceptions
from app.api.v1.llms.engine import MODELS_DIR, engine
from app.api.v1.llms.schemas import CatalogResponse, HealthResponse, ModelInfo

logger = logging.getLogger(__name__)

STATE_FILE = Path("llm_state.json")


# ---------------------------------------------------------------------------
# Catálogo de modelos
#
# Aquí vive la definición de qué modelos ofrece el sistema.
# Para agregar un modelo: una entrada aquí. Nada más cambia.
#
# Los 3 modelos actuales están elegidos para correr en CPU con 16GB RAM.
# Solo UN modelo cargado a la vez → el swap libera antes de cargar.
#
# Para producción GPU: cambia dtype a "float16", agrega quantization="awq"
# y usa modelos más grandes (Llama 3 8B, Qwen 2.5 7B, Mistral 7B, etc.)
# ---------------------------------------------------------------------------

@dataclass
class ModelConfig:
    id: str
    repo_id: str                      # HuggingFace "org/nombre"
    display_name: str
    description: str
    context_length: int
    memory_required_gb: float         # RAM en CPU float32 / VRAM en GPU float16
    supports_tools: bool = False
    dtype: str = "float32"
    quantization: str | None = None   # "awq" | "gptq" | None (solo GPU + vLLM)


CATALOG: dict[str, ModelConfig] = {
    "mistral-7b-awq": ModelConfig(
        id="mistral-7b-awq",
        repo_id="TheBloke/Mistral-7B-Instruct-v0.2-AWQ",
        display_name="Mistral 7B AWQ",
        description=(
            "Arquitectura optimizada Grouped-Query Attention. Muy eficiente, "
            "ideal para T4 con holgura. ~5 GB VRAM, 8K contexto."
        ),
        context_length=8192,
        memory_required_gb=5.0,
        supports_tools=True,
        dtype="float16",
        quantization="awq",
    ),
    "nemotron-nano-9b-awq": ModelConfig(
        id="nemotron-nano-9b-awq",
        repo_id="cyankiwi/NVIDIA-Nemotron-Nano-9B-v2-AWQ-4bit",
        display_name="Nemotron Nano 9B AWQ",
        description=(
            "Modelo NVIDIA híbrido Mamba-2+Attention, superior a Qwen7B en coding/math. "
            "AWQ 4-bit para <8GB VRAM en T4/RTX. Soporta tools y reasoning. ~6 GB VRAM, 128K contexto."
        ),
        context_length=131072,
        memory_required_gb=6.0,
        supports_tools=True,
        dtype="float16",
        quantization="awq",
    ),
    "qwen3-8b-awq": ModelConfig(
        id="qwen3-8b-awq",
        repo_id="Qwen/Qwen3-8B-AWQ",
        display_name="Qwen3 8B AWQ",
        description=(
            "Balance óptimo calidad/velocidad en T4. 4-bit AWQ, "
            "soporta tool calling nativo y reasoning mode. ~10 GB VRAM."
        ),
        context_length=32000,
        memory_required_gb=10.0,
        supports_tools=True,
        dtype="float16",
        quantization="awq",
    ),
}


DEFAULT_MODEL_ID = "qwen3-8b-awq"


# ---------------------------------------------------------------------------
# Estado persistente
# ---------------------------------------------------------------------------

def _save_state(model_id: str) -> None:
    """Guarda el último modelo usado para restaurarlo en el próximo startup."""
    STATE_FILE.write_text(json.dumps({"last_model": model_id}))


def _load_state() -> str | None:
    """Devuelve el id del último modelo usado, o None si es primera vez."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text()).get("last_model")
    return None


# ---------------------------------------------------------------------------
# Startup — llamado desde lifespan en main.py
# ---------------------------------------------------------------------------

async def startup() -> None:
    """
    Punto de entrada del lifespan. Llamado UNA VEZ al arrancar el servidor.

    Orden de prioridad — el modelo queda listo en RAM lo antes posible:
      1. Crea el directorio de modelos.
      2. Descarga SOLO el modelo prioritario (último usado → default).
      3. Carga ese modelo en RAM — a partir de aquí el chat ya funciona.
      4. Descarga los modelos restantes del catálogo en segundo plano.

    El servidor acepta requests desde el principio (main.py usa create_task).
    """
    MODELS_DIR.mkdir(exist_ok=True)

    # ── Paso 1: decidir qué modelo arrancar ───────────────────────────────────
    model_to_load = _load_state() or DEFAULT_MODEL_ID
    if model_to_load not in CATALOG:
        model_to_load = DEFAULT_MODEL_ID

    # ── Paso 2: descargar SOLO el modelo prioritario (si no está en disco) ────
    priority_config = CATALOG[model_to_load]
    await _download_if_missing(model_to_load, priority_config)

    # ── Paso 3: cargarlo en RAM — el chat ya puede responder ─────────────────
    model_path = MODELS_DIR / model_to_load
    if model_path.exists() and _has_weights(model_path):
        logger.info(f"[LLMs] Auto-cargando modelo al startup: {model_to_load}")
        try:
            await load_model(model_to_load)
            logger.info(f"[LLMs] Modelo listo en RAM: {model_to_load}")
        except Exception as exc:
            logger.error(f"[LLMs] Error auto-cargando '{model_to_load}': {exc}")
    else:
        logger.warning(f"[LLMs] No se puede auto-cargar '{model_to_load}': pesos no encontrados tras la descarga.")

    # ── Paso 4: descargar el resto del catálogo en segundo plano ─────────────
    remaining = [
        (mid, cfg) for mid, cfg in CATALOG.items() if mid != model_to_load
    ]
    if remaining:
        await asyncio.gather(*[_download_if_missing(mid, cfg) for mid, cfg in remaining])



def _has_weights(path: Path) -> bool:
    """
    Verifica que el directorio contiene pesos del modelo.
    No basta con que el directorio exista — puede tener solo config/tokenizer
    si una descarga previa fue parcial o usó ignore_patterns incorrectos.
    """
    return any(path.glob("*.safetensors")) or any(path.glob("*.bin"))


async def _download_if_missing(model_id: str, config: ModelConfig) -> None:
    model_path = MODELS_DIR / model_id

    if model_path.exists() and _has_weights(model_path):
        logger.info(f"[LLMs] Ya en disco: {model_id}")
        return

    logger.info(f"[LLMs] Descargando {config.repo_id} → {model_path} ...")
    try:
        from huggingface_hub import snapshot_download

        await asyncio.to_thread(
            snapshot_download,
            repo_id=config.repo_id,
            local_dir=str(model_path),
            # Excluimos solo archivos legacy de PyTorch puro y carpetas de
            # checkpoints originales. Conservamos *.bin porque no todos los
            # modelos tienen safetensors (ej: TinyLlama solo tiene .bin).
            ignore_patterns=["*.pt", "original/*", "*.gguf"],
        )
        logger.info(f"[LLMs] Descarga completa: {model_id}")
    except Exception as exc:
        # No abortamos el startup si falla una descarga.
        # El servidor arranca con los modelos disponibles.
        logger.error(f"[LLMs] Error descargando {model_id}: {exc}")


# ---------------------------------------------------------------------------
# Operaciones de dominio — llamadas desde router.py
# ---------------------------------------------------------------------------

async def load_model(model_id: str) -> None:
    """
    Valida que el modelo existe y ordena al engine cargarlo.
    Persiste el cambio en llm_state.json.
    """
    if model_id not in CATALOG:
        raise exceptions.ModelNotInCatalog

    model_path = MODELS_DIR / model_id
    if not model_path.exists() or not _has_weights(model_path):
        raise exceptions.ModelNotDownloaded

    # Delegamos el swap al engine (que maneja el Lock internamente)
    config = CATALOG[model_id]
    try:
        await engine.load(model_id, config.dtype)
    except Exception as exc:
        logger.error("[LLMs] engine.load failed for %s: %s", model_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error cargando el modelo '{model_id}': {exc}",
        )
    _save_state(model_id)


def get_catalog() -> CatalogResponse:
    """Devuelve el catálogo completo con el estado actual de cada modelo."""
    models = [
        ModelInfo(
            id=config.id,
            display_name=config.display_name,
            description=config.description,
            context_length=config.context_length,
            memory_required_gb=config.memory_required_gb,
            supports_tools=config.supports_tools,
            quantization=config.quantization,
            is_loaded=(config.id == engine.current_model_id),
        )
        for config in CATALOG.values()
    ]
    return CatalogResponse(
        models=models,
        default_model=DEFAULT_MODEL_ID,
        current_model=engine.current_model_id,
    )


def get_health() -> HealthResponse:
    """
    Estado del engine + métricas de memoria del sistema.

    En producción esto alimentaría un dashboard de monitoring (Grafana).
    memory_required_gb del modelo actual ayuda a predecir si hay RAM
    suficiente para un swap sin matar el proceso.
    """
    mem = psutil.virtual_memory()

    status = "ready"
    if engine.swap_in_progress:
        status = "swap_in_progress"
    elif not engine.is_ready:
        status = "no_model_loaded"

    health = HealthResponse(
        status=status,
        backend=engine.backend,
        current_model=engine.current_model_id,
        swap_in_progress=engine.swap_in_progress,
        memory={
            "total_gb": round(mem.total / 1e9, 2),
            "available_gb": round(mem.available / 1e9, 2),
            "used_percent": mem.percent,
            # Cuánta RAM necesita el modelo actual (para saber si hay margen)
            "current_model_gb": (
                CATALOG[engine.current_model_id].memory_required_gb
                if engine.current_model_id
                else None
            ),
        },
    )

    # 🚀 GPU: estas métricas son las más críticas en producción
    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        health.gpu = {
            "name": props.name,
            "vram_total_gb": round(props.total_memory / 1e9, 2),
            "vram_used_gb": round(torch.cuda.memory_allocated(0) / 1e9, 2),
            "vram_free_gb": round(
                (props.total_memory - torch.cuda.memory_allocated(0)) / 1e9, 2
            ),
        }

    return health
