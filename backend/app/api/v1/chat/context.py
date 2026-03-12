"""
chat/context.py — Construcción de contexto para inferencia LLM.
"""
from __future__ import annotations

import json
import re

from app.api.v1.chat.llm_config import ModelConfig
from app.api.v1.chat.models import Conversation, MemoryEntry, Message
from app.api.v1.chat.tools import TOOL_SCHEMAS

_BASE_SYSTEM = (
    "You are Tripolar AI, an industrial AI assistant specialized in manufacturing, "
    "process automation, and industrial IoT.\n"
    "You help plant operators monitor equipment, analyze sensor data, control industrial assets, "
    "and answer questions about company documents and manuals.\n"
    "Be precise with measurements, always include units, and be safety-conscious when suggesting write operations on equipment.\n\n"
    "CRITICAL RULES — follow these exactly:\n"
    "1. When the user asks about assets, equipment, sensor readings, or connectors → "
    "call list_assets or read_asset_property FIRST, then answer with the real data.\n"
    "2. When the user asks about documents, manuals, procedures, specifications, or says "
    "'this document', 'the document', 'what does it say', 'summarize', 'explain this' → "
    "call search_knowledge_base FIRST with a relevant query, then answer with the retrieved content.\n"
    "3. When the user asks about sensor trends, historical data, statistics, power consumption over time, "
    "temperature history, or any time-range query → "
    "call query_time_range or get_sensor_statistics FIRST with the relevant signal IDs and time window.\n"
    "4. When the user asks about current factory values (temperature, vibration, power, robot speed, etc.) → "
    "call get_latest_readings FIRST, then answer with the real data.\n"
    "5. NEVER invent, guess, or answer from memory. Always call a tool first when real data or documents are involved.\n"
    "6. If the user's question is ambiguous but documents are available, "
    "call search_knowledge_base with the user's exact words as the query.\n"
    "Available signal IDs: zone1_temperature, zone2_temperature, ambient_temperature, "
    "vibration_x, vibration_y, vibration_z, humidity, line_pressure, "
    "total_power, aux_power, power_factor, grid_frequency, energy_today, "
    "throughput, cycle_time, defect_rate, yield_rate, parts_assembled, "
    "robot1_speed, robot1_joint_temp, robot1_load, robot1_power, "
    "robot2_speed, robot2_joint_temp, robot2_load, robot2_power, "
    "robot3_speed, robot3_joint_temp, robot3_load, robot3_power, "
    "robot4_speed, robot4_joint_temp, robot4_load, robot4_power."
)

_ASSET_CATALOG = (
    "\n## Available Assets — use these exact IDs and property names in tool calls:\n{catalog}\n"
)

_KB_DOCUMENTS = (
    "\n## Knowledge Base — Documents available for search:\n"
    "Call search_knowledge_base(query) for ANY question about these documents.\n"
    "{doc_list}\n"
)

_TOOLS_SECTION = (
    "\n## Available Tools — CALL THESE TO GET REAL DATA\n"
    "You MUST call a tool for any question about assets, sensors, readings, connectors, or documents.\n"
    "Do NOT describe, guess, or narrate. Output the tool call, wait for the result, then answer.\n\n"
    "Call format — output EXACTLY this on its own line, no extra text:\n"
    '<tool_call>{{"name": "TOOL_NAME", "arguments": {{"param": "value"}}}}</tool_call>\n\n'
    "{tool_list}"
)

_LLAMA_TOOL_RE = re.compile(r"<\|python_tag\|>(.*?)(?:<\|eom_id\|>|<\|eot_id\|>|$)", re.DOTALL)
_XML_TOOL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)
_JSON_TOOL_RE = re.compile(r'\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*\}')

_KNOWN_TOOLS = {s["name"] for s in TOOL_SCHEMAS}

OPENAI_TOOL_SCHEMAS = None


