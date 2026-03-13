"""
simulated-data/main.py — Entry point: runs OPC UA server + FastAPI concurrently.

Both services share the same asyncio event loop and the same Simulator
instance, so real-time OPC UA values and historical REST values are always
derived from identical math.

Ports (override via env vars):
  OPCUA_ENDPOINT  opc.tcp://0.0.0.0:4840/tripolar/   ← OPC UA clients
  REST_HOST       0.0.0.0
  REST_PORT       8001                                 ← timeline history API

Run from the backend/ directory:
  uv run python simulated-data/main.py

Connect the Tripolar connector to:
  opc.tcp://<host>:4840/tripolar/

Query historical data from the timeline service at:
  http://<host>:8001/api/history?signals=zone1_temperature,total_power&minutes=60
  http://<host>:8001/api/nodes        ← signal catalog
  http://<host>:8001/api/snapshot     ← all current values
  http://<host>:8001/docs             ← Swagger UI
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

# Ensure the simulated-data package directory is on sys.path so relative
# imports work regardless of the working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

from opcua_server import run_opcua_server
from rest_api import app, init_rest_api
from simulator import Simulator

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-32s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
# asyncua emits an INFO log on every OPC UA read request — far too noisy.
# Set WARNING so only real problems surface in the terminal.
logging.getLogger("asyncua").setLevel(logging.WARNING)
logger = logging.getLogger("simulated-data")

# ── Config ────────────────────────────────────────────────────────────────────
OPCUA_ENDPOINT = os.getenv("OPCUA_ENDPOINT", "opc.tcp://0.0.0.0:4840/tripolar/")
REST_HOST      = os.getenv("REST_HOST", "0.0.0.0")
REST_PORT      = int(os.getenv("REST_PORT", "8001"))


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    sim = Simulator()
    init_rest_api(sim)

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  Tripolar Simulated KUKA Assembly Factory")
    logger.info("  OPC UA  → %s", OPCUA_ENDPOINT)
    logger.info("  REST    → http://%s:%d", REST_HOST, REST_PORT)
    logger.info("  Swagger → http://%s:%d/docs", REST_HOST, REST_PORT)
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    uvicorn_cfg = uvicorn.Config(
        app,
        host=REST_HOST,
        port=REST_PORT,
        loop="none",        # run inside our event loop, not a new one
        log_config=None,    # use our own basicConfig handler
        access_log=False,
    )
    uvicorn_server = uvicorn.Server(uvicorn_cfg)

    await asyncio.gather(
        run_opcua_server(sim, OPCUA_ENDPOINT),
        uvicorn_server.serve(),
    )


if __name__ == "__main__":
    asyncio.run(main())
