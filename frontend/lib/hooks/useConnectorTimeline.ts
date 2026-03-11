'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoverConnector, readConnectorBatch } from '@/lib/services/connector.service';
import { getChannelMetadata, getTelemetryTimeline } from '@/lib/services/telemetry.service';
import { ApiError } from '@/lib/services/backend';
import type {
    EnergyReading,
    ProductMetric,
    SensorReading,
    SignalMeta,
    TimeGranularity,
} from '@/lib/types/timeline';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ConnectorStatus =
    | 'idle'
    | 'discovering'
    | 'connected'
    | 'not_found'
    | 'error';

const NUMERIC_DATA_TYPES = new Set([
    'Float', 'Double',
    'Int16', 'Int32', 'Int64',
    'UInt16', 'UInt32', 'UInt64',
    'Byte', 'SByte', 'Number',
]);

const FIELD_MAP = ['temperature', 'vibration', 'pressure', 'humidity'] as const;
type MappedField = (typeof FIELD_MAP)[number];

export interface NodeMapping {
    field: MappedField;
    displayName: string;
    nodeId: string;
    dataType: string;
}

// ─── GRANULARITY CONFIG ───────────────────────────────────────────────────────
//
// windowMs  = total time span shown on X-axis (like the "timeframe" in TradingView)
// bucketMs  = size of each aggregation bucket (0 = raw, no aggregation)
//
// Switching granularity changes what portion of the buffer you see and how
// readings are averaged into buckets — exactly like 1m / 5m / 1h candles.
// As the buffer grows (future: DB persistence), Day/Week/Year views fill in.

const GRANULARITY_CONFIG: Record<TimeGranularity, { windowMs: number; bucketMs: number }> = {
    Minute: { windowMs: 60_000,           bucketMs: 0 },          // last 60s  — raw 2s readings
    Hour:   { windowMs: 3_600_000,        bucketMs: 30_000 },     // last 1h   — 30s buckets
    Day:    { windowMs: 86_400_000,       bucketMs: 300_000 },    // last 24h  — 5 min buckets
    Month:  { windowMs: 2_592_000_000,    bucketMs: 3_600_000 },  // last 30d  — 1h buckets
    Year:   { windowMs: 31_536_000_000,   bucketMs: 86_400_000 }, // last 365d — 1d buckets
};

// In-memory buffer ceiling: hold the Hour window + 1 min headroom.
// Day/Month/Year views are intentionally sparse until DB-backed history pagination
// is wired in — the buffer can only grow as fast as the 2s polling interval.
const MAX_BUFFER_MS          = 3_660_000; // 61 min (covers Hour window with headroom)
const MAX_CONSECUTIVE_ERRORS = 4;
const NORMALIZE_WINDOW       = 60;      // readings used for rolling min/max per channel

/** Remove readings older than `cutoffMs`. Assumes array is chronologically sorted. */
export function pruneBuffer(buf: SensorReading[], cutoffMs: number): SensorReading[] {
    if (buf.length === 0) return buf;
    // Binary-search first index that's >= cutoff (faster than filter for large buffers)
    let lo = 0, hi = buf.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (buf[mid].timestamp < cutoffMs) lo = mid + 1; else hi = mid;
    }
    return lo === 0 ? buf : buf.slice(lo);
}

// ─── DISCOVERY CACHE (localStorage) ──────────────────────────────────────────
//
// Discovery is expensive (OPC UA tree walk). We cache the node mappings per
// connector so subsequent connects skip the tree walk entirely.

function loadCachedMappings(connectorId: string): NodeMapping[] | null {
    try {
        const raw = localStorage.getItem(`node_mappings_${connectorId}`);
        return raw ? (JSON.parse(raw) as NodeMapping[]) : null;
    } catch {
        return null;
    }
}

function saveMappings(connectorId: string, mappings: NodeMapping[]): void {
    try {
        localStorage.setItem(`node_mappings_${connectorId}`, JSON.stringify(mappings));
    } catch {
        // localStorage unavailable (SSR, private mode) — non-fatal
    }
}

