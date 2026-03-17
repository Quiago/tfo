"""
connectors/router.py — endpoints HTTP para gestión de conectores.

Solo responsabilidad HTTP: recibe, valida, llama service, devuelve.
El dispatcher vive en service.py, los protocolos en backends/.

Endpoints:
  POST   /connectors                      → registrar conector
  GET    /connectors                      → listar conectores
  GET    /connectors/{id}                 → detalle de un conector
  PATCH  /connectors/{id}                 → actualizar config
  DELETE /connectors/{id}                 → eliminar conector
  POST   /connectors/{id}/discover        → descubrir todos los nodos (cachea en RAM)
  GET    /connectors/{id}/nodes           → buscar nodos en el cache
  POST   /connectors/{id}/read            → leer dato del sistema externo
  POST   /connectors/{id}/write           → escribir dato en sistema externo
  GET    /connectors/{id}/health          → verificar conectividad
"""

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.api.v1.assets import service as asset_service
from app.api.v1.assets.schemas import ImportAssetsResponse
from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.connectors import service
from app.api.v1.connectors.schemas import (
    BatchReadRequest,
    BatchReadResponse,
    BatchReadItem,
    ConnectorCreate,
    ConnectorHealthResponse,
    ConnectorResponse,
    ConnectorUpdate,
    DataResponse,
    DiscoveryResponse,
    NodeInfoResponse,
    NodeMappingsUpdate,
    ReadRequest,
    WriteRequest,
)
from app.db.engine import get_session

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("", response_model=ConnectorResponse, status_code=status.HTTP_201_CREATED)
def create_connector(body: ConnectorCreate, session: Session = Depends(get_session)):
    """Registra un nuevo conector en el sistema."""
    return service.create_connector(body, session)


@router.get("", response_model=list[ConnectorResponse])
def list_connectors(session: Session = Depends(get_session)):
    """Lista todos los conectores registrados."""
    return service.list_connectors(session)


@router.get("/{connector_id}", response_model=ConnectorResponse)
def get_connector(connector_id: str, session: Session = Depends(get_session)):
    """Detalle de un conector específico."""
    return service.get_connector(connector_id, session)


@router.patch("/{connector_id}", response_model=ConnectorResponse)
def update_connector(
    connector_id: str,
    body: ConnectorUpdate,
    session: Session = Depends(get_session),
):
    """Actualiza nombre, endpoint o config de un conector."""
    return service.update_connector(connector_id, body, session)


