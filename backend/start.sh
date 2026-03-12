#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Tripolar Industries — RunPod startup script
# Usage: bash /workspace/tfo/backend/start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -a
source /workspace/.env
set +a

# uv en PATH
export PATH="/root/.local/bin:$PATH"

BACKEND_DIR="/workspace/tfo/backend"
LOG_DIR="/workspace/logs"
mkdir -p "$LOG_DIR"

cd "$BACKEND_DIR"

# ── Instalar uv si no está ────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  echo "[start] Instalando uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="/root/.local/bin:$PATH"
fi

# ── Sincronizar dependencias ──────────────────────────────────────────────────
echo "[start] Sincronizando dependencias..."
UV_CACHE_DIR=/workspace/.uv-cache uv sync --frozen --no-dev --python 3.12

# ── Matar procesos anteriores ─────────────────────────────────────────────────
pkill -f "simulated-data/main.py" 2>/dev/null
pkill -f "uvicorn app.main" 2>/dev/null
sleep 2

# ── 1. Simulador OPC-UA (4840) + REST (8003) ─────────────────────────────────
echo "[start] Arrancando simulador..."
REST_PORT=8003 nohup uv run python simulated-data/main.py \
  > "$LOG_DIR/simulator.log" 2>&1 &
echo "[start] Simulador PID: $!"

sleep 4

# ── 2. Auto-stop watchdog ─────────────────────────────────────────────────────
echo "[start] Arrancando auto-stop watchdog..."
nohup bash "$BACKEND_DIR/auto_stop.sh" \
  > "$LOG_DIR/autostop.log" 2>&1 &
echo "[start] Auto-stop PID: $!"

# ── 3. FastAPI principal ──────────────────────────────────────────────────────
echo "[start] Arrancando FastAPI..."
nohup uv run uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1 \
  > "$LOG_DIR/app.log" 2>&1 &
echo "[start] FastAPI PID: $!"

echo ""
echo "✅ Todo corriendo. Logs en $LOG_DIR/"
echo "   tail -f $LOG_DIR/app.log"
echo "   tail -f $LOG_DIR/simulator.log"
echo "   tail -f $LOG_DIR/autostop.log"
echo ""
echo "   curl http://localhost:8000/health"
