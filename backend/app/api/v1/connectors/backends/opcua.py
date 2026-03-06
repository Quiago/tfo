"""
backends/opcua.py — Conector OPC-UA (protocolo industrial estándar).

OPC-UA (IEC 62541) es el protocolo más extendido en automatización industrial:
PLCs, SCADAs, sensores, actuadores. Permite leer/escribir nodos por NodeId.

Compatibilidad probada / enterprise targets:
  - Ignition (Maker / Standard / Edge)  opc.tcp://<host>:62541
  - Kepware / Thingworx Kepware Server   opc.tcp://<host>:49320
  - Siemens S7-1500 / S7-1200           opc.tcp://<host>:4840
  - ABB AC500 / ABB cpmPlus             opc.tcp://<host>:4840
  - Beckhoff TwinCAT 3 (TF6100)         opc.tcp://<host>:4840
  - Unified Automation UaAnsiCServer    opc.tcp://<host>:48010
  - Prosys OPC UA Simulation Server

Configuración en Connector.backend_config:
  username             str    autenticación (si el servidor la requiere)
  password             str
  discovery_max_nodes  int    max assets a descubrir (default: 5000)
  discovery_timeout_s  int    timeout global del discovery en segundos (default: 120)
  discovery_max_depth  int    profundidad máxima de recursión (default: 8)

Ejemplo mínimo (sin auth):
  endpoint:       "opc.tcp://localhost:62541"
  backend_config: {}

Ejemplo enterprise con auth y límites grandes:
  backend_config: {
    "username": "admin", "password": "secret",
    "discovery_max_nodes": 20000,
    "discovery_timeout_s": 300,
    "discovery_max_depth": 10
  }

── Diseño del discovery ──────────────────────────────────────────────────────

Discovery semántico (Object-centric), no plano:
  Visitamos Object nodes y agrupamos sus Variable hijas en AssetDiscovery.
  Esto elimina el heurístico path[-2] y es correcto para cualquier jerarquía:

    Objects → Pump1 → [Temp, Pressure]       → AssetDiscovery("Pump1")
    Objects → Line1 → Pump1 → [Temp]         → AssetDiscovery("Pump1")
    Objects → Site → Area → Cell → Motor → [RPM, Vibration]
                                              → AssetDiscovery("Motor")

  Regla: si un Object tiene Variables directas → es un asset.
         Si solo tiene Object hijos → es un contenedor, se recursa igualmente.

OPC-UA DI (Device Integration, IEC 62541-100):
  Si el servidor tiene cargado el companion spec DI, expone un nodo DeviceSet
  (ns=<DI>;i=5001) con dispositivos físicos tipados (DeviceType, SensorType…).
  Lo detectamos leyendo el NamespaceArray y lo navegamos como entry point adicional.

Por qué NO recursamos Variables:
  Los hijos de un Variable son Properties del sistema (EngineeringUnits, EURange,
  ValueAsText…), no datos de proceso. Recursarlos multiplica los requests N×.
  El DataValue del Variable ya contiene el valor completo, incluso si es un
  struct (ExtensionObject / StructuredType).

Fundamento para MCP:
  La misma estructura AssetDiscovery (Object+Variables) es el modelo natural
  para exponer OPC-UA como herramientas MCP:
    list_devices()          → assets discovered
    read_tag(device, tag)   → asset_service.read_property()
    write_tag(device, tag)  → asset_service.write_property()
  Ver: github.com/kukapay/opcua-mcp, github.com/midhunxavier/OPCUA-MCP
"""
import asyncio
import logging
from typing import Any

from asyncua import Client, Node, ua
from asyncua.ua import AttributeIds, DataValue, NodeClass, Variant

from app.api.v1.connectors.backends.base import (
    AssetDiscovery, ConnectorBackend, DiscoveryResult, NodeInfo,
)
from app.api.v1.connectors.models import Connector

logger = logging.getLogger(__name__)

NodeId = str


