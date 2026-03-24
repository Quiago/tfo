"""
integrations/models.py — Persisted integration configurations.

An IntegrationConfig holds the connection settings for an external system
(Teams webhook, ServiceNow instance, SMTP relay) used by the Dispatcher to
execute actions.  Sensitive fields (passwords, tokens) are encrypted at rest
via Fernet — only the ciphertext is stored in DB.
"""
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class IntegrationType(StrEnum):
    teams       = "teams"
    servicenow  = "servicenow"
    email       = "email"


class IntegrationConfig(SQLModel, table=True):
    __tablename__ = "integration_configs"

    id:               str      = Field(primary_key=True)
    name:             str
    type:             IntegrationType
    # Encrypted JSON blob — decrypted only at action-execution time
    config_encrypted: dict     = Field(default_factory=dict, sa_column=Column(JSON))
    platform_mode:    str      = Field(default="datacenter")
    is_active:        bool     = Field(default=True)
    created_by:       int      = Field(default=0)
    created_at:       datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at:       datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_tested_at:   datetime | None = Field(default=None)
    last_test_status: str | None      = Field(default=None)  # "ok" | "failed" | None
