"""
llms/router.py — endpoints HTTP para gestión de modelos.

Solo responsabilidad HTTP: recibe, valida, llama service, devuelve.
Sin lógica de negocio aquí.

Endpoints:
  GET  /llms/catalog          → lista todos los modelos del catálogo
  GET  /llms/health           → estado del engine + métricas de memoria
  POST /llms/load             → carga (swap) un modelo en memoria
  GET  /llms/current          → información del modelo actualmente cargado
"""

from fastapi import APIRouter, status

from app.api.v1.llms import service
from app.api.v1.llms.schemas import CatalogResponse, HealthResponse, LoadModelRequest

router = APIRouter()


@router.get("/catalog", response_model=CatalogResponse)
def get_catalog():
    """Lista todos los modelos disponibles en el catálogo."""
    return service.get_catalog()


@router.get("/health", response_model=HealthResponse)
def get_health():
    """Estado del engine LLM y métricas de memoria del sistema."""
    return service.get_health()


@router.get("/current")
def get_current_model():
    """Información del modelo actualmente cargado en memoria."""
    catalog = service.get_catalog()
    if not catalog.current_model:
        return {"current_model": None}
    # Busca el modelo actual en la lista del catálogo
    current = next(m for m in catalog.models if m.is_loaded)
    return current


@router.post("/load", status_code=status.HTTP_200_OK)
async def load_model(
    body: LoadModelRequest,
):
    """
    Carga (o hace swap a) un modelo del catálogo.

    El swap puede tardar segundos o minutos dependiendo del modelo y
    la máquina. Mientras dura, GET /health devuelve swap_in_progress=true.

    Devuelve el estado actualizado del catálogo una vez terminado el swap.
    """
    await service.load_model(body.model_id)
    return service.get_catalog()
