"""
simulated-data/rest_api.py — FastAPI REST layer for historical time-series data.

The timeline component needs pre-populated history at startup so charts
aren't empty.  This API generates synthetic history on-demand using the same
deterministic simulation math, so historical data is always smooth and
consistent with current real-time readings coming from OPC UA.

Endpoints:
  GET /health                    — liveness probe
  GET /api/nodes                 — signal catalog (id, name, unit, group)
  GET /api/snapshot              — all current values in one call
  GET /api/history               — time-series for one or more signals
      ?signals=zone1_temperature,total_power
      &minutes=60        (1 – 1440)
      &points=300        (10 – 3000)
"""
from __future__ import annotations

import time
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from simulator import Simulator

app = FastAPI(
    title="Tripolar Simulated Factory — REST API",
    version="1.0.0",
    description="Historical time-series and snapshot endpoints for the Tripolar timeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Shared simulator instance — set by main.py before the server starts
_sim: Simulator | None = None


def init_rest_api(sim: Simulator) -> None:
    global _sim
    _sim = sim


def _sim_or_raise() -> Simulator:
    if _sim is None:
        raise RuntimeError("Simulator not initialised")
    return _sim


# ── Signal catalog ────────────────────────────────────────────────────────────
#
# Each entry describes one logical signal:
#   id       → stable string key (used in /api/history ?signals=)
#   name     → human-readable label for the UI
#   unit     → engineering unit string
#   group    → "sensors" | "production" | "energy"
#   fn       → SimPoint method name
#   robot_id → (optional) int passed as first positional arg to fn

_CATALOG: list[dict] = [
    # ── Sensors ───────────────────────────────────────────────────────────────
    {"id": "ambient_temperature", "name": "Ambient Temperature", "unit": "°C",   "group": "sensors",    "fn": "ambient_temperature"},
    {"id": "zone1_temperature",   "name": "Zone 1 Temperature",  "unit": "°C",   "group": "sensors",    "fn": "zone1_temperature"},
    {"id": "zone2_temperature",   "name": "Zone 2 Temperature",  "unit": "°C",   "group": "sensors",    "fn": "zone2_temperature"},
    {"id": "vibration_x",         "name": "Vibration X",         "unit": "mm/s", "group": "sensors",    "fn": "vibration_x"},
    {"id": "vibration_y",         "name": "Vibration Y",         "unit": "mm/s", "group": "sensors",    "fn": "vibration_y"},
    {"id": "vibration_z",         "name": "Vibration Z",         "unit": "mm/s", "group": "sensors",    "fn": "vibration_z"},
    {"id": "humidity",            "name": "Humidity",            "unit": "%",    "group": "sensors",    "fn": "humidity"},
    {"id": "line_pressure",       "name": "Line Pressure",       "unit": "bar",  "group": "sensors",    "fn": "line_pressure"},
    # ── Production KPIs ───────────────────────────────────────────────────────
    {"id": "parts_assembled",     "name": "Parts Assembled",     "unit": "pcs",  "group": "production", "fn": "parts_assembled"},
    {"id": "cycle_time",          "name": "Cycle Time",          "unit": "s",    "group": "production", "fn": "cycle_time"},
    {"id": "throughput",          "name": "Throughput",          "unit": "pph",  "group": "production", "fn": "throughput"},
    {"id": "defect_rate",         "name": "Defect Rate",         "unit": "%",    "group": "production", "fn": "defect_rate"},
    {"id": "yield_rate",          "name": "Yield Rate",          "unit": "%",    "group": "production", "fn": "yield_rate"},
    # ── Robots ────────────────────────────────────────────────────────────────
    *[
        {
            "id": f"robot{i}_{field}",
            "name": f"Robot {i} {label}",
            "unit": unit,
            "group": "production",
            "fn": fn,
            "robot_id": i,
        }
        for i in range(1, 5)
        for field, label, unit, fn in [
            ("speed",      "Speed",             "%",  "robot_speed"),
            ("joint_temp", "Joint Temperature", "°C", "robot_joint_temp"),
            ("load",       "Load",              "Nm", "robot_load"),
        ]
    ],
    # ── Energy ────────────────────────────────────────────────────────────────
    {"id": "total_power",    "name": "Total Power",    "unit": "kW",  "group": "energy", "fn": "total_power"},
    {"id": "aux_power",      "name": "Aux Power",      "unit": "kW",  "group": "energy", "fn": "aux_power"},
    {"id": "power_factor",   "name": "Power Factor",   "unit": "",    "group": "energy", "fn": "power_factor"},
    {"id": "grid_frequency", "name": "Grid Frequency", "unit": "Hz",  "group": "energy", "fn": "grid_frequency"},
    {"id": "energy_today",   "name": "Energy Today",   "unit": "kWh", "group": "energy", "fn": "energy_today_kwh"},
    *[
        {
            "id": f"robot{i}_power",
            "name": f"Robot {i} Power",
            "unit": "kW",
            "group": "energy",
            "fn": "robot_power",
            "robot_id": i,
        }
        for i in range(1, 5)
    ],
]

_INDEX: dict[str, dict] = {entry["id"]: entry for entry in _CATALOG}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "ts_ms": int(time.time() * 1000)}


@app.get("/api/nodes")
def list_nodes():
    """Signal catalog — all available signal IDs, names, units, and groups."""
    return [
        {k: v for k, v in entry.items() if k not in ("fn", "robot_id")}
        for entry in _CATALOG
    ]


@app.get("/api/snapshot")
def snapshot():
    """All current process values in one call."""
    return _sim_or_raise().now().snapshot()


@app.get("/api/history")
def history(
    signals: Annotated[
        str,
        Query(description="Comma-separated signal IDs (see /api/nodes)"),
    ] = "zone1_temperature,total_power,throughput,vibration_x",
    minutes: Annotated[int, Query(ge=1, le=525_600, description="History window in minutes")] = 60,
    points:  Annotated[int, Query(ge=10, le=3000, description="Number of data points to return")] = 300,
):
    """
    Historical time-series data for one or more signals.

    Returns: `{ signal_id: [ {ts: epoch_ms, value: number|null}, … ] }`

    The data is generated deterministically from the same wave equations used
    by the OPC UA server, so history is always consistent with real-time values.
    """
    sim = _sim_or_raise()
    signal_ids = [s.strip() for s in signals.split(",") if s.strip()]

    now = time.time()
    step_s = (minutes * 60.0) / points
    timestamps = [now - (points - i) * step_s for i in range(points)]

    result: dict[str, object] = {}

    for sig_id in signal_ids:
        meta = _INDEX.get(sig_id)
        if meta is None:
            result[sig_id] = {"error": f"Unknown signal '{sig_id}'. See /api/nodes."}
            continue

        fn_name = meta["fn"]
        robot_id = meta.get("robot_id")
        series = []

        for ts in timestamps:
            p = sim.at(ts)
            fn = getattr(p, fn_name, None)
            if fn is None:
                series.append({"ts": int(ts * 1000), "value": None})
                continue
            try:
                raw = fn(robot_id) if robot_id is not None else fn()
                value = float(raw) if not isinstance(raw, str) else raw
            except Exception:
                value = None
            series.append({"ts": int(ts * 1000), "value": value})

        result[sig_id] = series

    return result
