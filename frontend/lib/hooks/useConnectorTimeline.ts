'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoverConnector, readConnectorBatch } from '@/lib/services/connector.service';
import { ApiError } from '@/lib/services/backend';
import type {
    EnergyReading,
    ProductMetric,
    SensorReading,
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
    Minute: { windowMs: 60_000,   bucketMs: 0 },       // last 60s — raw 2s readings
    Hour:   { windowMs: 300_000,  bucketMs: 10_000 },   // last 5 min — 10s buckets
    Day:    { windowMs: 600_000,  bucketMs: 30_000 },   // last 10 min — 30s buckets
    Week:   { windowMs: 600_000,  bucketMs: 60_000 },   // last 10 min — 1 min buckets
    Year:   { windowMs: 600_000,  bucketMs: 120_000 },  // last 10 min — 2 min buckets
};

const MAX_BUFFER            = 300;  // 300 × 2s = 10 min of raw readings
const MAX_CONSECUTIVE_ERRORS = 4;
const NORMALIZE_WINDOW      = 60;   // readings used for rolling min/max per channel

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
            timestamp:   key + bucketMs / 2,  // midpoint of bucket
            temperature: avgArr(group.map((r) => r.temperature)),
            vibration:   avgArr(group.map((r) => r.vibration)),
            pressure:    avgArr(group.map((r) => r.pressure)),
            humidity:    avgArr(group.map((r) => r.humidity)),
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
// Energy and Product use different formula weights so each chart has a
// visually distinct curve even when sensor channels are correlated.

function deriveEnergy(s: SensorReading): EnergyReading {
    // powerDraw: dominated by vibration (×8) — reacts strongly to vib changes
    const powerDraw   = Math.round((50 + s.temperature * 1.5 + s.vibration * 8) * 10) / 10;
    // coolingLoad: 30% of power — tracks power but with a dampening multiplier
    const coolingLoad = Math.round(powerDraw * 0.3 * 10) / 10;
    // efficiency: INVERSE of vibration — drops when vibration rises
    const efficiency  = Math.round(Math.max(60, 100 - s.vibration * 0.4) * 10) / 10;
    const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;
    return { timestamp: s.timestamp, powerDraw, coolingLoad, efficiency, costPerHour };
}

function deriveProduct(s: SensorReading): ProductMetric {
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
    const [nodeMappings, setNodeMappings]  = useState<NodeMapping[]>([]);
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
        setNodeMappings([]);
        setSensorBuffer([]);
        connectedRef.current = false;
        consecutiveErrorsRef.current = 0;
        prevRawRef.current = {};
        let cancelled = false;

        async function init() {
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

                const candidates = (scored.length >= 4 ? scored : numericNodes).slice(0, 4);
                nodeIdsRef.current = candidates.map((n) => n.node_id);

                const mappings: NodeMapping[] = candidates.map((n, i) => ({
                    field:       FIELD_MAP[i],
                    displayName: n.display_name,
                    nodeId:      n.node_id,
                    dataType:    n.data_type,
                }));
                setNodeMappings(mappings);
                console.log('[Connector] Discovery →', mappings.map((m) => `${m.field}=${m.nodeId}`));
            } catch (err) {
                if (cancelled) return;
                const httpStatus = err instanceof ApiError ? err.status : null;
                setStatus(httpStatus === 404 ? 'not_found' : 'error');
                return;
            }

            if (nodeIdsRef.current.length === 0) { setStatus('error'); return; }

            // Seed prevRaw so the first poll has fallback values
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
            } catch {
                consecutiveErrorsRef.current += 1;
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setStatus('error');
                }
                return;
            }

            const rawValues: Partial<Record<MappedField, number>> = {};
            let anySuccess = false;

            for (const item of batchResult.results) {
                const idx  = nodeIdsRef.current.indexOf(item.node_id);
                const field = FIELD_MAP[idx];
                if (!field || item.error) continue;
                const val = extractNumeric(item.value);
                if (val !== null) {
                    rawValues[field]          = val;
                    prevRawRef.current[field] = val;
                    anySuccess                = true;
                }
            }

            if (!anySuccess) {
                consecutiveErrorsRef.current += 1;
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setStatus('error');
                }
                return;
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
                timestamp: Date.now(),
                temperature,
                vibration,
                pressure,
                humidity,
                anomaly:    false,
                alertLevel: 'none',
            };

            setSensorBuffer((prev) => [...prev.slice(-(MAX_BUFFER - 1)), reading]);
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
        setSensorBuffer((prev) => [...prev.slice(-(MAX_BUFFER - 1)), spike]);
    }, []);

    // ── Aggregation + X-axis domain ───────────────────────────────────────────

    const { windowMs, bucketMs } = GRANULARITY_CONFIG[granularity];

    const visibleSensor = useMemo(() => {
        const windowStart = Date.now() - windowMs;
        return aggregateToBuckets(sensorBuffer, bucketMs, windowStart);
    }, [sensorBuffer, windowMs, bucketMs]);

    // xDomain is the time window for ALL chart X-axes.
    // It always spans [now - windowMs, now] and updates on every poll cycle,
    // making charts scroll left continuously — the TradingView effect.
    const xDomain = useMemo((): [number, number] => {
        const now = Date.now();
        return [now - windowMs, now];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sensorBuffer, windowMs]); // sensorBuffer dep ensures domain refreshes on each poll

    const energyData  = useMemo(() => visibleSensor.map(deriveEnergy),  [visibleSensor]);
    const productData = useMemo(() => visibleSensor.map(deriveProduct), [visibleSensor]);

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
        nodeMappings,
    };
}
