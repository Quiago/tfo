"""
Shared test fixtures for the backend test suite.

Uses an in-memory SQLite DB with only the telemetry model registered,
so tests run without vLLM, OPC UA, or any external service.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.api.v1.telemetry.models  # noqa: F401 — registers TelemetryReading


@pytest.fixture(name="engine")
def engine_fixture():
    # StaticPool forces all connections to reuse the same underlying SQLite
    # connection, making the in-memory DB visible to both the session fixture
    # and the TestClient's dependency override.
    # Function scope (default) gives each test a fully isolated database.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(engine):
    """TestClient wired to the telemetry router with an in-memory DB."""
    from app.api.v1.telemetry.router import router as telemetry_router
    from app.db.engine import get_session

    test_app = FastAPI()
    test_app.include_router(telemetry_router, prefix="/telemetry")

    def _override():
        with Session(engine) as s:
            yield s

    test_app.dependency_overrides[get_session] = _override
    return TestClient(test_app)
