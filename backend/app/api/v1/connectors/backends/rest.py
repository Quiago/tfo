"""
backends/rest.py — Conector HTTP/REST genérico.

Permite leer y escribir contra cualquier API HTTP externa.
Es el backend más versátil: sirve para APIs industriales con interfaz REST,
SaaS (Drive, Gmail vía sus APIs), microservicios internos, etc.

Configuración esperada en Connector.backend_config:
  method        str   método HTTP para writes ("POST" | "PUT" | "PATCH"), default "POST"
  headers       dict  cabeceras fijas (Authorization, Content-Type, etc.)
  timeout       int   segundos, default 30
  verify_ssl    bool  verificar certificado SSL, default True
"""
import logging
from typing import Any

import httpx

from app.api.v1.connectors.backends.base import ConnectorBackend
from app.api.v1.connectors.models import Connector

logger = logging.getLogger(__name__)


class RESTConnector(ConnectorBackend):
    def __init__(self, connector: Connector):
        super().__init__(connector)
        cfg = connector.backend_config
        self._headers: dict = cfg.get("headers", {})
        self._timeout: int = cfg.get("timeout", 30)
        self._write_method: str = cfg.get("method", "POST").upper()
        self._verify_ssl: bool = cfg.get("verify_ssl", True)

    def _url(self, path: str) -> str:
        base = self.connector.endpoint.rstrip("/")
        return f"{base}/{path.lstrip('/')}"

    def read(self, path: str, **kwargs) -> Any:
        url = self._url(path)
        logger.debug("REST read", extra={"connector_id": self.connector.id, "url": url})

        async def _get():
            async with httpx.AsyncClient(verify=self._verify_ssl) as client:
                response = await client.get(url, headers=self._headers, params=kwargs, timeout=self._timeout)
                response.raise_for_status()
                try:
                    return response.json()
                except Exception:
                    return response.text

        import asyncio
        return asyncio.run(_get())

    def write(self, path: str, value: Any, **kwargs) -> None:
        url = self._url(path)
        body = {"value": value}
        logger.debug("REST write", extra={"connector_id": self.connector.id, "url": url})

        async def _write():
            async with httpx.AsyncClient(verify=self._verify_ssl) as client:
                response = await client.request(
                    self._write_method, url, json=body, headers=self._headers, timeout=self._timeout,
                )
                response.raise_for_status()

        import asyncio
        asyncio.run(_write())

    def health(self) -> bool:
        async def _health():
            try:
                async with httpx.AsyncClient(verify=self._verify_ssl) as client:
                    response = await client.get(
                        self.connector.endpoint, headers=self._headers, timeout=5,
                    )
                    return response.status_code < 500
            except Exception:
                return False

        import asyncio
        return asyncio.run(_health())
