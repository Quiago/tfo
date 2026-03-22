"""
dispatcher/router.py — HTTP layer for the Event Dispatcher domain.

All endpoints require authentication.
All data is scoped to platform_mode='datacenter' — factory users will not
see dispatcher data (enforced at the service layer, not just the frontend gate).

Endpoints:
  POST   /dispatcher/events           — ingest event (SSE stream of processing steps)
  GET    /dispatcher/events           — paginated history
  GET    /dispatcher/rules            — list all rules
  POST   /dispatcher/rules            — create rule
  GET    /dispatcher/rules/{id}       — single rule
  PATCH  /dispatcher/rules/{id}       — update rule
  DELETE /dispatcher/rules/{id}       — delete rule
  GET    /dispatcher/executions       — paginated execution history
  GET    /dispatcher/stream           — SSE live feed of new events
"""
import json
import logging
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.dispatcher import service
from app.api.v1.dispatcher.schemas import (
    EventIn,
    EventListOut,
    EventOut,
    ExecutionListOut,
    RuleCreate,
    RuleListOut,
    RuleOut,
    RuleUpdate,
)
from app.db.engine import get_session
from app.models.user import User

router = APIRouter(prefix="/dispatcher", tags=["dispatcher"])
logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _sse_wrap(gen: AsyncGenerator[dict, None]) -> AsyncGenerator[str, None]:
    """Wrap a dict generator into SSE wire format: `data: {...}\\n\\n`"""
    async for event in gen:
        yield f"data: {json.dumps(event, default=str)}\n\n"


# ─── Events ───────────────────────────────────────────────────────────────────

@router.post("/events", status_code=status.HTTP_201_CREATED)
async def ingest_event(
    body: EventIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Ingest an alarm/sensor event and run it through the rule engine.
    Returns an SSE stream so the browser can watch rule matching and action
    execution happen in real time.
    """
    logger.info(
        "dispatcher_ingest — user=%s severity=%s title=%s",
        current_user.id, body.severity, body.title,
    )
    return StreamingResponse(
        _sse_wrap(service.intake(body, current_user.id, session)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/events", response_model=EventListOut)
def list_events(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> EventListOut:
    items, total = service.get_events(
        session, page=page, page_size=page_size,
        severity=severity, category=category, status=status,
    )
    return EventListOut(items=[EventOut.model_validate(e) for e in items], total=total, page=page, page_size=page_size)


# ─── Rules ────────────────────────────────────────────────────────────────────

@router.get("/rules", response_model=RuleListOut)
def list_rules(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> RuleListOut:
    items, total = service.get_rules(session)
    return RuleListOut(items=[RuleOut.model_validate(r) for r in items], total=total)


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    body: RuleCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RuleOut:
    rule = service.create_rule(body, current_user.id, session)
    return RuleOut.model_validate(rule)


@router.get("/rules/{rule_id}", response_model=RuleOut)
def get_rule(
    rule_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> RuleOut:
    from app.api.v1.dispatcher.models import DispatchRule
    rule = session.get(DispatchRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return RuleOut.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=RuleOut)
def update_rule(
    rule_id: str,
    body: RuleUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> RuleOut:
    try:
        rule = service.update_rule(rule_id, body, session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> None:
    try:
        service.delete_rule(rule_id, session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ─── Executions ───────────────────────────────────────────────────────────────

@router.get("/executions", response_model=ExecutionListOut)
def list_executions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    rule_id: str | None = Query(default=None),
    event_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> ExecutionListOut:
    from app.api.v1.dispatcher.schemas import ExecutionOut
    items, total = service.get_executions(session, page=page, page_size=page_size, rule_id=rule_id, event_id=event_id)
    return ExecutionListOut(items=[ExecutionOut.model_validate(e) for e in items], total=total, page=page, page_size=page_size)


# ─── Live SSE stream ──────────────────────────────────────────────────────────

@router.get("/stream")
async def event_stream(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    SSE endpoint that polls for new events every 2 seconds and pushes them
    to connected clients.  Used by the EventFeed component in the frontend.
    """
    since = datetime.now(UTC)
    return StreamingResponse(
        _sse_wrap(service.stream_events(session, since)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
