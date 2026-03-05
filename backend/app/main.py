from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.logging import setup_logging
from app.db.engine import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(api_router)


@app.get("/")
async def root():
    return {"message": "Tripolar Industries API"}

