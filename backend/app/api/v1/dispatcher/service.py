"""
dispatcher/service.py — Business logic for the Event Dispatcher.

Public API:
  intake(event_in, user_id, session)   → AsyncGenerator[dict]   (SSE events)
  get_events(session, ...)             → tuple[list[AlarmEvent], int]
  get_rules(session)                   → tuple[list[DispatchRule], int]
  create_rule(rule_in, user_id, sess)  → DispatchRule
  update_rule(rule_id, data, session)  → DispatchRule
  delete_rule(rule_id, session)        → None
  get_executions(session, ...)         → tuple[list[DispatchExecution], int]
  stream_events(session, since)        → AsyncGenerator[dict]    (SSE live feed)
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.api.v1.dispatcher import rule_engine
from app.api.v1.dispatcher.models import AlarmEvent, DispatchExecution, DispatchRule
from app.api.v1.dispatcher.schemas import EventIn, RuleCreate, RuleUpdate

logger = logging.getLogger(__name__)

# SSE stream polling interval (seconds)
_STREAM_POLL_SECS: float = 2.0
# Maximum events returned per page
_DEFAULT_PAGE_SIZE: int = 50


# ─── Event ingestion ──────────────────────────────────────────────────────────

async def intake(
    event_in: EventIn,
    user_id: int,
    session: Session,
) -> AsyncGenerator[dict, None]:
    """
    Ingest an event, match rules, and execute actions.
    Yields SSE-ready dicts at each meaningful step so the caller can stream
    progress to the browser in real time.
    """
    # 1. Persist event
    event = AlarmEvent(
        source_connector_id=event_in.source_connector_id,
        severity=event_in.severity,
        category=event_in.category,
        asset_id=event_in.asset_id,
        title=event_in.title,
        raw_payload=event_in.raw_payload,
        platform_mode="datacenter",
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    logger.info(
        "dispatcher_event_received — id=%s severity=%s title=%s",
        event.id, event.severity, event.title,
    )
    yield {"type": "event_received", "event_id": event.id, "title": event.title}

    # 2. Load enabled datacenter rules ordered by priority
    rules = session.exec(
        select(DispatchRule)
        .where(DispatchRule.enabled == True, DispatchRule.platform_mode == "datacenter")  # noqa: E712
        .order_by(DispatchRule.priority)
    ).all()

    # 3. Match rules
    matched = rule_engine.match_rules(list(rules), event)

    if not matched:
        event.status = "no_match"
        session.add(event)
        session.commit()
        logger.info("dispatcher_no_match — event=%s", event.id)
        yield {"type": "no_rules_matched", "event_id": event.id}
        return

    event.status = "matched"
    session.add(event)
    session.commit()

    yield {
        "type": "rules_matched",
        "event_id": event.id,
        "rule_count": len(matched),
        "rules": [{"id": r.id, "name": r.name} for r in matched],
    }

    # 4. Execute actions for each matched rule
    all_ok = True
    for rule in matched:
        execution = DispatchExecution(
            rule_id=rule.id,
            event_id=event.id,
            status="running",
        )
        session.add(execution)
        session.commit()
        session.refresh(execution)

        yield {"type": "execution_started", "execution_id": execution.id, "rule_name": rule.name}

        action_results: list[dict] = []
        failed = False

        for action in rule.actions:
            try:
                result = await _execute_action(action, event, session)
                action_results.append(result)
                yield {
                    "type": "action_completed",
                    "action_type": action.get("type"),
                    "result": result,
                }
            except Exception as exc:
                logger.exception("dispatcher_action_error — rule=%s action=%s", rule.id, action)
                err_result = {"type": action.get("type"), "status": "error", "error": str(exc)}
                action_results.append(err_result)
                yield {"type": "action_error", "action_type": action.get("type"), "error": str(exc)}
                failed = True

        execution.status = "failed" if failed else "completed"
        execution.action_results = action_results
        execution.completed_at = datetime.now(UTC)
        session.add(execution)
        session.commit()

        if failed:
            all_ok = False
            yield {"type": "execution_failed", "execution_id": execution.id, "rule_name": rule.name}
        else:
            yield {"type": "execution_completed", "execution_id": execution.id, "rule_name": rule.name}

    event.status = "completed" if all_ok else "failed"
    session.add(event)
    session.commit()

    yield {"type": "done", "event_id": event.id, "status": event.status}


async def _execute_action(action: dict, event: AlarmEvent, session: Session) -> dict:
    """
    Execute a single action dict.  Returns a result dict that is stored in
    DispatchExecution.action_results.

    Phase 0 supports: log_only, create_work_order (stub — real impl in Phase 1)
    """
    action_type: str = action.get("type", "log_only")
    config: dict = action.get("config", {})

    if action_type == "log_only":
        logger.info(
            "dispatcher_action_log — event=%s severity=%s title=%s",
            event.id, event.severity, event.title,
        )
        return {"type": "log_only", "status": "ok", "logged_at": datetime.now(UTC).isoformat()}

    if action_type == "create_work_order":
        # Stub: Phase 1 will call the real OpsHub work-order creation endpoint.
        logger.info(
            "dispatcher_action_create_wo — event=%s config=%s",
            event.id, config,
        )
        return {
            "type": "create_work_order",
            "status": "pending_integration",
            "note": "Real work-order creation will be wired in Phase 1",
            "config": config,
        }

    logger.warning("dispatcher_unknown_action — type=%s", action_type)
    return {"type": action_type, "status": "unknown_action_type"}


# ─── Event queries ────────────────────────────────────────────────────────────

def get_events(
    session: Session,
    page: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    severity: str | None = None,
    category: str | None = None,
    status: str | None = None,
) -> tuple[list[AlarmEvent], int]:
    query = select(AlarmEvent).where(AlarmEvent.platform_mode == "datacenter")
    if severity:
        query = query.where(AlarmEvent.severity == severity)
    if category:
        query = query.where(AlarmEvent.category == category)
    if status:
        query = query.where(AlarmEvent.status == status)
    query = query.order_by(AlarmEvent.received_at.desc())  # type: ignore[attr-defined]

    all_items = session.exec(query).all()
    total = len(all_items)
    offset = (page - 1) * page_size
    return list(all_items[offset: offset + page_size]), total


# ─── Rule CRUD ────────────────────────────────────────────────────────────────

def get_rules(session: Session) -> tuple[list[DispatchRule], int]:
    rules = session.exec(
        select(DispatchRule)
        .where(DispatchRule.platform_mode == "datacenter")
        .order_by(DispatchRule.priority)
    ).all()
    return list(rules), len(rules)


def create_rule(rule_in: RuleCreate, user_id: int, session: Session) -> DispatchRule:
    rule = DispatchRule(
        name=rule_in.name,
        description=rule_in.description,
        platform_mode="datacenter",
        conditions=rule_in.conditions.model_dump(),
        actions=[a.model_dump() for a in rule_in.actions],
        enabled=rule_in.enabled,
        priority=rule_in.priority,
        suppression_window_secs=rule_in.suppression_window_secs,
        created_by=user_id,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    logger.info("dispatcher_rule_created — id=%s name=%s user=%d", rule.id, rule.name, user_id)
    return rule


def update_rule(rule_id: str, data: RuleUpdate, session: Session) -> DispatchRule:
    rule = session.get(DispatchRule, rule_id)
    if not rule:
        raise ValueError(f"Rule {rule_id} not found")

    if data.name is not None:
        rule.name = data.name
    if data.description is not None:
        rule.description = data.description
    if data.conditions is not None:
        rule.conditions = data.conditions.model_dump()
    if data.actions is not None:
        rule.actions = [a.model_dump() for a in data.actions]
    if data.enabled is not None:
        rule.enabled = data.enabled
    if data.priority is not None:
        rule.priority = data.priority
    if data.suppression_window_secs is not None:
        rule.suppression_window_secs = data.suppression_window_secs

    rule.updated_at = datetime.now(UTC)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    logger.info("dispatcher_rule_updated — id=%s", rule.id)
    return rule


def delete_rule(rule_id: str, session: Session) -> None:
    rule = session.get(DispatchRule, rule_id)
    if not rule:
        raise ValueError(f"Rule {rule_id} not found")
    session.delete(rule)
    session.commit()
    logger.info("dispatcher_rule_deleted — id=%s", rule_id)


# ─── Execution queries ────────────────────────────────────────────────────────

def get_executions(
    session: Session,
    page: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    rule_id: str | None = None,
    event_id: str | None = None,
) -> tuple[list[DispatchExecution], int]:
    query = select(DispatchExecution)
    if rule_id:
        query = query.where(DispatchExecution.rule_id == rule_id)
    if event_id:
        query = query.where(DispatchExecution.event_id == event_id)
    query = query.order_by(DispatchExecution.started_at.desc())  # type: ignore[attr-defined]

    all_items = session.exec(query).all()
    total = len(all_items)
    offset = (page - 1) * page_size
    return list(all_items[offset: offset + page_size]), total


# ─── SSE live stream ──────────────────────────────────────────────────────────

async def stream_events(session: Session, since: datetime) -> AsyncGenerator[dict, None]:
    """
    Long-poll SSE generator: every _STREAM_POLL_SECS seconds, query for events
    received after `since` and yield any new ones.

    The caller (router) wraps each dict as `data: {...}\n\n`.
    """
    last_seen = since
    while True:
        await asyncio.sleep(_STREAM_POLL_SECS)
        new_events = session.exec(
            select(AlarmEvent)
            .where(
                AlarmEvent.platform_mode == "datacenter",
                AlarmEvent.received_at > last_seen,
            )
            .order_by(AlarmEvent.received_at)
        ).all()

        for evt in new_events:
            last_seen = evt.received_at
            yield {
                "type": "new_event",
                "event": {
                    "id": evt.id,
                    "severity": evt.severity,
                    "category": evt.category,
                    "title": evt.title,
                    "status": evt.status,
                    "asset_id": evt.asset_id,
                    "source_connector_id": evt.source_connector_id,
                    "received_at": evt.received_at.isoformat(),
                },
            }
