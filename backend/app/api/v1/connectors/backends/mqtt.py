"""
backends/mqtt.py — Conector MQTT (protocolo IoT pub/sub).

MQTT es el estándar de mensajería para IoT: sensores, edge devices, gateways.
Soporta QoS 0/1/2 y TLS. Muy usado junto con OPC-UA en arquitecturas híbridas.

Para activar instalar: uv add aiomqtt

Configuración esperada en Connector.backend_config:
  port      int    1883 (plain) o 8883 (TLS), default 1883
  username  str    credenciales opcionales
  password  str
  tls       bool   usar TLS, default False
  qos       int    0 | 1 | 2, default 0
  timeout   int    segundos de espera para recibir mensaje, default 5
"""
import logging
from typing import Any

from app.api.v1.connectors.backends.base import ConnectorBackend
from app.api.v1.connectors.models import Connector

logger = logging.getLogger(__name__)


class MQTTConnector(ConnectorBackend):
    def __init__(self, connector: Connector):
        super().__init__(connector)

    def read(self, path: str, **kwargs) -> Any:
        """
        path: topic MQTT, ej: "factory/line-1/temperature"
        Suscribe al topic, espera el primer mensaje y devuelve el payload.

        Implementación de referencia con aiomqtt:

            import aiomqtt
            cfg = self.connector.backend_config
            async with aiomqtt.Client(
                hostname=self.connector.endpoint,
                port=cfg.get("port", 1883),
                username=cfg.get("username"),
                password=cfg.get("password"),
            ) as client:
                await client.subscribe(path)
                async for message in client.messages:
                    return {"topic": str(message.topic), "payload": message.payload.decode()}
        """
        raise NotImplementedError("MQTT backend not yet implemented. Install aiomqtt: uv add aiomqtt")

    def write(self, path: str, value: Any, **kwargs) -> None:
        """
        path: topic MQTT
        value: payload a publicar

        Implementación de referencia:

            import aiomqtt, json
            cfg = self.connector.backend_config
            async with aiomqtt.Client(hostname=self.connector.endpoint, ...) as client:
                payload = json.dumps(value) if not isinstance(value, (str, bytes)) else value
                await client.publish(path, payload=payload, qos=cfg.get("qos", 0))
        """
        raise NotImplementedError("MQTT backend not yet implemented. Install aiomqtt: uv add aiomqtt")

    def health(self) -> bool:
        """
        Implementación de referencia:

            import aiomqtt
            cfg = self.connector.backend_config
            try:
                async with aiomqtt.Client(
                    hostname=self.connector.endpoint,
                    port=cfg.get("port", 1883),
                    timeout=5,
                ) as client:
                    return True
            except Exception:
                return False
        """
        raise NotImplementedError("MQTT backend not yet implemented. Install aiomqtt: uv add aiomqtt")
