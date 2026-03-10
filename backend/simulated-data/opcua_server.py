"""
simulated-data/opcua_server.py — Professional OPC UA server for the Tripolar simulation.

Address space (namespace index = 2, URI = urn:tripolar:factory:sim):

  Objects/
  └── Factory
      ├── Sensors
      │   ├── AmbientTemperature  (Double, °C)
      │   ├── Zone1Temperature    (Double, °C)
      │   ├── Zone2Temperature    (Double, °C)
      │   ├── Vibration_X         (Double, mm/s)
      │   ├── Vibration_Y         (Double, mm/s)
      │   ├── Vibration_Z         (Double, mm/s)
      │   ├── Humidity            (Double, %)
      │   └── LinePressure        (Double, bar)
      ├── AssemblyLine
      │   ├── PartsAssembled      (Int64,  count)
      │   ├── CycleTime           (Double, s)
      │   ├── Throughput          (Double, parts/h)
      │   ├── DefectRate          (Double, %)
      │   ├── YieldRate           (Double, %)
      │   └── Robot{1..4}/
      │       ├── Speed           (Double, %)
      │       ├── JointTemperature(Double, °C)
      │       ├── Load            (Double, Nm)
      │       ├── Status          (String)
      │       └── Power           (Double, kW)
      └── Energy
          ├── TotalPower          (Double, kW)
          ├── AuxPower            (Double, kW)
          ├── PowerFactor         (Double)
          ├── GridFrequency       (Double, Hz)
          ├── EnergyTodayKWh      (Double, kWh)
          └── Robot{1..4}Power    (Double, kW)
"""
from __future__ import annotations

import asyncio
import logging

from asyncua import Server, ua

from simulator import Simulator

logger = logging.getLogger(__name__)

_NS_URI = "urn:tripolar:factory:sim"
_UPDATE_HZ = 1.0  # update interval in seconds


async def _add_var(parent, ns: int, name: str, value, description: str = "") -> object:
    """Helper: create a variable node. Type is inferred from Python value."""
    node = await parent.add_variable(ns, name, value)
    if description:
        try:
            await node.write_attribute(
                ua.AttributeIds.Description,
                ua.DataValue(ua.Variant(ua.LocalizedText(description), ua.VariantType.LocalizedText)),
            )
        except Exception:
            pass  # non-fatal
    return node


async def build_address_space(
    server: Server, ns: int, sim: Simulator
) -> dict[str, object]:
    """
    Populates the OPC UA address space.
    Returns a flat {key: node} dict used by the update loop.
    """
    objects = server.get_objects_node()
    p = sim.now()
    nodes: dict[str, object] = {}

    # ── Factory root object ───────────────────────────────────────────────────
    factory = await objects.add_object(ns, "Factory")

    # ── Sensors ───────────────────────────────────────────────────────────────
    sensors = await factory.add_object(ns, "Sensors")
    nodes["ambient_temperature"] = await _add_var(sensors, ns, "AmbientTemperature", p.ambient_temperature(), "Ambient hall temperature (°C)")
    nodes["zone1_temperature"]   = await _add_var(sensors, ns, "Zone1Temperature",   p.zone1_temperature(),   "Welding zone 1 temperature (°C)")
    nodes["zone2_temperature"]   = await _add_var(sensors, ns, "Zone2Temperature",   p.zone2_temperature(),   "Welding zone 2 temperature (°C)")
    nodes["vibration_x"]         = await _add_var(sensors, ns, "Vibration_X",        p.vibration_x(),         "Structure vibration X-axis (mm/s RMS)")
    nodes["vibration_y"]         = await _add_var(sensors, ns, "Vibration_Y",        p.vibration_y(),         "Structure vibration Y-axis (mm/s RMS)")
    nodes["vibration_z"]         = await _add_var(sensors, ns, "Vibration_Z",        p.vibration_z(),         "Structure vibration Z-axis (mm/s RMS)")
    nodes["humidity"]            = await _add_var(sensors, ns, "Humidity",            p.humidity(),            "Relative humidity (%)")
    nodes["line_pressure"]       = await _add_var(sensors, ns, "LinePressure",        p.line_pressure(),       "Pneumatic supply pressure (bar)")

    # ── Assembly line ─────────────────────────────────────────────────────────
    assembly = await factory.add_object(ns, "AssemblyLine")
    nodes["parts_assembled"] = await _add_var(assembly, ns, "PartsAssembled", p.parts_assembled(), "Total parts assembled since server start")
    nodes["cycle_time"]      = await _add_var(assembly, ns, "CycleTime",      p.cycle_time(),      "Current assembly cycle time (s)")
    nodes["throughput"]      = await _add_var(assembly, ns, "Throughput",      p.throughput(),      "Current throughput (parts/hour)")
    nodes["defect_rate"]     = await _add_var(assembly, ns, "DefectRate",      p.defect_rate(),     "Defect rate (%)")
    nodes["yield_rate"]      = await _add_var(assembly, ns, "YieldRate",       p.yield_rate(),      "Yield rate (%)")

    for i in range(1, 5):
        robot = await assembly.add_object(ns, f"Robot{i}")
        nodes[f"robot{i}_speed"]      = await _add_var(robot, ns, "Speed",            p.robot_speed(i),      f"KUKA KR210 Robot {i} override speed (%)")
        nodes[f"robot{i}_joint_temp"] = await _add_var(robot, ns, "JointTemperature", p.robot_joint_temp(i), f"KUKA KR210 Robot {i} joint temperature (°C)")
        nodes[f"robot{i}_load"]       = await _add_var(robot, ns, "Load",             p.robot_load(i),       f"KUKA KR210 Robot {i} torque load (Nm)")
        nodes[f"robot{i}_status"]     = await _add_var(robot, ns, "Status",           p.robot_status(i),     f"KUKA KR210 Robot {i} operational status")
        nodes[f"robot{i}_power"]      = await _add_var(robot, ns, "Power",            p.robot_power(i),      f"KUKA KR210 Robot {i} power consumption (kW)")

    # ── Energy ────────────────────────────────────────────────────────────────
    energy = await factory.add_object(ns, "Energy")
    nodes["total_power"]    = await _add_var(energy, ns, "TotalPower",     p.total_power(),      "Total facility power (kW)")
    nodes["aux_power"]      = await _add_var(energy, ns, "AuxPower",       p.aux_power(),        "Auxiliary equipment power (kW)")
    nodes["power_factor"]   = await _add_var(energy, ns, "PowerFactor",    p.power_factor(),     "Power factor (dimensionless)")
    nodes["grid_frequency"] = await _add_var(energy, ns, "GridFrequency",  p.grid_frequency(),   "Grid frequency (Hz)")
    nodes["energy_today"]   = await _add_var(energy, ns, "EnergyTodayKWh", p.energy_today_kwh(), "Energy consumed today (kWh)")

    for i in range(1, 5):
        nodes[f"robot{i}_power_e"] = await _add_var(
            energy, ns, f"Robot{i}Power", p.robot_power(i),
            f"KUKA KR210 Robot {i} power (kW)"
        )

    logger.info("[OPC UA] Address space built — %d variable nodes", len(nodes))
    return nodes


