#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-stop watchdog: stops the RunPod pod after IDLE_THRESHOLD seconds
# of no HTTP traffic on port 8000.
# Requires env vars: RUNPOD_API_KEY, RUNPOD_POD_ID
# ─────────────────────────────────────────────────────────────────────────────
IDLE_THRESHOLD=${IDLE_THRESHOLD_SECONDS:-600}   # default: 10 min
CHECK_INTERVAL=60                                # check every 60s

echo "[auto-stop] Watchdog started (threshold=${IDLE_THRESHOLD}s)"

while true; do
  sleep "$CHECK_INTERVAL"

  # Ask the app how many seconds since last real request
  SECONDS_IDLE=$(curl -sf http://localhost:8000/metrics/last-request-seconds-ago 2>/dev/null || echo "0")

  # Validate it's a number
  if ! [[ "$SECONDS_IDLE" =~ ^[0-9]+$ ]]; then
    continue
  fi

  echo "[auto-stop] Idle for ${SECONDS_IDLE}s / threshold ${IDLE_THRESHOLD}s"

  if [ "$SECONDS_IDLE" -ge "$IDLE_THRESHOLD" ]; then
    echo "[auto-stop] Threshold reached — stopping pod ${RUNPOD_POD_ID}..."
    curl -s -X POST "https://api.runpod.io/v2/pod/${RUNPOD_POD_ID}/stop" \
      -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
      -H "Content-Type: application/json"
    echo "[auto-stop] Stop signal sent. Exiting watchdog."
    exit 0
  fi
done
