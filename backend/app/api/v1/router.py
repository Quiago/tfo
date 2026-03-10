from fastapi import APIRouter

from app.api.v1.assets.router import router as assets_router
from app.api.v1.auth.router import router as auth_router
from app.api.v1.chat.router import router as chat_router
from app.api.v1.connectors.router import router as connectors_router
from app.api.v1.knowledge_base.router import router as knowledge_base_router
from app.api.v1.llms.router import router as llms_router
from app.api.v1.telemetry.router import router as telemetry_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(llms_router, prefix="/llms", tags=["llms"])
api_router.include_router(connectors_router, prefix="/connectors", tags=["connectors"])
api_router.include_router(assets_router, prefix="/assets", tags=["assets"])
api_router.include_router(knowledge_base_router, prefix="/knowledge-base", tags=["knowledge-base"])
api_router.include_router(telemetry_router, prefix="/telemetry", tags=["telemetry"])

