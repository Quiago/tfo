"""
chat/router.py — Endpoints HTTP del dominio chat.
"""
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.chat import service
from app.api.v1.chat.schemas import (
    ConversationCreate, ConversationDetailResponse, ConversationResponse,
    ConversationUpdate, MemoryCreate, MemoryEntryResponse, MessageCreate,
    MessageResponse, ToolParameterSchema, ToolSchema,
)
from app.api.v1.chat.tools import TOOL_SCHEMAS
from app.db.engine import get_session
from app.models.user import User

router = APIRouter()


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
def create_conversation(body: ConversationCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Crea un nuevo hilo de conversación."""
    return service.create_conversation(body, current_user.id, session)


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Lista todas las conversaciones del usuario autenticado, más recientes primero."""
    return service.list_conversations(current_user.id, session)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Detalle de una conversación con su historial completo de mensajes."""
    conv = service.get_conversation(conversation_id, current_user.id, session)
    messages = service.list_messages(conversation_id, current_user.id, session)
    return ConversationDetailResponse(
        **conv.model_dump(),
        messages=[MessageResponse.model_validate(m) for m in messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
def update_conversation(conversation_id: str, body: ConversationUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Actualiza título, system prompt o ventana de contexto de una conversación."""
    return service.update_conversation(conversation_id, body, current_user.id, session)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Elimina una conversación y todos sus mensajes."""
    service.delete_conversation(conversation_id, current_user.id, session)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(conversation_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Historial completo de mensajes de una conversación."""
    return service.list_messages(conversation_id, current_user.id, session)


@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, body: MessageCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """
    Envía un mensaje y obtiene la respuesta del LLM.
    Si body.stream=True devuelve SSE, si no devuelve JSON.
    """
    if body.stream:
        event_gen = service.send_message_streaming(
            conversation_id=conversation_id,
            user_id=current_user.id,
            content=body.content,
            max_new_tokens=body.max_new_tokens,
            temperature=body.temperature,
            enable_thinking=body.enable_thinking,
            session=session,
            screen_context=body.screen_context,
        )
        return StreamingResponse(
            _sse_generator(event_gen),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    msg = await service.send_message(
        conversation_id=conversation_id,
        user_id=current_user.id,
        content=body.content,
        max_new_tokens=body.max_new_tokens,
        temperature=body.temperature,
        enable_thinking=body.enable_thinking,
        session=session,
        screen_context=body.screen_context,
    )
    return MessageResponse.model_validate(msg)


async def _sse_generator(event_gen: AsyncGenerator) -> AsyncGenerator:
    """Formatea dicts de eventos como líneas SSE (data: {...}\n\n)."""
    async for event in event_gen:
        yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


@router.get("/memory", response_model=list[MemoryEntryResponse])
def list_memories(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Memorias de largo plazo del usuario."""
    return service.list_memories(current_user.id, session)


@router.post("/memory", response_model=MemoryEntryResponse, status_code=status.HTTP_201_CREATED)
def create_memory(body: MemoryCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Agrega un hecho de largo plazo que el LLM recordará en todas las conversaciones."""
    return service.create_memory(body, current_user.id, session)


@router.delete("/memory/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """Elimina una memoria de largo plazo."""
    service.delete_memory(memory_id, current_user.id, session)


@router.get("/tools", response_model=list[ToolSchema])
def list_tools():
    """Lista las herramientas disponibles para el LLM."""
    return [
        ToolSchema(
            name=t["name"],
            description=t["description"],
            parameters=ToolParameterSchema(**t["parameters"]),
        )
        for t in TOOL_SCHEMAS
    ]
