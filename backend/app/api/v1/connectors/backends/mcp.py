"""
backends/mcp.py — Conector MCP (Model Context Protocol).

MCP permite conectar el backend con cualquier MCP server: sistemas de archivos,
bases de datos, APIs de SaaS (Google Drive, Gmail, Slack, GitHub…), herramientas
de desarrollo, y cualquier fuente de contexto para el LLM del sistema.

En este backend:
  read(path)  → llama a un tool MCP y devuelve su resultado
  write(path) → no aplica (los tools MCP son stateless desde el cliente)
  health()    → verifica que el server MCP responde al handshake

Para activar instalar: uv add mcp

Configuración esperada en Connector.backend_config:
  transport  str        "stdio" | "sse" | "http"
  command    str        comando del server (solo para transport=stdio), ej: "uvx mcp-server-filesystem"
  args       list[str]  argumentos del comando
  env        dict       variables de entorno para el proceso
  url        str        URL del server (solo para transport=sse|http)
"""
import logging
from typing import Any

from app.api.v1.connectors.backends.base import ConnectorBackend
from app.api.v1.connectors.models import Connector

logger = logging.getLogger(__name__)


class MCPConnector(ConnectorBackend):
    def __init__(self, connector: Connector):
        super().__init__(connector)

    def read(self, path: str, **kwargs) -> Any:
        """
        path: nombre del tool MCP a invocar, ej: "read_file", "search_emails"
        kwargs: argumentos del tool, ej: path="/home/user/data.csv"

        Implementación de referencia (transport=stdio) con mcp SDK:

            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            cfg = self.connector.backend_config
            params = StdioServerParameters(
                command=cfg["command"],
                args=cfg.get("args", []),
                env=cfg.get("env"),
            )
            async with stdio_client(params) as (read_s, write_s):
                async with ClientSession(read_s, write_s) as session:
                    await session.initialize()
                    result = await session.call_tool(path, arguments=kwargs)
                    return result.content
        """
        raise NotImplementedError("MCP backend not yet implemented. Install MCP SDK: uv add mcp")

    def write(self, path: str, value: Any, **kwargs) -> None:
        """
        MCP es principalmente read (call_tool). Para operaciones de escritura
        usar tools que acepten un argumento value, ej: write_file, send_email.

            await self.read(path, value=value, **kwargs)
        """
        raise NotImplementedError("MCP backend not yet implemented. Install MCP SDK: uv add mcp")

    def health(self) -> bool:
        """
        Verifica que el MCP server responde al initialize handshake.

        Implementación de referencia:

            try:
                cfg = self.connector.backend_config
                params = StdioServerParameters(command=cfg["command"], ...)
                async with stdio_client(params) as (r, w):
                    async with ClientSession(r, w) as session:
                        await session.initialize()
                        return True
            except Exception:
                return False
        """
        raise NotImplementedError("MCP backend not yet implemented. Install MCP SDK: uv add mcp")
