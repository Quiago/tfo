"""
Integration tests for the dispatcher REST endpoints.

Uses an in-memory SQLite DB with dispatcher models registered.
Auth dependency is overridden with a dummy user so tests run without JWT.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.api.v1.dispatcher.models  # noqa: F401 — registers AlarmEvent, DispatchRule, etc.
from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.dispatcher.router import router as dispatcher_router
from app.db.engine import get_session


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(name="dc_engine")
def dc_engine_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="dc_session")
def dc_session_fixture(dc_engine):
    with Session(dc_engine) as session:
        yield session


@pytest.fixture(name="dc_client")
def dc_client_fixture(dc_engine):
    """TestClient wired to the dispatcher router with in-memory DB and no-op auth."""
    app = FastAPI()
    app.include_router(dispatcher_router)

    # Override DB dependency
    def _db():
        with Session(dc_engine) as s:
            yield s

    # Override auth dependency — return a dummy user object
    def _auth():
        user = MagicMock()
        user.id = 1
        user.email = "test@example.com"
        return user

    app.dependency_overrides[get_session] = _db
    app.dependency_overrides[get_current_user] = _auth
    return TestClient(app)


# ── Rules CRUD ────────────────────────────────────────────────────────────────

class TestRulesCRUD:
    def test_list_rules_empty(self, dc_client):
        r = dc_client.get("/dispatcher/rules")
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_create_rule(self, dc_client):
        payload = {
            "name": "Test rule",
            "description": "Critical events",
            "conditions": {
                "operator": "AND",
                "items": [{"type": "severity_gte", "value": "critical"}],
            },
            "actions": [{"type": "log_only", "config": {}}],
            "enabled": True,
            "priority": 100,
            "suppression_window_secs": 0,
        }
        r = dc_client.post("/dispatcher/rules", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Test rule"
        assert data["enabled"] is True
        assert data["id"] is not None

    def test_list_rules_after_create(self, dc_client):
        self.test_create_rule(dc_client)
        r = dc_client.get("/dispatcher/rules")
        assert r.status_code == 200
        assert r.json()["total"] == 1

    def test_get_rule_by_id(self, dc_client):
        r = dc_client.post("/dispatcher/rules", json={
            "name": "Rule X",
            "conditions": {"operator": "AND", "items": []},
            "actions": [{"type": "log_only", "config": {}}],
            "enabled": True,
            "priority": 50,
            "suppression_window_secs": 0,
        })
        rule_id = r.json()["id"]
        r2 = dc_client.get(f"/dispatcher/rules/{rule_id}")
        assert r2.status_code == 200
        assert r2.json()["id"] == rule_id

    def test_get_rule_not_found(self, dc_client):
        r = dc_client.get("/dispatcher/rules/nonexistent-id")
        assert r.status_code == 404

    def test_patch_rule(self, dc_client):
        r = dc_client.post("/dispatcher/rules", json={
            "name": "Rule To Update",
            "conditions": {"operator": "AND", "items": []},
            "actions": [{"type": "log_only", "config": {}}],
            "enabled": True,
            "priority": 100,
            "suppression_window_secs": 0,
        })
        rule_id = r.json()["id"]
        r2 = dc_client.patch(f"/dispatcher/rules/{rule_id}", json={"enabled": False})
        assert r2.status_code == 200
        assert r2.json()["enabled"] is False

    def test_delete_rule(self, dc_client):
        r = dc_client.post("/dispatcher/rules", json={
            "name": "Rule To Delete",
            "conditions": {"operator": "AND", "items": []},
            "actions": [{"type": "log_only", "config": {}}],
            "enabled": True,
            "priority": 100,
            "suppression_window_secs": 0,
        })
        rule_id = r.json()["id"]
        r2 = dc_client.delete(f"/dispatcher/rules/{rule_id}")
        assert r2.status_code == 204
        r3 = dc_client.get(f"/dispatcher/rules/{rule_id}")
        assert r3.status_code == 404


# ── Events listing ────────────────────────────────────────────────────────────

class TestEventsEndpoint:
    def test_list_events_empty(self, dc_client):
        r = dc_client.get("/dispatcher/events")
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0


# ── Executions listing ────────────────────────────────────────────────────────

class TestExecutionsEndpoint:
    def test_list_executions_empty(self, dc_client):
        r = dc_client.get("/dispatcher/executions")
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0
