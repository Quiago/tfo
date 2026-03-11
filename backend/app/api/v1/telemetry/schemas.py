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
    """4-channel reading for the frontend chart.

    Normalized (0–100) values drive the Y-axis.
    Raw engineering-unit values are included for tooltip display.
    """
    timestamp: int    # epoch ms
    # Normalized 0–100 (for chart Y-axis)
    temperature: float
    vibration: float
    pressure: float
    humidity: float
    # Raw engineering-unit values (for tooltip labels)
    rawTemperature: float | None = None
    rawVibration: float | None = None
    rawPressure: float | None = None
    rawHumidity: float | None = None


class ChannelMeta(BaseModel):
    """Static metadata for one of the 4 frontend chart channels."""
    field: str        # 'temperature' | 'vibration' | 'pressure' | 'humidity'
    signal_id: str
    display_name: str
    unit: str
