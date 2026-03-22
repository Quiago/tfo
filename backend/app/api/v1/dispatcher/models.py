"""
dispatcher/models.py — DB models for the Event Dispatcher domain.

Three tables:
  - AlarmEvent        : an incoming event (alarm, sensor breach, manual trigger)
  - DispatchRule      : a configured automation rule (conditions → actions)
  - DispatchExecution : audit record of a rule being triggered by an event
"""
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid4())


class AlarmEvent(SQLModel, table=True):
    """
    An event ingested into the dispatcher.

    Severity levels (ordered): info < warning < critical < emergency
    Categories: power | cooling | network | security | env | general
    Status flow: pending → matched/no_match → executing → completed/failed
                 pending → suppressed (if matching suppression window)
    """

    __tablename__ = "alarm_events"

    id: str = Field(default_factory=_uuid, primary_key=True)
    source_connector_id: str | None = Field(default=None, index=True)
    severity: str = Field(default="warning")   # info|warning|critical|emergency
    category: str = Field(default="general")   # power|cooling|network|security|env|general
    asset_id: str | None = Field(default=None, index=True)
    title: str
    raw_payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    enriched: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = Field(default="pending")     # pending|matched|no_match|executing|completed|failed|suppressed
    platform_mode: str = Field(default="datacenter", index=True)
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)


class DispatchRule(SQLModel, table=True):
    """
    An automation rule: when conditions match an event → execute actions.

    conditions JSON shape:
        {
          "operator": "AND",          // AND | OR
          "items": [
            {"type": "severity_gte", "value": "warning"},
            {"type": "contains",     "field": "title", "value": "UPS"},
            {"type": "threshold",    "field": "value", "operator": "gte", "value": 80},
            {"type": "asset_tag",    "value": "ups"},
            {"type": "connector_id", "value": "ua-1"}
          ]
        }

    actions JSON shape (list):
        [
          {"type": "log_only",           "config": {}},
          {"type": "create_work_order",  "config": {"priority": "high", "facility": "Frankfurt DC Campus"}}
        ]

    priority: lower number = evaluated first when multiple rules match.
    suppression_window_secs: if > 0, identical events won't re-trigger this rule
                             within that many seconds after the last execution.
    """

    __tablename__ = "dispatch_rules"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    description: str = Field(default="")
    platform_mode: str = Field(default="datacenter", index=True)
    conditions: dict = Field(default_factory=dict, sa_column=Column(JSON))
    actions: list = Field(default_factory=list, sa_column=Column(JSON))
    enabled: bool = Field(default=True, index=True)
    priority: int = Field(default=100)                # lower = higher priority
    suppression_window_secs: int = Field(default=0)   # 0 = no suppression
    created_by: int | None = Field(default=None)      # User.id FK (soft)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DispatchExecution(SQLModel, table=True):
    """
    Audit record of a DispatchRule being triggered by an AlarmEvent.
    One execution is created per matched rule per event.
    """

    __tablename__ = "dispatch_executions"

    id: str = Field(default_factory=_uuid, primary_key=True)
    rule_id: str = Field(index=True)    # FK → DispatchRule.id (soft)
    event_id: str = Field(index=True)   # FK → AlarmEvent.id (soft)
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = Field(default=None)
    status: str = Field(default="pending")   # pending|running|completed|failed
    action_results: list = Field(default_factory=list, sa_column=Column(JSON))
    error_detail: str | None = Field(default=None)
