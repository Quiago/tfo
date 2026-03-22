"""
dispatcher/schemas.py — Pydantic contracts for the Dispatcher API.

Kept separate from DB models so the API surface can evolve independently.
"""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ─── Shared enums / literals ─────────────────────────────────────────────────

AlarmSeverity = Literal["info", "warning", "critical", "emergency"]
AlarmCategory = Literal["power", "cooling", "network", "security", "env", "general"]
EventStatus   = Literal["pending", "matched", "no_match", "executing", "completed", "failed", "suppressed"]
RuleOperator  = Literal["AND", "OR"]
ConditionType = Literal["severity_gte", "contains", "threshold", "asset_tag", "connector_id"]
ThresholdOp   = Literal["gt", "gte", "lt", "lte", "eq"]
ActionType    = Literal["log_only", "create_work_order"]   # extended in Phases 1+
ExecutionStatus = Literal["pending", "running", "completed", "failed"]


# ─── Event ingestion ──────────────────────────────────────────────────────────

class EventIn(BaseModel):
    """Payload for POST /dispatcher/events — manual or webhook ingestion."""
    source_connector_id: str | None = None
    severity: AlarmSeverity = "warning"
    category: AlarmCategory = "general"
    asset_id: str | None = None
    title: str = Field(..., min_length=1, max_length=500)
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class EventOut(BaseModel):
    """Response shape for a single AlarmEvent."""
    id: str
    source_connector_id: str | None
    severity: str
    category: str
    asset_id: str | None
    title: str
    raw_payload: dict[str, Any]
    enriched: dict[str, Any]
    status: str
    platform_mode: str
    received_at: datetime

    model_config = {"from_attributes": True}


class EventListOut(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    page_size: int


# ─── Rule conditions ──────────────────────────────────────────────────────────

class ConditionItem(BaseModel):
    """
    A single condition within a rule.

    Examples:
      {"type": "severity_gte",  "value": "critical"}
      {"type": "contains",      "field": "title",  "value": "UPS"}
      {"type": "threshold",     "field": "value",  "operator": "gte", "value": 80}
      {"type": "asset_tag",     "value": "ups"}
      {"type": "connector_id",  "value": "ua-1"}
    """
    type: ConditionType
    field: str | None = None      # used by: threshold, contains
    operator: ThresholdOp | None = None  # used by: threshold
    value: Any                    # required for all condition types


class RuleConditions(BaseModel):
    """Top-level condition group with AND/OR composition."""
    operator: RuleOperator = "AND"
    items: list[ConditionItem] = Field(default_factory=list)


# ─── Rule actions ─────────────────────────────────────────────────────────────

class RuleAction(BaseModel):
    """
    A single action to execute when a rule matches.

    log_only         — writes to server log (always available, good for testing)
    create_work_order — creates a work order in OpsHub (config: priority, facility)
    """
    type: ActionType
    config: dict[str, Any] = Field(default_factory=dict)


# ─── Rule CRUD ────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    conditions: RuleConditions
    actions: list[RuleAction] = Field(default_factory=list)
    enabled: bool = True
    priority: int = Field(default=100, ge=1, le=1000)
    suppression_window_secs: int = Field(default=0, ge=0)


class RuleUpdate(BaseModel):
    """All fields optional — PATCH semantics."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    conditions: RuleConditions | None = None
    actions: list[RuleAction] | None = None
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=1, le=1000)
    suppression_window_secs: int | None = Field(default=None, ge=0)


class RuleOut(BaseModel):
    id: str
    name: str
    description: str
    platform_mode: str
    conditions: dict[str, Any]
    actions: list[dict[str, Any]]
    enabled: bool
    priority: int
    suppression_window_secs: int
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RuleListOut(BaseModel):
    items: list[RuleOut]
    total: int


# ─── Execution ────────────────────────────────────────────────────────────────

class ExecutionOut(BaseModel):
    id: str
    rule_id: str
    event_id: str
    started_at: datetime
    completed_at: datetime | None
    status: str
    action_results: list[dict[str, Any]]
    error_detail: str | None

    model_config = {"from_attributes": True}


class ExecutionListOut(BaseModel):
    items: list[ExecutionOut]
    total: int
    page: int
    page_size: int
