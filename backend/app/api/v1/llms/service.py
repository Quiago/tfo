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
    "tinyllama-1.1b": ModelConfig(
        id="tinyllama-1.1b",
        repo_id="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        display_name="TinyLlama 1.1B Chat",
        description="El más rápido. Ideal para desarrollo y pruebas. ~4 GB RAM.",
        context_length=2048,
        memory_required_gb=4.0,
        supports_tools=False,
    ),
    "gemma-2b-it": ModelConfig(
        id="gemma-2b-it",
        repo_id="google/gemma-2b-it",
        display_name="Gemma 2B Instruct",
        description=(
            "Modelo ligero de Google (Gemma 2B instruccional). "
            "Muy mejor calidad que TinyLlama, sigue siendo usable en CPU. "
            "~5–6 GB RAM, contexto 8K."
        ),
        context_length=8192,
        memory_required_gb=6.0,
        supports_tools=False,
        dtype="float16",  # ajusta según cómo cargues el modelo
    ),
    "qwen2.5-1.5b": ModelConfig(
        id="qwen2.5-1.5b",
        repo_id="Qwen/Qwen2.5-1.5B-Instruct",
        display_name="Qwen 2.5 1.5B Instruct",
        description=(
            "El más capaz del catálogo CPU. Soporta tool calling "
            "(necesario para consultas de sensor_data en tiempo real). ~6 GB RAM."
        ),
        context_length=32768,
        memory_required_gb=6.0,
        supports_tools=True,
    ),
}

DEFAULT_MODEL_ID = "tinyllama-1.1b"


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

    Orden:
    1. Crea el directorio local de modelos si no existe.
    2. Descarga en paralelo los modelos del catálogo que falten en disco.

    No se carga ningún modelo en RAM al arrancar (lazy loading).
    El primer POST /llms/load carga el modelo elegido bajo demanda.
    Esto evita consumir varios GB de RAM antes de que haya requests reales.
    """
    MODELS_DIR.mkdir(exist_ok=True)
    await _download_all_catalog_models()
    logger.info("[LLMs] Startup completo. Ningún modelo en RAM (lazy load).")


async def _download_all_catalog_models() -> None:
    """
    Descarga todos los modelos del catálogo que no estén en disco.

    Por qué asyncio.gather: las descargas son I/O independiente entre sí.
    gather las lanza en "paralelo" (en realidad son corutinas concurrentes
    sobre el mismo event loop, pero snapshot_download corre en threads).
    Esto reduce el tiempo total de startup si hay varios modelos que bajar.

    snapshot_download descarga TODOS los archivos del repo HuggingFace:
    pesos safetensors, tokenizer, config.json, generation_config.json, etc.
    Los guarda en MODELS_DIR/<model_id>/ para que el engine los encuentre.
    """
    tasks = [_download_if_missing(model_id, config) for model_id, config in CATALOG.items()]
    await asyncio.gather(*tasks)


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
    await engine.load(model_id, config.dtype)
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
