"""
VLLMEngine — wrapper del motor de inferencia con detección automática de backend.

  CPU  → transformers.pipeline (bloqueante, wrapeado en asyncio.to_thread)
  GPU  → vLLM AsyncLLMEngine (asíncrono nativo, PagedAttention, CUDA Graphs)
"""
import asyncio
import gc
import logging
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

import os

import torch

logger = logging.getLogger(__name__)
torch.cuda.empty_cache()

# Override via MODELS_DIR env var to point at a RunPod network volume,
# e.g. MODELS_DIR=/runpod-volume/models
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "models"))
_CUDA_AVAILABLE = torch.cuda.is_available()


_VLLM_AVAILABLE = False
try:
    import vllm  # noqa: F401
    _VLLM_AVAILABLE = True
except ImportError:
    pass

if _CUDA_AVAILABLE and not _VLLM_AVAILABLE:
    logger.warning("[Engine] CUDA detectada pero vLLM no está instalado. Usando transformers como fallback. Para habilitar vLLM: uv add vllm")

logger.info(
    "[Engine] Diagnóstico al importar — CUDA=%s, vLLM=%s, multiproc_method=%s, VLLM_WORKER_MULTIPROC_METHOD=%s",
    _CUDA_AVAILABLE,
    _VLLM_AVAILABLE,
    __import__("multiprocessing").get_start_method(allow_none=True),
    __import__("os").environ.get("VLLM_WORKER_MULTIPROC_METHOD", "<no establecido>"),
)
logger.info("[Engine] Backend seleccionado: %s", "vLLM (GPU)" if (_VLLM_AVAILABLE and _CUDA_AVAILABLE) else "transformers (CPU)")


