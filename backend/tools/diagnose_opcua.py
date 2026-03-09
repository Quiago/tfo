"""
Diagnóstico de stream OPC-UA — 60 segundos de datos reales.

Uso:
    cd /home/quiala/Datos/TRIPOLAR/tfo/backend
    source .venv/bin/activate
    python tools/diagnose_opcua.py [connector_id]

Genera: tools/opcua_stream_<connector_id>.json
"""
import asyncio
import json
import sys
import time
from pathlib import Path
from collections import defaultdict

ENDPOINT = "opc.tcp://opcuaserver.com:48010"
CONNECTOR_ID = sys.argv[1] if len(sys.argv) > 1 else "ua-1"
POLL_INTERVAL = 2.0     # seconds between polls
DURATION = 60           # seconds total
OUT_FILE = Path(__file__).parent / f"opcua_stream_{CONNECTOR_ID}.json"

# OPC-UA numeric types worth showing in time-series charts
NUMERIC_VARIANT_TYPES = {
    "Float", "Double",
    "Int16", "Int32", "Int64",
    "UInt16", "UInt32", "UInt64",
    "Byte", "SByte",
}

# Types we skip for charts (booleans change rarely, strings/bytes are not plottable)
SKIP_FOR_CHARTS = {"Boolean", "String", "ByteString", "Guid", "DateTime", "NodeId", "Unknown"}


async def discover_all_nodes(endpoint: str) -> list[dict]:
    """Full discovery — returns all Variable nodes with data_type."""
    from asyncua import Client, ua
    from asyncua.ua import AttributeIds, NodeClass

    nodes = []

    async def browse(node, path, depth=0):
        if depth > 8 or len(nodes) >= 500:
            return
        try:
            children = await node.get_children()
        except Exception:
            return
        for child in children:
            if len(nodes) >= 500:
                return
            try:
                nid = child.nodeid
                if nid.NamespaceIndex == 0:
                    continue
                attrs = await child.read_attributes([AttributeIds.DisplayName, AttributeIds.NodeClass])
                raw_name = attrs[0].Value.Value if attrs[0].Value else None
                name = (raw_name.Text if hasattr(raw_name, "Text") else str(raw_name)) if raw_name else str(nid)
                nc = attrs[1].Value.Value if attrs[1].Value else None
                cur_path = path + [name]

                if nc == NodeClass.Variable:
                    try:
                        dv = await child.read_data_value()
                        vt = dv.Value.VariantType.name if dv.Value else "Unknown"
                        raw_val = dv.Value.Value if dv.Value else None
                    except Exception:
                        vt = "Unknown"
                        raw_val = None

                    nodes.append({
                        "node_id": child.nodeid.to_string(),
                        "display_name": name,
                        "path": "/".join(cur_path),
                        "data_type": vt,
                        "initial_value": str(raw_val) if raw_val is not None else None,
                        "is_numeric": vt in NUMERIC_VARIANT_TYPES,
                        "chart_candidate": vt in NUMERIC_VARIANT_TYPES,
                    })
                elif nc == NodeClass.Object:
                    await browse(child, cur_path, depth + 1)
            except Exception:
                continue

    async with Client(url=endpoint) as client:
        await browse(client.nodes.objects, [])
    return nodes


async def batch_read(endpoint: str, node_ids: list[str]) -> dict[str, dict]:
    """Read multiple nodes in ONE OPC-UA session — no repeated handshakes."""
    from asyncua import Client
    results = {}
    async with Client(url=endpoint) as client:
        for nid in node_ids:
            try:
                node = client.get_node(nid)
                dv = await node.read_data_value()
                val = dv.Value.Value if dv.Value else None
                # Convert to JSON-safe
                if isinstance(val, bool):
                    safe_val = val
                elif isinstance(val, (int, float)):
                    safe_val = val
                elif isinstance(val, bytes):
                    safe_val = val.hex()
                else:
                    safe_val = str(val) if val is not None else None
                results[nid] = {
                    "value": safe_val,
                    "status": str(dv.StatusCode),
                    "ts": dv.SourceTimestamp.isoformat() if dv.SourceTimestamp else None,
                }
            except Exception as e:
                results[nid] = {"error": str(e)}
    return results


