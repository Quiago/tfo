"""
chat/tools.py — Registry de herramientas disponibles al LLM.

Patrón dispatcher: cada herramienta es una función async que recibe kwargs
validados y devuelve un string (el resultado que ve el LLM).
"""
import json
import logging
from typing import Any

from sqlmodel import Session

from app.api.v1.assets import service as asset_service

logger = logging.getLogger(__name__)


async def _list_assets(session: Session, **_) -> str:
    assets = asset_service.list_assets(session)
    if not assets:
        return "No assets registered in the system."
    return json.dumps(
        [{"id": a.id, "name": a.name, "type": a.asset_type, "location": a.location, "active": a.is_active} for a in assets],
        ensure_ascii=False,
    )


async def _read_asset_property(asset_id: str, property_name: str, session: Session, **_) -> str:
    try:
        reading = await asset_service.read_property(asset_id, property_name, session)
        return json.dumps(
            {"asset_id": reading.asset_id, "property": reading.property_name, "value": reading.value, "unit": reading.unit, "connector_id": reading.connector_id},
            ensure_ascii=False,
        )
    except Exception as exc:
        logger.warning("tool_read_property_error", extra={"asset_id": asset_id, "error": str(exc)}, exc_info=True)
        return f"Error reading {property_name} from {asset_id}: {exc}"


async def _read_all_asset_properties(asset_id: str, session: Session, **_) -> str:
    try:
        result = await asset_service.read_all_properties(asset_id, session)
        readings = [
            {"property": r.property_name, "value": r.value, "unit": r.unit, "error": r.error}
            for r in result.readings
        ]
        return json.dumps(
            {"asset_id": result.asset_id, "total": result.total, "success": result.success, "readings": readings},
            ensure_ascii=False,
        )
    except Exception as exc:
        logger.warning("tool_read_all_error", extra={"asset_id": asset_id, "error": str(exc)}, exc_info=True)
        return f"Error reading properties of {asset_id}: {exc}"


async def _search_knowledge_base(query: str, session: Session, **_) -> str:
    """
    Busca en la knowledge base corporativa documentos relevantes para la query.
    Devuelve los fragmentos más similares semánticamente (cosine similarity).
    """
    try:
        from app.api.v1.knowledge_base import service as kb_service
        results = kb_service.search(query=query, top_k=3, session=session)
        if not results:
            return "No relevant documents found in the knowledge base for this query."
        return json.dumps(
            [{"title": r.title, "content": r.content, "score": round(r.score, 3)} for r in results],
            ensure_ascii=False,
        )
    except Exception as exc:
        logger.warning("tool_search_kb_error", extra={"query": query, "error": str(exc)}, exc_info=True)
        return f"Error searching knowledge base: {exc}"


async def _get_latest_readings(session: Session, signal_ids: str | None = None, **_) -> str:
    """
    Returns the latest stored value for each tracked sensor signal.
    signal_ids: optional comma-separated list of signal IDs to filter.
    """
    try:
        from app.api.v1.telemetry import service as telemetry_service
        ids = [s.strip() for s in signal_ids.split(",")] if signal_ids else None
        readings = telemetry_service.get_latest_readings(session, ids)
        if not readings:
            return "No telemetry readings available. The simulator may not be running yet."
        return json.dumps(
            [
                {
                    "signal_id": r.signal_id,
                    "display_name": r.display_name,
                    "value": r.value,
                    "unit": r.unit,
                    "recorded_at": r.recorded_at.isoformat(),
                }
                for r in readings
            ],
            ensure_ascii=False,
        )
    except Exception as exc:
        logger.warning("tool_get_latest_readings_error", extra={"error": str(exc)}, exc_info=True)
        return f"Error retrieving latest readings: {exc}"


async def _query_time_range(
    session: Session,
    signal_ids: str = "",
    minutes: int = 60,
    **_,
) -> str:
    """
    Returns historical readings for specified signals over the last N minutes.
    signal_ids: comma-separated signal IDs (e.g. 'zone1_temperature,total_power').
    minutes: time window (1–1440).
    """
    try:
        from app.api.v1.telemetry import service as telemetry_service
        ids = [s.strip() for s in signal_ids.split(",") if s.strip()]
        if not ids:
            return "Provide at least one signal_id. Use get_latest_readings() first to see available signals."
        minutes = max(1, min(1440, int(minutes)))
        readings = telemetry_service.query_time_range(session, ids, minutes)
        if not readings:
            return f"No readings found for {ids} in the last {minutes} minutes."
        # Group by signal for compact output
        from collections import defaultdict
        groups: dict[str, list[dict]] = defaultdict(list)
        for r in readings:
            groups[r.signal_id].append({
                "ts": r.recorded_at.isoformat(),
                "value": r.value,
                "unit": r.unit,
            })
        return json.dumps(
            {"window_minutes": minutes, "signals": dict(groups)},
            ensure_ascii=False,
        )
    except Exception as exc:
        logger.warning("tool_query_time_range_error", extra={"error": str(exc)}, exc_info=True)
        return f"Error querying time range: {exc}"


