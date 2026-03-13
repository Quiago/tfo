"""
Integration tests for the telemetry REST endpoints.

Uses a TestClient wired to an in-memory SQLite DB — no OPC UA, no vLLM.
"""
from datetime import UTC, datetime, timedelta

from app.api.v1.telemetry.models import TelemetryReading


# ── Helpers ───────────────────────────────────────────────────────────────────

def _insert(session, signal_id: str, value: float, seconds_ago: float = 1.0):
    session.add(TelemetryReading(
        connector_id="test-connector",
        signal_id=signal_id,
        display_name=signal_id.replace("_", " ").title(),
        value=value,
        unit="°C",
        recorded_at=datetime.now(UTC) - timedelta(seconds=seconds_ago),
    ))
    session.commit()


# ── /telemetry/readings/latest ────────────────────────────────────────────────

class TestLatestEndpoint:
    def test_empty_response(self, client):
        r = client.get("/telemetry/readings/latest")
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_latest_value(self, client, session):
        _insert(session, "zone1_temperature", 65.0, seconds_ago=10)
        _insert(session, "zone1_temperature", 67.0, seconds_ago=1)
        r = client.get("/telemetry/readings/latest")
        assert r.status_code == 200
        results = r.json()
        temp = next((x for x in results if x["signal_id"] == "zone1_temperature"), None)
        assert temp is not None
        assert temp["value"] == 67.0

    def test_filter_by_signal_ids(self, client, session):
        _insert(session, "humidity", 55.0)
        _insert(session, "total_power", 45.0)
        r = client.get("/telemetry/readings/latest?signal_ids=humidity")
        assert r.status_code == 200
        data = r.json()
        assert all(x["signal_id"] == "humidity" for x in data)

    def test_response_schema(self, client, session):
        _insert(session, "vibration_x", 2.5)
        r = client.get("/telemetry/readings/latest")
        assert r.status_code == 200
        for item in r.json():
            assert "signal_id" in item
            assert "display_name" in item
            assert "value" in item
            assert "unit" in item
            assert "recorded_at" in item


# ── /telemetry/readings/history ───────────────────────────────────────────────

class TestHistoryEndpoint:
    def test_requires_signal_ids(self, client):
        r = client.get("/telemetry/readings/history")
        assert r.status_code == 422   # validation error

    def test_returns_series(self, client, session):
        _insert(session, "line_pressure", 6.5, seconds_ago=30)
        _insert(session, "line_pressure", 6.7, seconds_ago=10)
        r = client.get("/telemetry/readings/history?signal_ids=line_pressure&minutes=2")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["signal_id"] == "line_pressure"
        assert len(data[0]["series"]) == 2
        for pt in data[0]["series"]:
            assert "ts" in pt
            assert "value" in pt

    def test_excludes_old_data(self, client, session):
        session.add(TelemetryReading(
            connector_id="tc",
            signal_id="old_sig",
            display_name="Old",
            value=1.0,
            unit="",
            recorded_at=datetime.now(UTC) - timedelta(hours=2),
        ))
        session.commit()
        r = client.get("/telemetry/readings/history?signal_ids=old_sig&minutes=1")
        assert r.status_code == 200
        assert r.json() == []


# ── /telemetry/readings/stats ─────────────────────────────────────────────────

class TestStatsEndpoint:
    def test_correct_stats(self, client, session):
        for v, secs in [(10.0, 50), (20.0, 40), (30.0, 30), (40.0, 20), (50.0, 10)]:
            _insert(session, "total_power_stat", v, seconds_ago=secs)
        r = client.get("/telemetry/readings/stats?signal_ids=total_power_stat&minutes=2")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        s = data[0]
        assert s["min"] == 10.0
        assert s["max"] == 50.0
        assert abs(s["avg"] - 30.0) < 0.01
        assert s["count"] == 5
        assert s["last"] == 50.0

    def test_requires_signal_ids(self, client):
        r = client.get("/telemetry/readings/stats")
        assert r.status_code == 422


# ── /telemetry/timeline ───────────────────────────────────────────────────────

