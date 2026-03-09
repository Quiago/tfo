import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.api.v1.router import api_router
from app.api.v1.llms import service as llm_service
from app.api.v1.assets.service import auto_import_assets
from app.core.logging import setup_logging
from app.db.engine import create_db_and_tables, engine as db_engine
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    create_db_and_tables()

    async def _startup():
        # 1. Download + load priority model into RAM.
        await llm_service.startup()
        # 2. If asset table is empty, auto-discover + import from active connectors.
        with Session(db_engine) as session:
            await auto_import_assets(session)

    startup_task = asyncio.create_task(_startup())

    yield

    # On shutdown: cancel startup if still in progress, then wait cleanly.
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

