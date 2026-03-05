"""
knowledge_base/embedder.py — Backend de embeddings para RAG.

Patrón Strategy + Registry + Singleton.
"""
import json
import logging
from abc import ABC, abstractmethod

import numpy as np

logger = logging.getLogger(__name__)


class EmbedderBackend(ABC):
    """Contrato para cualquier backend de embeddings."""

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Devuelve una lista de vectores (uno por texto)."""
        ...

    def similarity(self, query_vec: list[float], corpus_vecs: list[list[float]]) -> list[float]:
        """
        Cosine similarity entre query_vec y cada vector en corpus_vecs.
        Implementación por defecto con numpy.
        """
        q = np.array(query_vec, dtype=np.float32)
        c = np.array(corpus_vecs, dtype=np.float32)
        q_norm = np.linalg.norm(q)
        c_norms = np.linalg.norm(c, axis=1)
        with np.errstate(divide="ignore", invalid="ignore"):
            scores = np.nan_to_num(np.dot(c, q) / (c_norms * q_norm), nan=0.0)
        return scores.tolist()

    def embed_and_store(self, texts: list[str]) -> list[str]:
        """Convierte textos a embeddings y los serializa como JSON para SQLite."""
        vecs = self.embed(texts)
        return [json.dumps(v) for v in vecs]


class SentenceTransformerEmbedder(EmbedderBackend):
    """
    Embeddings con sentence-transformers / all-MiniLM-L6-v2.
    80 MB, 384 dimensiones. Lazy-load en primer uso.
    """

    _MODEL_NAME = "all-MiniLM-L6-v2"

    def __init__(self) -> None:
        self._model = None

    def _ensure_model(self) -> None:
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            logger.info(f"[Embedder] Cargando modelo: {self._MODEL_NAME}")
            self._model = SentenceTransformer(self._MODEL_NAME)
            logger.info("[Embedder] Modelo listo.")

    def embed(self, texts: list[str]) -> list[list[float]]:
        self._ensure_model()
        return self._model.encode(texts, convert_to_numpy=True).tolist()


_REGISTRY: dict[str, type[EmbedderBackend]] = {
    "sentence-transformers": SentenceTransformerEmbedder,
}

_instance: EmbedderBackend | None = None


def get_embedder(backend: str = "sentence-transformers") -> EmbedderBackend:
    """
    Devuelve el embedder activo (singleton).
    El modelo se carga en memoria la primera vez que se llama embed().
    """
    global _instance
    if _instance is None:
        cls = _REGISTRY.get(backend)
        if not cls:
            available = ", ".join(_REGISTRY.keys())
            raise ValueError(f"Unknown embedder backend '{backend}'. Available: {available}")
        logger.info(f"[Embedder] Backend: {backend}")
        _instance = cls()
    return _instance