// ─── NORMALIZATION ────────────────────────────────────────────────────────────
//
// Maps each channel's raw value to 0–100 relative to its own recent min/max.
// Static values (spread ≈ 0) map to 50 so they appear centered, not at a flat 0.
// With real industrial sensors each channel will follow its own independent curve.

function windowNormalize(
    raw: number,
    field: MappedField,
    history: SensorReading[],
): number {
    if (history.length < 2) return 50;
    const win  = history.slice(-NORMALIZE_WINDOW);
    const vals = win.map((s) => s[field] as number).filter(isFinite);
    if (vals.length < 2) return 50;
    const min    = Math.min(...vals);
    const max    = Math.max(...vals);
    const spread = max - min;
    if (spread < 0.001) return 50;
    return Math.round(((raw - min) / spread) * 100 * 100) / 100;
}

function extractNumeric(value: unknown): number | null {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
        const n = parseFloat(value);
        if (!isNaN(n) && isFinite(n)) return n;
    }
    return null;
}

function avgArr(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── TIME-BUCKET AGGREGATION ─────────────────────────────────────────────────
//
// Groups readings into fixed-size time buckets (OHLC-style averages).
// anomaly  = OR across the bucket (any spike marks the whole bucket).
// bucketMs = 0  → return raw readings filtered to the window.

function avgNullable(arr: (number | null | undefined)[]): number | null {
    const vals = arr.filter((v): v is number => v != null);
    return vals.length ? avgArr(vals) : null;
}

function aggregateToBuckets(
    readings: SensorReading[],
    bucketMs: number,
    windowStart: number,
): SensorReading[] {
    const inWindow = readings.filter((r) => r.timestamp >= windowStart);
    if (bucketMs === 0 || inWindow.length === 0) return inWindow;

    const buckets = new Map<number, SensorReading[]>();
    for (const r of inWindow) {
        const key = Math.floor(r.timestamp / bucketMs) * bucketMs;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(r);
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([key, group]) => ({
            timestamp:        key + bucketMs / 2,
            temperature:      avgArr(group.map((r) => r.temperature)),
            vibration:        avgArr(group.map((r) => r.vibration)),
            pressure:         avgArr(group.map((r) => r.pressure)),
            humidity:         avgArr(group.map((r) => r.humidity)),
            // Average raw values for the bucket (null when not available)
            rawTemperature:   avgNullable(group.map((r) => r.rawTemperature)),
            rawVibration:     avgNullable(group.map((r) => r.rawVibration)),
            rawPressure:      avgNullable(group.map((r) => r.rawPressure)),
            rawHumidity:      avgNullable(group.map((r) => r.rawHumidity)),
            anomaly:     group.some((r) => r.anomaly),
            alertLevel:  group.reduce<SensorReading['alertLevel']>(
                (worst, r) =>
                    r.alertLevel === 'critical' ? 'critical'
                    : worst === 'critical'       ? 'critical'
                    : r.alertLevel,
                'none',
            ),
        }));
}

// ─── DERIVED METRICS ─────────────────────────────────────────────────────────
//
// Exported so individual chart-layer components can derive their own data
// locally without depending on the hook (useful for lightweight-charts adoption).

export function deriveEnergy(s: SensorReading): EnergyReading {
    // powerDraw: dominated by vibration (×8) — reacts strongly to vib changes
    const powerDraw   = Math.round((50 + s.temperature * 1.5 + s.vibration * 8) * 10) / 10;
    // coolingLoad: 30% of power — tracks power but with a dampening multiplier
    const coolingLoad = Math.round(powerDraw * 0.3 * 10) / 10;
    // efficiency: INVERSE of vibration — drops when vibration rises
    const efficiency  = Math.round(Math.max(60, 100 - s.vibration * 0.4) * 10) / 10;
    const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;
    return { timestamp: s.timestamp, powerDraw, coolingLoad, efficiency, costPerHour };
}

export function deriveProduct(s: SensorReading): ProductMetric {
    // uptime driven by pressure & humidity (not vibration) → independent shape
    const pressurePenalty = Math.max(0, (50 - s.pressure) * 0.3);
    const humidityPenalty = Math.max(0, (s.humidity - 60) * 0.2);
    const uptime = Math.round(Math.max(60, 100 - pressurePenalty - humidityPenalty) * 10) / 10;
    const output = Math.round(1200 * (uptime / 100));
    return { timestamp: s.timestamp, output, target: 1200, uptime };
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useConnectorTimeline(
    connectorId: string | undefined,
    granularity: TimeGranularity,
) {
    const [status, setStatus]             = useState<ConnectorStatus>(connectorId ? 'discovering' : 'idle');
    const [errorDetail, setErrorDetail]   = useState<string | null>(null);
    const [nodeMappings, setNodeMappings]  = useState<NodeMapping[]>([]);
    const [signalMeta, setSignalMeta]      = useState<SignalMeta[]>([]);
    const [sensorBuffer, setSensorBuffer]  = useState<SensorReading[]>([]);

    const nodeIdsRef           = useRef<string[]>([]);
    const connectedRef         = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const prevRawRef           = useRef<Partial<Record<MappedField, number>>>({});
    const bufferRef            = useRef<SensorReading[]>([]);

    useEffect(() => { bufferRef.current = sensorBuffer; }, [sensorBuffer]);

    // ── Discovery ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!connectorId) {
            setStatus('idle');
            setNodeMappings([]);
            setSensorBuffer([]);
            nodeIdsRef.current = [];
            connectedRef.current = false;
            return;
        }

        setStatus('discovering');
        setErrorDetail(null);
        setNodeMappings([]);
        setSignalMeta([]);
        setSensorBuffer([]);
        connectedRef.current = false;
        consecutiveErrorsRef.current = 0;
        prevRawRef.current = {};
        let cancelled = false;

        async function init() {
            // ── Node mapping: use localStorage cache to skip re-discovery ──────
            const cached = loadCachedMappings(connectorId!);
            if (cached && cached.length > 0) {
                // Connector was used before — reuse known node IDs
                nodeIdsRef.current = cached.map((m) => m.nodeId);
                setNodeMappings(cached);
                console.log('[Connector] Using cached node mappings for', connectorId, '— skipping discovery');
            } else {
                // First time this connector is used — run full OPC UA discovery
                try {
                    const discovery = await discoverConnector(connectorId!);
                    if (cancelled) return;

                    const numericNodes = discovery.nodes.filter(
                        (n) => NUMERIC_DATA_TYPES.has(n.data_type) || n.data_type === 'Unknown',
                    );
                    const scored = numericNodes
                        .filter((n) => n.data_type !== 'Unknown')
                        .sort((a, b) => {
                            const score = (n: typeof a) =>
                                (n.path.some((p) => /static/i.test(p))  ?  1 : 0) +
                                (n.path.some((p) => /dynamic/i.test(p)) ? -1 : 0);
                            return score(a) - score(b);
                        });

                    const pool = numericNodes.length > 0 ? (scored.length >= 4 ? scored : numericNodes) : discovery.nodes;
                    const candidates = pool.slice(0, 4);
                    nodeIdsRef.current = candidates.map((n) => n.node_id);

                    const mappings: NodeMapping[] = candidates.map((n, i) => ({
                        field:       FIELD_MAP[i],
                        displayName: n.display_name,
                        nodeId:      n.node_id,
                        dataType:    n.data_type,
                    }));
                    setNodeMappings(mappings);
                    // Persist so next time we skip discovery
                    saveMappings(connectorId!, mappings);
                    console.log('[Connector] Discovery complete →', {
                        total: discovery.nodes.length,
                        numeric: numericNodes.length,
                        selected: mappings.map((m) => `${m.field}=${m.nodeId} (${m.dataType})`),
                    });
                } catch (err) {
                    if (cancelled) return;
                    console.error('[Connector] discovery failed:', err);
                    const httpStatus = err instanceof ApiError ? err.status : null;
                    const detail = err instanceof ApiError
                        ? `HTTP ${err.status}: ${err.message}`
                        : (err instanceof Error ? err.message : String(err));
                    setErrorDetail(detail);
                    setStatus(httpStatus === 404 ? 'not_found' : 'error');
                    return;
                }

                if (nodeIdsRef.current.length === 0) {
                    const msg = 'No readable nodes found on this connector. Check that the server has tags exposed.';
                    console.warn('[Connector]', msg);
                    setErrorDetail(msg);
                    setStatus('error');
                    return;
                }
            }

            // ── Fetch real signal labels + units from DB ───────────────────────
            try {
                const channels = await getChannelMetadata();
                if (!cancelled && channels.length > 0) {
                    const meta: SignalMeta[] = channels.map((c) => ({
                        field:       c.field as SignalMeta['field'],
                        signalId:    c.signal_id,
                        displayName: c.display_name,
                        unit:        c.unit,
                    }));
                    setSignalMeta(meta);
                }
            } catch {
                // Non-fatal — tooltips will fall back to OPC UA display names
            }

            // ── Seed prevRaw so the first poll has fallback values ─────────────
            try {
                const batch = await readConnectorBatch(connectorId!, nodeIdsRef.current);
                if (cancelled) return;
                for (const item of batch.results) {
                    const idx = nodeIdsRef.current.indexOf(item.node_id);
                    const field = FIELD_MAP[idx];
                    if (!field || item.error) continue;
                    const val = extractNumeric(item.value);
                    if (val !== null) prevRawRef.current[field] = val;
                }
            } catch {
                // Non-fatal — first poll tick will populate prevRaw
            }

            if (cancelled) return;

            // ── Pre-populate buffer from stored telemetry (with raw values) ────
            try {
                const history = await getTelemetryTimeline(10);
                if (!cancelled && history.length > 0) {
                    const seeded: SensorReading[] = history.map((p) => ({
                        timestamp:      p.timestamp,
                        temperature:    p.temperature,
                        vibration:      p.vibration,
                        pressure:       p.pressure,
                        humidity:       p.humidity,
                        rawTemperature: p.rawTemperature ?? null,
                        rawVibration:   p.rawVibration   ?? null,
                        rawPressure:    p.rawPressure    ?? null,
                        rawHumidity:    p.rawHumidity    ?? null,
                        anomaly:        false,
                        alertLevel:     'none' as const,
                    }));
                    const cutoff = Date.now() - MAX_BUFFER_MS;
                    const kept = pruneBuffer(seeded, cutoff);
                    setSensorBuffer(kept);
                    bufferRef.current = kept;
                    console.log('[Connector] Pre-populated buffer with', seeded.length, 'telemetry readings');
                }
            } catch {
                // Non-fatal — live polling will populate the buffer
            }

            connectedRef.current = true;
            setStatus('connected');
        }

        init();
        return () => { cancelled = true; };
    }, [connectorId]);

    // ── Live polling — one batch request per 2s cycle ─────────────────────────
    useEffect(() => {
        if (!connectorId || status !== 'connected') return;

        const interval = setInterval(async () => {
            if (!connectedRef.current || nodeIdsRef.current.length === 0) return;

            let batchResult;
            try {
                batchResult = await readConnectorBatch(connectorId, nodeIdsRef.current);
            } catch (err) {
                consecutiveErrorsRef.current += 1;
                const detail = err instanceof ApiError
                    ? `HTTP ${err.status}: ${err.message}`
                    : (err instanceof Error ? err.message : String(err));
                console.warn(`[Connector] batch read failed (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS}): ${detail}`, err);
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setErrorDetail(detail);
                    setStatus('error');
                }
                return;
            }

            const rawValues: Partial<Record<MappedField, number>> = {};
            let anySuccess = false;

            for (const item of batchResult.results) {
                const idx  = nodeIdsRef.current.indexOf(item.node_id);
                const field = FIELD_MAP[idx];
                if (!field) continue;
                if (item.error) {
                    console.debug(`[Connector] node ${item.node_id} error: ${item.error}`);
                    continue;
                }
                const val = extractNumeric(item.value);
                if (val !== null) {
                    rawValues[field]          = val;
                    prevRawRef.current[field] = val;
                    anySuccess                = true;
                }
            }

            if (!anySuccess) {
                // If the batch HTTP call succeeded but all values are non-numeric
                // (e.g. String/Boolean OPC-UA tags), keep previous values and
                // continue streaming — don't count as a connection error.
                // Only hard HTTP errors (caught above) increment the error counter.
                console.warn('[Connector] batch returned no numeric values — using previous.', batchResult.results);
            }
            consecutiveErrorsRef.current = 0;

            const buf = bufferRef.current;
            const rT  = rawValues.temperature ?? prevRawRef.current.temperature ?? 0;
            const rV  = rawValues.vibration   ?? prevRawRef.current.vibration   ?? 0;
            const rP  = rawValues.pressure    ?? prevRawRef.current.pressure    ?? 0;
            const rH  = rawValues.humidity    ?? prevRawRef.current.humidity    ?? 0;

            // Each channel is normalized independently against its own recent history.
            // Real sensors (temperature, pressure, vibration…) each have their own
            // volatility patterns, so the normalized curves will differ.
            const temperature = windowNormalize(rT, 'temperature', buf);
            const vibration   = windowNormalize(rV, 'vibration',   buf);
            const pressure    = windowNormalize(rP, 'pressure',    buf);
            const humidity    = windowNormalize(rH, 'humidity',    buf);

            // Anomaly is NEVER auto-detected from raw values.
            // It is only injected by the TEST ANOMALY button (triggerAnomaly).
            const reading: SensorReading = {
                timestamp:      Date.now(),
                temperature,
                vibration,
                pressure,
                humidity,
                // Store raw engineering values for tooltip display
                rawTemperature: rT,
                rawVibration:   rV,
                rawPressure:    rP,
                rawHumidity:    rH,
                anomaly:        false,
                alertLevel:     'none',
            };

            setSensorBuffer((prev) => {
                const cutoff = reading.timestamp - MAX_BUFFER_MS;
                return [...pruneBuffer(prev, cutoff), reading];
            });
        }, 2000);

        return () => clearInterval(interval);
    }, [connectorId, status]);

    // ── Manual anomaly injection (TEST ANOMALY button) ────────────────────────
    const triggerAnomaly = useCallback(() => {
        if (!connectedRef.current) return;
        const prev = bufferRef.current[bufferRef.current.length - 1];
        const spike: SensorReading = {
            timestamp:   Date.now(),
            temperature: Math.min(100, (prev?.temperature ?? 50) + 25),
            vibration:   Math.min(100, (prev?.vibration   ?? 30) + 40),
            pressure:    Math.max(0,   (prev?.pressure    ?? 50) - 30),
            humidity:    prev?.humidity ?? 50,
            anomaly:     true,
            alertLevel:  'critical',
        };
        setSensorBuffer((prev) => {
            const cutoff = spike.timestamp - MAX_BUFFER_MS;
            return [...pruneBuffer(prev, cutoff), spike];
        });
    }, []);

    // ── Aggregation + X-axis domain ───────────────────────────────────────────
    //
    // RULE 2 — Strict sliding window:
    //   right = Date.now() (the "live edge" even if the last poll was 2s ago)
    //   left  = right - windowMs
    //   xDomain and visibleSensor share ONE `now` snapshot so they can never
    //   drift apart (previously two separate Date.now() calls = desync risk).
    //
    // RULE 4 — Both derived datasets (energy, product) live here so swapping
    //   out a layer for lightweight-charts only requires removing one useMemo.

    const { windowMs, bucketMs } = GRANULARITY_CONFIG[granularity];

    const { xDomain, visibleSensor, energyData, productData } = useMemo(() => {
        const now   = Date.now();
        const left  = now - windowMs;
        const vis   = aggregateToBuckets(sensorBuffer, bucketMs, left);
        return {
            xDomain:     [left, now] as [number, number],
            visibleSensor: vis,
            energyData:  vis.map(deriveEnergy),
            productData: vis.map(deriveProduct),
        };
    }, [sensorBuffer, windowMs, bucketMs]);

    const isLive = connectorId !== undefined && status === 'connected';

    return {
        sensorData:      isLive ? visibleSensor : [],
        energyData:      isLive ? energyData    : [],
        productData:     isLive ? productData   : [],
        xDomain,
        pointCount:      isLive ? visibleSensor.length : 0,
        isStreaming:     isLive,
        triggerAnomaly,
        connectorStatus: status,
        connectorError:  errorDetail,
        nodeMappings,
        signalMeta,
    };
}
