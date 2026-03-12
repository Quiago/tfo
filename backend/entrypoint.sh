#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Tripolar Industries — Container entrypoint
# Starts: 1) OPC-UA simulator  2) FastAPI main app  3) Auto-stop watchdog
# ─────────────────────────────────────────────────────────────────────────────
set -e

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

echo "[entrypoint] Starting OPC-UA simulator (ports 4840 + 8001)..."
uv run python simulated-data/main.py \
  >> "$LOG_DIR/simulator.log" 2>&1 &
SIMULATOR_PID=$!

# Give OPC-UA server time to bind before FastAPI connects
sleep 4

echo "[entrypoint] Starting auto-stop watchdog..."
bash /app/auto_stop.sh &
WATCHDOG_PID=$!

echo "[entrypoint] Starting FastAPI app (port 8000)..."
# This runs in foreground — Docker tracks this process
exec uv run uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1

# exec replaces shell → on uvicorn exit Docker stops the container
# and the OS kills all child processes automatically
