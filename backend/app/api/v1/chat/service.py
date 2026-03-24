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
import re
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Session, select

from app.api.v1.chat.context import OPENAI_TOOL_SCHEMAS, build_context, parse_tool_call
from app.api.v1.chat.llm_config import ModelConfig, get_model_config
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
_THINK_CLOSED_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)
_THINK_OPEN_RE = re.compile(r"<think>(.*)", re.DOTALL)

# Chars to accumulate before committing to "this is a final answer, not a tool call".
# Keeps TTFT low while still catching tool-call prefixes reliably.
_STREAM_LOOKAHEAD = 128


def _extract_thinking(text: str) -> tuple[str, str | None]:
    """Strip <think>…</think> from text. Returns (clean_text, thinking_content | None).

    Handles both closed tags and unclosed tags (truncated by max_new_tokens).
    """
    # Prefer closed tag — strip all occurrences, capture first block
    m = _THINK_CLOSED_RE.search(text)
    if m:
        return _THINK_CLOSED_RE.sub("", text).strip(), m.group(1).strip()
    # Fallback: unclosed <think> (model was cut off before </think>)
    # Everything from <think> to end of string is treated as thinking.
    m = _THINK_OPEN_RE.search(text)
    if m:
        return text[: m.start()].strip(), m.group(1).strip()
    return text, None


async def _stream_llm_response(
    context: list[dict],
    max_new_tokens: int,
    temperature: float,
    tools: list | None,
) -> AsyncGenerator[dict, None]:
    """
    Real-streaming wrapper over engine.generate_stream().

    Handles two special cases transparently:
      • <think>…</think>  → buffers block, emits {"type": "thinking", "content": "…"}
                            then continues streaming the answer normally.
      • <tool_call>…      → detected in the lookahead buffer; emits a single internal
                            {"type": "_tool_detected", "text": full_response} event so
                            the caller can run the tool without the user seeing raw JSON.

    Normal text is emitted as {"type": "token", "content": delta}.

    The caller owns the final assembly (persisting to DB, etc.).
    """
    # State: "lookahead" | "thinking" | "streaming" | "tool_call"
    state = "lookahead"
    buf = ""        # always accumulates the full raw output
    think_buf = ""  # content inside <think>…</think>

    async for delta in engine.generate_stream(context, max_new_tokens, temperature, tools):
        buf += delta

        if state == "lookahead":
            # Early tool-call detection (model outputs <tool_call> right away)
            if "<tool_call>" in buf:
                state = "tool_call"
                continue

            # Detect thinking block start
            stripped = buf.lstrip()
            if stripped.startswith("<think>"):
                state = "thinking"
                think_buf = buf[buf.index("<think>") + 7:]
                continue

            # Keep buffering until we have enough chars to be confident
            if len(buf) < _STREAM_LOOKAHEAD:
                continue

            # Committed: no tool call, no thinking — start streaming immediately
            state = "streaming"
            yield {"type": "token", "content": buf}

        elif state == "thinking":
            think_buf += delta
            if "</think>" in think_buf:
                end_idx = think_buf.index("</think>")
                yield {"type": "thinking", "content": think_buf[:end_idx].strip()}
                after = think_buf[end_idx + 8:].lstrip()
                state = "streaming"
                if after:
                    yield {"type": "token", "content": after}

        elif state == "streaming":
            if "<tool_call>" in delta:
                # Tool call arrived mid-stream (unusual but possible)
                state = "tool_call"
            else:
                yield {"type": "token", "content": delta}

        # "tool_call" state: silently accumulate into buf

    # ── Stream ended ──────────────────────────────────────────────────────────
    if state == "tool_call":
        yield {"type": "_tool_detected", "text": buf}
        return

    if state == "lookahead":
        # Very short response — didn't reach LOOKAHEAD threshold
        if "<tool_call>" in buf:
            yield {"type": "_tool_detected", "text": buf}
            return
        clean, thinking = _extract_thinking(buf)
        if thinking:
            yield {"type": "thinking", "content": thinking}
        if clean:
            yield {"type": "token", "content": clean}
        return

    if state == "thinking":
        # Stream ended inside an unclosed <think> block
        clean_think, remaining = think_buf, ""
        if "</think>" in think_buf:
            end_idx = think_buf.index("</think>")
            clean_think = think_buf[:end_idx]
            remaining = think_buf[end_idx + 8:].lstrip()
        yield {"type": "thinking", "content": clean_think.strip()}
        if remaining:
            yield {"type": "token", "content": remaining}


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