def _to_json_safe(value: Any) -> Any:
    """
    Convierte cualquier valor OPC-UA a un tipo JSON-serializable.

    OPC-UA puede devolver bytes (ByteString, Guid), ExtensionObjects, enums,
    NodeIds, etc. que Pydantic no puede serializar directamente.
    """
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        # Strings can have embedded nulls or invalid UTF-8 from some servers
        try:
            value.encode('utf-8')
            return value
        except (UnicodeEncodeError, UnicodeDecodeError):
            return value.encode('utf-8', errors='replace').decode('utf-8')
    if isinstance(value, (bytes, bytearray)):
        return value.hex()
    if isinstance(value, (list, tuple)):
        return [_to_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_json_safe(v) for k, v in value.items()}
    # ExtensionObjects, NodeIds, enums, datetime, etc.
    try:
        import datetime
        if isinstance(value, datetime.datetime):
            return value.isoformat()
    except Exception:
        pass
    try:
        return str(value)
    except Exception:
        return None


_FOLDER_TYPE_ID = 61
_DI_NAMESPACE_URI = "http://opcfoundation.org/UA/DI/"
_DI_DEVICE_SET_ID = 5001


def _make_client(endpoint: str, cfg: dict) -> Client:
    """
    Construye un asyncua.Client con la config del conector.
    No conecta todavía — la conexión ocurre al entrar al context manager.
    """
    client = Client(url=endpoint)
    username = cfg.get("username", "")
    password = cfg.get("password", "")
    if username:
        client.set_user(username)
        client.set_password(password)
    return client


