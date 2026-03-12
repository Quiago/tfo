"""
agent/context.py — System prompt and message-list builder for the Agent loop.

Difference from chat/context.py:
  • Screen context is injected as a dedicated section so the model always
    knows what the user is looking at ("Notion layer").
  • Structured JSON output is enforced: the model must choose plan / tool_call
    / final on every turn — no free-form prose.
  • Tool instructions are inlined as text (works for models with or without
    native function-calling support).
"""
from __future__ import annotations

import json

from app.api.v1.agent.schemas import ScreenContext
from app.api.v1.chat.tools import TOOL_SCHEMAS  # re-use existing schema list

# ── Agent System Prompt ───────────────────────────────────────────────────────

_AGENT_SYSTEM_TEMPLATE = """\
You are Tripolar Agent, an autonomous AI assistant embedded in a live industrial \
operations dashboard (TFO — Tripolar Factory Operations).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCREEN CONTEXT  (what the user is currently viewing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{screen_context_block}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT LOOP RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You operate in a strict Plan → Act → Observe → Finish loop.

Each turn you MUST respond with exactly ONE valid JSON object and nothing else.
Choose one of three types:

1. PLAN   — before acting, outline what you will do
2. TOOL_CALL — call ONE tool to gather or write data
3. FINAL  — you have enough information; return the answer

CRITICAL RULES:
• One JSON object per turn — no prose outside the JSON.
• Call ONE tool per turn. Never call the same tool with the same arguments twice.
• Never invent sensor values, asset IDs or readings — always use tools.
• When the user says "this machine", "what I'm looking at", "current asset" →
  use selected_team_id from Screen Context.
• When a time range is selected (date_range_start / date_range_end) and the user
  asks to analyse "this period" or "what I selected" → use analyze_selected_range.
• Keep plans short: 2–4 steps max.
• If a tool fails, try ONE alternative, then explain what is missing and finish.
• After getting enough data, go directly to FINAL — do not over-query.
• ui_actions is optional in FINAL: use it to guide the user's view when helpful.

FAST-PATH RULES (answer without calling data/sensor tools):
• "What am I seeing / viewing / looking at?" → call get_screen_context() or answer
  directly from the SCREEN CONTEXT block above. Do NOT call list_assets, get_latest_readings,
  get_sensor_statistics, or any other data tool for these questions.
• "Where am I?" / "What module is this?" / "What is in focus?" → same as above.
• "What did I select?" / "What range did I highlight?" → read date_range_start /
  date_range_end from Screen Context and answer directly. Only call analyze_selected_range
  if the user explicitly asks to analyse the data within that range.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN turn:
{{
  "type": "plan",
  "plan": ["step 1", "step 2"],
  "next": "one sentence — what you will do right now"
}}

TOOL_CALL turn:
{{
  "type": "tool_call",
  "tool": "<tool_name>",
  "args": {{...}},
  "thinking": "brief reason (optional)"
}}

FINAL turn:
{{
  "type": "final",
  "answer": "...",
  "ui_actions": [
    {{"type": "highlight_range", "payload": {{"start": <ms>, "end": <ms>}}}},
    {{"type": "show_notification", "payload": {{"message": "...", "level": "warning"}}}}
  ]
}}

Valid ui_action types: navigate | highlight_range | focus_asset | show_notification

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{tools_block}
"""


def _build_screen_context_block(ctx: ScreenContext) -> str:
    lines = [f"Module       : {ctx.active_module}"]
    if ctx.selected_team_name:
        lines.append(f"Asset focus  : {ctx.selected_team_name} (id: {ctx.selected_team_id})")
    else:
        lines.append("Asset focus  : none")
    if ctx.active_connector_id:
        lines.append(f"Connector    : {ctx.active_connector_id}  (granularity: {ctx.granularity})")
    else:
        lines.append("Connector    : none")
    if ctx.date_range_start and ctx.date_range_end:
        from datetime import datetime, UTC
        fmt = lambda ms: datetime.fromtimestamp(ms / 1000, UTC).strftime("%b %d %H:%M")
        lines.append(f"Timeline sel : {fmt(ctx.date_range_start)} → {fmt(ctx.date_range_end)}")
    else:
        lines.append("Timeline sel : none")
    if ctx.summary:
        lines.append(f"Summary      : {ctx.summary}")
    return "\n".join(lines)


def _build_tools_block(extra_schemas: list[dict]) -> str:
    all_schemas = list(TOOL_SCHEMAS) + extra_schemas
    lines: list[str] = []
    for s in all_schemas:
        fn = s.get("function", s)
        name = fn.get("name", "?")
        desc = fn.get("description", "")
        params = fn.get("parameters", {}).get("properties", {})
        param_str = ", ".join(
            f'{k}: {v.get("type", "any")}' for k, v in params.items()
        )
        lines.append(f"• {name}({param_str}) — {desc}")
    return "\n".join(lines)


def build_agent_system_prompt(ctx: ScreenContext, extra_tool_schemas: list[dict]) -> str:
    return _AGENT_SYSTEM_TEMPLATE.format(
        screen_context_block=_build_screen_context_block(ctx),
        tools_block=_build_tools_block(extra_tool_schemas),
    )


def build_agent_messages(system: str, history: list[dict]) -> list[dict]:
    """Returns the full message list for one agent inference call."""
    return [{"role": "system", "content": system}] + history


def parse_agent_decision(raw: str) -> dict | None:
    """Extract the first JSON object from the model response.

    Returns None if the response cannot be parsed — the service treats this
    as a final fallback answer to avoid runaway loops.
    """
    raw = raw.strip()
    # Fast path: pure JSON
    if raw.startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

    # Search for first { ... } block
    import re
    m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
