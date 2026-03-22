"""
dispatcher/rule_engine.py — Pure condition-evaluation functions.

All functions are stateless and have no side effects, making them trivial
to unit-test without a database or running server.

Condition types supported:
  severity_gte  — event severity is at or above a threshold
  contains      — a text field contains a substring (case-insensitive)
  threshold     — a numeric field in raw_payload satisfies a comparison
  asset_tag     — raw_payload["tags"] contains a specific tag
  connector_id  — event.source_connector_id matches a value

Composition: items within a rule are joined with AND or OR.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.api.v1.dispatcher.models import AlarmEvent, DispatchRule

logger = logging.getLogger(__name__)

# Ordered severity scale — index = weight (higher = more severe)
_SEVERITY_SCALE: list[str] = ["info", "warning", "critical", "emergency"]


def _severity_index(s: str) -> int:
    try:
        return _SEVERITY_SCALE.index(s.lower())
    except ValueError:
        return 0


def _evaluate_condition(condition: dict, event: "AlarmEvent") -> bool:
    """
    Evaluate a single condition dict against an AlarmEvent.
    Returns True if the condition is satisfied, False otherwise.
    Unknown condition types return False and emit a warning.
    """
    ctype = condition.get("type", "")

    if ctype == "severity_gte":
        return _severity_index(event.severity) >= _severity_index(str(condition.get("value", "")))

    if ctype == "connector_id":
        return event.source_connector_id == condition.get("value")

    if ctype == "asset_tag":
        tags: list = event.raw_payload.get("tags", [])
        return condition.get("value") in tags

    if ctype == "contains":
        field: str = condition.get("field") or "title"
        # Check model attribute first, fall back to raw_payload
        text: str = str(getattr(event, field, None) or event.raw_payload.get(field, ""))
        needle: str = str(condition.get("value", ""))
        return needle.lower() in text.lower()

    if ctype == "threshold":
        field = condition.get("field") or "value"
        raw_val = event.raw_payload.get(field)
        if raw_val is None:
            return False
        try:
            event_num = float(raw_val)
            threshold_num = float(condition.get("value", 0))
        except (TypeError, ValueError):
            return False
        op = condition.get("operator", "gte")
        _OPS = {
            "gt":  lambda a, b: a > b,
            "gte": lambda a, b: a >= b,
            "lt":  lambda a, b: a < b,
            "lte": lambda a, b: a <= b,
            "eq":  lambda a, b: a == b,
        }
        fn = _OPS.get(op)
        return fn(event_num, threshold_num) if fn else False

    logger.warning("rule_engine — unknown condition type: %s", ctype)
    return False


def evaluate_conditions(conditions: dict, event: "AlarmEvent") -> bool:
    """
    Evaluate all conditions in a rule's conditions dict against an event.

    conditions = {"operator": "AND"|"OR", "items": [...]}

    - Empty items list → match-all (returns True)
    - AND → all items must be True
    - OR  → at least one item must be True
    """
    operator: str = conditions.get("operator", "AND").upper()
    items: list[dict] = conditions.get("items", [])

    if not items:
        return True  # match-all rule

    results = [_evaluate_condition(item, event) for item in items]

    return all(results) if operator == "AND" else any(results)


def match_rules(rules: list["DispatchRule"], event: "AlarmEvent") -> list["DispatchRule"]:
    """
    Return all enabled rules whose conditions match the event,
    sorted by priority ascending (lower number = evaluated/executed first).
    """
    matched: list["DispatchRule"] = []
    for rule in rules:
        if not rule.enabled:
            continue
        if evaluate_conditions(rule.conditions, event):
            matched.append(rule)
    return sorted(matched, key=lambda r: r.priority)
