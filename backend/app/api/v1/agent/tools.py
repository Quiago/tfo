"""
agent/tools.py — Tool registry for the Agent domain.

Extends the shared chat tool registry with two platform-aware tools that
leverage Screen Context — no asset ID or time range required from the user:

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
    minutes = max(1, int((end_ms - start_ms) / 60_000))
    logger.info("agent_tool — analyze_selected_range minutes=%d", minutes)
    return await execute_chat_tool("query_time_range", {"minutes": minutes}, session)


# ── Dispatcher ────────────────────────────────────────────────────────────────

_PLATFORM_REGISTRY: dict[str, Any] = {
    "analyze_focused_asset": _analyze_focused_asset,
    "analyze_selected_range": _analyze_selected_range,
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
