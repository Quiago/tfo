"""
Unit tests for the OPC UA node → signal_id mapping logic.

These are pure unit tests — no DB, no network, no OPC UA server needed.
"""
import pytest

from app.api.v1.connectors.backends.base import NodeInfo
from app.api.v1.telemetry.service import _node_to_signal


def _node(display_name: str, path: list[str], data_type: str = "Double") -> NodeInfo:
    return NodeInfo(
        node_id=f"ns=2;i=0",
        display_name=display_name,
        path=path,
        data_type=data_type,
    )


# ── Sensor nodes ──────────────────────────────────────────────────────────────

class TestSensorMapping:
    def test_zone1_temperature(self):
        sig = _node_to_signal(_node("Zone1Temperature", ["Factory", "Sensors", "Zone1Temperature"]))
        assert sig == ("zone1_temperature", "Zone 1 Temperature", "°C")

    def test_ambient_temperature(self):
        sig = _node_to_signal(_node("AmbientTemperature", ["Factory", "Sensors", "AmbientTemperature"]))
        assert sig is not None
        assert sig[0] == "ambient_temperature"
        assert sig[2] == "°C"

    def test_vibration_x(self):
        sig = _node_to_signal(_node("Vibration_X", ["Factory", "Sensors", "Vibration_X"]))
        assert sig is not None
        assert sig[0] == "vibration_x"
        assert sig[2] == "mm/s"

    def test_humidity(self):
        sig = _node_to_signal(_node("Humidity", ["Factory", "Sensors", "Humidity"]))
        assert sig is not None
        assert sig[0] == "humidity"
        assert sig[2] == "%"

    def test_line_pressure(self):
        sig = _node_to_signal(_node("LinePressure", ["Factory", "Sensors", "LinePressure"]))
        assert sig is not None
        assert sig[0] == "line_pressure"
        assert sig[2] == "bar"


# ── Energy nodes ──────────────────────────────────────────────────────────────

class TestEnergyMapping:
    def test_total_power(self):
        sig = _node_to_signal(_node("TotalPower", ["Factory", "Energy", "TotalPower"]))
        assert sig is not None
        assert sig[0] == "total_power"
        assert sig[2] == "kW"

    def test_grid_frequency(self):
        sig = _node_to_signal(_node("GridFrequency", ["Factory", "Energy", "GridFrequency"]))
        assert sig is not None
        assert sig[0] == "grid_frequency"
        assert sig[2] == "Hz"

    def test_energy_today(self):
        sig = _node_to_signal(_node("EnergyTodayKWh", ["Factory", "Energy", "EnergyTodayKWh"]))
        assert sig is not None
        assert sig[0] == "energy_today"
        assert sig[2] == "kWh"


# ── Production KPI nodes ──────────────────────────────────────────────────────

class TestProductionMapping:
    def test_throughput(self):
        sig = _node_to_signal(_node("Throughput", ["Factory", "AssemblyLine", "Throughput"]))
        assert sig is not None
        assert sig[0] == "throughput"

    def test_defect_rate(self):
        sig = _node_to_signal(_node("DefectRate", ["Factory", "AssemblyLine", "DefectRate"]))
        assert sig is not None
        assert sig[0] == "defect_rate"
        assert sig[2] == "%"


# ── Robot nodes ───────────────────────────────────────────────────────────────

class TestRobotMapping:
    @pytest.mark.parametrize("robot_id", [1, 2, 3, 4])
    def test_robot_speed(self, robot_id: int):
        sig = _node_to_signal(_node(
            "Speed",
            ["Factory", "AssemblyLine", f"Robot{robot_id}", "Speed"],
        ))
        assert sig is not None
        assert sig[0] == f"robot{robot_id}_speed"
        assert sig[1] == f"Robot {robot_id} Speed"
        assert sig[2] == "%"

    @pytest.mark.parametrize("robot_id", [1, 2, 3, 4])
    def test_robot_joint_temp(self, robot_id: int):
        sig = _node_to_signal(_node(
            "JointTemperature",
            ["Factory", "AssemblyLine", f"Robot{robot_id}", "JointTemperature"],
        ))
        assert sig is not None
        assert sig[0] == f"robot{robot_id}_joint_temp"
        assert sig[2] == "°C"

    @pytest.mark.parametrize("robot_id", [1, 2, 3, 4])
    def test_robot_load(self, robot_id: int):
        sig = _node_to_signal(_node(
            "Load",
            ["Factory", "AssemblyLine", f"Robot{robot_id}", "Load"],
        ))
        assert sig is not None
        assert sig[0] == f"robot{robot_id}_load"
        assert sig[2] == "Nm"

    @pytest.mark.parametrize("robot_id", [1, 2, 3, 4])
    def test_robot_power_under_assembly(self, robot_id: int):
        sig = _node_to_signal(_node(
            "Power",
            ["Factory", "AssemblyLine", f"Robot{robot_id}", "Power"],
        ))
        assert sig is not None
        assert sig[0] == f"robot{robot_id}_power"


# ── Nodes that must be skipped ────────────────────────────────────────────────

class TestSkippedNodes:
    def test_skip_status_string(self):
        """Status is a String tag — not numeric, must be skipped."""
        sig = _node_to_signal(_node(
            "Status",
            ["Factory", "AssemblyLine", "Robot1", "Status"],
            data_type="String",
        ))
        assert sig is None

    def test_skip_energy_robot_power_duplicate(self):
        """
        Energy/Robot{N}Power are duplicates of AssemblyLine/Robot{N}/Power.
        display_name='Robot1Power' is not in _NODE_INFO and not in _ROBOT_FIELDS,
        so it's naturally skipped.
        """
        sig = _node_to_signal(_node(
            "Robot1Power",
            ["Factory", "Energy", "Robot1Power"],
        ))
        assert sig is None

    def test_skip_unknown_node(self):
        sig = _node_to_signal(_node(
            "SomeUnknownTag",
            ["Factory", "Unknown", "SomeUnknownTag"],
        ))
        assert sig is None
