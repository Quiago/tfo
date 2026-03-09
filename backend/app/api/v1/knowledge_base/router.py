"""
knowledge_base/router.py — Endpoints del dominio knowledge base.
"""
import logging

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlmodel import Session

from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.knowledge_base import service
from app.api.v1.knowledge_base.schemas import (
    DocumentRead, DocumentUploadResponse, SearchRequest, SearchResponse,
)
from app.db.engine import get_session
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/documents", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    title: str = Form(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Sube un documento al knowledge base y lo indexa para búsqueda semántica.
    Formatos: txt, md, rst, csv, tsv, json, yaml, xml,
              pdf, docx, pptx, xlsx, xls, html, htm, rtf, epub.
    """
    try:
        doc = await service.upload_document(file, title, str(current_user.id), session)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("upload_error — filename=%s: %s", file.filename, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {exc}",
        )
    return DocumentUploadResponse(
        document=DocumentRead.model_validate(doc),
        message=f"Document '{doc.title}' indexed with {doc.chunk_count} chunks.",
    )


@router.get("/documents", response_model=list[DocumentRead])
def list_documents(_: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return service.list_documents(session)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: str, _: User = Depends(get_current_user), session: Session = Depends(get_session)):
    service.delete_document(doc_id, session)


@router.post("/search", response_model=SearchResponse)
def search_documents(body: SearchRequest, _: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Busca documentos por similitud semántica. Devuelve los top_k fragmentos más relevantes."""
    results = service.search(query=body.query, top_k=body.top_k, session=session)
    return SearchResponse(query=body.query, results=results)