class TestTimelineEndpoint:
    def _seed_timeline(self, session):
        now = datetime.now(UTC)
        for i in range(4):
            ts = now - timedelta(seconds=(3 - i) * 5)
            for sig, val in [
                ("zone1_temperature", 60.0 + i * 2),
                ("vibration_x",       1.0 + i),
                ("line_pressure",     6.0 + i * 0.2),
                ("humidity",          50.0 + i),
            ]:
                session.add(TelemetryReading(
                    connector_id="tc",
                    signal_id=sig,
                    display_name=sig,
                    value=val,
                    unit="",
                    recorded_at=ts,
                ))
        session.commit()

    def test_returns_normalized_points(self, client, session):
        self._seed_timeline(session)
        r = client.get("/telemetry/timeline?minutes=2")
        assert r.status_code == 200
        points = r.json()
        assert len(points) > 0
        for p in points:
            assert "timestamp" in p
            assert "temperature" in p
            assert "vibration" in p
            assert "pressure" in p
            assert "humidity" in p
            assert 0.0 <= p["temperature"] <= 100.0
            assert 0.0 <= p["vibration"] <= 100.0

    def test_empty_when_no_data(self, client):
        r = client.get("/telemetry/timeline?minutes=1")
        assert r.status_code == 200
        assert r.json() == []

    def test_minutes_validation(self, client):
        r = client.get("/telemetry/timeline?minutes=0")
        assert r.status_code == 422
        # Upper bound is 525_600 (1 year); 61 minutes is now a valid request
        r = client.get("/telemetry/timeline?minutes=61")
        assert r.status_code == 200
        # Exceeding the 1-year cap is still rejected
        r = client.get("/telemetry/timeline?minutes=525601")
        assert r.status_code == 422


# ── /telemetry/node-map ───────────────────────────────────────────────────────

class TestNodeMapEndpoint:
    def test_empty_before_discovery(self, client):
        r = client.get("/telemetry/node-map?connector_id=unknown-connector")
        assert r.status_code == 200
        assert r.json() == {}

    def test_populated_after_publish(self, client):
        from app.api.v1.telemetry import service as svc
        svc._published_node_maps["test-conn"] = {
            "ns=2;i=10": ("zone1_temperature", "Zone 1 Temperature", "°C"),
            "ns=2;i=11": ("vibration_x",       "Vibration X",        "mm/s"),
        }
        r = client.get("/telemetry/node-map?connector_id=test-conn")
        assert r.status_code == 200
        data = r.json()
        assert "ns=2;i=10" in data
        assert data["ns=2;i=10"]["signal_id"] == "zone1_temperature"
        assert data["ns=2;i=10"]["unit"] == "°C"
        # Cleanup
        del svc._published_node_maps["test-conn"]


# ── /telemetry/timeline/signals ───────────────────────────────────────────────

class TestTimelineSignalsEndpoint:
    def _seed(self, session, signal_id: str, values: list[tuple[float, float]]):
        """Seed (seconds_ago, value) pairs."""
        from datetime import UTC, datetime, timedelta
        from app.api.v1.telemetry.models import TelemetryReading
        for secs_ago, val in values:
            session.add(TelemetryReading(
                connector_id="tc",
                signal_id=signal_id,
                display_name=signal_id,
                value=val,
                unit="kW",
                recorded_at=datetime.now(UTC) - timedelta(seconds=secs_ago),
            ))
        session.commit()

    def test_returns_signal_keyed_points(self, client, session):
        self._seed(session, "total_power", [(60, 100.0), (30, 150.0), (5, 200.0)])
        self._seed(session, "aux_power",   [(60,  20.0), (30,  25.0), (5,  30.0)])
        r = client.get("/telemetry/timeline/signals?signal_ids=total_power,aux_power&minutes=2")
        assert r.status_code == 200
        points = r.json()
        assert len(points) > 0
        for p in points:
            assert "timestamp" in p
            # At least one signal should be present
            assert "total_power" in p or "aux_power" in p

    def test_empty_when_no_data(self, client):
        r = client.get("/telemetry/timeline/signals?signal_ids=nonexistent&minutes=1")
        assert r.status_code == 200
        assert r.json() == []

    def test_missing_signal_ids_returns_422(self, client):
        r = client.get("/telemetry/timeline/signals?minutes=10")
        assert r.status_code == 422
