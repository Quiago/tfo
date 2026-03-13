import asyncio
import contextlib
import multiprocessing
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime

# ── vLLM multiprocessing fix ───────────────────────────────────────────────────
# vLLM V1 (≥0.6) spawns EngineCore as a subprocess. On Linux the default
# multiprocessing start method is 'fork', which fails when CUDA is already
# initialized in the parent process ("Cannot re-initialize CUDA in forked
# subprocess"). Setting spawn here and via env var ensures vLLM uses a fresh
# process that can initialize CUDA from scratch.
# Both must be set BEFORE any torch/vLLM import happens downstream.
os.environ["VLLM_WORKER_MULTIPROC_METHOD"] = "spawn"
if multiprocessing.get_start_method(allow_none=True) != "spawn":
    multiprocessing.set_start_method("spawn", force=True)
# ──────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlmodel import Session, Session as SQLModelSession

from app.api.v1.router import api_router
from app.api.v1.llms import service as llm_service
from app.api.v1.assets.service import auto_import_assets
from app.api.v1.telemetry.service import TelemetryPoller, backfill_missing_history
from app.core.logging import setup_logging
from app.db.engine import create_db_and_tables, engine as db_engine
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    create_db_and_tables()

    _sf = lambda: SQLModelSession(db_engine)

    # Start telemetry poller immediately — don't wait for backfill
    poller = TelemetryPoller(session_factory=_sf)
    poller.start()

    # Run backfill in a background thread so it never blocks startup or requests.
    # backfill_missing_history() is a long-running sync function (~794k inserts
    # on first boot); running it via asyncio.to_thread keeps the event loop free.
    asyncio.create_task(
        asyncio.to_thread(backfill_missing_history, _sf),
        name="telemetry-backfill",
    )

    async def _startup():
        # 1. Download + load priority model into RAM.
        await llm_service.startup()
        # 2. If asset table is empty, auto-discover + import from active connectors.
        with Session(db_engine) as session:
            await auto_import_assets(session)

    startup_task = asyncio.create_task(_startup())

    yield

    # On shutdown: stop poller, cancel startup if still in progress, then wait cleanly.
    poller.stop()
    startup_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await startup_task


# ── Activity tracker ──────────────────────────────────────────────────────────
# Timestamp of the most recent non-probe request. Used by RunPod auto-stop
# scripts to decide when the pod has been idle long enough to shut down.
# Module-level so the middleware closure and the metrics endpoint share state
# without needing a dependency or a singleton class.
_last_request_at: datetime | None = None

# Paths that should not reset the idle timer (health probes + this metric itself)
_PROBE_PATHS = frozenset({"/health", "/metrics/last-request-seconds-ago"})


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=settings.ALLOW_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.middleware("http")
async def _track_last_request(request: Request, call_next):
    global _last_request_at
    if request.url.path not in _PROBE_PATHS:
        _last_request_at = datetime.now(UTC)
    return await call_next(request)


@app.get("/")
async def root():
    return {"message": "Tripolar Industries API"}


@app.get("/metrics/last-request-seconds-ago", response_class=PlainTextResponse)
async def last_request_seconds_ago() -> PlainTextResponse:
    """Idle-time probe — no auth required.

    Returns a plain-text integer: seconds elapsed since the last non-probe
    request. Returns "0" when no real request has been recorded yet (i.e.
    the server just started). Used by RunPod auto-stop scripts to decide
    when the pod has been idle long enough to terminate.
    """
    if _last_request_at is None:
        return PlainTextResponse("0")
    elapsed = int((datetime.now(UTC) - _last_request_at).total_seconds())
    return PlainTextResponse(str(elapsed))


@app.get("/health")
async def health() -> JSONResponse:
    """Liveness probe — no auth required.

    Returns 200 as soon as the FastAPI process is up and accepting requests.
    The frontend polls this endpoint after waking the RunPod pod to know
    when the server is ready to accept API calls.
    """
    return JSONResponse({"status": "ok", "timestamp": datetime.now(UTC).isoformat()})

