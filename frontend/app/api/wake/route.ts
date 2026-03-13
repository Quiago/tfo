/**
 * POST /api/wake
 *
 * Server-side route handler that:
 *   1. Starts the RunPod pod via the RunPod REST API (if RUNPOD_POD_ID is set).
 *   2. Polls the backend /health endpoint every POLL_INTERVAL_MS until it
 *      responds 200 or the timeout is exceeded.
 *   3. Returns { ready: true } on success or { ready: false, error } on failure.
 *
 * All secrets (RUNPOD_POD_ID, RUNPOD_API_KEY) are server-side only — never
 * exposed to the browser. NEXT_PUBLIC_API_URL is used for the health check.
 */

import { NextResponse } from 'next/server';

// ── Config constants ──────────────────────────────────────────────────────────

const BACKEND_URL     = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const RUNPOD_POD_ID   = process.env.RUNPOD_POD_ID ?? '';
const RUNPOD_API_KEY  = process.env.RUNPOD_API_KEY ?? '';

const POLL_INTERVAL_MS   = 3_000;
const HEALTH_TIMEOUT_MS  = 4_000;   // per-attempt fetch timeout
const MAX_ATTEMPTS       = 40;       // 40 × 3 s = 2 min total

// ── Helpers ───────────────────────────────────────────────────────────────────

async function startRunpodPod(): Promise<void> {
  if (!RUNPOD_POD_ID || !RUNPOD_API_KEY) return; // skip if not configured

  try {
    await fetch(`https://api.runpod.io/v2/pod/${RUNPOD_POD_ID}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
  } catch {
    // Non-fatal — pod may already be starting; health poll will determine readiness
  }
}

async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  // In dev mode skip RunPod entirely — local backend is assumed always up
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    return NextResponse.json({ ready: true });
  }

  // Step 1: Signal RunPod to start the pod (fire-and-forget, errors are safe to ignore)
  await startRunpodPod();

  // Step 2: Poll /health until ready or timeout
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const healthy = await checkHealth();
    if (healthy) {
      return NextResponse.json({ ready: true });
    }
    // Don't sleep after the last attempt
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // Step 4: Timeout exceeded
  return NextResponse.json(
    { ready: false, error: 'timeout' },
    { status: 503 },
  );
}
