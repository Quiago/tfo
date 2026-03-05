"""
backends/base.py — Contrato común para todos los conectores.

Cada backend implementa este ABC. El dispatcher en service.py
trabaja exclusivamente contra esta interfaz, ignorando el tipo concreto.

Modelo de datos de discovery:
  NodeInfo       — un nodo/tag individual con su NodeId técnico
  AssetDiscovery — un Object del sistema externo con sus Variables agrupadas
  DiscoveryResult — resultado completo: lista plana (nodes) + estructura (assets)

El campo `assets` es la representación semánticamente correcta:
cada Asset (bomba, motor, tanque) agrupa sus Variables (temperatura, presión, rpm).
`nodes` es una vista plana de esas mismas Variables, mantenida por backward-compat.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.api.v1.connectors.models import Connector


@dataclass
class NodeInfo:
    """
    Representación normalizada de un nodo/tag/endpoint descubierto.

    El campo path es la ruta navegable desde la raíz del sistema externo.
    Ejemplos por protocolo:
      opcua → ["Objects", "Plant A", "Line 1", "Temperature"]
      mqtt  → ["factory", "line-1", "sensors", "temp"]
      rest  → ["/api", "/sensors", "/temperature"]

    node_id es el identificador técnico necesario para read()/write().
    display_name es el nombre legible para mostrar en UI o al LLM.
    """
    node_id: str
    display_name: str
    path: list[str]
    data_type: str = "Unknown"
    writable: bool = False
    unit: str | None = None
    description: str | None = None


@dataclass
class AssetDiscovery:
    """
    Un equipo/asset descubierto con sus variables agrupadas.

    Esta es la representación semánticamente correcta del address space OPC-UA
    y de cualquier protocolo que organice datos en jerarquías:

      Object (Pump1) → Variables (Temperature, Pressure, RPM)

    A diferencia de la lista plana de NodeInfo, AssetDiscovery hace explícita
    la relación padre-hijo entre el equipo y sus sensores/actuadores.

    Ventajas frente al heurístico path[-2]:
      - La agrupación es determinista: el Object que visitamos ES el asset
      - Funciona a cualquier profundidad sin suposiciones sobre la estructura
      - Es el modelo natural para un futuro MCP server de OPC-UA
      - `import_from_discovery` no necesita reconstruir el árbol

    type_definition: NodeId del ObjectType OPC-UA ("ns=0;i=58" = BaseObjectType,
      "ns=0;i=61" = FolderType, valores DI para DeviceType, etc.).
      None para backends no-OPC-UA.
    """
    node_id: str
    display_name: str
    path: list[str]
    type_definition: str | None = None
    variables: list[NodeInfo] = field(default_factory=list)


@dataclass
class DiscoveryResult:
    """
    Resultado del discovery: estructura semántica + lista plana para compat.

    assets: lista de AssetDiscovery — el modelo correcto (Object + Variables).
            Backends que lo soporten (OPC-UA) lo populan.
    nodes:  lista plana de NodeInfo — derivada de assets o directamente de
            backends simples (REST mock, MQTT). Mantenida para backward-compat.
    """
    connector_id: str
    node_count: int
    nodes: list[NodeInfo] = field(default_factory=list)
    assets: list[AssetDiscovery] = field(default_factory=list)


class ConnectorBackend(ABC):
    def __init__(self, connector: Connector):
        self.connector = connector

    @abstractmethod
    def read(self, path: str, **kwargs) -> Any:
        """
        Lee un valor del sistema externo.

        path: identificador del dato a leer (node_id, topic, URL path, tool name…)
        kwargs: parámetros opcionales específicos del protocolo.
        Devuelve el dato crudo; el servicio lo envuelve en DataResponse.
        """
        ...

    @abstractmethod
    def write(self, path: str, value: Any, **kwargs) -> None:
        """
        Escribe un valor en el sistema externo.

        path: destino (node_id, topic, URL path…)
        value: valor a escribir.
        kwargs: parámetros opcionales específicos del protocolo.
        """
        ...

    @abstractmethod
    def health(self) -> bool:
        """
        Verifica conectividad con el sistema externo.
        Devuelve True si alcanzable, False si no.
        No debe lanzar excepciones — manejarlas internamente.
        """
        ...

    def discover(self) -> DiscoveryResult:
        """
        Descubre todos los nodos/tags disponibles en el sistema externo.

        Por defecto devuelve un resultado vacío (backends que no soporten discovery).
        Cada backend lo sobreescribe con su lógica específica.

        El resultado es usado por el registry en RAM — no se persiste en DB.
        """
        return DiscoveryResult(connector_id=self.connector.id, node_count=0, nodes=[])
