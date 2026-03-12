#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Tripolar Industries — RunPod stop script
# Usage: bash /workspace/tfo/backend/stop.sh
# ─────────────────────────────────────────────────────────────────────────────
echo "[stop] Deteniendo procesos..."

pkill -f "simulated-data/main.py" 2>/dev/null && echo "[stop] Simulador detenido" || echo "[stop] Simulador no estaba corriendo"
pkill -f "uvicorn app.main" 2>/dev/null && echo "[stop] FastAPI detenido"       || echo "[stop] FastAPI no estaba corriendo"
pkill -f "auto_stop.sh" 2>/dev/null      && echo "[stop] Watchdog detenido"     || echo "[stop] Watchdog no estaba corriendo"

sleep 2
echo "[stop] ✅ Todo detenido"