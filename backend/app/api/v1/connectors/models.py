"""
connectors/models.py — Conector persistido en DB.

Un Connector es una configuración nombrada apuntando a una fuente/destino
de datos externo: protocolo industrial, API REST, broker MQTT, server MCP, etc.
Se guarda en DB para poder referenciarlo por ID desde otras partes del sistema.
"""
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class ConnectorType(StrEnum):
    opcua = "opcua"
    mqtt = "mqtt"
    rest = "rest"
    mcp = "mcp"


class Connector(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    type: ConnectorType
    endpoint: str
    backend_config: dict = Field(default_factory=dict, sa_column=Column(JSON))
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
