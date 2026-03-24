"""
connectors/service.py — Dispatcher y lógica de negocio.

El dispatcher resuelve qué backend concreto usar a partir del tipo del conector
registrado en DB, instancia el backend, y le delega la operación.

Agregar un protocolo nuevo = 1 clase backend + 1 línea en _REGISTRY.
El router no necesita saber nada sobre tipos concretos.
"""
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.api.v1.connectors.backends.base import ConnectorBackend, DiscoveryResult, NodeInfo
from app.api.v1.connectors.backends.mcp import MCPConnector
from app.api.v1.connectors.backends.mqtt import MQTTConnector
from app.api.v1.connectors.backends.opcua import OPCUAConnector
from app.api.v1.connectors.backends.rest import RESTConnector
from app.api.v1.connectors.backends.webhook import WebhookConnector
from app.api.v1.connectors.backends.teams import TeamsConnector
from app.api.v1.connectors.backends.servicenow import ServiceNowConnector
from app.api.v1.connectors.backends.smtp_email import SMTPEmailConnector
from app.api.v1.connectors.exceptions import (
    BackendNotImplemented, ConnectorAlreadyExists, ConnectorInactive,
    ConnectorNotFound, ConnectorReadError, ConnectorUnreachable, ConnectorWriteError,
)
from app.api.v1.connectors.models import Connector, ConnectorType
from app.api.v1.connectors.schemas import ConnectorCreate, ConnectorUpdate

logger = logging.getLogger(__name__)

_REGISTRY: dict[ConnectorType, type[ConnectorBackend]] = {
    ConnectorType.opcua:       OPCUAConnector,
    ConnectorType.mqtt:        MQTTConnector,
    ConnectorType.rest:        RESTConnector,
    ConnectorType.mcp:         MCPConnector,
    ConnectorType.webhook:     WebhookConnector,
    ConnectorType.teams:       TeamsConnector,
    ConnectorType.servicenow:  ServiceNowConnector,
    ConnectorType.email:       SMTPEmailConnector,
}

_DISCOVERY_TTL_SECONDS = 300


@dataclass
class _CachedDiscovery:
    result: DiscoveryResult
    cached_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    ttl: int = _DISCOVERY_TTL_SECONDS

    def is_expired(self, ttl: int = _DISCOVERY_TTL_SECONDS) -> bool:
        age = (datetime.now(UTC) - self.cached_at).total_seconds()
        return age > ttl


_node_registry: dict[str, _CachedDiscovery] = {}


def _get_backend(connector: Connector) -> ConnectorBackend:
    backend_cls = _REGISTRY.get(ConnectorType(connector.type))
    if not backend_cls:
        raise BackendNotImplemented
    return backend_cls(connector)


def invalidate_discovery(connector_id: str) -> None:
    """Limpia el cache de un conector (llamar al actualizar o eliminar)."""
    _node_registry.pop(connector_id, None)


def get_cached_discovery(connector_id: str) -> _CachedDiscovery | None:
    cached = _node_registry.get(connector_id)
    if cached and cached.is_expired():
        _node_registry.pop(connector_id, None)
        return None
    return cached


def create_connector(data: ConnectorCreate, session: Session) -> Connector:
    existing = session.get(Connector, data.id)
    if existing:
        raise ConnectorAlreadyExists
    connector = Connector(**data.model_dump())
    session.add(connector)
    session.commit()
    session.refresh(connector)
    logger.info("connector_created", extra={"connector_id": connector.id, "type": connector.type})
    return connector


def list_connectors(session: Session) -> list[Connector]:
    return list(session.exec(select(Connector)).all())


def get_connector(connector_id: str, session: Session) -> Connector:
    connector = session.get(Connector, connector_id)
    if not connector:
        raise ConnectorNotFound
    return connector


def update_connector(connector_id: str, data: ConnectorUpdate, session: Session) -> Connector:
    connector = get_connector(connector_id, session)
    for attr, value in data.model_dump(exclude_none=True).items():
        setattr(connector, attr, value)
    session.add(connector)
    session.commit()
    session.refresh(connector)
    invalidate_discovery(connector_id)
    logger.info("connector_updated", extra={"connector_id": connector_id})
    return connector


def save_node_mappings(
    connector_id: str,
    node_mappings: list[dict],
    energy_mappings: list[dict],
    session: Session,
) -> Connector:
    connector = get_connector(connector_id, session)
    connector.node_mappings = node_mappings
    connector.energy_mappings = energy_mappings
    session.add(connector)
    session.commit()
    session.refresh(connector)
    logger.info("node_mappings_saved", extra={"connector_id": connector_id, "count": len(node_mappings)})
    return connector


