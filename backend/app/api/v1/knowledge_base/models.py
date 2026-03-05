"""
knowledge_base/models.py — Document y DocumentChunk persistidos en DB.
"""
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class Document(SQLModel, table=True):
    """Metadatos de un documento subido al knowledge base."""

    id: str = Field(primary_key=True)
    title: str
    filename: str
    mime_type: str
    chunk_count: int = 0
    uploaded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DocumentChunk(SQLModel, table=True):
    """
    Fragmento de texto de un documento con su embedding vectorial.

    El embedding se almacena como JSON (list[float]) para compatibilidad
    con SQLite. Upgrade path: migrar a Qdrant/Chroma para escala.
    """

    __tablename__ = "document_chunk"

    id: int = Field(default=None, primary_key=True)
    document_id: str = Field(foreign_key="document.id", index=True)
    chunk_index: int
    content: str
    embedding: str | None = None
