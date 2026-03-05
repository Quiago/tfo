"""
chat/schemas.py — Contratos HTTP del dominio chat.
"""
import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class ConversationCreate(BaseModel):
    model_id: str = "tinyllama-1.1b"
    title: str | None = None
    system_prompt: str | None = None
    max_context_messages: int = 20


class ConversationUpdate(BaseModel):
    title: str | None = None
    system_prompt: str | None = None
    max_context_messages: int | None = None


class ConversationResponse(BaseModel):
    id: str
    user_id: int
    title: str | None
    model_id: str
    system_prompt: str | None
    max_context_messages: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str
    stream: bool = False
    max_new_tokens: int = 512
    temperature: float = 0.7


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    tool_calls: list[dict] | None = None
    created_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("tool_calls", mode="before")
    @classmethod
    def parse_tool_calls(cls, v: Any) -> Any:
        """Deserializa tool_calls de JSON string a lista de dicts."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class ConversationDetailResponse(ConversationResponse):
    messages: list[MessageResponse] = []


class ChatStreamEvent(BaseModel):
    """
    Evento SSE emitido durante la generación.

    Tipos posibles:
      token       → fragmento de texto del assistant
      tool_call   → el LLM decidió llamar una herramienta
      tool_result → resultado de la herramienta (preview)
      done        → generación terminada, incluye message_id
      error       → error durante la generación
    """

    type: str
    content: str | None = None
    name: str | None = None
    arguments: dict | None = None
    result_preview: str | None = None
    message_id: str | None = None
    conversation_id: str | None = None
    error: str | None = None


class MemoryCreate(BaseModel):
    content: str


class MemoryEntryResponse(BaseModel):
    id: int
    user_id: int
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ToolParameterSchema(BaseModel):
    type: str
    properties: dict
    required: list = []


class ToolSchema(BaseModel):
    name: str
    description: str
    parameters: ToolParameterSchema
