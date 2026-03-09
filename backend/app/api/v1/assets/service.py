"""
assets/service.py — Lógica de negocio del dominio assets.
"""
import asyncio
import logging
import re
from collections import defaultdict
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.api.v1.assets.exceptions import (
    AssetAlreadyExists, AssetNotFound, DiscoveryRequired,
    PropertyAlreadyExists, PropertyNotFound, PropertyNotWritable,
)
from app.api.v1.assets.models import Asset, AssetProperty
from app.api.v1.assets.schemas import (
    AssetCreate, AssetPropertyCreate, AssetPropertyUpdate,
    AssetReadingResponse, AssetReadingsResponse, AssetUpdate, ImportAssetsResponse,
)
from app.api.v1.connectors import service as connector_service

logger = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    """'Pump 1 (Main)' → 'pump-1-main'"""
    text = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[\s_]+", "-", text)


def _extract_value(raw: Any) -> Any:
    """Extrae un valor escalar de la respuesta cruda del conector."""
    if isinstance(raw, dict):
        for key in ("value", "Value", "result", "data"):
            if key in raw:
                return raw[key]
    return raw


def create_asset(data: AssetCreate, session: Session) -> Asset:
    if session.get(Asset, data.id):
        raise AssetAlreadyExists
    asset = Asset(**data.model_dump())
    session.add(asset)
    session.commit()
    session.refresh(asset)
    logger.info("asset_created", extra={"asset_id": asset.id, "type": asset.asset_type})
    return asset


def list_assets(session: Session) -> list[Asset]:
    return list(session.exec(select(Asset)).all())


def get_asset(asset_id: str, session: Session) -> Asset:
    asset = session.get(Asset, asset_id)
    if not asset:
        raise AssetNotFound
    return asset


def update_asset(asset_id: str, data: AssetUpdate, session: Session) -> Asset:
    asset = get_asset(asset_id, session)
    for attr, value in data.model_dump(exclude_none=True).items():
        setattr(asset, attr, value)
    session.add(asset)
    session.commit()
    session.refresh(asset)
    logger.info("asset_updated", extra={"asset_id": asset_id})
    return asset


def delete_asset(asset_id: str, session: Session) -> None:
    asset = get_asset(asset_id, session)
    session.delete(asset)
    session.commit()
    logger.info("asset_deleted", extra={"asset_id": asset_id})


def add_property(asset_id: str, data: AssetPropertyCreate, session: Session) -> AssetProperty:
    get_asset(asset_id, session)
    prop = AssetProperty(asset_id=asset_id, **data.model_dump())
    session.add(prop)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise PropertyAlreadyExists
    session.refresh(prop)
    logger.info("property_added", extra={"asset_id": asset_id, "property": data.name, "connector_id": data.connector_id})
    return prop


def list_properties(asset_id: str, session: Session) -> list[AssetProperty]:
    get_asset(asset_id, session)
    return list(session.exec(select(AssetProperty).where(AssetProperty.asset_id == asset_id)).all())


def get_property(asset_id: str, property_name: str, session: Session) -> AssetProperty:
    prop = session.exec(
        select(AssetProperty).where(AssetProperty.asset_id == asset_id, AssetProperty.name == property_name)
    ).first()
    if not prop:
        raise PropertyNotFound
    return prop


def update_property(asset_id: str, property_name: str, data: AssetPropertyUpdate, session: Session) -> AssetProperty:
    prop = get_property(asset_id, property_name, session)
    for attr, value in data.model_dump(exclude_none=True).items():
        setattr(prop, attr, value)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    logger.info("property_updated", extra={"asset_id": asset_id, "property": property_name})
    return prop


def delete_property(asset_id: str, property_name: str, session: Session) -> None:
    prop = get_property(asset_id, property_name, session)
    session.delete(prop)
    session.commit()
    logger.info("property_deleted", extra={"asset_id": asset_id, "property": property_name})