async def send_message(conversation_id: str, user_id: int, content: str, max_new_tokens: int, temperature: float, session: Session, screen_context=None) -> Message:
    if not engine.is_ready:
        raise ModelNotReady

    conv = get_conversation(conversation_id, user_id, session)
    memories = _get_user_memories(user_id, session)
    kb_docs = _get_kb_documents(session)

    _save_message(conv.id, "user", content, session)
    _auto_title(conv, content, session)

    messages = list_messages(conversation_id, user_id, session)
    model_config = get_model_config(conv.model_id)
    context = build_context(conv, messages, memories, model_config=model_config, kb_documents=kb_docs, screen_context=screen_context)

    final_text, tool_calls_log = await _run_tool_loop(context, max_new_tokens, temperature, session, model_config)
    final_text, _ = _extract_thinking(final_text)  # strip think block before saving

    assistant_msg = _save_message(conv.id, "assistant", final_text, session, tool_calls=tool_calls_log or None)
    _touch_conversation(conv, session)
    return assistant_msg


async def send_message_streaming(conversation_id: str, user_id: int, content: str, max_new_tokens: int, temperature: float, session: Session, screen_context=None) -> AsyncGenerator[dict, None]:
    logger.info(
        "stream_start — conv=%s user=%s model_ready=%s model=%s",
        conversation_id, user_id, engine.is_ready, engine.current_model_id,
    )
    if not engine.is_ready:
        logger.warning("stream_error — model not loaded")
        yield {"type": "error", "error": "No model loaded. Call POST /llms/load first."}
        return

    try:
        conv = get_conversation(conversation_id, user_id, session)
    except Exception as exc:
        logger.warning("stream_error — conversation not found: %s", exc)
        yield {"type": "error", "error": str(exc)}
        return

    memories = _get_user_memories(user_id, session)
    kb_docs = _get_kb_documents(session)
    _save_message(conv.id, "user", content, session)
    _auto_title(conv, content, session)

    messages = list_messages(conversation_id, user_id, session)
    model_config = get_model_config(conv.model_id)
    context = build_context(conv, messages, memories, model_config=model_config, kb_documents=kb_docs, screen_context=screen_context)
    tools = OPENAI_TOOL_SCHEMAS if model_config.supports_native_tools else None

    tool_calls_log: list[dict] = []
    ui_actions_log: list[dict] = []
    final_text = ""

    for iteration in range(_MAX_TOOL_ITERATIONS):
        logger.info("stream_iter — conv=%s iter=%d ctx_msgs=%d", conversation_id, iteration, len(context))

        streamed_parts: list[str] = []
        tool_detected = False
        tool_response_text = ""

        try:
            async for event in _stream_llm_response(context, max_new_tokens, temperature, tools):
                if event["type"] == "_tool_detected":
                    tool_detected = True
                    tool_response_text = event["text"]
                elif event["type"] == "thinking":
                    yield event  # forward thinking block to frontend
                elif event["type"] == "token":
                    streamed_parts.append(event["content"])
                    yield event  # real vLLM token → forward immediately
        except Exception as exc:
            logger.error("stream_generate_error — conv=%s iter=%d", conversation_id, iteration, exc_info=True)
            yield {"type": "error", "error": f"Generation failed: {exc}"}
            return

        if not tool_detected:
            # Final answer — tokens were already streamed to the client
            final_text = "".join(streamed_parts)
            logger.info("stream_done_no_tool — conv=%s iter=%d chars=%d", conversation_id, iteration, len(final_text))
            break

        # ── Tool call detected ──────────────────────────────────────────────
        response = tool_response_text
        logger.info("stream_generate_ok — conv=%s iter=%d resp_len=%d (tool)", conversation_id, iteration, len(response))

        tool_name, tool_args = parse_tool_call(response)
        if not tool_name:
            # Couldn't parse — treat as final answer (emit what we have)
            final_text, thinking = _extract_thinking(response)
            if thinking:
                yield {"type": "thinking", "content": thinking}
            yield {"type": "token", "content": final_text}
            break

        yield {"type": "tool_call", "name": tool_name, "arguments": tool_args}
        logger.info("stream_tool_call — conv=%s tool=%s args=%s", conversation_id, tool_name, tool_args)

        try:
            tool_result = await execute_tool(tool_name, tool_args, session, screen_context=screen_context)
        except Exception as exc:
            logger.error("stream_tool_error — conv=%s tool=%s", conversation_id, tool_name, exc_info=True)
            tool_result = f"Tool error: {exc}"
        tool_calls_log.append({"name": tool_name, "arguments": tool_args, "result": tool_result})

        # Detect UI action marker and emit as a separate SSE event
        try:
            result_data = json.loads(tool_result)
            if result_data.get("__ui_action__"):
                action = {"type": result_data["type"], "payload": result_data.get("payload", {})}
                ui_actions_log.append(action)
                yield {"type": "ui_action", "ui_action": action}
        except Exception:
            pass

        yield {
            "type": "tool_result",
            "name": tool_name,
            "result_preview": tool_result[:120] + ("…" if len(tool_result) > 120 else ""),
        }

        formatted_result = model_config.tool_result_formatter(tool_name, tool_result)
        clean_response, _ = _extract_thinking(response)
        context.append({"role": "assistant", "content": clean_response})
        context.append({"role": model_config.tool_result_role, "content": formatted_result})
    else:
        logger.warning("max_tool_iterations", extra={"conversation_id": conversation_id})
        # Tokens of the last iteration were already streamed (or it was a tool call loop)
        if not final_text and streamed_parts:
            final_text = "".join(streamed_parts)

    assistant_msg = _save_message(conv.id, "assistant", final_text, session, tool_calls=tool_calls_log or None)
    _touch_conversation(conv, session)

    logger.info("stream_done — conv=%s msg=%s", conversation_id, assistant_msg.id)
    yield {"type": "done", "message_id": assistant_msg.id, "conversation_id": conv.id, "ui_actions": ui_actions_log}


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


