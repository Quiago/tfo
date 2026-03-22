"""
connectors/backends/webhook.py — Inbound webhook connector.

Receives events from external systems (BMS, DCIM, monitoring tools) via HTTP
POST to /dispatcher/events.  This backend acts as a passive receiver — read()
is not applicable, but health() verifies the connector config is valid.

Usage: create a Connector of type 'webhook' with endpoint = the URL that
external systems should POST to (informational only — actual ingestion goes
through the dispatcher router directly).
"""
from __future__ import annotations

from app.api.v1.connectors.backends.base import ConnectorBackend, DiscoveryResult


class WebhookConnector(ConnectorBackend):
    """
    Inbound webhook: external systems POST events to /api/v1/dispatcher/events.
    No outbound reads — this connector is receive-only.
    """

    async def read(self, path: str, **kwargs):
        raise NotImplementedError("WebhookConnector is receive-only; use POST /dispatcher/events")

    async def write(self, path: str, value, **kwargs) -> None:
        raise NotImplementedError("WebhookConnector is receive-only")

    async def health(self) -> bool:
        # Config is valid as long as the endpoint field is non-empty
        return bool(self.connector.endpoint)

    async def discover(self) -> DiscoveryResult:
        return DiscoveryResult(connector_id=self.connector.id, node_count=0, nodes=[])