class VLLMEngine:
    """
    Gestiona UN modelo cargado en memoria a la vez.
    Selecciona automáticamente vLLM (GPU) o transformers (CPU).
    """

    def __init__(self) -> None:
        self._pipeline = None
        self._vllm_engine = None
        self._current_model_id: str | None = None
        self._swap_lock = asyncio.Lock()

    async def load(self, model_id: str, dtype: str = "float32") -> None:
        """Carga un modelo descargando el actual. Thread-safe via Lock."""
        import multiprocessing as _mp
        logger.info(
            "[Engine] load() — model_id=%s dtype=%s CUDA=%s vLLM=%s multiproc=%s",
            model_id, dtype, _CUDA_AVAILABLE, _VLLM_AVAILABLE,
            _mp.get_start_method(allow_none=True),
        )
        async with self._swap_lock:
            if self._current_model_id:
                await self._unload()
            if _VLLM_AVAILABLE and _CUDA_AVAILABLE:
                try:
                    await self._load_vllm(model_id, dtype)
                except Exception as exc:
                    logger.warning(
                        "[Engine] vLLM falló al inicializar (%s). "
                        "Causa común: VRAM insuficiente, versión CUDA incompatible, "
                        "o proceso vLLM terminado inesperadamente. "
                        "Intentando fallback con transformers...",
                        exc,
                        exc_info=True,
                    )
                    await self._load_transformers(model_id, dtype)
            else:
                await self._load_transformers(model_id, dtype)

    async def _unload(self) -> None:
        """
        Libera el modelo activo de memoria.
        gc.collect() fuerza la liberación inmediata.
        torch.cuda.empty_cache() devuelve la VRAM al driver.
        """
        logger.info(f"[Engine] Descargando de memoria: {self._current_model_id}")
        self._pipeline = None
        self._vllm_engine = None
        self._current_model_id = None
        gc.collect()
        if _CUDA_AVAILABLE:
            torch.cuda.empty_cache()

    async def _load_vllm(self, model_id: str, dtype: str) -> None:
        """Carga el modelo con vLLM AsyncLLMEngine (GPU)."""
        from vllm import AsyncEngineArgs, AsyncLLMEngine
        os.environ["VLLM_WORKER_MULTIPROC_METHOD"] = "spawn"

        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            logger.info(f"[Engine] VRAM libre antes de cargar: {free/1024**3:.1f}/{total/1024**3:.1f} GiB")

        model_path = MODELS_DIR / model_id
        num_gpus = max(torch.cuda.device_count(), 1)
        args = AsyncEngineArgs(
            model=str(model_path),
            dtype=dtype,
            quantization="awq",            # Explicit AWQ quantization hint
            gpu_memory_utilization=0.85,   # More headroom for KV cache (was 0.75)
            max_model_len=8192,            # Realistic for T4 16GB with 7-10B models (was 32768)
            enforce_eager=False,           # Enable CUDA Graphs for 30-40% throughput gain (was True)
            tensor_parallel_size=num_gpus,
            trust_remote_code=True,
        )
        logger.info(f"[Engine] Cargando con vLLM en {num_gpus} GPU(s): {model_id}")
        self._vllm_engine = await asyncio.to_thread(AsyncLLMEngine.from_engine_args, args)

        if hasattr(self._vllm_engine, 'engine_core'):
            torch.cuda.empty_cache()

        self._current_model_id = model_id
        logger.info(f"[Engine] Listo (vLLM): {model_id}")

    async def _load_transformers(self, model_id: str, dtype: str) -> None:
        """Carga el modelo con transformers.pipeline (CPU)."""
        import transformers

        model_path = MODELS_DIR / model_id
        logger.info(f"[Engine] Cargando con transformers (CPU): {model_id}")

        def _load():
            # device_map="auto" requires `accelerate`; on CPU just use device=-1
            load_kwargs: dict = {
                "dtype": torch.float32,
                "trust_remote_code": True,
            }
            if _CUDA_AVAILABLE:
                load_kwargs["device_map"] = "auto"   # GPU: accelerate is expected
            else:
                load_kwargs["device"] = -1            # CPU: no accelerate needed
            return transformers.pipeline(
                "text-generation",
                model=str(model_path),
                **load_kwargs,
            )

        self._pipeline = await asyncio.to_thread(_load)
        self._current_model_id = model_id
        logger.info(f"[Engine] Listo (transformers): {model_id}")

    async def generate(self, messages: list[dict], max_new_tokens: int = 512, temperature: float = 0.7, tools: list | None = None) -> str:
        """
        Genera texto dado un historial en formato OpenAI messages.
        Bloquea hasta que la generación completa. Úsalo cuando necesitas el texto
        completo antes de proceder (p.ej. detección de tool calls en el loop del agente).
        tools: schemas en formato OpenAI. Se pasa a apply_chat_template si el modelo lo soporta.
        """
        logger.debug(
            "[Engine] generate() — is_ready=%s backend=%s model=%s msgs=%d tools=%s",
            self.is_ready, self.backend, self._current_model_id, len(messages),
            len(tools) if tools else 0,
        )
        if not self.is_ready:
            raise RuntimeError("No hay modelo cargado. Llama load() primero.")
        if _VLLM_AVAILABLE and self._vllm_engine:
            return await self._generate_vllm(messages, max_new_tokens, temperature, tools)
        return await self._generate_transformers(messages, max_new_tokens, temperature, tools)

    async def generate_stream(
        self,
        messages: list[dict],
        max_new_tokens: int = 512,
        temperature: float = 0.7,
        tools: list | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Generador asíncrono que produce deltas de texto conforme el modelo genera.

        En GPU (vLLM): primer delta llega tras el prefill (~0.3-0.8s en T4).
        En CPU (transformers): no hay streaming real — produce el texto completo
        como un único chunk al finalizar.

        Úsalo en el chat streaming para que el usuario vea tokens en tiempo real.
        El agente sigue usando generate() porque necesita el JSON completo para
        parsear tool calls antes de actuar.
        """
        if not self.is_ready:
            raise RuntimeError("No hay modelo cargado. Llama load() primero.")
        if _VLLM_AVAILABLE and self._vllm_engine:
            async for delta in self._generate_vllm_stream(messages, max_new_tokens, temperature, tools):
                yield delta
        else:
            # CPU: no hay streaming nativo en transformers — emitimos todo de golpe
            full = await self._generate_transformers(messages, max_new_tokens, temperature, tools)
            yield full

    async def _generate_vllm(self, messages: list[dict], max_new_tokens: int, temperature: float, tools: list | None) -> str:
        """Generación bloqueante con vLLM (espera toda la salida)."""
        from vllm import SamplingParams

        tokenizer = await asyncio.to_thread(self._vllm_engine.get_tokenizer)
        prompt = self._apply_template(tokenizer, messages, tools)
        params = SamplingParams(max_tokens=max_new_tokens, temperature=temperature)
        outputs = []
        async for output in self._vllm_engine.generate(prompt, params, request_id=str(uuid.uuid4())):
            outputs.append(output)
        return outputs[-1].outputs[0].text

    async def _generate_vllm_stream(
        self,
        messages: list[dict],
        max_new_tokens: int,
        temperature: float,
        tools: list | None,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming real de tokens desde vLLM.
        vLLM devuelve texto ACUMULADO en cada output; calculamos el delta.
        """
        from vllm import SamplingParams

        tokenizer = await asyncio.to_thread(self._vllm_engine.get_tokenizer)
        prompt = self._apply_template(tokenizer, messages, tools)
        params = SamplingParams(max_tokens=max_new_tokens, temperature=temperature)

        prev_len = 0
        async for output in self._vllm_engine.generate(prompt, params, request_id=str(uuid.uuid4())):
            current_text = output.outputs[0].text
            delta = current_text[prev_len:]
            prev_len = len(current_text)
            if delta:
                yield delta

    async def _generate_transformers(self, messages: list[dict], max_new_tokens: int, temperature: float, tools: list | None) -> str:
        """Generación con transformers (CPU). Bloqueante → wrapeado en to_thread."""
        tokenizer = self._pipeline.tokenizer
        prompt = self._apply_template(tokenizer, messages, tools)

        def _run():
            outputs = self._pipeline(
                prompt,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=False,
                return_full_text=False,
            )
            return outputs[0]["generated_text"]

        return await asyncio.to_thread(_run)

    @staticmethod
    def _apply_template(tokenizer, messages: list[dict], tools: list | None) -> str:
        """
        Aplica el chat template. Intenta inyectar tools= nativamente; si el
        tokenizer no lo soporta, cae al template sin tools (los schemas ya están
        en el system prompt como texto via context.py, así que el modelo los ve).
        """
        if tools:
            try:
                prompt = tokenizer.apply_chat_template(
                    messages, tools=tools, tokenize=False, add_generation_prompt=True
                )
                logger.debug("[Engine] Chat template aplicado con tools nativos (%d schemas).", len(tools))
                return prompt
            except Exception as exc:
                logger.warning(
                    "[Engine] Template nativo de tools falló (%s). "
                    "El modelo usará el texto del system prompt para saber qué tools existen.",
                    exc,
                )
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    @property
    def current_model_id(self) -> str | None:
        return self._current_model_id

    @property
    def is_ready(self) -> bool:
        return self._pipeline is not None or self._vllm_engine is not None

    @property
    def swap_in_progress(self) -> bool:
        return self._swap_lock.locked()

    @property
    def backend(self) -> str:
        """Devuelve el backend activo."""
        return "vllm" if (_VLLM_AVAILABLE and _CUDA_AVAILABLE) else "transformers"


engine = VLLMEngine()