async def _run_tool_loop(context: list[dict], max_new_tokens: int, temperature: float, session: Session, model_config: ModelConfig) -> tuple[str, list[dict]]:
    tool_calls_log: list[dict] = []
    tools = OPENAI_TOOL_SCHEMAS if model_config.supports_native_tools else None
    response = ""

    for iteration in range(_MAX_TOOL_ITERATIONS):
        response = await engine.generate(context, max_new_tokens, temperature, tools=tools)
        tool_name, tool_args = parse_tool_call(response)

        if not tool_name:
            clean, _ = _extract_thinking(response)
            return clean, tool_calls_log

        logger.info("tool_call_executed", extra={"tool": tool_name, "iteration": iteration})
        tool_result = await execute_tool(tool_name, tool_args, session)
        tool_calls_log.append({"name": tool_name, "arguments": tool_args, "result": tool_result})

        formatted_result = model_config.tool_result_formatter(tool_name, tool_result)
        clean_response, _ = _extract_thinking(response)
        context.append({"role": "assistant", "content": clean_response})
        context.append({"role": model_config.tool_result_role, "content": formatted_result})

    logger.warning("max_tool_iterations_reached")
    clean, _ = _extract_thinking(response)  # noqa: F821
    return clean, tool_calls_log


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


def _get_kb_documents(session: Session) -> list[dict]:
    """Returns a lightweight list of KB document metadata for context injection."""
    from app.api.v1.knowledge_base.models import Document
    docs = list(session.exec(select(Document).order_by(Document.created_at.desc())).all())
    return [{"title": d.title, "chunk_count": d.chunk_count} for d in docs]