async def _get_sensor_statistics(
    session: Session,
    signal_ids: str = "",
    minutes: int = 60,
    **_,
) -> str:
    """
    Returns min/max/avg/count statistics for specified signals over a time window.
    signal_ids: comma-separated signal IDs.
    minutes: time window (1–1440).
    """
    try:
        from app.api.v1.telemetry import service as telemetry_service
        ids = [s.strip() for s in signal_ids.split(",") if s.strip()]
        if not ids:
            return "Provide at least one signal_id."
        minutes = max(1, min(1440, int(minutes)))
        stats = telemetry_service.get_statistics(session, ids, minutes)
        if not stats:
            return f"No statistics found for {ids} in the last {minutes} minutes."
        return json.dumps({"window_minutes": minutes, "stats": stats}, ensure_ascii=False)
    except Exception as exc:
        logger.warning("tool_get_sensor_statistics_error", extra={"error": str(exc)}, exc_info=True)
        return f"Error retrieving sensor statistics: {exc}"


async def _write_asset_property(asset_id: str, property_name: str, value: Any, session: Session, **_) -> str:
    try:
        await asset_service.write_property(asset_id, property_name, value, session)
        return f"Successfully wrote {value} to {property_name} of {asset_id}."
    except Exception as exc:
        logger.warning("tool_write_property_error", extra={"asset_id": asset_id, "property": property_name, "error": str(exc)}, exc_info=True)
        return f"Error writing to {property_name}: {exc}"


_TOOL_REGISTRY: dict[str, Any] = {
    "list_assets": _list_assets,
    "read_asset_property": _read_asset_property,
    "read_all_asset_properties": _read_all_asset_properties,
    "write_asset_property": _write_asset_property,
    "search_knowledge_base": _search_knowledge_base,
    "get_latest_readings": _get_latest_readings,
    "query_time_range": _query_time_range,
    "get_sensor_statistics": _get_sensor_statistics,
}


async def execute_tool(name: str, arguments: dict, session: Session) -> str:
    """
    Dispatcher: ejecuta una herramienta por nombre.
    """
    fn = _TOOL_REGISTRY.get(name)
    if not fn:
        available = ", ".join(_TOOL_REGISTRY.keys())
        return f"Unknown tool '{name}'. Available tools: {available}"
    return await fn(session=session, **arguments)


TOOL_SCHEMAS: list[dict] = [
    {
        "name": "list_assets",
        "description": "List all industrial assets (machines, sensors, devices) registered in the system. Use this to discover what equipment is available before querying specific readings.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "read_asset_property",
        "description": "Read the current real-time value of a specific property from an asset. Use this when you need the current reading of one sensor (e.g. temperature, pressure, RPM).",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {"type": "string", "description": "The ID of the asset (e.g. 'opcua-1-pump1')"},
                "property_name": {"type": "string", "description": "The property/sensor name (e.g. 'temperature', 'pressure', 'rpm')"},
            },
            "required": ["asset_id", "property_name"],
        },
    },
    {
        "name": "read_all_asset_properties",
        "description": "Read ALL current sensor readings from an asset at once. More efficient than calling read_asset_property multiple times.",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {"type": "string", "description": "The ID of the asset"},
            },
            "required": ["asset_id"],
        },
    },
    {
        "name": "search_knowledge_base",
        "description": "Search the corporate knowledge base for relevant documents, manuals, SOPs, or datasheets. Use this when the user asks about procedures, specifications, troubleshooting guides, or any company documentation. Returns the most relevant text fragments.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query in natural language (e.g. 'pump startup procedure', 'safety protocol for tank overflow')"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_latest_readings",
        "description": (
            "Get the latest stored sensor value for each tracked signal from the factory simulator. "
            "Use this for questions like 'what is the current temperature?', 'show me current power consumption', "
            "'what are the robots doing right now?'. Returns real values from the database."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "signal_ids": {
                    "type": "string",
                    "description": (
                        "Optional comma-separated signal IDs to filter (e.g. 'zone1_temperature,total_power'). "
                        "Omit to get all available signals."
                    ),
                },
            },
            "required": [],
        },
    },
    {
        "name": "query_time_range",
        "description": (
            "Query historical sensor readings for specific signals over a time window. "
            "Use this for trend analysis: 'how has the temperature changed in the last hour?', "
            "'show power consumption over the last 30 minutes', 'is the vibration increasing?'"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "signal_ids": {
                    "type": "string",
                    "description": "Comma-separated signal IDs (e.g. 'zone1_temperature,vibration_x')",
                },
                "minutes": {
                    "type": "integer",
                    "description": "Time window in minutes (1–1440). Default: 60.",
                },
            },
            "required": ["signal_ids"],
        },
    },
    {
        "name": "get_sensor_statistics",
        "description": (
            "Get aggregated statistics (min, max, average, count, last value) for sensor signals over a time window. "
            "Use this for questions like 'what was the peak temperature today?', "
            "'average power consumption last hour', 'min/max vibration in the last 24h'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "signal_ids": {
                    "type": "string",
                    "description": "Comma-separated signal IDs (e.g. 'zone1_temperature,total_power')",
                },
                "minutes": {
                    "type": "integer",
                    "description": "Time window in minutes (1–1440). Default: 60.",
                },
            },
            "required": ["signal_ids"],
        },
    },
    {
        "name": "write_asset_property",
        "description": "Write a value to a writable property of an asset (actuator control). Only works on properties marked as writable. Always confirm with the user before writing.",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {"type": "string", "description": "The ID of the asset"},
                "property_name": {"type": "string", "description": "The writable property name"},
                "description": {"type": "string"},
                "value": {"type": "string", "description": "The value to write (number, boolean, or string)"},
            },
            "required": ["asset_id", "property_name", "value"],
        },
    },
]