async def read_property(asset_id: str, property_name: str, session: Session) -> AssetReadingResponse:
    """
    Lee el valor actual de una propiedad de un asset.
    Resuelve: asset_id + property_name → connector_id + node_id → valor real.
    """
    prop = get_property(asset_id, property_name, session)
    raw = await connector_service.read(prop.connector_id, prop.node_id, session)
    logger.info("asset_property_read", extra={"asset_id": asset_id, "property": property_name})
    return AssetReadingResponse(
        asset_id=asset_id,
        property_name=property_name,
        display_name=prop.display_name,
        value=_extract_value(raw),
        unit=prop.unit,
        connector_id=prop.connector_id,
        node_id=prop.node_id,
        raw=raw,
    )


async def read_all_properties(asset_id: str, session: Session) -> AssetReadingsResponse:
    """
    Lee todas las propiedades del asset en paralelo (asyncio.gather).
    Si una propiedad falla, las demás siguen devolviendo su valor.
    """
    props = list_properties(asset_id, session)

    async def _read_one(prop: AssetProperty) -> AssetReadingResponse:
        try:
            raw = await connector_service.read(prop.connector_id, prop.node_id, session)
            return AssetReadingResponse(
                asset_id=asset_id,
                property_name=prop.name,
                display_name=prop.display_name,
                value=_extract_value(raw),
                unit=prop.unit,
                connector_id=prop.connector_id,
                node_id=prop.node_id,
                raw=raw,
            )
        except Exception as exc:
            logger.warning("asset_property_read_error", extra={"asset_id": asset_id, "property": prop.name, "error": str(exc)}, exc_info=True)
            return AssetReadingResponse(
                asset_id=asset_id,
                property_name=prop.name,
                display_name=prop.display_name,
                value=None,
                unit=prop.unit,
                connector_id=prop.connector_id,
                node_id=prop.node_id,
                error=str(exc),
            )

    readings = await asyncio.gather(*[_read_one(p) for p in props])
    success = sum(1 for r in readings if r.error is None)
    return AssetReadingsResponse(asset_id=asset_id, total=len(readings), success=success, readings=list(readings))


