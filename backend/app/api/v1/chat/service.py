"""
chat/service.py — Lógica de negocio del dominio chat.

Flujo de inferencia (send_message):
  1. Guardar mensaje del usuario.
  2. Construir contexto (system + memorias + historial).
  3. Loop de tool calling:
       a. Generar respuesta con el LLM.
       b. Si contiene <tool_call>: ejecutar tool, añadir resultado, volver a 3a.
       c. Si no: respuesta final → salir del loop.
  4. Guardar mensaje del assistant.
  5. Actualizar timestamp de la conversación.
"""
import json
import logging
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Session, select

from app.api.v1.chat.context import build_context, parse_tool_call
from app.api.v1.chat.exceptions import (
    ConversationAccessDenied,
    ConversationNotFound,
    MemoryAccessDenied,
    MemoryNotFound,
    ModelNotReady,
)
from app.api.v1.chat.models import Conversation, MemoryEntry, Message
from app.api.v1.chat.schemas import ConversationCreate, ConversationUpdate, MemoryCreate
from app.api.v1.chat.tools import execute_tool
from app.api.v1.llms.engine import engine

logger = logging.getLogger(__name__)

_MAX_TOOL_ITERATIONS = 5


def create_conversation(data: ConversationCreate, user_id: int, session: Session) -> Conversation:
    conv = Conversation(
        user_id=user_id,
        model_id=data.model_id,
        title=data.title,
        system_prompt=data.system_prompt,
        max_context_messages=data.max_context_messages,
    )
    session.add(conv)
    session.commit()
    session.refresh(conv)
    logger.info("conversation_created", extra={"conversation_id": conv.id, "user_id": user_id})
    return conv


def list_conversations(user_id: int, session: Session) -> list[Conversation]:
    return list(
        session.exec(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        ).all()
    )


def get_conversation(conversation_id: str, user_id: int, session: Session) -> Conversation:
    conv = session.get(Conversation, conversation_id)
    if not conv:
        raise ConversationNotFound
    if conv.user_id != user_id:
        raise ConversationAccessDenied
    return conv


def update_conversation(conversation_id: str, data: ConversationUpdate, user_id: int, session: Session) -> Conversation:
    conv = get_conversation(conversation_id, user_id, session)
    for attr, value in data.model_dump(exclude_none=True).items():
        setattr(conv, attr, value)
    conv.updated_at = datetime.now(UTC)
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return conv


def delete_conversation(conversation_id: str, user_id: int, session: Session) -> None:
    conv = get_conversation(conversation_id, user_id, session)
    msgs = session.exec(select(Message).where(Message.conversation_id == conversation_id)).all()
    for msg in msgs:
        session.delete(msg)
    session.delete(conv)
    session.commit()
    logger.info("conversation_deleted", extra={"conversation_id": conversation_id})


def list_messages(conversation_id: str, user_id: int, session: Session) -> list[Message]:
    get_conversation(conversation_id, user_id, session)
    return list(
        session.exec(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        ).all()
    )


async def send_message(conversation_id: str, user_id: int, content: str, max_new_tokens: int, temperature: float, session: Session) -> Message:
    if not engine.is_ready:
        raise ModelNotReady

    conv = get_conversation(conversation_id, user_id, session)
    memories = _get_user_memories(user_id, session)

    _save_message(conv.id, "user", content, session)
    _auto_title(conv, content, session)

    messages = list_messages(conversation_id, user_id, session)
    context = build_context(conv, messages, memories, enable_tools=True)

    final_text, tool_calls_log = await _run_tool_loop(context, max_new_tokens, temperature, session)

    assistant_msg = _save_message(conv.id, "assistant", final_text, session, tool_calls=tool_calls_log or None)
    _touch_conversation(conv, session)
    return assistant_msg


