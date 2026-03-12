"""
agent/router.py — HTTP layer for the Agent domain.

Single endpoint: POST /agent/run
  • Always streams SSE (text/event-stream)
  • Requires authentication (same as chat)
  • Body: AgentRunRequest (prompt + screen_context + optional tuning params)
"""
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.v1.agent.schemas import AgentRunRequest
from app.api.v1.agent.service import run_agent_streaming
from app.api.v1.auth.dependencies import get_current_user
from app.db.engine import get_session
from app.models.user import User

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger(__name__)


async def _sse_generator(
    request: AgentRunRequest,
    session: Session,
) -> AsyncGenerator[str, None]:
    """Wraps the agent generator into the SSE wire format."""
    async for event in run_agent_streaming(request, session):
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/run")
async def run_agent(
    body: AgentRunRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Run the autonomous agent loop with full screen context awareness.

    The agent knows which module, asset, connector and time range the user
    is currently viewing and can act on that context without the user having
    to repeat themselves.

    Returns a Server-Sent Events stream of AgentStreamEvent objects.
    """
    logger.info(
        "agent_run — user=%s prompt_len=%d screen=%s",
        current_user.id,
        len(body.prompt),
        body.screen_context.summary or body.screen_context.active_module,
    )
    return StreamingResponse(
        _sse_generator(body, session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_agent_tools(
    _: User = Depends(get_current_user),
) -> dict:
    """Returns all tools available to the agent (chat tools + platform tools)."""
    from app.api.v1.agent.tools import PLATFORM_TOOL_SCHEMAS
    from app.api.v1.chat.tools import TOOL_SCHEMAS
    return {
        "chat_tools": TOOL_SCHEMAS,
        "platform_tools": PLATFORM_TOOL_SCHEMAS,
    }