def delete_connector(connector_id: str, session: Session) -> None:
    connector = get_connector(connector_id, session)
    session.delete(connector)
    session.commit()
    invalidate_discovery(connector_id)
    logger.info("connector_deleted", extra={"connector_id": connector_id})


async def discover(connector_id: str, session: Session, force: bool = False) -> DiscoveryResult:
    """
    Descubre todos los nodos del sistema externo y los cachea en RAM.

    force=True ignora el cache y redescubre aunque no haya expirado.
    Útil cuando el usuario sabe que el servidor cambió.
    """
    connector = get_connector(connector_id, session)
    if not connector.is_active:
        raise ConnectorInactive

    if not force:
        cached = get_cached_discovery(connector_id)
        if cached:
            logger.debug(
                "discovery_cache_hit",
                extra={"connector_id": connector_id, "node_count": cached.result.node_count},
            )
            return cached.result

    backend = _get_backend(connector)
    try:
        result = await backend.discover()
    except NotImplementedError:
        raise BackendNotImplemented
    except (ConnectionRefusedError, OSError) as exc:
        # Transient: simulator / device not reachable yet — log quietly so
        # the dev console isn't flooded with stack traces every 5 s.
        logger.debug(
            "discovery_error",
            extra={"connector_id": connector_id, "error": str(exc)},
        )
        raise ConnectorReadError
    except Exception as exc:
        logger.warning(
            "discovery_error",
            extra={"connector_id": connector_id, "error": str(exc)},
            exc_info=True,
        )
        raise ConnectorReadError

    _node_registry[connector_id] = _CachedDiscovery(result=result)
    logger.info("discovery_complete", extra={"connector_id": connector_id, "node_count": result.node_count})
    return result


def search_nodes(connector_id: str, query: str) -> list[NodeInfo]:
    """
    Busca nodos en el cache por display_name o node_id (case-insensitive).
    Requiere haber llamado discover() antes — lanza ConnectorReadError si no hay cache.
    """
    cached = get_cached_discovery(connector_id)
    if not cached:
        raise ConnectorReadError
    q = query.lower()
    return [
        n for n in cached.result.nodes
        if q in n.display_name.lower() or q in n.node_id.lower()
        or any(q in part.lower() for part in n.path)
    ]


async def read(connector_id: str, path: str, session: Session, **kwargs):
    connector = get_connector(connector_id, session)
    if not connector.is_active:
        raise ConnectorInactive
    backend = _get_backend(connector)
    try:
        data = await backend.read(path, **kwargs)
    except NotImplementedError:
        raise BackendNotImplemented
    except Exception as exc:
        logger.warning(
            "connector_read_error",
            extra={"connector_id": connector_id, "path": path, "error": str(exc)},
            exc_info=True,
        )
        raise ConnectorReadError
    logger.info("connector_read", extra={"connector_id": connector_id, "path": path})
    return data


async def write(connector_id: str, path: str, value, session: Session, **kwargs) -> None:
    connector = get_connector(connector_id, session)
    if not connector.is_active:
        raise ConnectorInactive
    backend = _get_backend(connector)
    try:
        await backend.write(path, value, **kwargs)
    except NotImplementedError:
        raise BackendNotImplemented
    except Exception as exc:
        logger.warning(
            "connector_write_error",
            extra={"connector_id": connector_id, "path": path, "error": str(exc)},
            exc_info=True,
        )
        raise ConnectorWriteError
    logger.info("connector_write", extra={"connector_id": connector_id, "path": path})


async def read_batch(connector_id: str, node_ids: list[str], session: Session) -> list[dict]:
    """
    Lee múltiples nodos en una sola sesión OPC-UA.
    Otros backends devuelven BackendNotImplemented.
    """
    connector = get_connector(connector_id, session)
    if not connector.is_active:
        raise ConnectorInactive
    backend = _get_backend(connector)
    if not hasattr(backend, "read_batch"):
        raise BackendNotImplemented
    try:
        return await backend.read_batch(node_ids)
    except Exception as exc:
        logger.warning(
            "connector_batch_read_error",
            extra={"connector_id": connector_id, "error": str(exc)},
            exc_info=True,
        )
        raise ConnectorReadError


async def health(connector_id: str, session: Session) -> bool:
    connector = get_connector(connector_id, session)
    backend = _get_backend(connector)
    try:
        return await backend.health()
    except NotImplementedError:
        raise BackendNotImplemented
    except Exception as exc:
        logger.warning(
            "connector_health_error",
            extra={"connector_id": connector_id, "error": str(exc)},
            exc_info=True,
        )
        raise ConnectorUnreachable
