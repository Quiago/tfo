import asyncio
import contextlib
import multiprocessing
import os
from contextlib import asynccontextmanager

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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

    # Backfill any gap since last shutdown before the live poller starts
    _sf = lambda: SQLModelSession(db_engine)
    backfill_missing_history(session_factory=_sf)

    # Start telemetry poller (polls OPC UA connector every 5s, stores in DB)
    poller = TelemetryPoller(session_factory=_sf)
    poller.start()

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


@app.get("/")
async def root():
    return {"message": "Tripolar Industries API"}

