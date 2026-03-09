"""
knowledge_base/service.py — Lógica de negocio del dominio knowledge base.
"""
import json
import logging
from uuid import uuid4

from fastapi import UploadFile
from sqlmodel import Session, select

from app.api.v1.knowledge_base.chunker import chunk_text
from app.api.v1.knowledge_base.embedder import get_embedder
from app.api.v1.knowledge_base.exceptions import DocumentNotFound
from app.api.v1.knowledge_base.extractor import extract_text
from app.api.v1.knowledge_base.models import Document, DocumentChunk
from app.api.v1.knowledge_base.schemas import SearchResult

logger = logging.getLogger(__name__)


async def upload_document(file: UploadFile, title: str, user_id: str, session: Session) -> Document:
    """
    Procesa un archivo y lo indexa en el knowledge base.
    Eleva UnsupportedFileType si el MIME no está soportado.
    """
    content = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    logger.info(
        "upload_attempt — filename=%s mime=%s size=%d user=%s",
        file.filename, mime_type, len(content), user_id,
    )
    text = extract_text(content, mime_type)
    chunks = chunk_text(text)
    embedder = get_embedder()
    embeddings = embedder.embed_and_store(chunks)

    doc = Document(
        id=uuid4().hex,
        title=title,
        filename=file.filename or "unknown",
        mime_type=mime_type,
        chunk_count=len(chunks),
        uploaded_by=user_id,
    )
    session.add(doc)
    session.flush()

    for i, (chunk_content, emb) in enumerate(zip(chunks, embeddings)):
        session.add(DocumentChunk(document_id=doc.id, chunk_index=i, content=chunk_content, embedding=emb))

    session.commit()
    session.refresh(doc)
    logger.info("document_uploaded", extra={"doc_id": doc.id, "chunks": len(chunks), "user_id": user_id})
    return doc


def list_documents(session: Session) -> list[Document]:
    return list(session.exec(select(Document).order_by(Document.created_at.desc())).all())


def get_document(doc_id: str, session: Session) -> Document:
    doc = session.get(Document, doc_id)
    if not doc:
        raise DocumentNotFound
    return doc


def delete_document(doc_id: str, session: Session) -> None:
    doc = get_document(doc_id, session)
    chunks = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == doc_id)).all()
    for c in chunks:
        session.delete(c)
    session.delete(doc)
    session.commit()
    logger.info("document_deleted", extra={"doc_id": doc_id})


def search(query: str, top_k: int = 3, session: Session = None) -> list[SearchResult]:
    """
    Busca los chunks más relevantes para una query semántica.
    """
    chunks = list(session.exec(select(DocumentChunk).where(DocumentChunk.embedding.is_not(None))).all())
    if not chunks:
        return []

    embedder = get_embedder()
    query_vec = embedder.embed([query])[0]
    corpus_vecs = [json.loads(c.embedding) for c in chunks]
    scores = embedder.similarity(query_vec, corpus_vecs)

    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)

    results = []
    for score, chunk in ranked[:top_k]:
        doc = session.get(Document, chunk.document_id)
        results.append(SearchResult(
            document_id=chunk.document_id,
            title=doc.title if doc else "Unknown",
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            score=float(score),
        ))
    return results
