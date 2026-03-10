from sqlmodel import SQLModel, Session, create_engine

from app.core.config import settings

import app.api.v1.assets.models  # noqa: F401 — registers models
import app.api.v1.chat.models  # noqa: F401
import app.api.v1.connectors.models  # noqa: F401
import app.api.v1.knowledge_base.models  # noqa: F401
import app.api.v1.telemetry.models  # noqa: F401
import app.models.user  # noqa: F401

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
