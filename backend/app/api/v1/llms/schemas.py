from pydantic import BaseModel


class ModelInfo(BaseModel):
    """Información de un modelo del catálogo."""
    id: str
    display_name: str
    description: str
    context_length: int
    memory_required_gb: float
    supports_tools: bool
    supports_thinking: bool = False
    quantization: str | None = None
    is_loaded: bool


class CatalogResponse(BaseModel):
    """Respuesta del endpoint GET /llms/catalog."""
    models: list[ModelInfo]
    default_model: str
    current_model: str | None


class LoadModelRequest(BaseModel):
    """Body del endpoint POST /llms/load."""
    model_id: str


class HealthResponse(BaseModel):
    """Respuesta del endpoint GET /llms/health."""
    status: str
    backend: str
    current_model: str | None
    swap_in_progress: bool
    memory: dict | None = None
    gpu: dict | None = None
