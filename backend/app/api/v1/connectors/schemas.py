"""
connectors/schemas.py — Contratos HTTP de entrada y salida.

Separados del modelo DB (Connector) para poder evolucionar ambos
de forma independiente.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.api.v1.connectors.models import ConnectorType


class ConnectorCreate(BaseModel):
    id: str
    name: str
    type: ConnectorType
    endpoint: str
    backend_config: dict = {}


class ConnectorUpdate(BaseModel):
    name: str | None = None
    endpoint: str | None = None
    backend_config: dict | None = None
    is_active: bool | None = None


class ConnectorResponse(BaseModel):
    id: str
    name: str
    type: ConnectorType
    endpoint: str
    backend_config: dict
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ReadRequest(BaseModel):
    """
    path: qué leer dentro del sistema externo.

    Ejemplos por tipo:
      opcua → "ns=2;s=Temperature"
      mqtt  → "factory/line-1/temp"
      rest  → "/metrics" (se append a endpoint)
      mcp   → nombre del tool, ej: "read_file"
    """
    path: str
    params: dict[str, Any] = {}


class WriteRequest(BaseModel):
    path: str
    value: Any
    params: dict[str, Any] = {}


class DataResponse(BaseModel):
    connector_id: str
    path: str
    data: Any


class NodeInfoResponse(BaseModel):
    node_id: str
    display_name: str
    path: list[str]
    data_type: str
    writable: bool
    unit: str | None = None
    description: str | None = None


class AssetDiscoveryResponse(BaseModel):
    """
    Un asset (Object OPC-UA u equivalente) con sus variables agrupadas.
    Representa la relación semántica Equipo → Sensores/Actuadores.
    """
    node_id: str
    display_name: str
    path: list[str]
    type_definition: str | None = None
    variables: list[NodeInfoResponse]


class DiscoveryResponse(BaseModel):
    connector_id: str
    node_count: int
    cached: bool = False
    nodes: list[NodeInfoResponse]
    assets: list[AssetDiscoveryResponse] = []


class ConnectorHealthResponse(BaseModel):
    connector_id: str
    reachable: bool
    detail: str | None = None
