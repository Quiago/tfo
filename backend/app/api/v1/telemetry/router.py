"""
telemetry/router.py — REST endpoints for telemetry data.

Endpoints:
  GET /telemetry/readings/latest   — latest value per signal
  GET /telemetry/readings/history  — time-series for specified signals
  GET /telemetry/readings/stats    — min/max/avg statistics
  GET /telemetry/channels          — metadata for the 4 chart channels
  GET /telemetry/node-map          — OPC UA node_id → signal_id map (post-discovery)
  GET /telemetry/timeline          — normalized 4-channel data for the chart
  GET /telemetry/timeline/signals  — generic downsampled data for arbitrary signals
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.v1.telemetry import service
from app.api.v1.telemetry.schemas import (
    ChannelMeta,
    LatestReadingOut,
    NodeMapEntry,
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
    """
    return [ChannelMeta(**c) for c in service.get_channel_metadata(session)]


@router.get("/node-map", response_model=dict[str, NodeMapEntry])
def node_map(
    connector_id: str = Query(description="Connector ID to retrieve the OPC UA node map for"),
):
    """
    Returns the OPC UA node_id → signal metadata mapping built after the first
    discovery cycle for the given connector.

    The frontend uses this to resolve its discovered node_ids to DB signal_ids,
    enabling dynamic historical queries without hard-coded field names.

    Returns an empty object if the connector has not been discovered yet.
    """
    return service.get_node_map(connector_id)


@router.get("/timeline", response_model=list[TimelinePoint])
def timeline_data(
    minutes: int = Query(
        default=60, ge=1, le=525_600,
        description="History window in minutes (max 1 year).",
    ),
    signal_ids: str | None = Query(
        default=None,
        description=(
            "Comma-separated signal IDs (4 items) to map to the "
            "temperature / vibration / pressure / humidity slots. "
            "Defaults to the built-in TIMELINE_FIELD_MAP when omitted."
        ),
    ),
    session: Session = Depends(get_session),
):
    """
    Pre-computed 4-channel timeline for the frontend chart buffer.

    When signal_ids is supplied the caller controls which DB signals fill each
    chart slot — enabling fully dynamic channel mapping based on the connector's
    discovered OPC UA nodes instead of hard-coded names.

    Returns normalized (0–100) values + raw engineering values per point.
    """
    ids = [s.strip() for s in signal_ids.split(",")] if signal_ids else None
    points = service.get_timeline_history(session, minutes, signal_ids=ids)
    return [TimelinePoint(**p) for p in points]


@router.get("/timeline/signals")
def timeline_signals(
    signal_ids: str = Query(description="Comma-separated signal IDs"),
    minutes: int = Query(
        default=60, ge=1, le=525_600,
        description="History window in minutes (max 1 year).",
    ),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    """
    Generic downsampled timeline for arbitrary signal IDs.

    Returns one dict per time bucket:
      { "timestamp": <epoch_ms>, "<signal_id>": <normalised 0-100>,
        "raw_<signal_id>": <raw engineering value>, ... }

    Used by the frontend to fetch energy channel history (total_power, aux_power,
    power_factor) with the same DB-level downsampling as the 4-channel endpoint.
    """
    ids = [s.strip() for s in signal_ids.split(",")]
    return service.get_timeline_history_by_signals(session, ids, minutes)