class OPCUAConnector(ConnectorBackend):
    def __init__(self, connector: Connector):
        super().__init__(connector)
        self._cfg = connector.backend_config

    async def read(self, path: str, **kwargs) -> Any:
        """
        Lee el valor de un nodo OPC-UA.

        path: NodeId en formato string, ej:
          "ns=2;s=_Meta/CurrentProject"        → string node  (Ignition)
          "ns=1;s=MyFolder/Temperature"         → tag de Ignition
          "ns=0;i=2258"                         → ServerTime (nodo estándar)

        Para encontrar el NodeId en Ignition:
          Ir a Ignition Designer → Tag Browser → clic derecho en tag → "Edit Tag"
          El OPC Item Path es el NodeId que va aquí.
        """
        logger.debug("OPC-UA read", extra={"connector_id": self.connector.id, "node_id": path})
        async with _make_client(self.connector.endpoint, self._cfg) as client:
            node = client.get_node(path)
            value = await node.read_value()
            dv: DataValue = await node.read_data_value()
            return {
                "node_id": path,
                "value": _to_json_safe(value),
                "status_code": str(dv.StatusCode),
                "source_timestamp": dv.SourceTimestamp.isoformat() if dv.SourceTimestamp else None,
            }

    async def write(self, path: str, value: Any, **kwargs) -> None:
        """
        Escribe un valor en un nodo OPC-UA.

        path:  NodeId del tag a escribir
        value: valor a escribir; asyncua infiere el tipo automáticamente.
               Para forzar el tipo: pasar params={"variant_type": "Float"}
        """
        logger.debug("OPC-UA write", extra={"connector_id": self.connector.id, "node_id": path, "value": value})
        async with _make_client(self.connector.endpoint, self._cfg) as client:
            node = client.get_node(path)
            variant_type_name = kwargs.get("variant_type", 0)
            if variant_type_name:
                VariantType = ua.VariantType
                vt = getattr(VariantType, variant_type_name)
                await node.write_value(DataValue(Variant(value, vt)))
            else:
                await node.write_value(value)

    async def discover(self) -> DiscoveryResult:
        """
        Navega el árbol de nodos OPC-UA recursivamente y devuelve todos los
        nodos de tipo Variable (los que tienen valores legibles) como lista plana.

        Ignora namespace 0 (infraestructura interna del servidor OPC-UA).
        Variables no se recursan — sus hijos son metadatos, no datos de proceso.

        Configurable via backend_config:
          discovery_timeout_s  — timeout global en segundos (default: 60)
          discovery_max_nodes  — máximo de nodos Variable a recolectar (default: 500)
          discovery_max_depth  — profundidad máxima de recursión (default: 8)
        """
        timeout_s = self._cfg.get("discovery_timeout_s", 60)
        max_nodes = self._cfg.get("discovery_max_nodes", 500)
        max_depth = self._cfg.get("discovery_max_depth", 8)

        nodes: list[NodeInfo] = []
        try:
            async with asyncio.timeout(timeout_s):
                async with _make_client(self.connector.endpoint, self._cfg) as client:
                    await self._browse_recursive(
                        node=client.nodes.objects,
                        path=[],
                        result=nodes,
                        depth=0,
                        max_depth=max_depth,
                        max_nodes=max_nodes,
                    )
        except TimeoutError:
            logger.warning(
                "OPC-UA discovery timeout — returning partial results",
                extra={"connector_id": self.connector.id, "nodes_found": len(nodes)},
            )

        logger.info(
            "OPC-UA discovery complete",
            extra={"connector_id": self.connector.id, "node_count": len(nodes)},
        )
        return DiscoveryResult(
            connector_id=self.connector.id,
            node_count=len(nodes),
            nodes=nodes,
        )

    async def _browse_recursive(
        self,
        node: Node,
        path: list[str],
        result: list[NodeInfo],
        depth: int,
        max_depth: int = 8,
        max_nodes: int = 500,
    ) -> None:
        """
        Traversal recursivo del address space OPC-UA.

        - Skips namespace 0 (nodos internos del servidor).
        - Variables: lee data_type + writable, añade a result, NO recursa
          (sus hijos son metadatos EngineeringUnits/EURange, no datos).
        - Objects: recursa en ellos.
        - Batch read de DisplayName + NodeClass en un solo request de red.
        """
        if depth > max_depth or len(result) >= max_nodes:
            return

        try:
            children = await node.get_children()
        except Exception:
            return

        for child in children:
            if len(result) >= max_nodes:
                return
            try:
                node_id = child.nodeid
                # Ignorar namespace 0 — nodos internos del servidor OPC-UA
                if node_id.NamespaceIndex == 0:
                    continue

                attrs = await child.read_attributes([AttributeIds.DisplayName, AttributeIds.NodeClass])
                raw_name = attrs[0].Value.Value if attrs[0].Value else None
                name = (raw_name.Text if hasattr(raw_name, 'Text') else str(raw_name)) if raw_name else str(node_id)
                node_class = attrs[1].Value.Value if attrs[1].Value else None
                current_path = path + [name]

                if node_class == NodeClass.Variable:
                    try:
                        dv: DataValue = await child.read_data_value()
                        vt = dv.Value.VariantType.name if dv.Value else "Unknown"
                    except Exception:
                        vt = "Unknown"

                    try:
                        access = await child.read_user_access_level()
                        writable = bool(access & 0x02)
                    except Exception:
                        writable = False

                    result.append(NodeInfo(
                        node_id=child.nodeid.to_string(),
                        display_name=name,
                        path=current_path,
                        data_type=vt,
                        writable=writable,
                    ))
                    # Variables no se recursan — sus hijos son metadatos del sistema

                elif node_class == NodeClass.Object:
                    await self._browse_recursive(child, current_path, result, depth + 1, max_depth, max_nodes)

            except Exception:
                continue

    async def health(self) -> bool:
        """
        Verifica conectividad con el servidor OPC-UA.
        Lee el nodo estándar ServerStatus (ns=0;i=2256), presente en cualquier
        servidor OPC-UA compatible con la especificación.
        """
        try:
            async with _make_client(self.connector.endpoint, self._cfg) as client:
                node = client.get_node("ns=0;i=2256")
                await node.read_value()
                return True
        except Exception as exc:
            logger.warning(
                "OPC-UA health check failed",
                extra={"connector_id": self.connector.id, "error": str(exc)},
                exc_info=True,
            )
            return False
