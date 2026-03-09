"""
VLLMEngine — wrapper del motor de inferencia con detección automática de backend.

  CPU  → transformers.pipeline (bloqueante, wrapeado en asyncio.to_thread)
  GPU  → vLLM AsyncLLMEngine (asíncrono nativo, PagedAttention)
"""
import asyncio
import gc
import logging
import uuid
from pathlib import Path

import torch

logger = logging.getLogger(__name__)

MODELS_DIR = Path("models")
_CUDA_AVAILABLE = torch.cuda.is_available()

_VLLM_AVAILABLE = False
try:
    import vllm  # noqa: F401
    _VLLM_AVAILABLE = True
except ImportError:
    pass

if _CUDA_AVAILABLE and not _VLLM_AVAILABLE:
    logger.warning("[Engine] CUDA detectada pero vLLM no está instalado. Usando transformers como fallback. Para habilitar vLLM: uv add vllm")

logger.info("[Engine] Backend seleccionado: " + ("vLLM (GPU)" if _VLLM_AVAILABLE else "transformers (CPU)"))


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
        async with self._swap_lock:
            if self._current_model_id:
                await self._unload()
            if _VLLM_AVAILABLE and _CUDA_AVAILABLE:
                await self._load_vllm(model_id, dtype)
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

        model_path = MODELS_DIR / model_id
        num_gpus = max(torch.cuda.device_count(), 1)
        args = AsyncEngineArgs(
            model=str(model_path),
            dtype=dtype,
            gpu_memory_utilization=0.9,
            tensor_parallel_size=num_gpus,
            trust_remote_code=True,
        )
        logger.info(f"[Engine] Cargando con vLLM en {num_gpus} GPU(s): {model_id}")
        self._vllm_engine = await asyncio.to_thread(AsyncLLMEngine.from_engine_args, args)
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
        tools: schemas en formato OpenAI. Se pasa a apply_chat_template si el modelo lo soporta.
        """
        if not self.is_ready:
            raise RuntimeError("No hay modelo cargado. Llama load() primero.")
        if _VLLM_AVAILABLE and self._vllm_engine:
            return await self._generate_vllm(messages, max_new_tokens, temperature, tools)
        return await self._generate_transformers(messages, max_new_tokens, temperature, tools)

    async def _generate_vllm(self, messages: list[dict], max_new_tokens: int, temperature: float, tools: list | None) -> str:
        """Generación con vLLM."""
        from vllm import SamplingParams

        tokenizer = await asyncio.to_thread(self._vllm_engine.get_tokenizer)
        prompt = self._apply_template(tokenizer, messages, tools)
        params = SamplingParams(max_tokens=max_new_tokens, temperature=temperature)
        outputs = []
        async for output in self._vllm_engine.generate(prompt, params, request_id=str(uuid.uuid4())):
            outputs.append(output)
        return outputs[-1].outputs[0].text

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
        Aplica el chat template con soporte nativo de tools cuando el modelo lo soporta.
        Fallback silencioso si el template no acepta tools.
        """
        if tools:
            try:
                return tokenizer.apply_chat_template(messages, tools=tools, tokenize=False, add_generation_prompt=True)
            except Exception:
                logger.warning("[Engine] El modelo no soporta tool calling nativo en su chat template. Usando template sin tools.")
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
