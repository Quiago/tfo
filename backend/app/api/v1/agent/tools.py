"""
agent/tools.py — Tool registry for the Agent domain.

Extends the shared chat tool registry with three platform-aware tools that
leverage Screen Context — no asset ID or time range required from the user:

  • get_screen_context      — returns current UI state as structured JSON (fast-path for "what am I seeing?" questions)
  • analyze_focused_asset   — queries stats for the asset currently in focus
  • analyze_selected_range  — queries telemetry for the range drawn on Timeline

The execute_agent_tool dispatcher is the single entry point for the service.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlmodel import Session

from app.api.v1.agent.schemas import ScreenContext
from app.api.v1.chat.tools import execute_tool as execute_chat_tool

logger = logging.getLogger(__name__)

# ── Screen-aware tool schemas (OpenAI format) ─────────────────────────────────

PLATFORM_TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_integrations",
            "description": (
                "Returns the list of active external integrations (Teams, ServiceNow, Email). "
                "Call this before send_teams_message / create_servicenow_incident / send_email_alert "
                "to discover available integration IDs. Returns name, type, and id for each."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_teams_message",
            "description": (
                "Sends an Adaptive Card alert to a Microsoft Teams channel via a configured webhook integration. "
                "Use when the user asks to notify the team, send a Teams alert, or post to Teams."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "integration_id": {
                        "type": "string",
                        "description": "The Teams integration ID (get from list_integrations).",
                    },
                    "title": {
                        "type": "string",
                        "description": "Card title / alert heading.",
                    },
                    "message": {
                        "type": "string",
                        "description": "Body text of the card.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "warning", "critical", "emergency"],
                        "description": "Severity level of the alert (default: info).",
                    },
                    "asset_id": {
                        "type": "string",
                        "description": "Optional asset ID related to this alert.",
                    },
                },
                "required": ["integration_id", "title", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_servicenow_incident",
            "description": (
                "Creates an Incident (or other record) in ServiceNow via the Table API. "
                "Use when the user asks to open a ticket, create an incident, or log an issue in ServiceNow."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "integration_id": {
                        "type": "string",
                        "description": "The ServiceNow integration ID (get from list_integrations).",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short description of the incident.",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description / additional context.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "warning", "critical", "emergency"],
                        "description": "Severity (maps to impact/urgency). Default: warning.",
                    },
                    "assignment_group": {
                        "type": "string",
                        "description": "ServiceNow assignment group override (e.g. 'NOC').",
                    },
                    "table": {
                        "type": "string",
                        "description": "ServiceNow table (default: incident).",
                    },
                },
                "required": ["integration_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email_alert",
            "description": (
                "Sends an alert email via SMTP relay through a configured email integration. "
                "Use when the user asks to send an email, notify by email, or email a team."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "integration_id": {
                        "type": "string",
                        "description": "The email integration ID (get from list_integrations).",
                    },
                    "subject": {
                        "type": "string",
                        "description": "Email subject line (severity prefix will be prepended automatically).",
                    },
                    "body": {
                        "type": "string",
                        "description": "Plain-text body of the email.",
                    },
                    "to": {
                        "type": "string",
                        "description": "Comma-separated recipients override. Leave empty to use integration defaults.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "warning", "critical", "emergency"],
                        "description": "Severity prefix prepended to the subject (default: info).",
                    },
                },
                "required": ["integration_id", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_screen_context",
            "description": (
                "Returns a structured snapshot of what the user is currently viewing on the dashboard: "
                "active module, asset in focus, connector, granularity, and selected timeline range. "
                "Call this FIRST when the user asks 'what am I seeing?', 'where am I?', 'what is in focus?', "
                "'what module is this?', or any question about the current UI state. "
                "Do NOT call list_assets or sensor tools for these questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_focused_asset",
            "description": (
                "Returns sensor statistics for the asset currently in focus on the dashboard. "
                "Use this when the user asks about 'this machine', 'the current asset', or 'what I'm looking at'. "
                "No asset_id needed — uses Screen Context automatically."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "minutes": {
                        "type": "integer",
                        "description": "How many minutes of history to analyse (default 30).",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_selected_range",
            "description": (
                "Returns sensor statistics for the exact time range the user drew on the Timeline. "
                "Use this when the user asks about 'this period', 'the selected range', or 'what I highlighted'. "
                "No timestamps needed — uses the date_range_start / date_range_end from Screen Context."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


# ── Platform tool implementations ─────────────────────────────────────────────

async def _list_integrations(
    screen_context: ScreenContext,  # noqa: ARG001
    session: Session,
) -> str:
    from app.api.v1.integrations.service import get_all as _get_all_integrations
    items = _get_all_integrations(session)
    active = [
        {"id": i.id, "name": i.name, "type": i.type.value, "is_active": i.is_active}
        for i in items if i.is_active
    ]
    return json.dumps({"count": len(active), "integrations": active})


async def _send_teams_message(
    screen_context: ScreenContext,  # noqa: ARG001
    session: Session,
    integration_id: str,
    title: str,
    message: str,
    severity: str = "info",
    asset_id: str | None = None,
) -> str:
    from app.api.v1.integrations.service import execute_integration_direct
    result = await execute_integration_direct(
        integration_id,
        "send_teams",
        {"title": title, "body": message, "severity": severity, "asset_id": asset_id},
        session,
    )
    return json.dumps(result)


async def _create_servicenow_incident(
    screen_context: ScreenContext,  # noqa: ARG001
    session: Session,
    integration_id: str,
    title: str,
    description: str = "",
    severity: str = "warning",
    assignment_group: str = "",
    table: str = "incident",
) -> str:
    from app.api.v1.integrations.service import execute_integration_direct
    overrides: dict[str, Any] = {"title": title, "severity": severity, "table": table}
    if description:
        overrides["body"] = description
    if assignment_group:
        overrides["assignment_group"] = assignment_group
    result = await execute_integration_direct(integration_id, "create_servicenow_incident", overrides, session)
    return json.dumps(result)


async def _send_email_alert(
    screen_context: ScreenContext,  # noqa: ARG001
    session: Session,
    integration_id: str,
    subject: str,
    body: str,
    to: str = "",
    severity: str = "info",
) -> str:
    from app.api.v1.integrations.service import execute_integration_direct
    overrides: dict[str, Any] = {"subject": subject, "body": body, "severity": severity}
    if to:
        overrides["to"] = [addr.strip() for addr in to.split(",") if addr.strip()]
    result = await execute_integration_direct(integration_id, "send_email", overrides, session)
    return json.dumps(result)


async def _get_screen_context(
    screen_context: ScreenContext,
    session: Session,  # noqa: ARG001 — kept for dispatcher uniformity
) -> str:
    """Serialise the current screen context as observable data for the model."""
    has_range = bool(screen_context.date_range_start and screen_context.date_range_end)
    payload: dict[str, Any] = {
        "active_module": screen_context.active_module,
        "asset_in_focus": screen_context.selected_team_name or "none",
        "asset_id": screen_context.selected_team_id,
        "connector": screen_context.active_connector_id or "none",
        "granularity": screen_context.granularity or "Day",
        "timeline_range_selected": has_range,
        "summary": screen_context.summary,
    }
    if has_range:
        payload["timeline_range_start_ms"] = screen_context.date_range_start
        payload["timeline_range_end_ms"] = screen_context.date_range_end
    logger.info("agent_tool — get_screen_context module=%s asset=%s",
                screen_context.active_module, screen_context.selected_team_id)
    return json.dumps(payload)


async def _analyze_focused_asset(
    screen_context: ScreenContext,
    session: Session,
    minutes: int = 30,
) -> str:
    asset_id = screen_context.selected_team_id
    if not asset_id:
        return json.dumps({
            "error": "No asset currently in focus on the dashboard. "
                     "Ask the user to open an asset in the expand view first."
        })
    logger.info("agent_tool — analyze_focused_asset asset=%s minutes=%d", asset_id, minutes)
    # Delegate to existing tool: get_sensor_statistics covers any connector
    return await execute_chat_tool("get_sensor_statistics", {"minutes": minutes}, session)


async def _analyze_selected_range(
    screen_context: ScreenContext,
    session: Session,
) -> str:
    start_ms = screen_context.date_range_start
    end_ms = screen_context.date_range_end
    if not start_ms or not end_ms:
        return json.dumps({
            "error": "No time range selected on the Timeline. "
                     "Ask the user to drag-select a range on the timeline chart first, "
                     "then try again."
        })
    from datetime import datetime, UTC as _UTC
    from app.api.v1.telemetry.service import get_statistics_absolute
    fmt = lambda ms: datetime.fromtimestamp(ms / 1000, _UTC).strftime("%b %d %H:%M UTC")
    logger.info(
        "agent_tool — analyze_selected_range start=%s end=%s",
        fmt(start_ms), fmt(end_ms),
    )
    # signal_ids=[] → returns stats for ALL signals active in the range
    stats = get_statistics_absolute(
        session,
        signal_ids=[],
        start_ms=start_ms,
        end_ms=end_ms,
        connector_id=screen_context.active_connector_id,
    )
    if not stats:
        return json.dumps({
            "range_start": fmt(start_ms),
            "range_end": fmt(end_ms),
            "error": "No telemetry readings found in the selected time range.",
        })
    return json.dumps({
        "range_start": fmt(start_ms),
        "range_end": fmt(end_ms),
        "duration_minutes": round((end_ms - start_ms) / 60_000, 1),
        "stats": stats,
    })


# ── Dispatcher ────────────────────────────────────────────────────────────────

_PLATFORM_REGISTRY: dict[str, Any] = {
    "get_screen_context": _get_screen_context,
    "analyze_focused_asset": _analyze_focused_asset,
    "analyze_selected_range": _analyze_selected_range,
    "list_integrations": _list_integrations,
    "send_teams_message": _send_teams_message,
    "create_servicenow_incident": _create_servicenow_incident,
    "send_email_alert": _send_email_alert,
}


async def execute_agent_tool(
    name: str,
    args: dict,
    screen_context: ScreenContext,
    session: Session,
) -> str:
    """Dispatch a tool call.

    Platform tools get screen_context injected automatically.
    All other tools are forwarded to the shared chat tool dispatcher.
    """
    platform_fn = _PLATFORM_REGISTRY.get(name)
    if platform_fn:
        logger.info("agent_tool_dispatch — platform tool=%s", name)
        return await platform_fn(screen_context=screen_context, session=session, **args)

    logger.info("agent_tool_dispatch — chat tool=%s", name)
    return await execute_chat_tool(name, args, session)