@router.delete("/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connector(connector_id: str, session: Session = Depends(get_session)):
    """Elimina un conector del registro."""
    service.delete_connector(connector_id, session)


@router.patch("/{connector_id}/node-mappings", response_model=ConnectorResponse)
def save_node_mappings(
    connector_id: str,
    body: NodeMappingsUpdate,
    session: Session = Depends(get_session),
):
    """Persiste los node/energy mappings resueltos tras el discovery."""
    return service.save_node_mappings(connector_id, body.node_mappings, body.energy_mappings, session)


@router.post("/{connector_id}/discover", response_model=DiscoveryResponse)
async def discover_connector(
    connector_id: str,
    force: bool = Query(default=False, description="Ignorar cache y redescubrir"),
    session: Session = Depends(get_session),
):
    """
    Descubre todos los nodos/tags disponibles en el sistema externo.

    El resultado se cachea en RAM por 5 minutos. Llamadas siguientes
    devuelven el cache (campo `cached=true`) sin reconectarse al servidor.

    Usar `?force=true` para forzar un redescubrimiento aunque el cache sea válido.
    Esto es útil cuando se agregaron nuevos tags al servidor.

    Paso previo obligatorio antes de usar GET /nodes para buscar.
    """
    from app.api.v1.connectors.service import get_cached_discovery

    was_cached = get_cached_discovery(connector_id) is not None and not force
    result = await service.discover(connector_id, session, force=force)
    return DiscoveryResponse(
        connector_id=result.connector_id,
        node_count=result.node_count,
        cached=was_cached,
        nodes=[NodeInfoResponse(**vars(n)) for n in result.nodes],
    )


@router.get("/{connector_id}/nodes", response_model=list[NodeInfoResponse])
def search_nodes(
    connector_id: str,
    q: str = Query(description="Texto a buscar en nombre, path o node_id"),
    session: Session = Depends(get_session),
):
    """
    Busca nodos en el cache de discovery por nombre, path o node_id.

    Requiere haber llamado POST /discover antes.
    Búsqueda case-insensitive sobre display_name, node_id y ruta completa.

    Ejemplo: q=temperature → devuelve todos los nodos que contengan "temperature".
    Este endpoint es el que usará el asset model para resolver
    "temperatura de pump-1" → node_id concreto.
    """
    nodes = service.search_nodes(connector_id, q)
    return [NodeInfoResponse(**vars(n)) for n in nodes]


@router.post("/{connector_id}/import-assets", response_model=ImportAssetsResponse)
def import_assets(connector_id: str, session: Session = Depends(get_session)):
    """
    Auto-crea Assets y AssetProperties a partir del cache de discovery.

    Flujo completo:
      1. POST /connectors          → crear conector
      2. POST /connectors/{id}/discover       → descubrir nodos del servidor
      3. POST /connectors/{id}/import-assets  → crear assets y properties automáticamente

    Agrupación (OPC-UA):
      Cada nodo Variable se asigna al nodo Object padre (su jerarquía en el árbol).
      El Object se convierte en Asset, las Variables en Properties.

    Es idempotente: llamarlo dos veces no duplica datos.
    """
    return asset_service.import_from_discovery(connector_id, session)


@router.post("/{connector_id}/read", response_model=DataResponse)
async def read_connector(
    connector_id: str,
    body: ReadRequest,
    session: Session = Depends(get_session),
):
    """
    Lee un dato del sistema externo vía el backend del conector.

    El campo `path` depende del protocolo:
    - opcua → NodeId, ej: "ns=2;s=Temperature"
    - mqtt  → topic, ej: "factory/line-1/temp"
    - rest  → URL path relativo, ej: "/api/metrics"
    - mcp   → nombre del tool, ej: "read_file"
    """
    data = await service.read(connector_id, body.path, session, **body.params)
    return DataResponse(connector_id=connector_id, path=body.path, data=data)


@router.post("/{connector_id}/read-batch", response_model=BatchReadResponse)
async def read_connector_batch(
    connector_id: str,
    body: BatchReadRequest,
    session: Session = Depends(get_session),
):
    """
    Lee múltiples nodos en una sola sesión OPC-UA.

    Usar en lugar de N llamadas individuales a /read para polling periódico.
    Una sola conexión TCP para todos los nodos → latencia O(RTT) en vez de O(N × RTT).
    Solo implementado para conectores OPC-UA.
    """
    results = await service.read_batch(connector_id, body.node_ids, session)
    return BatchReadResponse(
        connector_id=connector_id,
        results=[BatchReadItem(**r) for r in results],
    )


@router.post("/{connector_id}/write", status_code=status.HTTP_204_NO_CONTENT)
async def write_connector(
    connector_id: str,
    body: WriteRequest,
    session: Session = Depends(get_session),
):
    """Escribe un valor en el sistema externo vía el backend del conector."""
    await service.write(connector_id, body.path, body.value, session, **body.params)


@router.get("/{connector_id}/health", response_model=ConnectorHealthResponse)
async def health_connector(connector_id: str, session: Session = Depends(get_session)):
    """Verifica conectividad con el sistema externo."""
    try:
        reachable = await service.health(connector_id, session)
        return ConnectorHealthResponse(connector_id=connector_id, reachable=reachable)
    except NotImplementedError:
        return ConnectorHealthResponse(
            connector_id=connector_id,
            reachable=False,
            detail="Backend not yet implemented",
        )
