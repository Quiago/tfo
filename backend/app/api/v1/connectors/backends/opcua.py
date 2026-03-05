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

    def read(self, path: str, **kwargs) -> Any:
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
        async def _read():
            async with _make_client(self.connector.endpoint, self._cfg) as client:
                node = client.get_node(path)
                value = await node.read_value()
                dv: DataValue = await node.read_data_value()
                return {
                    "node_id": path,
                    "value": value,
                    "status_code": str(dv.StatusCode),
                    "source_timestamp": dv.SourceTimestamp.isoformat() if dv.SourceTimestamp else None,
                }

        logger.debug("OPC-UA read", extra={"connector_id": self.connector.id, "node_id": path})
        return asyncio.run(_read())

    def write(self, path: str, value: Any, **kwargs) -> None:
        """
        Escribe un valor en un nodo OPC-UA.

        path:  NodeId del tag a escribir
        value: valor a escribir; asyncua infiere el tipo automáticamente.
               Para forzar el tipo: pasar params={"variant_type": "Float"}
        """
        async def _write():
            async with _make_client(self.connector.endpoint, self._cfg) as client:
                node = client.get_node(path)
                variant_type_name = kwargs.get("variant_type", 0)
                if variant_type_name:
                    VariantType = ua.VariantType
                    vt = getattr(VariantType, variant_type_name)
                    await node.write_value(DataValue(Variant(value, vt)))
                else:
                    await node.write_value(value)

        logger.debug("OPC-UA write", extra={"connector_id": self.connector.id, "node_id": path, "value": value})
        asyncio.run(_write())

    def discover(self) -> DiscoveryResult:
        """
        Discovery semántico: navega el address space y devuelve AssetDiscovery
        (Objects con sus Variables agrupadas), no una lista plana de nodos.

        Entry points:
          1. Objects (ns=0;i=85) — raíz estándar para todos los servidores
          2. DeviceSet (DI companion spec) — si el servidor tiene DI cargado

        Los límites son configurables en backend_config para adaptarse a
        cualquier servidor (desde demoservers con 200 nodos hasta Ignition
        enterprise con 50,000+ tags):
          discovery_max_nodes  — máximo de assets (no variables individuales)
          discovery_timeout_s  — timeout total, devuelve parciales si se alcanza
          discovery_max_depth  — profundidad máxima de recursión
        """
        max_assets = self._cfg.get("discovery_max_nodes", 5000)
        timeout_s = self._cfg.get("discovery_timeout_s", 120)
        max_depth = self._cfg.get("discovery_max_depth", 8)

        async def _discover():
            assets: list[AssetDiscovery] = []
            try:
                async with asyncio.timeout(timeout_s):
                    async with _make_client(self.connector.endpoint, self._cfg) as client:
                        objects = client.get_node("ns=0;i=85")
                        await self._browse_for_assets(objects, [], assets, 0, max_depth, max_assets)
                        di_nodes = await self._find_di_entry_points(client)
                        for di_node, di_label in di_nodes:
                            await self._browse_for_assets(di_node, [di_label], assets, 0, max_depth, max_assets)
            except TimeoutError:
                logger.warning(
                    "OPC-UA discovery timeout — partial results returned. "
                    "Increase discovery_timeout_s in backend_config if needed",
                    extra={"connector_id": self.connector.id, "assets_found": len(assets), "timeout_s": timeout_s},
                )
            return assets

        assets = asyncio.run(_discover())
        all_nodes = [var for asset in assets for var in asset.variables]
        logger.info(
            "OPC-UA discovery complete",
            extra={"connector_id": self.connector.id, "assets": len(assets), "variables": len(all_nodes)},
        )
        return DiscoveryResult(
            connector_id=self.connector.id,
            node_count=len(all_nodes),
            nodes=all_nodes,
            assets=assets,
        )

    async def _browse_for_assets(
        self,
        node: Node,
        path: list[str],
        assets: list[AssetDiscovery],
        depth: int,
        max_depth: int,
        max_assets: int,
    ) -> None:
        """
        Traversal Object-centric del address space OPC-UA.

        Para cada Object visitado:
          - Recolecta sus Variables directas → son las propiedades del equipo
          - Si tiene Variables → crea un AssetDiscovery y lo añade al resultado
          - Recursa en sus Object hijos (sin importar si tenía Variables o no)

        Variables NO se recursan: sus hijos son Properties del sistema
        (EngineeringUnits, EURange…), no datos de proceso.

        Un solo `read_attributes([DisplayName, NodeClass])` por nodo reduce
        los round-trips a la mitad respecto a llamadas individuales,
        crítico para servidores remotos con alta latencia.

        El límite max_assets detiene el discovery cuando se alcanzan N assets
        (no N variables individuales), haciendo el límite más predecible.
        """
        if depth > max_depth or len(assets) >= max_assets:
            return

        try:
            children = await node.get_children()
        except Exception:
            logger.debug(
                "OPC-UA get_children failed — skipping node",
                extra={"node": str(node), "depth": depth},
                exc_info=True,
            )
            return

        variables: list[NodeInfo] = []
        sub_objects: list[tuple] = []

        for child in children:
            try:
                child_id = child.nodeid.to_string()
                node_id = str(child_id)
                attrs = await child.read_attributes([AttributeIds.DisplayName, AttributeIds.NodeClass])
                name = getattr(attrs[0].Value, "Text", "?") or "?"
                node_class = attrs[1].Value

                if node_class == NodeClass.Variable:
                    data_type, writable = await self._read_variable_details(child)
                    display_name = name
                    variables.append(NodeInfo(
                        node_id=node_id,
                        display_name=display_name,
                        path=path + [display_name],
                        data_type=data_type,
                        writable=writable,
                    ))
                elif node_class == NodeClass.Object:
                    sub_node = child
                    sub_name = name
                    sub_objects.append((sub_node, sub_name))
            except Exception:
                logger.debug(
                    "OPC-UA node skipped",
                    extra={"node_id": str(child), "display_name": "?", "path": path},
                )

        if variables:
            asset_name = path[-1] if path else "/"
            assets.append(AssetDiscovery(
                node_id=node.nodeid.to_string(),
                display_name=asset_name,
                path=path,
                variables=variables,
            ))
            logger.debug(
                "OPC-UA asset found",
                extra={"asset_name": asset_name, "vars": len(variables), "path": "/".join(path)},
            )

        if len(assets) >= max_assets:
            logger.warning(
                "OPC-UA discovery asset limit reached. "
                "Increase discovery_max_nodes in backend_config",
                extra={"connector_id": self.connector.id, "max_assets": max_assets},
            )
            return

        for sub_node, sub_name in sub_objects:
            await self._browse_for_assets(sub_node, path + [sub_name], assets, depth + 1, max_depth, max_assets)

    async def _read_variable_details(self, node: Node) -> tuple[str, bool]:
        """
        Lee data_type y writable de un nodo Variable.
        Dos calls separados porque no son AttributeIds estándar batcheables juntos.
        """
        data_type = "Unknown"
        writable = False
        try:
            dv: DataValue = await node.read_data_value()
            data_type = dv.Value.VariantType.name if dv.Value else "Unknown"
        except Exception:
            logger.debug("OPC-UA read_data_value failed — defaulting to Unknown", exc_info=True)
        try:
            access = await node.read_user_access_level()
            writable = bool(access & 2)
        except Exception:
            logger.debug("OPC-UA read_user_access_level failed — defaulting to not writable", exc_info=False)
        return data_type, writable

    async def _find_di_entry_points(self, client: Client) -> list[tuple]:
        """
        Detecta si el servidor tiene el companion spec OPC-UA DI cargado.

        OPC-UA DI (Device Integration, IEC 62541-100) define un nodo DeviceSet
        (ns=<DI>;i=5001) bajo Objects que contiene dispositivos físicos tipados
        (DeviceType, SensorType, ActuatorType…). Es muy común en:
          - Siemens S7-1500, Beckhoff TwinCAT 3, Phoenix Contact PLCnext
          - Cualquier servidor certificado OPC-UA DI compliant

        El namespace index del companion spec varía por servidor — NUNCA
        hardcodearlo. Siempre resolverlo desde el NamespaceArray (ns=0;i=2255).

        Devuelve lista de (node, display_label) para navegar como entry points.
        Lista vacía si el servidor no tiene DI o si DeviceSet no es accesible.
        """
        try:
            ns_array = await client.get_namespace_array()
            di_idx = ns_array.index(_DI_NAMESPACE_URI)
            device_set = client.get_node(ua.NodeId(_DI_DEVICE_SET_ID, di_idx))
            await device_set.read_node_class()
            logger.info(
                "OPC-UA DI companion spec detected — adding DeviceSet entry point",
                extra={"connector_id": self.connector.id, "di_ns_idx": di_idx},
            )
            return [(device_set, "DeviceSet")]
        except Exception:
            logger.debug(
                "OPC-UA DI companion spec not available or not accessible",
                extra={"connector_id": self.connector.id},
                exc_info=True,
            )
            return []

    def health(self) -> bool:
        """
        Verifica conectividad con el servidor OPC-UA.
        Lee el nodo estándar ServerStatus (ns=0;i=2256), presente en cualquier
        servidor OPC-UA compatible con la especificación.
        """
        async def _health():
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

        return asyncio.run(_health())
