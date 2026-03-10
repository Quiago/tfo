"""
telemetry/service.py — Background poller + query helpers.

TelemetryPoller
  Runs as an asyncio background task (started from app lifespan).
  Every POLL_INTERVAL seconds it calls the simulator's REST /api/snapshot,
  flattens the nested JSON into individual signal readings, and persists them.
  Old readings beyond RETENTION_HOURS are pruned in the same poll cycle.

Query helpers (synchronous, called by router + AI tools)
  get_latest_readings   — latest value per signal
  query_time_range      — all readings in a sliding time window
  get_statistics        — min / max / avg / count / last per signal
  get_timeline_history  — 4-channel normalized output for the frontend chart
"""
from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import httpx
from sqlmodel import Session, col, func, select

from app.api.v1.telemetry.models import TelemetryReading

logger = logging.getLogger(__name__)

SIMULATED_DATA_URL  = os.getenv("SIMULATED_DATA_URL", "http://localhost:8001")
POLL_INTERVAL       = int(os.getenv("TELEMETRY_POLL_INTERVAL", "5"))    # seconds
RETENTION_HOURS     = int(os.getenv("TELEMETRY_RETENTION_HOURS", "24"))
CONNECTOR_ID        = "simulated-factory"

# ── Signal map: (snapshot_group, snapshot_key) → (signal_id, display_name, unit)
_SIGNAL_MAP: dict[tuple[str, str], tuple[str, str, str]] = {
    ("sensors", "ambient_temperature"): ("ambient_temperature", "Ambient Temperature", "°C"),
    ("sensors", "zone1_temperature"):   ("zone1_temperature",   "Zone 1 Temperature",  "°C"),
    ("sensors", "zone2_temperature"):   ("zone2_temperature",   "Zone 2 Temperature",  "°C"),
    ("sensors", "vibration_x"):         ("vibration_x",         "Vibration X",         "mm/s"),
    ("sensors", "vibration_y"):         ("vibration_y",         "Vibration Y",         "mm/s"),
    ("sensors", "vibration_z"):         ("vibration_z",         "Vibration Z",         "mm/s"),
    ("sensors", "humidity"):            ("humidity",            "Humidity",            "%"),
    ("sensors", "line_pressure"):       ("line_pressure",       "Line Pressure",       "bar"),
    ("production", "parts_assembled"):  ("parts_assembled",     "Parts Assembled",     "pcs"),
    ("production", "cycle_time"):       ("cycle_time",          "Cycle Time",          "s"),
    ("production", "throughput"):       ("throughput",          "Throughput",          "pph"),
    ("production", "defect_rate"):      ("defect_rate",         "Defect Rate",         "%"),
    ("production", "yield_rate"):       ("yield_rate",          "Yield Rate",          "%"),
    ("energy", "total_power_kw"):       ("total_power",         "Total Power",         "kW"),
    ("energy", "aux_power_kw"):         ("aux_power",           "Aux Power",           "kW"),
    ("energy", "power_factor"):         ("power_factor",        "Power Factor",        ""),
    ("energy", "grid_frequency_hz"):    ("grid_frequency",      "Grid Frequency",      "Hz"),
    ("energy", "energy_today_kwh"):     ("energy_today",        "Energy Today",        "kWh"),
}

# ── Frontend 4-channel mapping: chart field → signal_id ──────────────────────
TIMELINE_FIELD_MAP: dict[str, str] = {
    "temperature": "zone1_temperature",
    "vibration":   "vibration_x",
    "pressure":    "line_pressure",
    "humidity":    "humidity",
}


def _flatten_snapshot(snapshot: dict) -> list[tuple[str, str, str, float]]:
    """
    Returns [(signal_id, display_name, unit, value), …] for every known signal.
    Robot sub-signals are extracted from production.robots.{1..4}.
    """
    results: list[tuple[str, str, str, float]] = []

    for (group, key), (sig_id, name, unit) in _SIGNAL_MAP.items():
        val = snapshot.get(group, {}).get(key)
        if val is not None:
            try:
                results.append((sig_id, name, unit, float(val)))
            except (TypeError, ValueError):
                pass

    robots = snapshot.get("production", {}).get("robots", {})
    for robot_id, rdata in robots.items():
        for field, label, unit in [
            ("speed",             "Speed",             "%"),
            ("joint_temperature", "Joint Temperature", "°C"),
            ("load",              "Load",              "Nm"),
            ("power_kw",          "Power",             "kW"),
        ]:
            val = rdata.get(field)
            if val is not None:
                try:
                    norm_field = field.replace("joint_temperature", "joint_temp").replace("_kw", "")
                    results.append((
                        f"robot{robot_id}_{norm_field}",
                        f"Robot {robot_id} {label}",
                        unit,
                        float(val),
                    ))
                except (TypeError, ValueError):
                    pass

    return results


# ── Poller ────────────────────────────────────────────────────────────────────

class TelemetryPoller:
    """
    Background asyncio task.  Call start() once from the app lifespan.

    Uses a session_factory (callable → Session) so it can open short-lived
    DB sessions per poll cycle without holding a connection open permanently.
    """

    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="telemetry-poller")
        logger.info(
            "[Telemetry] Poller started — interval=%ds  source=%s",
            POLL_INTERVAL, SIMULATED_DATA_URL,
        )

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        async with httpx.AsyncClient(timeout=5.0) as client:
            while True:
                try:
                    await self._poll_once(client)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.debug("[Telemetry] poll error: %s", exc)
                await asyncio.sleep(POLL_INTERVAL)

    async def _poll_once(self, client: httpx.AsyncClient) -> None:
        resp = await client.get(f"{SIMULATED_DATA_URL}/api/snapshot")
        resp.raise_for_status()
        signals = _flatten_snapshot(resp.json())
        now = datetime.now(UTC)

        with self._session_factory() as session:
            for sig_id, name, unit, value in signals:
                session.add(TelemetryReading(
                    connector_id=CONNECTOR_ID,
                    signal_id=sig_id,
                    display_name=name,
                    value=value,
                    unit=unit,
                    recorded_at=now,
                ))
            session.commit()
            logger.debug("[Telemetry] Stored %d readings at %s", len(signals), now.isoformat())

            # Prune readings beyond retention window
            cutoff = now - timedelta(hours=RETENTION_HOURS)
            old = session.exec(
                select(TelemetryReading).where(TelemetryReading.recorded_at < cutoff)
            ).all()
            for r in old:
                session.delete(r)
            if old:
                session.commit()
                logger.debug("[Telemetry] Pruned %d old readings", len(old))


