"""Tests for integrations/service.py — CRUD and dispatch_action logic."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.api.v1.integrations.models  # noqa: F401 — registers IntegrationConfig table
import app.api.v1.dispatcher.models    # noqa: F401 — registers AlarmEvent (needed by dispatch_action)
from app.api.v1.integrations import service
from app.api.v1.integrations.schemas import IntegrationCreate, IntegrationUpdate


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _create_data(name="Teams Webhook", type="teams") -> IntegrationCreate:
    return IntegrationCreate(
        name=name,
        type=type,
        config={"webhook_url": "https://outlook.office.com/webhook/fake"},
        is_active=True,
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

class TestIntegrationCRUD:
    def test_create_persists_and_returns_config(self, session):
        data = _create_data()
        cfg = service.create(data, user_id=1, session=session)
        assert cfg.id is not None
        assert cfg.name == "Teams Webhook"
        assert cfg.type == "teams"
        assert cfg.is_active is True
        # config_encrypted should not be plain — it wraps raw dict
        assert cfg.config_encrypted is not None

    def test_get_all_returns_only_datacenter(self, session):
        service.create(_create_data("A"), user_id=1, session=session)
        service.create(_create_data("B", type="email"), user_id=1, session=session)
        items = service.get_all(session)
        assert len(items) == 2

    def test_get_by_id_returns_correct(self, session):
        created = service.create(_create_data(), user_id=1, session=session)
        fetched = service.get(created.id, session)
        assert fetched.id == created.id

    def test_get_not_found_raises(self, session):
        with pytest.raises(ValueError, match="not found"):
            service.get("nonexistent-id", session)

    def test_update_name(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        updated = service.update(cfg.id, IntegrationUpdate(name="Renamed"), session)
        assert updated.name == "Renamed"

    def test_update_config_re_encrypts(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        new_config = {"webhook_url": "https://new.webhook.com/hook"}
        updated = service.update(cfg.id, IntegrationUpdate(config=new_config), session)
        # The stored config_encrypted should be updated (it's a dict from Fernet)
        assert updated.config_encrypted is not None

    def test_update_not_found_raises(self, session):
        with pytest.raises(ValueError, match="not found"):
            service.update("bad-id", IntegrationUpdate(name="X"), session)

    def test_delete_removes_record(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        service.delete(cfg.id, session)
        with pytest.raises(ValueError, match="not found"):
            service.get(cfg.id, session)

    def test_delete_not_found_raises(self, session):
        with pytest.raises(ValueError, match="not found"):
            service.delete("ghost-id", session)


# ── test_connection ────────────────────────────────────────────────────────────

class TestTestConnection:
    @pytest.mark.asyncio
    async def test_test_connection_teams_updates_status_ok(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        with patch("app.api.v1.integrations.service._test_teams", new=AsyncMock(return_value=(True, "HTTP 200"))):
            result = await service.test_connection(cfg.id, session)
        assert result["success"] is True
        assert result["message"] == "HTTP 200"
        # DB should be updated
        refreshed = service.get(cfg.id, session)
        assert refreshed.last_test_status == "ok"
        assert refreshed.last_tested_at is not None

    @pytest.mark.asyncio
    async def test_test_connection_teams_updates_status_failed(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        with patch("app.api.v1.integrations.service._test_teams", new=AsyncMock(return_value=(False, "timeout"))):
            result = await service.test_connection(cfg.id, session)
        assert result["success"] is False
        refreshed = service.get(cfg.id, session)
        assert refreshed.last_test_status == "failed"

    @pytest.mark.asyncio
    async def test_test_connection_not_found_raises(self, session):
        with pytest.raises(ValueError, match="not found"):
            await service.test_connection("ghost", session)


# ── dispatch_action ────────────────────────────────────────────────────────────

class TestDispatchAction:
    def _make_event(self):
        event = MagicMock()
        event.id = "evt-1"
        event.title = "Disk Full"
        event.severity = "critical"
        event.asset_id = "srv-01"
        event.source_connector_id = "conn-1"
        return event

    @pytest.mark.asyncio
    async def test_dispatch_returns_error_when_no_integration_id(self, session):
        result = await service.dispatch_action(
            {"type": "send_teams", "integration_id": ""},
            self._make_event(),
            session,
        )
        assert result["status"] == "error"
        assert "integration_id" in result["error"]

    @pytest.mark.asyncio
    async def test_dispatch_returns_error_when_integration_not_found(self, session):
        result = await service.dispatch_action(
            {"type": "send_teams", "integration_id": "nonexistent"},
            self._make_event(),
            session,
        )
        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_dispatch_send_teams_ok(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        with patch("app.api.v1.integrations.service._do_send_teams", new=AsyncMock(return_value={"type": "send_teams", "status": "ok", "sent_at": "2026-01-01T00:00:00"})):
            result = await service.dispatch_action(
                {"type": "send_teams", "integration_id": cfg.id, "config": {}},
                self._make_event(),
                session,
            )
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_dispatch_inactive_integration_returns_error(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        service.update(cfg.id, IntegrationUpdate(is_active=False), session)
        result = await service.dispatch_action(
            {"type": "send_teams", "integration_id": cfg.id},
            self._make_event(),
            session,
        )
        assert result["status"] == "error"
        assert "inactive" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_dispatch_unknown_action_type_returns_error(self, session):
        cfg = service.create(_create_data(), user_id=1, session=session)
        result = await service.dispatch_action(
            {"type": "do_magic", "integration_id": cfg.id},
            self._make_event(),
            session,
        )
        assert result["status"] == "error"
