"""
Tests for the telemetry query helpers (get_latest_readings, query_time_range,
get_statistics, get_timeline_history).

Uses an in-memory SQLite DB seeded with known readings — no OPC UA or network.
"""
from datetime import UTC, datetime, timedelta

import pytest

from app.api.v1.telemetry.models import TelemetryReading
from app.api.v1.telemetry import service


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(session, signal_id: str, values: list[float], minutes_ago_start: float = 5.0):
    """Seed `len(values)` readings spaced 5s apart, ending ~now."""
    now = datetime.now(UTC)
    step = 5.0  # seconds
    start = now - timedelta(minutes=minutes_ago_start)
    for i, v in enumerate(values):
        session.add(TelemetryReading(
            connector_id="test-connector",
            signal_id=signal_id,
            display_name=signal_id.replace("_", " ").title(),
            value=v,
            unit="°C",
            recorded_at=start + timedelta(seconds=i * step),
        ))
    session.commit()


# ── get_latest_readings ───────────────────────────────────────────────────────

class TestGetLatestReadings:
    def test_returns_latest_per_signal(self, session):
        _seed(session, "temp_a", [10.0, 20.0, 30.0])
        _seed(session, "temp_b", [1.0, 2.0])
        results = service.get_latest_readings(session)
        by_sig = {r.signal_id: r for r in results}
        assert by_sig["temp_a"].value == 30.0
        assert by_sig["temp_b"].value == 2.0

    def test_filter_by_signal_ids(self, session):
        _seed(session, "sig_x", [100.0])
        _seed(session, "sig_y", [200.0])
        results = service.get_latest_readings(session, signal_ids=["sig_x"])
        assert len([r for r in results if r.signal_id == "sig_x"]) == 1
        assert all(r.signal_id != "sig_y" for r in results)

    def test_empty_when_no_data(self, session):
        results = service.get_latest_readings(session, signal_ids=["nonexistent"])
        assert results == []


# ── query_time_range ──────────────────────────────────────────────────────────

class TestQueryTimeRange:
    def test_returns_readings_in_window(self, session):
        _seed(session, "pressure", [1.0, 2.0, 3.0], minutes_ago_start=2.0)
        results = service.query_time_range(session, ["pressure"], minutes=5)
        assert len(results) == 3
        assert [r.value for r in results] == [1.0, 2.0, 3.0]

    def test_excludes_old_readings(self, session):
        now = datetime.now(UTC)
        # Insert an old reading (2 hours ago)
        session.add(TelemetryReading(
            connector_id="test-connector",
            signal_id="old_sig",
            display_name="Old Sig",
            value=999.0,
            unit="",
            recorded_at=now - timedelta(hours=2),
        ))
        session.commit()
        results = service.query_time_range(session, ["old_sig"], minutes=10)
        assert results == []

    def test_results_ordered_by_time(self, session):
        _seed(session, "ordered_sig", [5.0, 10.0, 15.0], minutes_ago_start=1.0)
        results = service.query_time_range(session, ["ordered_sig"], minutes=5)
        timestamps = [r.recorded_at for r in results]
        assert timestamps == sorted(timestamps)


# ── get_statistics ────────────────────────────────────────────────────────────

class TestGetStatistics:
    def test_correct_aggregates(self, session):
        _seed(session, "power_stat", [10.0, 20.0, 30.0, 40.0], minutes_ago_start=3.0)
        stats = service.get_statistics(session, ["power_stat"], minutes=10)
        assert len(stats) == 1
        s = stats[0]
        assert s["signal_id"] == "power_stat"
        assert s["count"] == 4
        assert s["min"] == 10.0
        assert s["max"] == 40.0
        assert abs(s["avg"] - 25.0) < 0.01   # (10+20+30+40)/4 = 25
        assert s["last"] == 40.0

    def test_multiple_signals(self, session):
        _seed(session, "sig_multi_a", [1.0, 2.0, 3.0])
        _seed(session, "sig_multi_b", [10.0, 11.0])
        stats = service.get_statistics(session, ["sig_multi_a", "sig_multi_b"], minutes=10)
        sig_ids = {s["signal_id"] for s in stats}
        assert "sig_multi_a" in sig_ids
        assert "sig_multi_b" in sig_ids

    def test_empty_for_unknown_signal(self, session):
        stats = service.get_statistics(session, ["totally_unknown"], minutes=60)
        assert stats == []


# ── get_timeline_history ──────────────────────────────────────────────────────

class TestGetTimelineHistory:
    def _seed_four_channels(self, session):
        """Seed the 4 timeline channels with linearly increasing values."""
        now = datetime.now(UTC)
        for i in range(6):   # 6 poll cycles (5s apart)
            ts = now - timedelta(seconds=(5 - i) * 5)   # oldest first
            for signal_id, value in [
                ("zone1_temperature", 60.0 + i),   # 60–65
                ("vibration_x",       1.0 + i * 0.5),  # 1.0–3.5
                ("line_pressure",     6.0 + i * 0.1),  # 6.0–6.5
                ("humidity",          50.0 + i),   # 50–55
            ]:
                session.add(TelemetryReading(
                    connector_id="test-connector",
                    signal_id=signal_id,
                    display_name=signal_id,
                    value=value,
                    unit="",
                    recorded_at=ts,
                ))
        session.commit()

    def test_returns_normalized_points(self, session):
        self._seed_four_channels(session)
        points = service.get_timeline_history(session, minutes=5)
        assert len(points) > 0
        for p in points:
            assert "timestamp" in p
            assert "temperature" in p
            assert "vibration" in p
            assert "pressure" in p
            assert "humidity" in p
            # All normalized values must be in 0–100
            for field in ("temperature", "vibration", "pressure", "humidity"):
                assert 0.0 <= p[field] <= 100.0, f"{field}={p[field]} out of range"

    def test_boundary_values_are_0_and_100(self, session):
        """The min-value bucket → 0, the max-value bucket → 100 (for any channel with spread)."""
        self._seed_four_channels(session)
        points = service.get_timeline_history(session, minutes=5)
        temps = [p["temperature"] for p in points]
        assert min(temps) == 0.0
        assert max(temps) == 100.0

    def test_empty_when_no_data(self, session):
        points = service.get_timeline_history(session, minutes=1)
        assert points == []
