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
import os
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, func, select

from app.api.v1.connectors.backends.base import NodeInfo
from app.api.v1.telemetry.models import TelemetryReading

logger = logging.getLogger(__name__)

POLL_INTERVAL     = int(os.getenv("TELEMETRY_POLL_INTERVAL", "5"))     # seconds
RETENTION_HOURS   = int(os.getenv("TELEMETRY_RETENTION_HOURS", "24"))
_CONNECTOR_ID_ENV = os.getenv("TELEMETRY_CONNECTOR_ID", "")

# Virtual connector_id stored in DB rows when reading via OPC UA connector.
# Matches whatever connector_id the user configured.  Stored per-reading so
# we can support multiple connectors in the future.
CONNECTOR_ID_DEFAULT = "simulated-factory"

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

# ── Frontend 4-channel mapping: chart field → signal_id ──────────────────────
TIMELINE_FIELD_MAP: dict[str, str] = {
    "temperature": "zone1_temperature",
    "vibration":   "vibration_x",
    "pressure":    "line_pressure",
    "humidity":    "humidity",
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

    # Everything else is skipped:
    #   - Energy/Robot{N}Power (duplicate of AssemblyLine robot power)
    #   - Status strings
    #   - OPC UA metadata nodes
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

            # Prune old data
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


def get_timeline_history(
    session: Session,
    minutes: int = 10,
    connector_id: str | None = None,
) -> list[dict]:
    """
    Pre-computed 4-channel timeline for the frontend chart.

    Reads the last `minutes` of raw data for temperature / vibration /
    pressure / humidity signals, buckets readings by poll cycle, then
    normalises each channel to 0–100 using the window min/max — identical
    normalisation to what the frontend hook applies to live readings.
    """
    signal_ids = list(TIMELINE_FIELD_MAP.values())
    readings = query_time_range(session, signal_ids, minutes, connector_id)

    bucket_ms = POLL_INTERVAL * 1000
    buckets: dict[int, dict[str, float]] = defaultdict(dict)
    for r in readings:
        ts_ms = int(r.recorded_at.timestamp() * 1000)
        key = (ts_ms // bucket_ms) * bucket_ms
        buckets[key][r.signal_id] = r.value

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