def import_from_discovery(connector_id: str, session: Session) -> ImportAssetsResponse:
    """
    Auto-crea Assets y AssetProperties a partir del cache de discovery.
    Es idempotente: assets y properties ya existentes se cuentan como skipped.

    get_cached_discovery() devuelve un _CachedDiscovery wrapper; el DiscoveryResult
    real está en .result. NodeInfo.path y AssetDiscovery.path son list[str].
    """
    cached = connector_service.get_cached_discovery(connector_id)
    if not cached:
        raise DiscoveryRequired

    # Unwrap the _CachedDiscovery wrapper to get the actual DiscoveryResult.
    discovery = cached.result

    assets_created = assets_skipped = properties_created = properties_skipped = 0
    asset_ids = []
    _SKIP_PREFIXES = frozenset({"objects", "deviceset", "root"})

    if discovery.assets:
        # Structured path: OPC-UA Object → Variables grouping.
        # ad.path is list[str], e.g. ["Objects", "Plant A", "Pump1"]
        for ad in discovery.assets:
            path_parts = ad.path  # list[str]
            meaningful = [seg.lower() for seg in path_parts if seg.lower() not in _SKIP_PREFIXES and len(seg) > 2]
            aid = connector_id + "-" + "-".join(meaningful[-2:]) if len(meaningful) >= 2 else connector_id + "-" + _slugify(ad.display_name)
            existing_asset = session.get(Asset, aid)
            if not existing_asset:
                path_str = " / ".join(path_parts)
                session.add(Asset(id=aid, name=ad.display_name, asset_type="equipment", description=f"Discovered from {connector_id} at {path_str}"))
                session.flush()
                assets_created += 1
                asset_ids.append(aid)
            else:
                assets_skipped += 1
                asset_ids.append(aid)

            for var in ad.variables:
                prop_name = _slugify(var.display_name)
                existing_prop = session.exec(
                    select(AssetProperty).where(AssetProperty.asset_id == aid, AssetProperty.name == prop_name)
                ).first()
                if not existing_prop:
                    session.add(AssetProperty(
                        asset_id=aid, name=prop_name, display_name=var.display_name,
                        connector_id=connector_id, node_id=var.node_id,
                        writable=var.writable, unit=var.unit, description=var.description,
                    ))
                    properties_created += 1
                else:
                    properties_skipped += 1
    else:
        # Flat path: group NodeInfo by their second-to-last path segment.
        # node.path is list[str], e.g. ["Objects", "Pump1", "Temperature"]
        groups: dict[str, list] = defaultdict(list)
        for node in discovery.nodes:
            parent_name = node.path[-2] if len(node.path) >= 2 else (node.path[0] if node.path else "equipment")
            groups[parent_name].append(node)

        for parent_name, nodes in groups.items():
            aid = f"{connector_id}-{_slugify(parent_name)}"
            existing_asset = session.get(Asset, aid)
            if not existing_asset:
                session.add(Asset(id=aid, name=parent_name, asset_type="equipment", description=f"Auto-imported from connector {connector_id}"))
                session.flush()
                assets_created += 1
                asset_ids.append(aid)
            else:
                assets_skipped += 1
                asset_ids.append(aid)

            for node in nodes:
                prop_name = _slugify(node.display_name)
                existing_prop = session.exec(
                    select(AssetProperty).where(AssetProperty.asset_id == aid, AssetProperty.name == prop_name)
                ).first()
                if not existing_prop:
                    session.add(AssetProperty(
                        asset_id=aid, name=prop_name, display_name=node.display_name,
                        connector_id=connector_id, node_id=node.node_id,
                        writable=node.writable, unit=node.unit,
                        description=node.description,
                    ))
                    properties_created += 1
                else:
                    properties_skipped += 1

    session.commit()
    logger.info("assets_imported_from_discovery", extra={"connector_id": connector_id, "assets_created": assets_created, "properties_created": properties_created, "mode": "structured" if (hasattr(cached, "assets") and cached.assets) else "flat"})
    return ImportAssetsResponse(
        connector_id=connector_id,
        assets_created=assets_created,
        assets_skipped=assets_skipped,
        properties_created=properties_created,
        properties_skipped=properties_skipped,
        asset_ids=list(set(asset_ids)),
    )


async def auto_import_assets(session: Session) -> None:
    """
    Startup helper: si no hay assets en la BD, descubre e importa automáticamente
    desde todos los conectores activos.

    Se llama desde el lifespan de FastAPI después de crear las tablas.
    Es idempotente: si ya hay assets, no hace nada.
    """
    from sqlmodel import select as _select
    from app.api.v1.assets.models import Asset

    if session.exec(_select(Asset)).first():
        logger.info("[Assets] Assets ya presentes en BD — omitiendo auto-import.")
        return

    connectors = connector_service.list_connectors(session)
    active = [c for c in connectors if c.is_active]
    if not active:
        logger.info("[Assets] No hay conectores activos — omitiendo auto-import.")
        return

    logger.info("[Assets] BD vacía. Auto-importando desde %d conector(es) activo(s)…", len(active))
    for connector in active:
        try:
            await connector_service.discover(connector.id, session, force=True)
            result = import_from_discovery(connector.id, session)
            logger.info(
                "[Assets] Auto-import '%s': %d assets, %d properties creados.",
                connector.id, result.assets_created, result.properties_created,
            )
        except Exception as exc:
            logger.warning("[Assets] Auto-import falló para '%s': %s", connector.id, exc)


async def write_property(asset_id: str, property_name: str, value: Any, session: Session) -> None:
    """
    Escribe un valor en la propiedad de un asset.
    Valida que la propiedad esté marcada como writable antes de escribir.
    """
    prop = get_property(asset_id, property_name, session)
    if not prop.writable:
        raise PropertyNotWritable
    await connector_service.write(prop.connector_id, prop.node_id, value, session)
    logger.info("asset_property_written", extra={"asset_id": asset_id, "property": property_name, "value": value})
