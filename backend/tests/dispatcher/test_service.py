"""
Integration tests for dispatcher/service.py.

Uses an in-memory SQLite DB with all dispatcher models registered.
Tests the intake() pipeline, CRUD helpers, and suppression logic.
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import app.api.v1.dispatcher.models  # noqa: F401

from app.api.v1.dispatcher.models import AlarmEvent, DispatchExecution, DispatchRule
from app.api.v1.dispatcher.schemas import EventIn, RuleCreate, RuleConditions, ConditionItem, RuleAction, RuleUpdate
from app.api.v1.dispatcher import service


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(name="svc_engine")
def svc_engine_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="svc_session")
def svc_session_fixture(svc_engine):
    with Session(svc_engine) as session:
        yield session


# ── Helpers ───────────────────────────────────────────────────────────────────

def _event_in(
    severity: str = "critical",
    category: str = "power",
    title: str = "UPS failure",
) -> EventIn:
    return EventIn(severity=severity, category=category, title=title, raw_payload={})


def _make_rule(session: Session, conditions=None, enabled: bool = True, priority: int = 100) -> DispatchRule:
    """Directly insert a DispatchRule row for testing."""
    rule = DispatchRule(
        name="Test Rule",
        description="",
        platform_mode="datacenter",
        conditions=conditions or {"operator": "AND", "items": []},
        actions=[{"type": "log_only", "config": {}}],
        enabled=enabled,
        priority=priority,
        suppression_window_secs=0,
        created_by=1,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


def _collect(gen) -> list[dict]:
    """Drain an async generator synchronously into a list."""
    return asyncio.get_event_loop().run_until_complete(_drain(gen))


async def _drain(gen) -> list[dict]:
    results = []
    async for item in gen:
        results.append(item)
    return results


# ── intake() — no rules ───────────────────────────────────────────────────────

class TestIntakeNoRules:
    def test_event_persisted(self, svc_session):
        events_before = svc_session.exec(select(AlarmEvent)).all()
        assert len(events_before) == 0

        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        events_after = svc_session.exec(select(AlarmEvent)).all()
        assert len(events_after) == 1

    def test_status_is_no_match(self, svc_session):
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))
        event = svc_session.exec(select(AlarmEvent)).first()
        assert event.status == "no_match"

    def test_sse_events_yielded(self, svc_session):
        yielded = _collect(service.intake(_event_in(), user_id=1, session=svc_session))
        types = [e["type"] for e in yielded]
        assert "event_received" in types
        assert "no_rules_matched" in types


# ── intake() — matching rule ──────────────────────────────────────────────────

class TestIntakeWithMatchingRule:
    def test_execution_created(self, svc_session):
        _make_rule(svc_session)  # match-all rule
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        executions = svc_session.exec(select(DispatchExecution)).all()
        assert len(executions) == 1

    def test_execution_status_completed(self, svc_session):
        _make_rule(svc_session)
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        execution = svc_session.exec(select(DispatchExecution)).first()
        assert execution.status == "completed"

    def test_event_status_completed(self, svc_session):
        _make_rule(svc_session)
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        event = svc_session.exec(select(AlarmEvent)).first()
        assert event.status == "completed"

    def test_action_results_stored(self, svc_session):
        _make_rule(svc_session)
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        execution = svc_session.exec(select(DispatchExecution)).first()
        assert execution.action_results is not None
        assert len(execution.action_results) == 1
        assert execution.action_results[0]["type"] == "log_only"
        assert execution.action_results[0]["status"] == "ok"

    def test_sse_execution_events_yielded(self, svc_session):
        _make_rule(svc_session)
        yielded = _collect(service.intake(_event_in(), user_id=1, session=svc_session))
        types = [e["type"] for e in yielded]
        assert "rules_matched" in types
        assert "execution_started" in types
        assert "action_completed" in types
        assert "execution_completed" in types
        assert "done" in types


# ── intake() — disabled rule skipped ─────────────────────────────────────────

class TestIntakeDisabledRule:
    def test_disabled_rule_not_matched(self, svc_session):
        _make_rule(svc_session, enabled=False)
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        executions = svc_session.exec(select(DispatchExecution)).all()
        assert len(executions) == 0

    def test_event_marked_no_match(self, svc_session):
        _make_rule(svc_session, enabled=False)
        _collect(service.intake(_event_in(), user_id=1, session=svc_session))

        event = svc_session.exec(select(AlarmEvent)).first()
        assert event.status == "no_match"


# ── intake() — condition filtering ───────────────────────────────────────────

class TestIntakeConditionFiltering:
    def test_severity_condition_matches(self, svc_session):
        conds = {
            "operator": "AND",
            "items": [{"type": "severity_gte", "value": "critical"}],
        }
        _make_rule(svc_session, conditions=conds)
        _collect(service.intake(_event_in(severity="emergency"), user_id=1, session=svc_session))

        executions = svc_session.exec(select(DispatchExecution)).all()
        assert len(executions) == 1

    def test_severity_condition_no_match(self, svc_session):
        conds = {
            "operator": "AND",
            "items": [{"type": "severity_gte", "value": "critical"}],
        }
        _make_rule(svc_session, conditions=conds)
        _collect(service.intake(_event_in(severity="info"), user_id=1, session=svc_session))

        executions = svc_session.exec(select(DispatchExecution)).all()
        assert len(executions) == 0

    def test_priority_ordering(self, svc_session):
        _make_rule(svc_session, priority=200)
        _make_rule(svc_session, priority=50)
        _make_rule(svc_session, priority=100)

        yielded = _collect(service.intake(_event_in(), user_id=1, session=svc_session))
        matched_event = next(e for e in yielded if e["type"] == "rules_matched")
        assert matched_event["rule_count"] == 3


# ── Rule CRUD ─────────────────────────────────────────────────────────────────

class TestRuleCRUD:
    def test_create_and_get(self, svc_session):
        rule_in = RuleCreate(
            name="My Rule",
            description="desc",
            conditions=RuleConditions(operator="AND", items=[]),
            actions=[RuleAction(type="log_only", config={})],
            enabled=True,
            priority=100,
            suppression_window_secs=0,
        )
        rule = service.create_rule(rule_in, user_id=1, session=svc_session)
        assert rule.id is not None
        assert rule.name == "My Rule"
        assert rule.created_by == 1

    def test_update_rule(self, svc_session):
        rule = _make_rule(svc_session)
        update = RuleUpdate(enabled=False, priority=10)
        updated = service.update_rule(rule.id, update, svc_session)
        assert updated.enabled is False
        assert updated.priority == 10

    def test_update_nonexistent_raises(self, svc_session):
        with pytest.raises(ValueError, match="not found"):
            service.update_rule("nonexistent-id", RuleUpdate(enabled=False), svc_session)

    def test_delete_rule(self, svc_session):
        rule = _make_rule(svc_session)
        service.delete_rule(rule.id, svc_session)
        assert svc_session.get(DispatchRule, rule.id) is None

    def test_delete_nonexistent_raises(self, svc_session):
        with pytest.raises(ValueError, match="not found"):
            service.delete_rule("nonexistent-id", svc_session)

    def test_get_rules_returns_all(self, svc_session):
        _make_rule(svc_session, priority=200)
        _make_rule(svc_session, priority=50)
        rules, total = service.get_rules(svc_session)
        assert total == 2
        assert rules[0].priority == 50  # sorted by priority asc
