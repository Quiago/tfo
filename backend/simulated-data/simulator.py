"""
simulated-data/simulator.py — Deterministic industrial process simulation.

All values are pure functions of elapsed time using overlapping sine waves
(multi-harmonic superposition), so:
  • Real-time values are smooth and continuous.
  • Historical data generated for any past timestamp is consistent with
    current readings — no seam between "history" and "now".

Factory model: KUKA 4-robot car assembly line.
  - 4 KUKA KR 210 R2700 robots
  - Welding + joining + inspection stages
  - Production rate ≈ 120 parts/hour nominal
"""
from __future__ import annotations

import math
import time


class SimPoint:
    """Evaluates all process variables at a specific elapsed-time value."""

    def __init__(self, elapsed: float) -> None:
        self._e = elapsed  # seconds since server epoch

    # ── private wave helpers ──────────────────────────────────────────────────

    def _w(self, period: float, amp: float, center: float, phase: float = 0.0) -> float:
        return center + amp * math.sin(2 * math.pi * self._e / period + phase)

    def _multi(self, period: float, amp: float, center: float, phase: float = 0.0) -> float:
        """
        Multi-harmonic wave: fundamental + 3 overtones.
        Produces realistic variation without true randomness.
        """
        base = self._w(period, amp, center, phase)
        h1 = 0.07 * amp * math.sin(2 * math.pi * self._e / 7.31 + phase * 2.3)
        h2 = 0.04 * amp * math.sin(2 * math.pi * self._e / 13.7 + phase * 5.1)
        h3 = 0.02 * amp * math.sin(2 * math.pi * self._e / 3.17 + phase * 0.7)
        return base + h1 + h2 + h3

    # ── Environment sensors ───────────────────────────────────────────────────

    def ambient_temperature(self) -> float:
        """Hall ambient temperature 19–26 °C, 1-hour thermal cycle."""
        return round(self._multi(3600, 3.5, 22.5), 2)

    def zone1_temperature(self) -> float:
        """Welding zone 1: 58–72 °C, 10-min process cycle."""
        return round(self._multi(600, 7.0, 65.0), 2)

    def zone2_temperature(self) -> float:
        """Welding zone 2: 54–68 °C, phase-shifted from zone 1."""
        return round(self._multi(600, 7.0, 61.0, phase=1.2), 2)

    def vibration_x(self) -> float:
        """Structure vibration X-axis 0.5–4.5 mm/s RMS."""
        return round(abs(self._multi(30, 2.0, 2.5)), 3)

    def vibration_y(self) -> float:
        """Structure vibration Y-axis 0.3–3.8 mm/s RMS."""
        return round(abs(self._multi(45, 1.8, 2.0, phase=0.7)), 3)

    def vibration_z(self) -> float:
        """Structure vibration Z-axis 0.2–2.4 mm/s RMS."""
        return round(abs(self._multi(20, 1.1, 1.3, phase=1.5)), 3)

    def humidity(self) -> float:
        """Relative humidity 40–65%, 2-hour HVAC cycle."""
        return round(max(30.0, min(80.0, self._multi(7200, 12.0, 52.0))), 2)

    def line_pressure(self) -> float:
        """Pneumatic supply pressure 5.8–7.2 bar, 2-min compressor cycle."""
        return round(max(4.0, min(8.5, self._multi(120, 0.7, 6.5))), 3)

    # ── KUKA robots ───────────────────────────────────────────────────────────

    def robot_speed(self, robot_id: int) -> float:
        """Override speed 35–98%, each robot phase-shifted by 90°."""
        phase = (robot_id - 1) * (math.pi / 2)
        val = self._multi(300, 20.0, 75.0, phase=phase)
        return round(max(30.0, min(100.0, val)), 1)

    def robot_joint_temp(self, robot_id: int) -> float:
        """Joint temperature 42–72 °C, correlated with speed."""
        speed = self.robot_speed(robot_id)
        center = 38.0 + speed * 0.34
        phase = (robot_id - 1) * 0.9
        return round(max(35.0, self._multi(300, 5.5, center, phase=phase)), 2)

    def robot_load(self, robot_id: int) -> float:
        """Current torque load 60–180 Nm."""
        phase = (robot_id - 1) * 1.1
        return round(abs(self._multi(60, 55.0, 120.0, phase=phase)), 1)

    def robot_status(self, robot_id: int) -> str:
        """Operational status based on speed setpoint."""
        speed = self.robot_speed(robot_id)
        if speed < 35.0:
            return "Idle"
        if speed > 92.0:
            return "HighLoad"
        return "Running"

    def robot_power(self, robot_id: int) -> float:
        """Individual power consumption 2.5–15 kW."""
        speed = self.robot_speed(robot_id)
        base = 2.5 + speed * 0.13
        ripple = 1.1 * math.sin(2 * math.pi * self._e / 90 + (robot_id - 1) * 0.6)
        return round(max(1.0, base + ripple), 2)

    # ── Production KPIs ───────────────────────────────────────────────────────

    def parts_assembled(self) -> int:
        """Monotonically increasing parts counter, ~120 parts/hour."""
        return int(self._e / 30)

    def cycle_time(self) -> float:
        """Assembly cycle time 22–36 s."""
        return round(max(18.0, self._multi(60, 7.0, 29.0)), 2)

    def throughput(self) -> float:
        """Parts per hour derived from cycle time."""
        return round(3600.0 / max(self.cycle_time(), 1.0), 1)

    def defect_rate(self) -> float:
        """Defect rate 0.2–2.4%, driven by slow drift."""
        return round(max(0.05, abs(self._multi(1800, 1.1, 1.2, phase=0.5))), 3)

    def yield_rate(self) -> float:
        return round(100.0 - self.defect_rate(), 3)

    # ── Energy ────────────────────────────────────────────────────────────────

    def aux_power(self) -> float:
        """Aux equipment (HVAC, lighting, conveyors) 6–13 kW."""
        return round(max(4.0, self._multi(300, 3.5, 9.5)), 2)

    def total_power(self) -> float:
        return round(sum(self.robot_power(i) for i in range(1, 5)) + self.aux_power(), 2)

    def power_factor(self) -> float:
        return round(max(0.78, min(0.99, self._multi(600, 0.05, 0.91, phase=2.1))), 4)

    def grid_frequency(self) -> float:
        return round(self._multi(120, 0.025, 50.0), 4)

    def energy_today_kwh(self) -> float:
        hours_today = (self._e % 86400) / 3600.0
        return round(self.total_power() * hours_today * 0.97, 1)

    # ── Full snapshot ─────────────────────────────────────────────────────────

    def snapshot(self) -> dict:
        return {
            "sensors": {
                "ambient_temperature": self.ambient_temperature(),
                "zone1_temperature": self.zone1_temperature(),
                "zone2_temperature": self.zone2_temperature(),
                "vibration_x": self.vibration_x(),
                "vibration_y": self.vibration_y(),
                "vibration_z": self.vibration_z(),
                "humidity": self.humidity(),
                "line_pressure": self.line_pressure(),
            },
            "production": {
                "parts_assembled": self.parts_assembled(),
                "cycle_time": self.cycle_time(),
                "throughput": self.throughput(),
                "defect_rate": self.defect_rate(),
                "yield_rate": self.yield_rate(),
                "robots": {
                    str(i): {
                        "speed": self.robot_speed(i),
                        "joint_temperature": self.robot_joint_temp(i),
                        "load": self.robot_load(i),
                        "status": self.robot_status(i),
                        "power_kw": self.robot_power(i),
                    }
                    for i in range(1, 5)
                },
            },
            "energy": {
                "total_power_kw": self.total_power(),
                "aux_power_kw": self.aux_power(),
                "power_factor": self.power_factor(),
                "grid_frequency_hz": self.grid_frequency(),
                "energy_today_kwh": self.energy_today_kwh(),
                "robots_kw": {str(i): self.robot_power(i) for i in range(1, 5)},
            },
        }


class Simulator:
    """
    Factory for SimPoint instances.

    Usage:
        sim = Simulator()
        p = sim.now()          # current values
        p = sim.at(timestamp)  # historical values at a specific epoch second
    """

    def __init__(self) -> None:
        self._epoch = time.time()

    def _elapsed(self, ts: float | None = None) -> float:
        return (ts if ts is not None else time.time()) - self._epoch

    def now(self) -> SimPoint:
        return SimPoint(self._elapsed())

    def at(self, timestamp: float) -> SimPoint:
        return SimPoint(self._elapsed(timestamp))
