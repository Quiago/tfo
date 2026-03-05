"""
assets/schemas.py — Contratos HTTP de la API de assets.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AssetCreate(BaseModel):
    id: str
    name: str
    description: str | None = None
    asset_type: str | None = None
    location: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    asset_type: str | None = None
    location: str | None = None
    is_active: bool | None = None


class AssetResponse(BaseModel):
    id: str
    name: str
    description: str | None
    asset_type: str | None
    location: str | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class AssetPropertyCreate(BaseModel):
    name: str
    display_name: str | None = None
    unit: str | None = None
    connector_id: str
    node_id: str
    writable: bool = False
    description: str | None = None


class AssetPropertyUpdate(BaseModel):
    display_name: str | None = None
    unit: str | None = None
    connector_id: str | None = None
    node_id: str | None = None
    writable: bool | None = None
    description: str | None = None


class AssetPropertyResponse(BaseModel):
    id: int
    asset_id: str
    name: str
    display_name: str | None
    unit: str | None
    connector_id: str
    node_id: str
    writable: bool
    description: str | None
    model_config = {"from_attributes": True}


class AssetReadingResponse(BaseModel):
    """
    Resultado de leer una propiedad de un asset.

    value:  el valor extraído de la respuesta del conector.
    raw:    la respuesta completa (con timestamps, status codes, etc.)
    error:  solo presente cuando el campo viene de una lectura bulk fallida.
    """
    asset_id: str
    property_name: str
    display_name: str | None
    value: Any
    unit: str | None
    connector_id: str
    node_id: str
    raw: Any = None
    error: str | None = None


class AssetReadingsResponse(BaseModel):
    """Resultado de leer todas las propiedades de un asset en paralelo."""
    asset_id: str
    total: int
    success: int
    readings: list[AssetReadingResponse]


class WritePropertyRequest(BaseModel):
    value: Any


class ImportAssetsResponse(BaseModel):
    """
    Resultado de importar assets desde el cache de discovery de un conector.
    """
    connector_id: str
    assets_created: int
    assets_skipped: int
    properties_created: int
    properties_skipped: int
    asset_ids: list[str]
