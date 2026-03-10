"""
telemetry/models.py — Persistent storage for simulator sensor readings.

Each row is one signal value at one point in time.
Indexed on (signal_id, recorded_at) for fast range scans by the AI tools and
the frontend timeline endpoint.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Index
from sqlmodel import Field, SQLModel


class TelemetryReading(SQLModel, table=True):
    __tablename__ = "telemetry_reading"
    __table_args__ = (
        Index("ix_telemetry_signal_time", "signal_id", "recorded_at"),
        Index("ix_telemetry_connector_time", "connector_id", "recorded_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    connector_id: str = Field(index=True)
    signal_id: str = Field(index=True)
    display_name: str
    value: float
    unit: str = ""
    recorded_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), index=True),
    )