async def _update_loop(nodes: dict[str, object], sim: Simulator) -> None:
    """Writes current simulation values to every OPC UA node once per second."""
    while True:
        p = sim.now()

        updates: dict[str, object] = {
            "ambient_temperature": p.ambient_temperature(),
            "zone1_temperature":   p.zone1_temperature(),
            "zone2_temperature":   p.zone2_temperature(),
            "vibration_x":         p.vibration_x(),
            "vibration_y":         p.vibration_y(),
            "vibration_z":         p.vibration_z(),
            "humidity":            p.humidity(),
            "line_pressure":       p.line_pressure(),
            "parts_assembled":     p.parts_assembled(),
            "cycle_time":          p.cycle_time(),
            "throughput":          p.throughput(),
            "defect_rate":         p.defect_rate(),
            "yield_rate":          p.yield_rate(),
            "total_power":         p.total_power(),
            "aux_power":           p.aux_power(),
            "power_factor":        p.power_factor(),
            "grid_frequency":      p.grid_frequency(),
            "energy_today":        p.energy_today_kwh(),
        }

        for i in range(1, 5):
            updates[f"robot{i}_speed"]      = p.robot_speed(i)
            updates[f"robot{i}_joint_temp"] = p.robot_joint_temp(i)
            updates[f"robot{i}_load"]       = p.robot_load(i)
            updates[f"robot{i}_status"]     = p.robot_status(i)
            updates[f"robot{i}_power"]      = p.robot_power(i)
            updates[f"robot{i}_power_e"]    = p.robot_power(i)

        for key, value in updates.items():
            node = nodes.get(key)
            if node is not None:
                try:
                    await node.write_value(value)
                except Exception as exc:
                    logger.debug("[OPC UA] write_value '%s': %s", key, exc)

        await asyncio.sleep(_UPDATE_HZ)


async def run_opcua_server(
    sim: Simulator,
    endpoint: str = "opc.tcp://0.0.0.0:4840/tripolar/",
) -> None:
    server = Server()
    await server.init()
    server.set_endpoint(endpoint)
    server.set_server_name("Tripolar — KUKA Assembly Factory (Simulated)")

    ns = await server.register_namespace(_NS_URI)
    nodes = await build_address_space(server, ns, sim)

    async with server:
        logger.info("[OPC UA] Listening at  %s  (ns=%d  uri=%s)", endpoint, ns, _NS_URI)
        await _update_loop(nodes, sim)