# ── Query helpers ─────────────────────────────────────────────────────────────

def get_latest_readings(
    session: Session,
    signal_ids: list[str] | None = None,
    connector_id: str = CONNECTOR_ID,
) -> list[TelemetryReading]:
    """Latest value per signal_id (subquery join on max recorded_at)."""
    subq = (
        select(
            TelemetryReading.signal_id,
            func.max(TelemetryReading.recorded_at).label("max_at"),
        )
        .where(TelemetryReading.connector_id == connector_id)
    )
    if signal_ids:
        subq = subq.where(col(TelemetryReading.signal_id).in_(signal_ids))
    subq = subq.group_by(TelemetryReading.signal_id).subquery()

    stmt = select(TelemetryReading).join(
        subq,
        (TelemetryReading.signal_id == subq.c.signal_id)
        & (TelemetryReading.recorded_at == subq.c.max_at),
    )
    return list(session.exec(stmt).all())


def query_time_range(
    session: Session,
    signal_ids: list[str],
    minutes: int = 60,
    connector_id: str = CONNECTOR_ID,
) -> list[TelemetryReading]:
    """All readings for the given signals in the last N minutes, ordered by time."""
    cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.connector_id == connector_id)
        .where(col(TelemetryReading.signal_id).in_(signal_ids))
        .where(TelemetryReading.recorded_at >= cutoff)
        .order_by(TelemetryReading.recorded_at)
    )
    return list(session.exec(stmt).all())


def get_statistics(
    session: Session,
    signal_ids: list[str],
    minutes: int = 60,
    connector_id: str = CONNECTOR_ID,
) -> list[dict]:
    """Aggregated stats (min/max/avg/count/last) per signal over a sliding window."""
    cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
    stmt = (
        select(
            TelemetryReading.signal_id,
            TelemetryReading.display_name,
            TelemetryReading.unit,
            func.count(TelemetryReading.id).label("cnt"),
            func.min(TelemetryReading.value).label("min_v"),
            func.max(TelemetryReading.value).label("max_v"),
            func.avg(TelemetryReading.value).label("avg_v"),
        )
        .where(TelemetryReading.connector_id == connector_id)
        .where(col(TelemetryReading.signal_id).in_(signal_ids))
        .where(TelemetryReading.recorded_at >= cutoff)
        .group_by(
            TelemetryReading.signal_id,
            TelemetryReading.display_name,
            TelemetryReading.unit,
        )
    )
    rows = session.exec(stmt).all()
    latest = {r.signal_id: r.value for r in get_latest_readings(session, signal_ids, connector_id)}

    return [
        {
            "signal_id":    r.signal_id,
            "display_name": r.display_name,
            "unit":         r.unit,
            "count":        r.cnt,
            "min":          round(r.min_v, 3),
            "max":          round(r.max_v, 3),
            "avg":          round(r.avg_v, 3),
            "last":         round(latest.get(r.signal_id, r.avg_v), 3),
        }
        for r in rows
    ]


def get_timeline_history(
    session: Session,
    minutes: int = 10,
    connector_id: str = CONNECTOR_ID,
) -> list[dict]:
    """
    Pre-computed 4-channel timeline for the frontend chart.

    Reads the last `minutes` of raw data for temperature / vibration /
    pressure / humidity signals, buckets readings by poll cycle, then
    normalises each channel to 0–100 using the window min/max — exactly
    matching the normalisation the frontend hook applies to live readings.
    """
    signal_ids = list(TIMELINE_FIELD_MAP.values())
    readings = query_time_range(session, signal_ids, minutes, connector_id)

    # Bucket by poll interval so co-polled readings land in the same point
    bucket_ms = POLL_INTERVAL * 1000
    buckets: dict[int, dict[str, float]] = defaultdict(dict)
    for r in readings:
        ts_ms = int(r.recorded_at.timestamp() * 1000)
        key = (ts_ms // bucket_ms) * bucket_ms
        buckets[key][r.signal_id] = r.value

    # Collect all values per field for normalization
    field_vals: dict[str, list[float]] = {f: [] for f in TIMELINE_FIELD_MAP}
    for bucket in buckets.values():
        for field, sig_id in TIMELINE_FIELD_MAP.items():
            v = bucket.get(sig_id)
            if v is not None:
                field_vals[field].append(v)

    def _norm(v: float, vals: list[float]) -> float:
        if len(vals) < 2:
            return 50.0
        mn, mx = min(vals), max(vals)
        spread = mx - mn
        if spread < 0.001:
            return 50.0
        return round(((v - mn) / spread) * 100, 2)

    result = []
    for ts_ms in sorted(buckets.keys()):
        bucket = buckets[ts_ms]
        point: dict = {"timestamp": ts_ms}
        for field, sig_id in TIMELINE_FIELD_MAP.items():
            v = bucket.get(sig_id)
            if v is None:
                break
            point[field] = _norm(v, field_vals[field])
        else:
            result.append(point)

    return result
