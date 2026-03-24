"""
integrations/schemas.py — Pydantic v2 request/response schemas.

Config fields (passwords, tokens) are accepted as plain dicts on creation
and never returned in responses — only the integration id and metadata are
exposed after write.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class IntegrationCreate(BaseModel):
    name:    str
    type:    str
    config:  dict[str, Any]   # plain-text; encrypted before storage
    is_active: bool = True


class IntegrationUpdate(BaseModel):
    name:      str | None = None
    config:    dict[str, Any] | None = None
    is_active: bool | None = None


class IntegrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:               str
    name:             str
    type:             str
    is_active:        bool
    platform_mode:    str
    created_at:       datetime
    updated_at:       datetime
    last_tested_at:   datetime | None
    last_test_status: str | None


class IntegrationListOut(BaseModel):
    items: list[IntegrationOut]
    total: int


class IntegrationTestResult(BaseModel):
    integration_id: str
    success:        bool
    message:        str
    tested_at:      datetime
