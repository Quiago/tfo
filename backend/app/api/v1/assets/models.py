"""
assets/models.py — Asset y AssetProperty persistidos en DB.
"""
from datetime import UTC, datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Asset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    description: str | None = None
    asset_type: str | None = None
    location: str | None = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AssetProperty(SQLModel, table=True):
    """
    Mapeo entre un nombre semántico ("temperature") y su origen técnico.

    connector_id + node_id dicen exactamente dónde leer/escribir el dato.
    La restricción UNIQUE(asset_id, name) garantiza que un asset no puede
    tener dos propiedades con el mismo nombre.
    """

    __tablename__ = "asset_property"
    __table_args__ = (UniqueConstraint("asset_id", "name"),)

    id: int = Field(default=None, primary_key=True)
    asset_id: str = Field(foreign_key="asset.id", index=True)
    name: str
    display_name: str | None = None
    unit: str | None = None
    connector_id: str = Field(foreign_key="connector.id")
    node_id: str
    writable: bool = False
    description: str | None = None
