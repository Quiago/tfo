"""
chat/models.py — Entidades persistidas del dominio chat.

Conversation → hilo de conversación de un usuario con un modelo.
Message      → cada turno del hilo (user / assistant / tool).
MemoryEntry  → hechos de largo plazo que el usuario quiere que el LLM recuerde
               en todas sus conversaciones (cross-conversation memory).
"""
from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Field, SQLModel


class Conversation(SQLModel, table=True):
    """
    Hilo de conversación. Aísla el contexto, el modelo y el system prompt.

    max_context_messages controla la ventana deslizante: cuántos mensajes
    históricos se inyectan en cada llamada al LLM. Más mensajes = mejor
    contexto pero mayor latencia y consumo de RAM.
    """

    __tablename__ = "conversation"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    model_id: str
    title: str | None = None
    system_prompt: str | None = None
    max_context_messages: int = 20
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Message(SQLModel, table=True):
    """
    Turno individual de la conversación.

    role: "user" | "assistant" | "tool"
    content: texto plano para user/assistant; resultado JSON para tool.
    tool_calls: JSON serializado de las tool calls que hizo el assistant.
    tool_call_id: referencia al tool call que generó este resultado (role="tool").
    """

    __tablename__ = "message"

    id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)
    role: str
    content: str
    tool_calls: str | None = None
    tool_call_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MemoryEntry(SQLModel, table=True):
    """
    Hecho persistente de largo plazo por usuario.

    Se inyecta en el system prompt de TODAS las conversaciones del usuario,
    dando continuidad cross-conversation sin guardar el historial completo.

    Ejemplos:
      "El usuario trabaja con bombas centrífugas en planta norte."
      "Temperatura de alarma para pump-1 es > 95°C."
    """

    __tablename__ = "memory_entry"

    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
