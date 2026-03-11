"""
telemetry/router.py — REST endpoints for telemetry data.

Used by:
  • The frontend chart to pre-populate its buffer on load.
  • Direct queries from the AI tools (via service functions, not these endpoints).

Endpoints:
  GET /telemetry/readings/latest   — latest value per signal
  GET /telemetry/readings/history  — time-series for specified signals
  GET /telemetry/readings/stats    — min/max/avg statistics
  GET /telemetry/timeline          — normalized 4-channel data for the chart
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.v1.telemetry import service
from app.api.v1.telemetry.schemas import (
    ChannelMeta,
    LatestReadingOut,
    SignalHistoryOut,
    SignalStats,
    TimelinePoint,
    TimeSeriesPoint,
)
from app.db.engine import get_session

router = APIRouter()


@router.get("/readings/latest", response_model=list[LatestReadingOut])
def latest_readings(
    signal_ids: str | None = Query(
        default=None,
        description="Comma-separated signal IDs. Omit to return all tracked signals.",
    ),
    session: Session = Depends(get_session),
):
    """Latest value per tracked signal."""
    ids = [s.strip() for s in signal_ids.split(",")] if signal_ids else None
    readings = service.get_latest_readings(session, ids)
    return [
        LatestReadingOut(
            signal_id=r.signal_id,
            display_name=r.display_name,
            value=r.value,
            unit=r.unit,
            recorded_at=r.recorded_at,
        )
        for r in readings
    ]


@router.get("/readings/history", response_model=list[SignalHistoryOut])
def signal_history(
    signal_ids: str = Query(description="Comma-separated signal IDs"),
    minutes: int = Query(default=60, ge=1, le=1440),
    session: Session = Depends(get_session),
):
    """Full time-series for one or more signals over a sliding time window."""
    ids = [s.strip() for s in signal_ids.split(",")]
    readings = service.query_time_range(session, ids, minutes)

    groups: dict[str, dict] = defaultdict(lambda: {"display_name": "", "unit": "", "series": []})
    for r in readings:
        groups[r.signal_id]["display_name"] = r.display_name
        groups[r.signal_id]["unit"] = r.unit
        groups[r.signal_id]["series"].append(
            TimeSeriesPoint(ts=int(r.recorded_at.timestamp() * 1000), value=r.value)
        )

    return [
        SignalHistoryOut(signal_id=sid, **groups[sid])
        for sid in ids
        if sid in groups
    ]


@router.get("/readings/stats", response_model=list[SignalStats])
def signal_stats(
    signal_ids: str = Query(description="Comma-separated signal IDs"),
    minutes: int = Query(default=60, ge=1, le=1440),
    session: Session = Depends(get_session),
):
    """Aggregated statistics for specified signals over a time window."""
    ids = [s.strip() for s in signal_ids.split(",")]
    stats = service.get_statistics(session, ids, minutes)
    return [SignalStats(**s) for s in stats]


@router.get("/channels", response_model=list[ChannelMeta])
def channel_metadata(session: Session = Depends(get_session)):
    """
    Metadata for the 4 frontend chart channels: display name and unit sourced
    from the latest stored telemetry readings (falls back to static catalogue).
    Used by the frontend to label tooltips with real OPC UA signal names.
    """
    return [ChannelMeta(**c) for c in service.get_channel_metadata(session)]


@router.get("/timeline", response_model=list[TimelinePoint])
def timeline_data(
    minutes: int = Query(
        default=10, ge=1, le=60,
        description="History window in minutes for chart pre-population.",
    ),
    session: Session = Depends(get_session),
):
    """
    Pre-computed 4-channel timeline data for the frontend chart buffer.

    Returns normalized (0–100) temperature / vibration / pressure / humidity
    values derived from stored telemetry readings.  The frontend hook calls
    this once at startup to seed the chart so the timeline isn't empty.
    """
    points = service.get_timeline_history(session, minutes)
    return [TimelinePoint(**p) for p in points]
