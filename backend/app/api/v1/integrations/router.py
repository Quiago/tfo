"""
integrations/router.py — HTTP layer for the Integrations domain.

Endpoints:
  GET    /integrations           — list all integrations
  POST   /integrations           — create integration
  GET    /integrations/{id}      — get single integration
  PATCH  /integrations/{id}      — update integration
  DELETE /integrations/{id}      — delete integration
  POST   /integrations/{id}/test — test connection
"""
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.v1.auth.dependencies import get_current_user
from app.api.v1.integrations import service
from app.api.v1.integrations.schemas import (
    IntegrationCreate,
    IntegrationListOut,
    IntegrationOut,
    IntegrationTestResult,
    IntegrationUpdate,
)
from app.db.engine import get_session
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("", response_model=IntegrationListOut)
def list_integrations(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> IntegrationListOut:
    items = service.get_all(session)
    return IntegrationListOut(
        items=[IntegrationOut.model_validate(i) for i in items],
        total=len(items),
    )


@router.post("", response_model=IntegrationOut, status_code=status.HTTP_201_CREATED)
def create_integration(
    body: IntegrationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> IntegrationOut:
    cfg = service.create(body, current_user.id, session)
    return IntegrationOut.model_validate(cfg)


@router.get("/{integration_id}", response_model=IntegrationOut)
def get_integration(
    integration_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> IntegrationOut:
    try:
        cfg = service.get(integration_id, session)
    except ValueError:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationOut.model_validate(cfg)


@router.patch("/{integration_id}", response_model=IntegrationOut)
def update_integration(
    integration_id: str,
    body: IntegrationUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> IntegrationOut:
    try:
        cfg = service.update(integration_id, body, session)
    except ValueError:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationOut.model_validate(cfg)


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_integration(
    integration_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> None:
    try:
        service.delete(integration_id, session)
    except ValueError:
        raise HTTPException(status_code=404, detail="Integration not found")


@router.post("/{integration_id}/test", response_model=IntegrationTestResult)
async def test_integration(
    integration_id: str,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> IntegrationTestResult:
    try:
        result = await service.test_connection(integration_id, session)
    except ValueError:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationTestResult(
        integration_id=integration_id,
        success=result["success"],
        message=result["message"],
        tested_at=datetime.now(UTC),
    )
