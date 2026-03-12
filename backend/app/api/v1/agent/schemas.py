"""
agent/schemas.py — Pydantic contracts for the Agent domain.

Key difference from chat: every request includes a ScreenContext that tells
the agent exactly which module, asset, connector and time range the user is
currently looking at — the Notion-style "where are you" layer.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Screen Context ────────────────────────────────────────────────────────────

class ScreenContext(BaseModel):
    """Serialised UI state from the frontend useScreenContext Zustand store.

    Populated by the frontend before every agent call; the agent uses it to
    answer questions like "analyse what I'm looking at" without the user
    having to manually specify assets or time windows.
    """
    active_module: str = "overview"
    selected_team_id: str | None = None       # mesh name / asset ID in focus
    selected_team_name: str | None = None     # human-readable label
    active_connector_id: str | None = None    # OPC UA / MQTT connector
    granularity: str | None = "Day"           # Minute | Hour | Day | Month | Year
    date_range_start: int | None = None       # epoch ms — drawn range on timeline
    date_range_end: int | None = None         # epoch ms
    summary: str = ""                         # pre-built human-readable string


# ── Request / Response ────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4_000)
    screen_context: ScreenContext
    max_steps: int = Field(default=8, ge=1, le=20)
    max_tool_calls: int = Field(default=5, ge=0, le=10)


# ── UI Actions ────────────────────────────────────────────────────────────────
#
# Structured instructions the agent returns to the frontend after reasoning.
# The frontend executes them against Zustand stores / router without touching
# the DOM directly — same pattern as Notion AI "driver" layer.

class UIAction(BaseModel):
    type: Literal[
        "navigate",          # switch module/view
        "highlight_range",   # draw a ReferenceArea on the Timeline
        "focus_asset",       # open expand view for an asset
        "show_notification", # display a toast / alert badge
    ]
    payload: dict[str, Any] = {}


# ── SSE Stream Events ─────────────────────────────────────────────────────────

class AgentStreamEvent(BaseModel):
    type: Literal["plan", "tool_call", "tool_result", "thinking", "token", "ui_action", "done", "error"]
    # Token-by-token text
    content: str | None = None
    # Plan step
    plan: list[str] | None = None
    next_step: str | None = None
    # Tool
    tool_name: str | None = None
    tool_args: dict | None = None
    tool_result_preview: str | None = None
    # UI action
    ui_action: UIAction | None = None
    # Final
    steps_taken: int | None = None
    tool_calls_made: int | None = None
    ui_actions: list[UIAction] | None = None
    # Error
    error: str | None = None
