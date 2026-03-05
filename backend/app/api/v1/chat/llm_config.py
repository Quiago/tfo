"""
chat/llm_config.py — Configuración por familia de modelo para tool calling.

Patrón: Strategy + Registry.
  - Cada ModelConfig es una estrategia inmutable con las reglas del modelo.
  - get_model_config(model_id) hace el dispatch por prefijo/substring.
"""
from dataclasses import dataclass


def _fmt_plain(tool_name: str, result: str) -> str:
    """
    Formato estándar OpenAI / Qwen / Mistral.
    role='tool' + contenido plano.
    """
    return result


def _fmt_llama(tool_name: str, result: str) -> str:
    """
    Formato Llama 3.1 / 3.2.
    role='ipython' + contenido plano.
    """
    return result


def _fmt_fallback(tool_name: str, result: str) -> str:
    """
    Formato para modelos sin tool calling nativo (Gemma, etc.).
    """
    return f"[Tool '{tool_name}' executed successfully]\nResult:\n{result}\n\nNow answer the user's question using ONLY this real data. Do not invent or supplement with other values."


_FALLBACK_INSTRUCTIONS = (
    "\n## Tool Calling Instructions (use ONLY when native tools are not available)\n"
    "When the user asks about sensor values, asset readings, or real-time data:\n"
    "1. To call a tool, output EXACTLY this format on its own line:\n"
    '   <tool_call>{"name": "TOOL_NAME", "arguments": {"param": "value"}}</tool_call>\n'
    "2. Use the exact asset_id and property_name from the Available Assets list.\n"
    "3. NEVER invent values. Call the tool to get real data."
)


@dataclass(frozen=True)
class ModelConfig:
    """
    Contrato de un modelo para tool calling y formateo de contexto.
    Todos los campos son inmutables (frozen=True).
    """

    name: str
    description: str
    supports_native_tools: bool
    tool_result_role: str
    tool_result_formatter: object
    fallback_tool_instructions: str


_REGISTRY: dict[str, ModelConfig] = {
    "llama-3": ModelConfig(
        name="llama-3",
        description="Llama 3.1 / 3.2 — native function calling, tool result via ipython role",
        supports_native_tools=True,
        tool_result_role="ipython",
        tool_result_formatter=_fmt_llama,
        fallback_tool_instructions="",
    ),
    "qwen": ModelConfig(
        name="qwen",
        description="Qwen 2.5 — native tool calling, tool result via tool role",
        supports_native_tools=True,
        tool_result_role="tool",
        tool_result_formatter=_fmt_plain,
        fallback_tool_instructions="",
    ),
    "mistral": ModelConfig(
        name="mistral",
        description="Mistral — native tool calling, OpenAI-compatible format",
        supports_native_tools=True,
        tool_result_role="tool",
        tool_result_formatter=_fmt_plain,
        fallback_tool_instructions="",
    ),
    "phi": ModelConfig(
        name="phi",
        description="Microsoft Phi-3/4 — native tool calling via tool role",
        supports_native_tools=True,
        tool_result_role="tool",
        tool_result_formatter=_fmt_plain,
        fallback_tool_instructions="",
    ),
    "gemma": ModelConfig(
        name="gemma",
        description="Gemma 2B/7B — no native tool calling, prompt engineering fallback",
        supports_native_tools=False,
        tool_result_role="user",
        tool_result_formatter=_fmt_fallback,
        fallback_tool_instructions=_FALLBACK_INSTRUCTIONS,
    ),
    "falcon": ModelConfig(
        name="falcon",
        description="Falcon — no native tool calling, prompt engineering fallback",
        supports_native_tools=False,
        tool_result_role="user",
        tool_result_formatter=_fmt_fallback,
        fallback_tool_instructions=_FALLBACK_INSTRUCTIONS,
    ),
}

_DEFAULT_CONFIG = ModelConfig(
    name="default",
    description="Default — tries native tools, falls back gracefully",
    supports_native_tools=True,
    tool_result_role="tool",
    tool_result_formatter=_fmt_plain,
    fallback_tool_instructions="",
)


def get_model_config(model_id: str) -> ModelConfig:
    """
    Devuelve la ModelConfig para un model_id dado.
    Matching por substring case-insensitive.
    """
    model_lower = model_id.lower()
    for key, config in _REGISTRY.items():
        if key in model_lower:
            return config
    return _DEFAULT_CONFIG
