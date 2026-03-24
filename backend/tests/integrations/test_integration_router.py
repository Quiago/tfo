"""HTTP endpoint tests for integrations router."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.api.v1.integrations.models  # noqa: F401
from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.integrations.router import router as integrations_router
from app.db.engine import get_session


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(name="ic_engine")
def ic_engine_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="ic_client")
def ic_client_fixture(ic_engine):
    app = FastAPI()
    app.include_router(integrations_router)

    def _db():
        with Session(ic_engine) as s:
            yield s

    def _auth():
        user = MagicMock()
        user.id = 1
        user.email = "test@example.com"
        return user

    app.dependency_overrides[get_session] = _db
    app.dependency_overrides[get_current_user] = _auth
    return TestClient(app)


def _create_payload(name="Teams", type="teams"):
    return {
        "name": name,
        "type": type,
        "config": {"webhook_url": "https://outlook.office.com/webhook/fake"},
        "is_active": True,
    }


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestIntegrationsEndpoints:
    def test_list_empty(self, ic_client):
        r = ic_client.get("/integrations")
        assert r.status_code == 200
        assert r.json()["total"] == 0
        assert r.json()["items"] == []

    def test_create_returns_201(self, ic_client):
        r = ic_client.post("/integrations", json=_create_payload())
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Teams"
        assert data["type"] == "teams"
        assert data["is_active"] is True
        assert "config" not in data  # credentials never exposed

    def test_create_and_list(self, ic_client):
        ic_client.post("/integrations", json=_create_payload("A"))
        ic_client.post("/integrations", json=_create_payload("B", "email"))
        r = ic_client.get("/integrations")
        assert r.json()["total"] == 2

    def test_get_by_id(self, ic_client):
        r = ic_client.post("/integrations", json=_create_payload())
        item_id = r.json()["id"]
        r2 = ic_client.get(f"/integrations/{item_id}")
        assert r2.status_code == 200
        assert r2.json()["id"] == item_id

    def test_get_not_found(self, ic_client):
        r = ic_client.get("/integrations/nonexistent")
        assert r.status_code == 404

    def test_patch_name(self, ic_client):
        r = ic_client.post("/integrations", json=_create_payload())
        item_id = r.json()["id"]
        r2 = ic_client.patch(f"/integrations/{item_id}", json={"name": "Updated Teams"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "Updated Teams"

    def test_patch_not_found(self, ic_client):
        r = ic_client.patch("/integrations/bad-id", json={"name": "x"})
        assert r.status_code == 404

    def test_delete(self, ic_client):
        r = ic_client.post("/integrations", json=_create_payload())
        item_id = r.json()["id"]
        r2 = ic_client.delete(f"/integrations/{item_id}")
        assert r2.status_code == 204
        r3 = ic_client.get(f"/integrations/{item_id}")
        assert r3.status_code == 404

    def test_delete_not_found(self, ic_client):
        r = ic_client.delete("/integrations/ghost")
        assert r.status_code == 404

    def test_test_connection_calls_service(self, ic_client):
        r = ic_client.post("/integrations", json=_create_payload())
        item_id = r.json()["id"]
        with patch(
            "app.api.v1.integrations.service.test_connection",
            new=AsyncMock(return_value={"success": True, "message": "HTTP 200"}),
        ):
            r2 = ic_client.post(f"/integrations/{item_id}/test")
        assert r2.status_code == 200
        body = r2.json()
        assert body["success"] is True
        assert body["integration_id"] == item_id

    def test_test_connection_not_found(self, ic_client):
        with patch(
            "app.api.v1.integrations.service.test_connection",
            new=AsyncMock(side_effect=ValueError("not found")),
        ):
            r = ic_client.post("/integrations/ghost/test")
        assert r.status_code == 404
