"""
connectors/backends/teams.py — Microsoft Teams Incoming Webhook connector.

Sends Adaptive Cards to a Teams channel via a pre-configured Incoming Webhook URL.
Severity → color mapping:
  emergency → red (#D13438), critical → orange (#D83B01),
  warning   → yellow (#FFB900), info     → blue (#0078D4)

Usage:
  connector.endpoint = the Incoming Webhook URL (from Teams channel settings)
  backend.write(path="alert", value={"title": "...", "severity": "critical", ...})
"""
from __future__ import annotations

import logging

import httpx

from app.api.v1.connectors.backends.base import ConnectorBackend, DiscoveryResult

logger = logging.getLogger(__name__)

_SEVERITY_COLORS: dict[str, str] = {
    "emergency": "#D13438",
    "critical":  "#D83B01",
    "warning":   "#FFB900",
    "info":      "#0078D4",
}
_DEFAULT_COLOR = "#0078D4"


def _build_adaptive_card(payload: dict) -> dict:
    """
    Build a Teams Adaptive Card message from an event payload dict.

    Expected payload keys (all optional with fallbacks):
      title, body, severity, asset_id, source, event_id
    """
    severity = str(payload.get("severity", "info")).lower()
    color = _SEVERITY_COLORS.get(severity, _DEFAULT_COLOR)
    title = payload.get("title", "OpsFlow Alert")
    body = payload.get("body", "")
    asset_id = payload.get("asset_id", "—")
    source = payload.get("source", "—")
    event_id = payload.get("event_id", "—")

    return {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "msteams": {"width": "Full"},
                    "body": [
                        {
                            "type": "Container",
                            "style": "emphasis",
                            "bleed": True,
                            "items": [
                                {
                                    "type": "ColumnSet",
                                    "columns": [
                                        {
                                            "type": "Column",
                                            "width": "auto",
                                            "items": [
                                                {
                                                    "type": "TextBlock",
                                                    "text": severity.upper(),
                                                    "weight": "Bolder",
                                                    "color": "Attention" if severity in ("emergency", "critical") else "Warning" if severity == "warning" else "Accent",
                                                    "size": "Small",
                                                }
                                            ],
                                        },
                                        {
                                            "type": "Column",
                                            "width": "stretch",
                                            "items": [
                                                {
                                                    "type": "TextBlock",
                                                    "text": title,
                                                    "weight": "Bolder",
                                                    "size": "Medium",
                                                    "wrap": True,
                                                }
                                            ],
                                        },
                                    ],
                                }
                            ],
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {"title": "Asset", "value": str(asset_id)},
                                {"title": "Source", "value": str(source)},
                                {"title": "Event ID", "value": str(event_id)},
                            ],
                        },
                        *(
                            [{"type": "TextBlock", "text": str(body), "wrap": True, "color": "Default"}]
                            if body
                            else []
                        ),
                    ],
                    "themeColor": color,
                },
            }
        ],
    }


class TeamsConnector(ConnectorBackend):
    """
    Sends Adaptive Card notifications to a Microsoft Teams channel
    via an Incoming Webhook URL stored in connector.endpoint.
    """

    async def read(self, path: str, **kwargs):
        raise NotImplementedError("TeamsConnector is send-only; Teams does not support polling via webhook")

    async def write(self, path: str, value: dict, **kwargs) -> None:
        """
        Send a Teams card notification.

        path:  ignored (reserved for future routing, e.g. different channels)
        value: dict with keys: title, body, severity, asset_id, source, event_id
        """
        webhook_url = self.connector.endpoint
        card = _build_adaptive_card(value)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=card)
            resp.raise_for_status()
        logger.info("teams_card_sent — connector=%s title=%s", self.connector.id, value.get("title"))

    async def health(self) -> bool:
        """
        Teams webhooks cannot be queried — we validate by sending a minimal
        test card.  If the endpoint URL is empty we skip and return False.
        """
        if not self.connector.endpoint:
            return False
        try:
            await self.write("health", {
                "title": "OpsFlow connectivity check",
                "severity": "info",
                "body": "This is an automated health-check message from OpsFlow.",
            })
            return True
        except Exception as exc:
            logger.warning("teams_health_failed — connector=%s err=%s", self.connector.id, exc)
            return False

    async def discover(self) -> DiscoveryResult:
        return DiscoveryResult(connector_id=self.connector.id, node_count=0, nodes=[])
