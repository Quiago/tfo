from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: str
    title: str
    filename: str
    mime_type: str
    chunk_count: int
    uploaded_by: str
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    document: DocumentRead
    message: str


class SearchResult(BaseModel):
    document_id: str
    title: str
    chunk_index: int
    content: str
    score: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


class SearchRequest(BaseModel):
    query: str
    top_k: int = 3
