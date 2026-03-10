"""
telemetry/schemas.py — Pydantic response schemas for telemetry endpoints.
"""
from datetime import datetime

from pydantic import BaseModel


class LatestReadingOut(BaseModel):
    signal_id: str
    display_name: str
    value: float
    unit: str
    recorded_at: datetime


class TimeSeriesPoint(BaseModel):
    ts: int    # epoch ms
    value: float


class SignalHistoryOut(BaseModel):
    signal_id: str
    display_name: str
    unit: str
    series: list[TimeSeriesPoint]


class SignalStats(BaseModel):
    signal_id: str
    display_name: str
    unit: str
    count: int
    min: float
    max: float
    avg: float
    last: float


class TimelinePoint(BaseModel):
    """Normalized (0–100) 4-channel reading for the frontend chart."""
    timestamp: int    # epoch ms
    temperature: float
    vibration: float
    pressure: float
    humidity: float