def _to_openai_tools(schemas: list) -> list:
    """
    Convierte nuestros schemas al formato OpenAI function-calling que espera
    apply_chat_template.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": s.get("name"),
                "description": s.get("description", ""),
                "parameters": s.get("parameters"),
            },
        }
        for s in schemas
    ]


OPENAI_TOOL_SCHEMAS = _to_openai_tools(TOOL_SCHEMAS)


def _build_tools_text() -> str:
    """
    Builds a human-readable tool reference injected into every system prompt.

    This is the critical fallback: even when apply_chat_template silently drops
    the tools= argument (common on small or misconfigured models), the model still
    sees what tools exist and the exact call format it must use.
    """
    lines = []
    for s in TOOL_SCHEMAS:
        props = s.get("parameters", {}).get("properties", {})
        if props:
            params = ", ".join(
                f'{k}: {v.get("type", "string")}' + (f' — {v["description"]}' if v.get("description") else "")
                for k, v in props.items()
            )
            sig = f'{s["name"]}({params})'
        else:
            sig = f'{s["name"]}()  # no arguments needed'
        lines.append(f"  • {sig}\n    {s['description']}")
    return _TOOLS_SECTION.format(tool_list="\n".join(lines))


def build_context(
    conversation: Conversation,
    messages: list[Message],
    memories: list[MemoryEntry],
    model_config: ModelConfig = None,
    asset_catalog: list[dict] = None,
    kb_documents: list[dict] | None = None,
    screen_context: "ScreenContextSnapshot | None" = None,
) -> list[dict]:
    """
    Construye la lista de mensajes en formato OpenAI para el engine.

    kb_documents: list of {"title": str, "chunk_count": int} — injected into
    the system prompt so the model knows which documents it can search.
    """
    system_prompt = conversation.system_prompt or _BASE_SYSTEM

    system_parts = [system_prompt]

    # Always inject tool schemas as text — this ensures the model knows what
    # tools exist and how to call them even when apply_chat_template silently
    # drops the tools= argument.
    system_parts.append(_build_tools_text())

    if asset_catalog:
        lines = []
        for a in asset_catalog:
            props = ", ".join(a.get("property_names", []))
            line = f'- asset_id="{a["asset_id"]}"  name="{a["name"]}"  properties=[{props}]'
            lines.append(line)
        system_parts.append(_ASSET_CATALOG.format(catalog="\n".join(lines)))

    if kb_documents:
        doc_lines = [
            f'- "{d["title"]}" ({d.get("chunk_count", "?")} chunks)'
            for d in kb_documents
        ]
        system_parts.append(_KB_DOCUMENTS.format(doc_list="\n".join(doc_lines)))

    if screen_context:
        lines = [f"Module       : {screen_context.active_module}"]
        if screen_context.selected_team_name:
            lines.append(f"Asset focus  : {screen_context.selected_team_name}")
        if screen_context.active_connector_id:
            lines.append(f"Connector    : {screen_context.active_connector_id}  (granularity: {screen_context.granularity})")
        if screen_context.date_range_start and screen_context.date_range_end:
            from datetime import datetime, UTC
            fmt = lambda ms: datetime.fromtimestamp(ms / 1000, UTC).strftime("%b %d %H:%M")
            lines.append(
                f"Selected range: {fmt(screen_context.date_range_start)} → {fmt(screen_context.date_range_end)}"
            )
        if screen_context.summary:
            lines.append(f"Summary      : {screen_context.summary}")
        ctx_block = "\n".join(lines)
        system_parts.append(
            "\n## SCREEN CONTEXT — what the user is currently viewing\n"
            f"{ctx_block}\n"
            "When the user refers to 'the selected range', 'this period', or 'what I highlighted' → "
            "use the selected range timestamps above with query_time_range or get_sensor_statistics."
        )

    if memories:
        mem_text = "\n## Long-term Context\n" + "\n".join(f"- {m.content}" for m in memories)
        system_parts.append(mem_text)

    # Keep any model-specific extra instructions (e.g. Gemma fallback coercion)
    if model_config and model_config.fallback_tool_instructions:
        system_parts.append(model_config.fallback_tool_instructions)

    system_content = "\n".join(system_parts)

    window = messages[-conversation.max_context_messages:] if messages else []
    history = [{"role": msg.role, "content": msg.content} for msg in window]

    return [{"role": "system", "content": system_content}] + history


def _try_parse(raw: str) -> tuple[str | None, dict]:
    """Intenta parsear JSON de una tool call. Soporta 'arguments' y 'parameters'."""
    try:
        data = json.loads(raw.strip())
        name = data.get("name")
        args = data.get("arguments") or data.get("parameters") or {}
        return name, args
    except (json.JSONDecodeError, AttributeError, TypeError):
        return None, {}


def parse_tool_call(response: str) -> tuple[str | None, dict]:
    """
    Detecta y parsea una tool call del texto generado por el LLM.

    Prueba en orden:
      1. Llama 3.1/3.2: <|python_tag|>json<|eom_id|>
      2. Qwen / XML:    <tool_call>json</tool_call>
      3. JSON inline:   {"name": "...", "parameters": {...}}

    Devuelve (tool_name, arguments) o (None, {}) si no encuentra ninguno válido.
    """
    m = _LLAMA_TOOL_RE.search(response)
    if m:
        name, args = _try_parse(m.group(1))
        if name and name in _KNOWN_TOOLS:
            return name, args

    m = _XML_TOOL_RE.search(response)
    if m:
        name, args = _try_parse(m.group(1))
        if name and name in _KNOWN_TOOLS:
            return name, args

    for m in _JSON_TOOL_RE.finditer(response):
        name, args = _try_parse(m.group(0))
        if name and name in _KNOWN_TOOLS:
            return name, args

    return None, {}
