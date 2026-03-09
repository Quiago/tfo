"""
assets/router.py — endpoints HTTP del dominio assets.
"""
from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.api.v1.assets import service
from app.api.v1.assets.schemas import (
    AssetCreate, AssetPropertyCreate, AssetPropertyResponse, AssetPropertyUpdate,
    AssetReadingResponse, AssetReadingsResponse, AssetResponse, AssetUpdate, WritePropertyRequest,
)
from app.api.v1.auth.dependencies import get_current_user
from app.db.engine import get_session

router = APIRouter()


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(body: AssetCreate, session: Session = Depends(get_session)):
    """Registra un nuevo asset en el sistema."""
    return service.create_asset(body, session)


@router.get("", response_model=list[AssetResponse])
def list_assets(session: Session = Depends(get_session)):
    """Lista todos los assets registrados."""
    return service.list_assets(session)


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str, session: Session = Depends(get_session)):
    """Detalle de un asset."""
    return service.get_asset(asset_id, session)


@router.patch("/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: str, body: AssetUpdate, session: Session = Depends(get_session)):
    """Actualiza metadata del asset."""
    return service.update_asset(asset_id, body, session)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: str, session: Session = Depends(get_session)):
    """Elimina un asset y todas sus propiedades."""
    service.delete_asset(asset_id, session)


@router.post("/{asset_id}/properties", response_model=AssetPropertyResponse, status_code=status.HTTP_201_CREATED)
def add_property(asset_id: str, body: AssetPropertyCreate, session: Session = Depends(get_session)):
    """Agrega un mapping: nombre semántico → conector + node_id."""
    return service.add_property(asset_id, body, session)


@router.get("/{asset_id}/properties", response_model=list[AssetPropertyResponse])
def list_properties(asset_id: str, session: Session = Depends(get_session)):
    """Lista todos los mappings de propiedades de un asset."""
    return service.list_properties(asset_id, session)


@router.get("/{asset_id}/properties/{property_name}", response_model=AssetPropertyResponse)
def get_property(asset_id: str, property_name: str, session: Session = Depends(get_session)):
    """Detalle del mapping de una propiedad."""
    return service.get_property(asset_id, property_name, session)


@router.patch("/{asset_id}/properties/{property_name}", response_model=AssetPropertyResponse)
def update_property(asset_id: str, property_name: str, body: AssetPropertyUpdate, session: Session = Depends(get_session)):
    """Actualiza el mapping de una propiedad."""
    return service.update_property(asset_id, property_name, body, session)


@router.delete("/{asset_id}/properties/{property_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(asset_id: str, property_name: str, session: Session = Depends(get_session)):
    """Elimina el mapping de una propiedad."""
    service.delete_property(asset_id, property_name, session)


@router.get("/{asset_id}/readings", response_model=AssetReadingsResponse)
async def read_all(asset_id: str, session: Session = Depends(get_session)):
    """Lee TODAS las propiedades del asset en paralelo."""
    return await service.read_all_properties(asset_id, session)


@router.get("/{asset_id}/readings/{property_name}", response_model=AssetReadingResponse)
async def read_one(asset_id: str, property_name: str, session: Session = Depends(get_session)):
    """Lee UNA propiedad del asset."""
    return await service.read_property(asset_id, property_name, session)


@router.put("/{asset_id}/readings/{property_name}", status_code=status.HTTP_204_NO_CONTENT)
async def write_one(asset_id: str, property_name: str, body: WritePropertyRequest, session: Session = Depends(get_session)):
    """Escribe un valor en una propiedad del asset."""
    await service.write_property(asset_id, property_name, body.value, session)
