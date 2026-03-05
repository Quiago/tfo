"""
chat/context.py — Construcción de contexto para inferencia LLM.
"""
import json
import re

from app.api.v1.chat.llm_config import ModelConfig
from app.api.v1.chat.models import Conversation, MemoryEntry, Message
from app.api.v1.chat.tools import TOOL_SCHEMAS

_BASE_SYSTEM = (
    "You are Tripolar AI, an industrial AI assistant specialized in manufacturing, "
    "process automation, and industrial IoT.\n"
    "You help plant operators monitor equipment, analyze sensor data, and control industrial assets safely.\n"
    "Be precise with measurements, always include units, and be safety-conscious when suggesting write operations on equipment.\n"
    "ALWAYS use the provided tools to get real-time data. NEVER invent or guess sensor values."
)

_ASSET_CATALOG = (
    "\n## Available Assets — use these exact IDs and property names in tool calls:\n{catalog}\n"
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


def build_context(
    conversation: Conversation,
    messages: list[Message],
    memories: list[MemoryEntry],
    model_config: ModelConfig = None,
    asset_catalog: list[dict] = None,
) -> list[dict]:
    """
    Construye la lista de mensajes en formato OpenAI para el engine.
    """
    system_prompt = conversation.system_prompt or _BASE_SYSTEM

    system_parts = [system_prompt]

    if asset_catalog:
        lines = []
        for a in asset_catalog:
            props = ", ".join(a.get("property_names", []))
            line = f'- asset_id="{a["asset_id"]}"  name="{a["name"]}"  properties=[{props}]'
            lines.append(line)
        system_parts.append(_ASSET_CATALOG.format(catalog="\n".join(lines)))

    if memories:
        mem_text = "\n## Long-term Context\n" + "\n".join(f"- {m.content}" for m in memories)
        system_parts.append(mem_text)

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
