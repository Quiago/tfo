"""
telemetry/service.py — Background poller + query helpers.

Architecture
────────────
The TelemetryPoller is the bridge between the connector layer and the DB:

  Simulator OPC UA
       │
       └── OPC UA Connector (registered in DB)
               │
               ├── Frontend (live, 2 s): /connectors/{id}/read-batch
               │
               └── TelemetryPoller (5 s): connector_service.read_batch()
                       │
                       └── telemetry_reading table
                               │
                               ├── /telemetry/timeline  → frontend history seed
                               └── AI tools (get_latest_readings, etc.)

The poller uses the existing connector_service.read_batch() so there is ONE
connection path to the simulator — the OPC UA connector already configured by
the operator.  It never calls the simulator REST API directly.

Signal mapping
────────────────
OPC UA nodes have display_names like "Zone1Temperature", "Speed", "Load".
_node_to_signal() maps them to our signal catalog IDs using two lookup tables:
  _NODE_INFO      — direct display_name → (signal_id, human_name, unit)
  _ROBOT_FIELDS   — robot sub-fields by display_name (path[-2] gives robot number)

Nodes that should be skipped (Energy/Robot{N}Power duplicates, string Status)
return None from _node_to_signal() and are not stored.

Configuration (env vars)
────────────────────────
  TELEMETRY_CONNECTOR_ID   ID of the OPC UA connector to poll.
                           If unset, the poller auto-detects the first active
                           OPC UA connector in DB.
  TELEMETRY_POLL_INTERVAL  Seconds between polls (default: 5).
  TELEMETRY_RETENTION_HOURS How many hours of readings to keep (default: 24).
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
import random
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import Integer as SAInteger
from sqlalchemy import cast as sa_cast
from sqlalchemy import literal_column
from sqlalchemy import text as sa_text
from sqlmodel import Session, col, delete as sql_delete, func, select

from app.api.v1.connectors.backends.base import NodeInfo
from app.api.v1.telemetry.models import TelemetryReading

logger = logging.getLogger(__name__)

POLL_INTERVAL     = int(os.getenv("TELEMETRY_POLL_INTERVAL", "5"))       # seconds
RETENTION_HOURS   = int(os.getenv("TELEMETRY_RETENTION_HOURS", "8760"))  # default: 1 year
_CONNECTOR_ID_ENV = os.getenv("TELEMETRY_CONNECTOR_ID", "")

# Virtual connector_id used for the one-time startup historical backfill.
# This data is shown in charts before any real OPC UA connector is configured.
STARTUP_CONNECTOR_ID = "_startup_"

# ── Backfill tier table ───────────────────────────────────────────────────────
# Each entry: (min_age_seconds, step_seconds)
_BACKFILL_TIERS: list[tuple[int, int]] = [
    (30 * 86_400,  86_400),          # ≥ 30 days : 1-day steps
    (7  * 86_400,  3_600),           # ≥ 7 days  : 1-hour steps
    (86_400,       300),             # ≥ 24 hours: 5-min steps
    (0,            POLL_INTERVAL),   # < 24 hours: raw poll interval
]


def _backfill_step(age_seconds: float) -> int:
    """Return the appropriate synthetic data interval for the given data age."""
    for min_age, step in _BACKFILL_TIERS:
        if age_seconds >= min_age:
            return step
    return POLL_INTERVAL


# ── Timeline downsampling tiers ───────────────────────────────────────────────
_DOWNSAMPLE_TIERS: list[tuple[int, int]] = [
    (43_200, 86_400),  # > 30 days  → 1-day   buckets
    (1_440,   3_600),  # > 24 hours → 1-hour  buckets
    (60,       300),   # > 1 hour   → 5-min   buckets
    (0,          0),   # ≤ 1 hour   → raw
]


def _downsample_bucket_seconds(minutes: int) -> int:
    """Return DB bucket size in seconds for the requested time window."""
    for min_minutes, bucket_s in _DOWNSAMPLE_TIERS:
        if minutes > min_minutes:
            return bucket_s
    return 0


# ── OPC UA display_name → (signal_id, human_label, unit) ─────────────────────
_NODE_INFO: dict[str, tuple[str, str, str]] = {
    "AmbientTemperature": ("ambient_temperature", "Ambient Temperature", "°C"),
    "Zone1Temperature":   ("zone1_temperature",   "Zone 1 Temperature",  "°C"),
    "Zone2Temperature":   ("zone2_temperature",   "Zone 2 Temperature",  "°C"),
    "Vibration_X":        ("vibration_x",         "Vibration X",         "mm/s"),
    "Vibration_Y":        ("vibration_y",         "Vibration Y",         "mm/s"),
    "Vibration_Z":        ("vibration_z",         "Vibration Z",         "mm/s"),
    "Humidity":           ("humidity",            "Humidity",            "%"),
    "LinePressure":       ("line_pressure",       "Line Pressure",       "bar"),
    "PartsAssembled":     ("parts_assembled",     "Parts Assembled",     "pcs"),
    "CycleTime":          ("cycle_time",          "Cycle Time",          "s"),
    "Throughput":         ("throughput",          "Throughput",          "pph"),
    "DefectRate":         ("defect_rate",         "Defect Rate",         "%"),
    "YieldRate":          ("yield_rate",          "Yield Rate",          "%"),
    "TotalPower":         ("total_power",         "Total Power",         "kW"),
    "AuxPower":           ("aux_power",           "Aux Power",           "kW"),
    "PowerFactor":        ("power_factor",        "Power Factor",        ""),
    "GridFrequency":      ("grid_frequency",      "Grid Frequency",      "Hz"),
    "EnergyTodayKWh":     ("energy_today",        "Energy Today",        "kWh"),
}

# Robot variable display_names (path[-2] = "Robot{N}" identifies the robot)
_ROBOT_FIELDS: dict[str, tuple[str, str, str]] = {
    "Speed":            ("speed",      "Speed",             "%"),
    "JointTemperature": ("joint_temp", "Joint Temperature", "°C"),
    "Load":             ("load",       "Load",              "Nm"),
    "Power":            ("power",      "Power",             "kW"),
    # "Status" is a string — deliberately excluded (not numeric)
}

_ROBOT_RE = re.compile(r"^Robot(\d+)$")

# ── Synthetic baseline values (signal_id → (base, variance)) ─────────────────
_SIGNAL_BASELINES: dict[str, tuple[float, float]] = {
    "ambient_temperature": (24.0, 4.0),
    "zone1_temperature":   (72.0, 8.0),
    "zone2_temperature":   (68.0, 8.0),
    "vibration_x":         (2.4,  1.2),
    "vibration_y":         (1.9,  0.9),
    "vibration_z":         (1.4,  0.7),
    "humidity":            (54.0, 12.0),
    "line_pressure":       (6.2,  0.8),
    "parts_assembled":     (1200, 150.0),
    "cycle_time":          (44.0, 8.0),
    "throughput":          (82.0, 12.0),
    "defect_rate":         (2.4,  1.2),
    "yield_rate":          (95.5, 3.0),
    "total_power":         (148.0, 28.0),
    "aux_power":           (24.0, 4.0),
    "power_factor":        (0.92, 0.04),
    "grid_frequency":      (50.0, 0.15),
    "energy_today":        (480.0, 90.0),
    # Robot sub-fields (matched by suffix pattern in backfill)
    "_speed":              (76.0, 14.0),
    "_joint_temp":         (44.0, 9.0),
    "_load":               (118.0, 28.0),
    "_power":              (4.8,  1.8),
}

# Number of robots to synthesise history for when the DB is empty.
_BACKFILL_ROBOT_COUNT = 4

# ── Frontend 4-channel mapping: chart field → signal_id ──────────────────────
# Used as fallback when the frontend does not supply explicit signal_ids.
TIMELINE_FIELD_MAP: dict[str, str] = {
    "temperature": "zone1_temperature",
    "vibration":   "vibration_x",
    "pressure":    "line_pressure",
    "humidity":    "humidity",
}

# ── Published node maps (populated by TelemetryPoller after discovery) ────────
# connector_id → { node_id → (signal_id, display_name, unit) }
# Exposed via GET /telemetry/node-map so the frontend can resolve OPC UA
# node_ids to DB signal_ids without hard-coding the mapping itself.
_published_node_maps: dict[str, dict[str, tuple[str, str, str]]] = {}


def get_node_map(connector_id: str) -> dict[str, dict]:
    """Return the OPC UA node_id → signal metadata map for a connector.

    Populated after the TelemetryPoller completes its first discovery cycle.
    Returns an empty dict if discovery has not happened yet.
    """
    raw = _published_node_maps.get(connector_id, {})
    return {
        node_id: {"signal_id": sig[0], "display_name": sig[1], "unit": sig[2]}
        for node_id, sig in raw.items()
    }


def _node_to_signal(node: NodeInfo) -> tuple[str, str, str] | None:
    """
    Map one OPC UA NodeInfo to (signal_id, display_name, unit).
    Returns None for nodes that should be skipped (string tags, energy duplicates).
    """
    name = node.display_name

    # Direct match (sensors, production KPIs, energy totals)
    if name in _NODE_INFO:
        return _NODE_INFO[name]

    # Robot variables under AssemblyLine: path[-2] = "Robot{N}"
    if name in _ROBOT_FIELDS and len(node.path) >= 2:
        m = _ROBOT_RE.match(node.path[-2])
        if m:
            robot_id = m.group(1)
            field_id, field_name, unit = _ROBOT_FIELDS[name]
            return (f"robot{robot_id}_{field_id}", f"Robot {robot_id} {field_name}", unit)

    return None


# ── Poller ────────────────────────────────────────────────────────────────────

class TelemetryPoller:
    """
    Background asyncio task.  Call start() once from the app lifespan.

    Uses session_factory (callable → Session) to open short-lived DB sessions
    per poll cycle.  Connector reads go through the existing connector_service
    dispatch so the OPC UA connector is the single source of truth.
    """

    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory
        self._task: asyncio.Task | None = None
        self._connector_id: str | None = None
        # node_id → (signal_id, display_name, unit) built after first discovery
        self._node_map: dict[str, tuple[str, str, str]] = {}
        # connector_ids for which we've already launched a backfill task
        self._backfill_launched: set[str] = set()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="telemetry-poller")
        logger.info("[Telemetry] Poller started — interval=%ds", POLL_INTERVAL)

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _resolve_connector_id(self) -> str | None:
        """Find the connector_id to poll: env var → first active OPC UA connector in DB."""
        if _CONNECTOR_ID_ENV:
            return _CONNECTOR_ID_ENV

        from app.api.v1.connectors.models import Connector, ConnectorType
        with self._session_factory() as session:
            stmt = select(Connector).where(
                Connector.type == ConnectorType.opcua,
                Connector.is_active == True,  # noqa: E712
            )
            connector = session.exec(stmt).first()
            if connector:
                return connector.id

        logger.warning(
            "[Telemetry] No active OPC UA connector found. "
            "Set TELEMETRY_CONNECTOR_ID or register an OPC UA connector to start polling."
        )
        return None

    async def _ensure_node_map(self, connector_id: str) -> bool:
        """
        Discover all OPC UA nodes and build the node_id → signal_info map.
        Returns True if the map was successfully built.
        Uses the cached discovery result (5-min TTL) — not a network call every poll.
        """
        if self._node_map:
            return True

        try:
            from app.api.v1.connectors import service as connector_service
            with self._session_factory() as session:
                result = await connector_service.discover(connector_id, session)

            self._node_map = {}
            for node in result.nodes:
                sig = _node_to_signal(node)
                if sig:
                    self._node_map[node.node_id] = sig

            # Publish the node map so the /telemetry/node-map endpoint can serve it
            _published_node_maps[connector_id] = self._node_map

            logger.info(
                "[Telemetry] Node map built — %d/%d nodes mapped to signals",
                len(self._node_map), result.node_count,
            )
            return bool(self._node_map)
        except Exception as exc:
            logger.debug("[Telemetry] Discovery failed: %s", exc)
            return False

    async def _run(self) -> None:
        while True:
            try:
                await self._poll_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("[Telemetry] poll error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)

    async def _maybe_launch_backfill(self, connector_id: str) -> None:
        """
        Checks if the connector needs a one-time backfill and launches it in a
        background thread if so.  Called once after the node map is built.
        """
        if connector_id in self._backfill_launched:
            return
        # Mark immediately so concurrent poll cycles don't double-launch
        self._backfill_launched.add(connector_id)

        from app.api.v1.connectors.models import Connector
        with self._session_factory() as session:
            connector = session.get(Connector, connector_id)
            needs_backfill = connector is not None and not connector.backfill_done

        if needs_backfill:
            logger.info("[Telemetry] Launching one-time backfill for connector %s", connector_id)
            asyncio.create_task(
                asyncio.to_thread(run_connector_backfill, connector_id, self._session_factory),
                name=f"backfill-{connector_id}",
            )
        else:
            logger.debug("[Telemetry] Backfill already done for connector %s — skipping", connector_id)

    async def _poll_cycle(self) -> None:
        # Resolve which connector to use (cached after first success)
        if self._connector_id is None:
            self._connector_id = await self._resolve_connector_id()
            if self._connector_id is None:
                return  # retry next cycle

        # Build or refresh node map (cached after first discovery)
        ok = await self._ensure_node_map(self._connector_id)
        if not ok:
            self._node_map = {}   # force re-discovery next cycle
            return

        # After discovery succeeds, check if a one-time backfill is needed
        await self._maybe_launch_backfill(self._connector_id)

        # Read all mapped nodes in one batch
        node_ids = list(self._node_map.keys())
        try:
            from app.api.v1.connectors import service as connector_service
            with self._session_factory() as session:
                batch = await connector_service.read_batch(self._connector_id, node_ids, session)
        except Exception as exc:
            logger.debug("[Telemetry] read_batch failed: %s — will rediscover", exc)
            self._node_map = {}  # force rediscovery (server may have restarted)
            return

        # Persist readings
        now = datetime.now(UTC)
        stored = 0
        with self._session_factory() as session:
            for item in batch:
                if "error" in item:
                    continue
                sig = self._node_map.get(item["node_id"])
                if sig is None:
                    continue
                raw = item.get("value")
                if raw is None:
                    continue
                try:
                    value = float(raw)
                except (TypeError, ValueError):
                    continue

                signal_id, display_name, unit = sig
                session.add(TelemetryReading(
                    connector_id=self._connector_id,
                    signal_id=signal_id,
                    display_name=display_name,
                    value=value,
                    unit=unit,
                    recorded_at=now,
                ))
                stored += 1

            session.commit()
            logger.debug("[Telemetry] Stored %d readings at %s", stored, now.isoformat())

            # Prune old data — bulk DELETE avoids loading rows into Python
            cutoff = now - timedelta(hours=RETENTION_HOURS)
            result = session.exec(
                sql_delete(TelemetryReading).where(TelemetryReading.recorded_at < cutoff)
            )
            if result.rowcount:
                session.commit()
                logger.debug("[Telemetry] Pruned %d old readings", result.rowcount)


# ── Query helpers ─────────────────────────────────────────────────────────────

def get_latest_readings(
    session: Session,
    signal_ids: list[str] | None = None,
    connector_id: str | None = None,
) -> list[TelemetryReading]:
    """Latest value per signal_id (subquery join on max recorded_at)."""
    subq = select(
        TelemetryReading.signal_id,
        func.max(TelemetryReading.recorded_at).label("max_at"),
    )
    if connector_id:
        subq = subq.where(TelemetryReading.connector_id == connector_id)
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
    connector_id: str | None = None,
) -> list[TelemetryReading]:
    """All readings for the given signals in the last N minutes, ordered by time."""
    cutoff = datetime.now(UTC) - timedelta(minutes=minutes)
    stmt = (
        select(TelemetryReading)
        .where(col(TelemetryReading.signal_id).in_(signal_ids))
        .where(TelemetryReading.recorded_at >= cutoff)
    )
    if connector_id:
        stmt = stmt.where(TelemetryReading.connector_id == connector_id)
    return list(session.exec(stmt.order_by(TelemetryReading.recorded_at)).all())


def get_statistics(
    session: Session,
    signal_ids: list[str],
    minutes: int = 60,
    connector_id: str | None = None,
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
        .where(col(TelemetryReading.signal_id).in_(signal_ids))
        .where(TelemetryReading.recorded_at >= cutoff)
        .group_by(
            TelemetryReading.signal_id,
            TelemetryReading.display_name,
            TelemetryReading.unit,
        )
    )
    if connector_id:
        stmt = stmt.where(TelemetryReading.connector_id == connector_id)
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


def get_statistics_absolute(
    session: Session,
    signal_ids: list[str],
    start_ms: int,
    end_ms: int,
    connector_id: str | None = None,
) -> list[dict]:
    """Aggregated stats for specific absolute epoch-ms timestamps."""
    start_dt = datetime.fromtimestamp(start_ms / 1000, UTC)
    end_dt   = datetime.fromtimestamp(end_ms   / 1000, UTC)

    base_filter = [
        TelemetryReading.recorded_at >= start_dt,
        TelemetryReading.recorded_at <= end_dt,
    ]
    if signal_ids:
        base_filter.append(col(TelemetryReading.signal_id).in_(signal_ids))
    if connector_id:
        base_filter.append(TelemetryReading.connector_id == connector_id)

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
        .where(*base_filter)
        .group_by(
            TelemetryReading.signal_id,
            TelemetryReading.display_name,
            TelemetryReading.unit,
        )
    )
    rows = session.exec(stmt).all()
    return [
        {
            "signal_id":    r.signal_id,
            "display_name": r.display_name,
            "unit":         r.unit,
            "count":        r.cnt,
            "min":          round(r.min_v, 3),
            "max":          round(r.max_v, 3),
            "avg":          round(r.avg_v, 3),
        }
        for r in rows
    ]


def _build_bucketed_data(
    session: Session,
    signal_ids: list[str],
    minutes: int,
    connector_id: str | None,
) -> dict[int, dict[str, float]]:
    """
    Internal helper: builds time-bucketed { ts_ms → { signal_id → avg_value } }
    with DB-level downsampling for large windows.
    """
    cutoff   = datetime.now(UTC) - timedelta(minutes=minutes)
    bucket_s = _downsample_bucket_seconds(minutes)
    buckets: dict[int, dict[str, float]] = defaultdict(dict)

    if bucket_s == 0:
        readings = query_time_range(session, signal_ids, minutes, connector_id)
        raw_bucket_ms = POLL_INTERVAL * 1000
        for r in readings:
            ts_ms = int(r.recorded_at.timestamp() * 1000)
            key   = (ts_ms // raw_bucket_ms) * raw_bucket_ms
            buckets[key][r.signal_id] = r.value
    else:
        bucket_expr = (
            f"(CAST(strftime('%s', recorded_at) AS INTEGER) / {bucket_s}) * {bucket_s}"
        )
        stmt = (
            select(
                literal_column(bucket_expr).label("ts_epoch"),
                TelemetryReading.signal_id,
                func.avg(TelemetryReading.value).label("avg_val"),
            )
            .where(col(TelemetryReading.signal_id).in_(signal_ids))
            .where(TelemetryReading.recorded_at >= cutoff)
        )
        if connector_id:
            stmt = stmt.where(TelemetryReading.connector_id == connector_id)
        stmt = (
            stmt
            .group_by(sa_text(bucket_expr), TelemetryReading.signal_id)
            .order_by(sa_text(bucket_expr))
        )
        for row in session.execute(stmt).all():
            ts_ms = int(row.ts_epoch) * 1_000
            buckets[ts_ms][row.signal_id] = float(row.avg_val)

    return buckets


def get_timeline_history(
    session: Session,
    minutes: int = 10,
    connector_id: str | None = None,
    signal_ids: list[str] | None = None,
) -> list[dict]:
    """
    Pre-computed 4-channel timeline for the frontend chart.

    When signal_ids is provided (4 items), those signals are mapped to the
    temperature / vibration / pressure / humidity slots respectively.
    This lets the frontend pass its dynamically discovered signal_ids so the
    historical data matches the live polling channels.

    Falls back to TIMELINE_FIELD_MAP when signal_ids is None or incomplete.

    Each point is normalised to 0–100 relative to the window min/max.
    """
    # Build the channel→signal mapping from caller-supplied ids or the default.
    default_slots = list(TIMELINE_FIELD_MAP.keys())   # ['temperature','vibration',...]
    default_sigs  = list(TIMELINE_FIELD_MAP.values())  # ['zone1_temperature',...]

    if signal_ids and len(signal_ids) > 0:
        # Pad with defaults for any missing slots
        padded = list(signal_ids) + default_sigs[len(signal_ids):]
        field_map = dict(zip(default_slots, padded[:4]))
    else:
        field_map = TIMELINE_FIELD_MAP

    query_sigs = list(field_map.values())
    buckets    = _build_bucketed_data(session, query_sigs, minutes, connector_id)

    # Normalise 0–100 across the full window per channel
    field_vals: dict[str, list[float]] = {f: [] for f in field_map}
    for bkt in buckets.values():
        for field, sig_id in field_map.items():
            v = bkt.get(sig_id)
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
        bkt   = buckets[ts_ms]
        point: dict = {"timestamp": ts_ms}
        for field, sig_id in field_map.items():
            v = bkt.get(sig_id)
            if v is None:
                break
            point[field] = _norm(v, field_vals[field])
            raw_key = "raw" + field[0].upper() + field[1:]
            point[raw_key] = round(v, 4)
        else:
            result.append(point)

    return result


def get_timeline_history_by_signals(
    session: Session,
    signal_ids: list[str],
    minutes: int = 10,
    connector_id: str | None = None,
) -> list[dict]:
    """
    Generic downsampled timeline for arbitrary signal_ids.

    Returns one dict per time bucket: { "timestamp": ms, <signal_id>: normalised,
    "raw_<signal_id>": raw_value, ... }

    Used by the frontend to fetch energy channel history (total_power, aux_power,
    power_factor) with the same DB-level downsampling as the 4-channel endpoint.
    """
    buckets = _build_bucketed_data(session, signal_ids, minutes, connector_id)

    # Collect all values per signal for normalisation
    sig_vals: dict[str, list[float]] = {s: [] for s in signal_ids}
    for bkt in buckets.values():
        for sig_id in signal_ids:
            v = bkt.get(sig_id)
            if v is not None:
                sig_vals[sig_id].append(v)

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
        bkt   = buckets[ts_ms]
        point: dict = {"timestamp": ts_ms}
        for sig_id in signal_ids:
            v = bkt.get(sig_id)
            if v is not None:
                point[sig_id]           = _norm(v, sig_vals[sig_id])
                point[f"raw_{sig_id}"]  = round(v, 4)
        result.append(point)

    return result


def run_startup_backfill(session_factory) -> None:
    """
    One-time synthetic backfill run at server startup before any connector exists.

    Fills 1 year of historical data for the full signal catalog using the virtual
    connector_id STARTUP_CONNECTOR_ID.  Skipped if the DB already has data so that
    subsequent restarts are instant.

    Called from main.py lifespan in a background thread — never blocks the server.
    """
    from sqlmodel import select, func as sql_func
    with session_factory() as session:
        count = session.exec(select(sql_func.count(TelemetryReading.id))).one()
        if count > 0:
            logger.info("[Telemetry] Startup backfill skipped — DB already has %d rows", count)
            return

    logger.info("[Telemetry] DB is empty — running startup backfill (1 year of synthetic history)")
    _run_backfill_inner(STARTUP_CONNECTOR_ID, session_factory)
    logger.info("[Telemetry] Startup backfill complete — server is ready with historical data")


def run_connector_backfill(connector_id: str, session_factory) -> None:
    """
    One-time historical backfill for a single OPC UA connector.

    Checks connector.backfill_done before running; marks it True on completion
    so it never re-runs for this connector.

    Before generating new data, removes the startup placeholder rows so that
    only real connector data remains in the DB.
    """
    from app.api.v1.connectors.models import Connector

    # Guard: skip if already done (concurrent launch safety)
    with session_factory() as session:
        connector = session.get(Connector, connector_id)
        if connector is None or connector.backfill_done:
            logger.info("[Telemetry] backfill skipped — already done for %s", connector_id)
            return

    # Remove startup placeholder so charts show only this connector's data
    with session_factory() as session:
        result = session.exec(
            sql_delete(TelemetryReading).where(
                TelemetryReading.connector_id == STARTUP_CONNECTOR_ID
            )
        )
        if result.rowcount:
            session.commit()
            logger.info(
                "[Telemetry] Removed %d startup placeholder rows before connector backfill",
                result.rowcount,
            )

    _run_backfill_inner(connector_id, session_factory)

    # Mark done — poller will never trigger backfill again for this connector
    with session_factory() as session:
        connector = session.get(Connector, connector_id)
        if connector:
            connector.backfill_done = True
            session.add(connector)
            session.commit()


def _run_backfill_inner(connector_id: str, session_factory) -> None:
    """
    Core backfill logic shared by startup and connector backfills.

    Generates synthetic readings for the full signal catalog from
    (now - RETENTION_HOURS) to now using tiered resolution.
    """
    now      = datetime.now(UTC)
    start_dt = now - timedelta(hours=RETENTION_HOURS)
    gap_s    = (now - start_dt).total_seconds()

    logger.info(
        "[Telemetry] backfill start — connector=%s covering %.0f h",
        connector_id, gap_s / 3_600,
    )

    # Build signal catalog
    sig_meta: dict[str, tuple[str, str]] = {}
    for _dn, (signal_id, human_name, unit) in _NODE_INFO.items():
        sig_meta[signal_id] = (human_name, unit)
    for n in range(1, _BACKFILL_ROBOT_COUNT + 1):
        for field_name, (field_id, human_name, unit) in _ROBOT_FIELDS.items():
            if field_name == "Status":
                continue
            sig_meta[f"robot{n}_{field_id}"] = (f"Robot {n} {human_name}", unit)

    def _baseline(signal_id: str) -> tuple[float, float]:
        if signal_id in _SIGNAL_BASELINES:
            return _SIGNAL_BASELINES[signal_id]
        for suffix, vals in _SIGNAL_BASELINES.items():
            if suffix.startswith("_") and signal_id.endswith(suffix):
                return vals
        return (50.0, 10.0)

    signals = list(sig_meta.items())
    batch: list[TelemetryReading] = []
    total_rows = 0
    t = start_dt

    while t <= now:
        elapsed_hours = (t - start_dt).total_seconds() / 3_600.0
        for signal_id, (display_name, unit) in signals:
            base, variance = _baseline(signal_id)
            value = (
                base
                + math.sin(elapsed_hours * 0.3) * variance * 0.5
                + random.gauss(0, variance * 0.2)
            )
            batch.append(TelemetryReading(
                connector_id=connector_id,
                signal_id=signal_id,
                display_name=display_name,
                value=round(value, 4),
                unit=unit,
                recorded_at=t,
            ))
            if len(batch) >= 1_000:
                with session_factory() as session:
                    session.add_all(batch)
                    session.commit()
                total_rows += len(batch)
                batch = []

        age_seconds = (now - t).total_seconds()
        t += timedelta(seconds=_backfill_step(age_seconds))

    if batch:
        with session_factory() as session:
            session.add_all(batch)
            session.commit()
        total_rows += len(batch)

    logger.info(
        "[Telemetry] backfill done — connector=%s rows=%d signals=%d span=%.1fh",
        connector_id, total_rows, len(signals), gap_s / 3_600,
    )


def get_channel_metadata(session: Session) -> list[dict]:
    """
    Returns display_name and unit for each of the 4 frontend timeline channels,
    sourced from the most recent readings stored in the DB.

    Falls back to the static _NODE_INFO catalogue when the DB has no data yet.
    """
    _FALLBACK: dict[str, tuple[str, str, str]] = {
        "temperature": _NODE_INFO["Zone1Temperature"],
        "vibration":   _NODE_INFO["Vibration_X"],
        "pressure":    _NODE_INFO["LinePressure"],
        "humidity":    _NODE_INFO["Humidity"],
    }

    signal_ids = list(TIMELINE_FIELD_MAP.values())
    latest = get_latest_readings(session, signal_ids)
    by_sig = {r.signal_id: r for r in latest}

    result = []
    for field, sig_id in TIMELINE_FIELD_MAP.items():
        row = by_sig.get(sig_id)
        if row:
            result.append({
                "field":        field,
                "signal_id":    sig_id,
                "display_name": row.display_name,
                "unit":         row.unit,
            })
        else:
            _, display_name, unit = _FALLBACK[field]
            result.append({
                "field":        field,
                "signal_id":    sig_id,
                "display_name": display_name,
                "unit":         unit,
            })
    return result
