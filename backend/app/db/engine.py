from sqlalchemy import text
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
    # Manual migrations for columns added after initial table creation.
    # SQLModel's create_all() never ALTERs existing tables.
    with engine.connect() as conn:
        user_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)"))]
        if "preferred_connector_id" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN preferred_connector_id TEXT"))
            conn.commit()

        if "platform_mode" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN platform_mode TEXT NOT NULL DEFAULT 'factory'"))
            conn.commit()

        connector_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(connector)"))]
        if "node_mappings" not in connector_cols:
            conn.execute(text("ALTER TABLE connector ADD COLUMN node_mappings JSON"))
            conn.commit()
        if "energy_mappings" not in connector_cols:
            conn.execute(text("ALTER TABLE connector ADD COLUMN energy_mappings JSON"))
            conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
