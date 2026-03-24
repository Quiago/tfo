"""
connectors/backends/servicenow.py — ServiceNow REST API connector.

Supports creating and reading Incidents and Change Requests via the
ServiceNow Table API.

connector.endpoint  = ServiceNow instance base URL
                      e.g. https://dev12345.service-now.com
connector.backend_config = {
    "username": "...",
    "password": "...",
    "default_assignment_group": "NOC",   # optional
    "default_caller_id": "admin",        # optional
}

Severity → ServiceNow impact/urgency mapping (follows ITIL P1–P4):
  emergency → impact=1 urgency=1 (P1)
  critical  → impact=1 urgency=2 (P2)
  warning   → impact=2 urgency=2 (P3)
  info      → impact=3 urgency=3 (P4)
"""
from __future__ import annotations

import logging

import httpx

from app.api.v1.connectors.backends.base import ConnectorBackend, DiscoveryResult, NodeInfo

logger = logging.getLogger(__name__)

_SEVERITY_MAP: dict[str, dict] = {
    "emergency": {"impact": "1", "urgency": "1", "priority": "1"},
    "critical":  {"impact": "1", "urgency": "2", "priority": "2"},
    "warning":   {"impact": "2", "urgency": "2", "priority": "3"},
    "info":      {"impact": "3", "urgency": "3", "priority": "4"},
}
_DEFAULT_SEVERITY = _SEVERITY_MAP["warning"]

_DISCOVERABLE_TABLES = [
    ("incident",        "Incident table"),
    ("problem",         "Problem table"),
    ("change_request",  "Change Request table"),
    ("cmdb_ci",         "CMDB — Configuration Item"),
]


class ServiceNowConnector(ConnectorBackend):
    """
    Bidirectional connector to ServiceNow Table API.

    write() → creates an Incident (default) or Change Request
    read()  → reads a single record by sys_id
    health() → GET /api/now/table/sys_user?sysparm_limit=1
    discover() → returns the supported tables as NodeInfo entries
    """

    def _auth(self) -> tuple[str, str]:
        cfg = self.connector.backend_config or {}
        return cfg.get("username", ""), cfg.get("password", "")

    def _base_url(self) -> str:
        return self.connector.endpoint.rstrip("/")

    async def write(self, path: str, value: dict, **kwargs) -> dict:
        """
        Create a record in ServiceNow.

        path:  table name — "incident" (default) or "change_request"
        value: dict with keys:
          title / short_description, body / description, severity,
          assignment_group, caller_id, cmdb_ci (asset), work_notes
        Returns the created record as a dict with at minimum: sys_id, number.
        """
        table = path or "incident"
        severity = str(value.get("severity", "warning")).lower()
        sev = _SEVERITY_MAP.get(severity, _DEFAULT_SEVERITY)
        cfg = self.connector.backend_config or {}

        payload = {
            "short_description": value.get("title") or value.get("short_description", "OpsFlow Alert"),
            "description":       value.get("body")  or value.get("description", ""),
            "impact":            sev["impact"],
            "urgency":           sev["urgency"],
            "assignment_group":  value.get("assignment_group") or cfg.get("default_assignment_group", ""),
            "caller_id":         value.get("caller_id")        or cfg.get("default_caller_id", "admin"),
        }
        if value.get("cmdb_ci"):
            payload["cmdb_ci"] = value["cmdb_ci"]
        if value.get("work_notes"):
            payload["work_notes"] = value["work_notes"]

        url = f"{self._base_url()}/api/now/table/{table}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, auth=self._auth())
            resp.raise_for_status()

        result = resp.json().get("result", {})
        logger.info(
            "servicenow_record_created — connector=%s table=%s number=%s sys_id=%s",
            self.connector.id, table, result.get("number"), result.get("sys_id"),
        )
        return result

    async def read(self, path: str, **kwargs) -> dict:
        """
        Read a single ServiceNow record.
        path format: "<table>/<sys_id>"  e.g. "incident/abc123"
        """
        parts = path.split("/", 1)
        if len(parts) != 2:
            raise ValueError(f"read() path must be '<table>/<sys_id>', got: {path!r}")
        table, sys_id = parts
        url = f"{self._base_url()}/api/now/table/{table}/{sys_id}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, auth=self._auth())
            resp.raise_for_status()
        return resp.json().get("result", {})

    async def health(self) -> bool:
        if not self.connector.endpoint:
            return False
        try:
            url = f"{self._base_url()}/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, auth=self._auth())
                return resp.status_code == 200
        except Exception as exc:
            logger.warning("servicenow_health_failed — connector=%s err=%s", self.connector.id, exc)
            return False

    async def discover(self) -> DiscoveryResult:
        nodes = [
            NodeInfo(
                node_id=table_name,
                display_name=label,
                path=["ServiceNow", "Tables", table_name],
                data_type="Table",
                writable=True,
                description=label,
            )
            for table_name, label in _DISCOVERABLE_TABLES
        ]
        return DiscoveryResult(
            connector_id=self.connector.id,
            node_count=len(nodes),
            nodes=nodes,
        )
