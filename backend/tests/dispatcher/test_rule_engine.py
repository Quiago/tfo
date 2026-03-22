"""
Unit tests for dispatcher/rule_engine.py.

All pure functions — no DB, no network, no startup overhead.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.api.v1.dispatcher.rule_engine import (
    _evaluate_condition,
    evaluate_conditions,
    match_rules,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _event(
    severity: str = "warning",
    category: str = "power",
    title: str = "UPS battery low",
    source_connector_id: str | None = "ups-connector",
    raw_payload: dict | None = None,
) -> MagicMock:
    ev = MagicMock()
    ev.severity = severity
    ev.category = category
    ev.title = title
    ev.source_connector_id = source_connector_id
    ev.raw_payload = raw_payload or {}
    return ev


def _rule(
    enabled: bool = True,
    priority: int = 100,
    conditions: dict | None = None,
) -> MagicMock:
    r = MagicMock()
    r.enabled = enabled
    r.priority = priority
    r.conditions = conditions or {"operator": "AND", "items": []}
    return r


# ── _evaluate_condition ───────────────────────────────────────────────────────

class TestEvaluateCondition:
    def test_severity_gte_matches_equal(self):
        ev = _event(severity="critical")
        assert _evaluate_condition({"type": "severity_gte", "value": "critical"}, ev) is True

    def test_severity_gte_matches_higher(self):
        ev = _event(severity="emergency")
        assert _evaluate_condition({"type": "severity_gte", "value": "warning"}, ev) is True

    def test_severity_gte_fails_lower(self):
        ev = _event(severity="info")
        assert _evaluate_condition({"type": "severity_gte", "value": "critical"}, ev) is False

    def test_connector_id_match(self):
        ev = _event(source_connector_id="abc-123")
        assert _evaluate_condition({"type": "connector_id", "value": "abc-123"}, ev) is True

    def test_connector_id_no_match(self):
        ev = _event(source_connector_id="abc-123")
        assert _evaluate_condition({"type": "connector_id", "value": "other"}, ev) is False

    def test_asset_tag_found(self):
        ev = _event(raw_payload={"tags": ["ups", "battery"]})
        assert _evaluate_condition({"type": "asset_tag", "value": "battery"}, ev) is True

    def test_asset_tag_not_found(self):
        ev = _event(raw_payload={"tags": ["ups"]})
        assert _evaluate_condition({"type": "asset_tag", "value": "crac"}, ev) is False

    def test_contains_title_match(self):
        ev = _event(title="CRAC unit failure — Room B")
        assert _evaluate_condition({"type": "contains", "field": "title", "value": "crac"}, ev) is True

    def test_contains_case_insensitive(self):
        ev = _event(title="PDU-A overload")
        assert _evaluate_condition({"type": "contains", "field": "title", "value": "PDU"}, ev) is True

    def test_contains_no_match(self):
        ev = _event(title="Normal status")
        assert _evaluate_condition({"type": "contains", "field": "title", "value": "failure"}, ev) is False

    def test_threshold_gte_passes(self):
        ev = _event(raw_payload={"temp_c": 37.1})
        assert _evaluate_condition({"type": "threshold", "field": "temp_c", "operator": "gte", "value": 35}, ev) is True

    def test_threshold_lt_passes(self):
        ev = _event(raw_payload={"soh": 76})
        assert _evaluate_condition({"type": "threshold", "field": "soh", "operator": "lt", "value": 80}, ev) is True

    def test_threshold_eq_passes(self):
        ev = _event(raw_payload={"count": 5})
        assert _evaluate_condition({"type": "threshold", "field": "count", "operator": "eq", "value": 5}, ev) is True

    def test_threshold_missing_field_returns_false(self):
        ev = _event(raw_payload={})
        assert _evaluate_condition({"type": "threshold", "field": "temp_c", "operator": "gte", "value": 35}, ev) is False

    def test_unknown_type_returns_false(self):
        ev = _event()
        assert _evaluate_condition({"type": "unknown_type"}, ev) is False


# ── evaluate_conditions ───────────────────────────────────────────────────────

class TestEvaluateConditions:
    def test_empty_items_is_match_all(self):
        ev = _event()
        assert evaluate_conditions({"operator": "AND", "items": []}, ev) is True

    def test_and_all_true(self):
        ev = _event(severity="critical", source_connector_id="c1")
        conditions = {
            "operator": "AND",
            "items": [
                {"type": "severity_gte", "value": "warning"},
                {"type": "connector_id", "value": "c1"},
            ],
        }
        assert evaluate_conditions(conditions, ev) is True

    def test_and_one_false(self):
        ev = _event(severity="info", source_connector_id="c1")
        conditions = {
            "operator": "AND",
            "items": [
                {"type": "severity_gte", "value": "critical"},
                {"type": "connector_id", "value": "c1"},
            ],
        }
        assert evaluate_conditions(conditions, ev) is False

    def test_or_one_true(self):
        ev = _event(severity="info", source_connector_id="other")
        conditions = {
            "operator": "OR",
            "items": [
                {"type": "severity_gte", "value": "critical"},
                {"type": "connector_id", "value": "other"},
            ],
        }
        assert evaluate_conditions(conditions, ev) is True

    def test_or_all_false(self):
        ev = _event(severity="info", source_connector_id="abc")
        conditions = {
            "operator": "OR",
            "items": [
                {"type": "severity_gte", "value": "critical"},
                {"type": "connector_id", "value": "xyz"},
            ],
        }
        assert evaluate_conditions(conditions, ev) is False


# ── match_rules ───────────────────────────────────────────────────────────────

class TestMatchRules:
    def test_disabled_rule_is_skipped(self):
        ev = _event()
        r = _rule(enabled=False, conditions={"operator": "AND", "items": []})
        assert match_rules([r], ev) == []

    def test_matching_rule_returned(self):
        ev = _event()
        r = _rule(enabled=True, conditions={"operator": "AND", "items": []})
        assert match_rules([r], ev) == [r]

    def test_non_matching_rule_excluded(self):
        ev = _event(severity="info")
        r = _rule(conditions={
            "operator": "AND",
            "items": [{"type": "severity_gte", "value": "critical"}],
        })
        assert match_rules([r], ev) == []

    def test_rules_sorted_by_priority(self):
        ev = _event()
        r1 = _rule(priority=200, conditions={"operator": "AND", "items": []})
        r2 = _rule(priority=50, conditions={"operator": "AND", "items": []})
        r3 = _rule(priority=100, conditions={"operator": "AND", "items": []})
        result = match_rules([r1, r2, r3], ev)
        assert [r.priority for r in result] == [50, 100, 200]

    def test_empty_rules_list(self):
        ev = _event()
        assert match_rules([], ev) == []