async def send_message_streaming(conversation_id: str, user_id: int, content: str, max_new_tokens: int, temperature: float, session: Session) -> AsyncGenerator[dict, None]:
    if not engine.is_ready:
        yield {"type": "error", "error": "No model loaded. Call POST /llms/load first."}
        return

    try:
        conv = get_conversation(conversation_id, user_id, session)
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}
        return

    memories = _get_user_memories(user_id, session)
    _save_message(conv.id, "user", content, session)
    _auto_title(conv, content, session)

    messages = list_messages(conversation_id, user_id, session)
    context = build_context(conv, messages, memories, enable_tools=True)

    tool_calls_log: list[dict] = []
    final_text = ""

    for iteration in range(_MAX_TOOL_ITERATIONS):
        response = await engine.generate(context, max_new_tokens, temperature)
        tool_name, tool_args = parse_tool_call(response)

        if not tool_name:
            final_text = response
            break

        yield {"type": "tool_call", "name": tool_name, "arguments": tool_args}

        tool_result = await execute_tool(tool_name, tool_args, session)
        tool_calls_log.append({"name": tool_name, "arguments": tool_args, "result": tool_result})

        yield {
            "type": "tool_result",
            "name": tool_name,
            "result_preview": tool_result[:120] + ("…" if len(tool_result) > 120 else ""),
        }

        context.append({"role": "assistant", "content": response})
        context.append({
            "role": "user",
            "content": f"Tool result for {tool_name}:\n{tool_result}\n\nNow answer the original question.",
        })
    else:
        logger.warning("max_tool_iterations", extra={"conversation_id": conversation_id})
        final_text = response  # noqa: F821

    words = final_text.split(" ")
    for i, word in enumerate(words):
        chunk = word + (" " if i < len(words) - 1 else "")
        yield {"type": "token", "content": chunk}

    assistant_msg = _save_message(conv.id, "assistant", final_text, session, tool_calls=tool_calls_log or None)
    _touch_conversation(conv, session)

    yield {"type": "done", "message_id": assistant_msg.id, "conversation_id": conv.id}


def list_memories(user_id: int, session: Session) -> list[MemoryEntry]:
    return list(
        session.exec(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id)
            .order_by(MemoryEntry.created_at.desc())
        ).all()
    )


def create_memory(data: MemoryCreate, user_id: int, session: Session) -> MemoryEntry:
    entry = MemoryEntry(user_id=user_id, content=data.content)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    logger.info("memory_created", extra={"user_id": user_id})
    return entry


def delete_memory(memory_id: int, user_id: int, session: Session) -> None:
    entry = session.get(MemoryEntry, memory_id)
    if not entry:
        raise MemoryNotFound
    if entry.user_id != user_id:
        raise MemoryAccessDenied
    session.delete(entry)
    session.commit()


async def _run_tool_loop(context: list[dict], max_new_tokens: int, temperature: float, session: Session) -> tuple[str, list[dict]]:
    tool_calls_log: list[dict] = []

    for iteration in range(_MAX_TOOL_ITERATIONS):
        response = await engine.generate(context, max_new_tokens, temperature)
        tool_name, tool_args = parse_tool_call(response)

        if not tool_name:
            return response, tool_calls_log

        logger.info("tool_call_executed", extra={"tool": tool_name, "iteration": iteration})
        tool_result = await execute_tool(tool_name, tool_args, session)
        tool_calls_log.append({"name": tool_name, "arguments": tool_args, "result": tool_result})

        context.append({"role": "assistant", "content": response})
        context.append({
            "role": "user",
            "content": f"Tool result for {tool_name}:\n{tool_result}\n\nNow answer the original question.",
        })

    logger.warning("max_tool_iterations_reached")
    return response, tool_calls_log  # noqa: F821


def _save_message(conversation_id: str, role: str, content: str, session: Session, tool_calls: list | None = None, tool_call_id: str | None = None) -> Message:
    msg = Message(
        id=uuid4().hex,
        conversation_id=conversation_id,
        role=role,
        content=content,
        tool_calls=json.dumps(tool_calls) if tool_calls else None,
        tool_call_id=tool_call_id,
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


def _auto_title(conv: Conversation, content: str, session: Session) -> None:
    if conv.title:
        return
    conv.title = content[:60] + ("…" if len(content) > 60 else "")
    conv.updated_at = datetime.now(UTC)
    session.add(conv)
    session.commit()


def _get_user_memories(user_id: int, session: Session) -> list[MemoryEntry]:
    return list(
        session.exec(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id)
            .order_by(MemoryEntry.created_at.desc())
            .limit(10)
        ).all()
    )


def _touch_conversation(conv: Conversation, session: Session) -> None:
    conv.updated_at = datetime.now(UTC)
    session.add(conv)
    session.commit()