async def main():
    print(f"\n{'='*60}")
    print(f"  OPC-UA DIAGNOSTICS — {CONNECTOR_ID}")
    print(f"  Endpoint: {ENDPOINT}")
    print(f"  Duration: {DURATION}s @ {POLL_INTERVAL}s interval")
    print(f"{'='*60}\n")

    # ── Step 1: Full Discovery ──────────────────────────────────────────
    print("⏳ Discovering nodes...")
    t0 = time.time()
    nodes = await discover_all_nodes(ENDPOINT)
    print(f"✓ Found {len(nodes)} variable nodes in {time.time()-t0:.1f}s\n")

    # Categorize
    numeric_nodes = [n for n in nodes if n["is_numeric"]]
    bool_nodes = [n for n in nodes if n["data_type"] == "Boolean"]
    other_nodes = [n for n in nodes if not n["is_numeric"] and n["data_type"] != "Boolean"]

    print(f"  Numeric (chart candidates): {len(numeric_nodes)}")
    print(f"  Boolean (status flags):     {len(bool_nodes)}")
    print(f"  Other (string/bytes/etc):   {len(other_nodes)}")
    print()

    print("── NUMERIC NODES (top 20) ──────────────────────────────")
    for n in numeric_nodes[:20]:
        print(f"  [{n['data_type']:8}] {n['display_name']:30} = {n['initial_value']:>12}  | {n['node_id']}")

    print("\n── BOOLEAN NODES (top 10) ──────────────────────────────")
    for n in bool_nodes[:10]:
        print(f"  [Boolean ] {n['display_name']:30} = {n['initial_value']:>12}  | {n['node_id']}")

    if not numeric_nodes:
        print("\n⚠ NO NUMERIC NODES FOUND — nothing suitable for time-series charts")
        return

    # ── Step 2: Poll numeric nodes for DURATION seconds ─────────────────
    # Take top 8 numeric nodes for the stream
    watch_nodes = numeric_nodes[:8]
    watch_ids = [n["node_id"] for n in watch_nodes]
    watch_names = {n["node_id"]: n["display_name"] for n in watch_nodes}

    print(f"\n── STREAMING {len(watch_nodes)} NUMERIC NODES FOR {DURATION}s ────────────────")
    for n in watch_nodes:
        print(f"  → {n['display_name']:30} [{n['data_type']}] {n['node_id']}")
    print()

    stream_records = []
    value_history = defaultdict(list)
    poll_count = 0
    start_ts = time.time()
    deadline = start_ts + DURATION

    while time.time() < deadline:
        t_poll = time.time()
        reads = await batch_read(ENDPOINT, watch_ids)
        elapsed = time.time() - start_ts
        poll_count += 1

        record = {"t": round(elapsed, 2), "poll": poll_count, "values": {}}
        row_parts = [f"t={elapsed:5.1f}s"]

        for nid in watch_ids:
            r = reads.get(nid, {})
            name = watch_names[nid]
            val = r.get("value")
            err = r.get("error")
            record["values"][nid] = {"name": name, "value": val, "error": err}
            if val is not None and not err:
                value_history[nid].append(val)
                row_parts.append(f"{name[:16]}={val}")

        stream_records.append(record)
        print("  " + "  ".join(row_parts))

        # Wait for next poll (accounting for time spent reading)
        sleep_s = max(0, POLL_INTERVAL - (time.time() - t_poll))
        await asyncio.sleep(sleep_s)

    # ── Step 3: Variance analysis ────────────────────────────────────────
    print(f"\n── VALUE CHANGE ANALYSIS ────────────────────────────────")
    node_stats = []
    for n in watch_nodes:
        nid = n["node_id"]
        hist = value_history.get(nid, [])
        if not hist:
            print(f"  ⚠ {n['display_name']:30} — NO DATA")
            continue
        numeric_hist = []
        for v in hist:
            try:
                numeric_hist.append(float(v))
            except (TypeError, ValueError):
                pass
        if numeric_hist:
            mn, mx = min(numeric_hist), max(numeric_hist)
            spread = mx - mn
            unique = len(set(round(v, 4) for v in numeric_hist))
            recommended = spread > 0 or unique > 1
            print(f"  {'✓' if recommended else '—'} {n['display_name']:30} [{n['data_type']:8}] "
                  f"min={mn:>10.3f}  max={mx:>10.3f}  spread={spread:>8.3f}  unique={unique:>3}  "
                  f"{'← USE IN CHART' if recommended else '← STATIC (skip)'}")
            node_stats.append({
                **n,
                "min": mn, "max": mx, "spread": spread,
                "unique_values": unique,
                "recommended_for_chart": recommended,
                "sample_count": len(numeric_hist),
            })

    # Pick top 4 for sensor chart (most variance first)
    top4 = sorted([s for s in node_stats if s["recommended_for_chart"]], key=lambda x: -x["spread"])[:4]
    print(f"\n── RECOMMENDED CHART MAPPING (top {len(top4)} by variance) ─────")
    for i, s in enumerate(top4):
        print(f"  slot[{i}] {s['display_name']:30} [{s['data_type']:8}] spread={s['spread']:.3f}")

    # ── Step 4: Save JSON ─────────────────────────────────────────────────
    output = {
        "connector_id": CONNECTOR_ID,
        "endpoint": ENDPOINT,
        "duration_s": DURATION,
        "poll_interval_s": POLL_INTERVAL,
        "poll_count": poll_count,
        "all_nodes": {
            "total": len(nodes),
            "numeric": len(numeric_nodes),
            "boolean": len(bool_nodes),
            "other": len(other_nodes),
        },
        "node_catalog": nodes,
        "numeric_node_stats": node_stats,
        "recommended_chart_nodes": top4,
        "stream": stream_records,
    }

    OUT_FILE.parent.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(output, indent=2, default=str))
    print(f"\n✓ Saved full stream to: {OUT_FILE}")
    print(f"  {poll_count} polls × {len(watch_nodes)} nodes = {poll_count * len(watch_nodes)} reads\n")


if __name__ == "__main__":
    asyncio.run(main())
