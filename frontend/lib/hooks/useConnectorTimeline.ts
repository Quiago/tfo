'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoverConnector, readConnectorBatch } from '@/lib/services/connector.service';
import { ApiError } from '@/lib/services/backend';
import type {
    ActionEvent,
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

// OPC-UA numeric variant types suitable for time-series charts.
// Boolean, String, DateTime, ByteString are excluded — they're not plottable.
const NUMERIC_DATA_TYPES = new Set([
    'Float', 'Double',
    'Int16', 'Int32', 'Int64',
    'UInt16', 'UInt32', 'UInt64',
    'Byte', 'SByte',
    'Number',   // generic fallback some servers return
]);

const FIELD_MAP = ['temperature', 'vibration', 'pressure', 'humidity'] as const;
type MappedField = (typeof FIELD_MAP)[number];

export interface NodeMapping {
    field: MappedField;
    displayName: string;
    nodeId: string;
    dataType: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FIELD_DEFAULTS: Record<MappedField, number> = {
    temperature: 0,
    vibration: 0,
    pressure: 0,
    humidity: 0,
};

// Keep up to 10 minutes of readings at 2s poll interval
const MAX_BUFFER = 300;

// How many recent readings to use for window-relative normalization.
// Larger = smoother Y-axis drift. Smaller = tighter zoom on recent delta.
const NORMALIZE_WINDOW = 60;

// Granularity → how many recent readings to display
const GRANULARITY_WINDOW: Record<TimeGranularity, number> = {
    Minute: 30,    // ~60s
    Hour: 90,      // ~3 min
    Day: 150,      // ~5 min
    Week: 225,     // ~7.5 min
    Year: 300,     // full buffer
};

const MAX_CONSECUTIVE_ERRORS = 4;

// ─── NORMALIZATION ────────────────────────────────────────────────────────────

/**
 * Converts raw OPC-UA counter values (e.g. monotonically-incrementing Floats
 * in the millions) into a 0–100 normalized value relative to the observed
 * range in the last NORMALIZE_WINDOW readings.
 *
 * This makes counter-style sensors visible as a trend in charts instead of
 * a flat line at an extreme Y position.
 *
 * If spread < 0.001 (truly static value), returns the raw value unchanged
 * so the chart at least shows the actual reading.
 */
function windowNormalize(
    raw: number,
    field: MappedField,
    history: SensorReading[],
): number {
    if (history.length < 2) return raw;
    const window = history.slice(-NORMALIZE_WINDOW);
    const vals = window.map((s) => s[field] as number).filter(isFinite);
    if (vals.length < 2) return raw;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const spread = max - min;
    if (spread < 0.001) return raw; // static — keep raw so user sees actual value
    return Math.round(((raw - min) / spread) * 100 * 100) / 100; // 0–100 range
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractNumericFromBatchItem(value: unknown): number | null {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
        const n = parseFloat(value);
        if (!isNaN(n) && isFinite(n)) return n;
    }
    return null;
}

function deriveEnergy(s: SensorReading): EnergyReading {
    const powerDraw = Math.round((50 + s.temperature * 1.5 + s.vibration * 8) * 10) / 10;
    const coolingLoad = Math.round(powerDraw * 0.3 * 10) / 10;
    const efficiency = Math.round(Math.max(60, 100 - Math.max(0, s.vibration - 3) * 5) * 10) / 10;
    const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;
    return { timestamp: s.timestamp, powerDraw, coolingLoad, efficiency, costPerHour };
}

function deriveProduct(s: SensorReading): ProductMetric {
    const uptime = Math.round(Math.max(60, 100 - Math.max(0, s.vibration - 3) * 5) * 10) / 10;
    const output = Math.round(1200 * (uptime / 100));
    return { timestamp: s.timestamp, output, target: 1200, uptime };
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

/**
 * Real-data-only timeline hook. ZERO mock/PRNG data.
 *
 * Key improvements over the previous version:
 *  1. Filters discovered nodes to NUMERIC types only (Float, Int32, etc.).
 *     Boolean, String, ByteString are excluded — they return 0 from extractNumeric
 *     making charts look static.
 *  2. Uses a single batch read per poll cycle (one OPC-UA TCP session for all N
 *     nodes), replacing N individual HTTP calls that each opened a separate session.
 *  3. Window-relative normalization: counter-style sensors (monotonically
 *     incrementing values in the millions) are mapped to a 0-100 range relative
 *     to the recent observed spread, making trends visible in charts.
 */
export function useConnectorTimeline(connectorId: string | undefined, granularity: TimeGranularity) {
    const [status, setStatus] = useState<ConnectorStatus>(connectorId ? 'discovering' : 'idle');
    const [nodeMappings, setNodeMappings] = useState<NodeMapping[]>([]);
    const [sensorBuffer, setSensorBuffer] = useState<SensorReading[]>([]);

    // Track raw values per field for fallback (before normalization)
    const nodeIdsRef = useRef<string[]>([]);
    const connectedRef = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const prevRawRef = useRef<Partial<Record<MappedField, number>>>({});
    // Ref to latest buffer for normalization without stale closure
    const bufferRef = useRef<SensorReading[]>([]);

    useEffect(() => {
        bufferRef.current = sensorBuffer;
    }, [sensorBuffer]);

    // ── Discovery + initial batch read ────────────────────────────────────
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

                // Filter to numeric-only nodes — skip Boolean, String, ByteString etc.
                const numericNodes = discovery.nodes.filter(
                    (n) => NUMERIC_DATA_TYPES.has(n.data_type) || n.data_type === 'Unknown',
                );

                // Sort: prefer nodes whose path contains "Dynamic" (live data) over
                // "Static" (config/metadata that always returns 0). Works for demo
                // servers (Demo.Static vs Demo.Dynamic) and many real SCADA servers.
                const scored = numericNodes
                    .filter((n) => n.data_type !== 'Unknown')
                    .sort((a, b) => {
                        const aStatic = a.path.some((p) => /static/i.test(p)) ? 1 : 0;
                        const bStatic = b.path.some((p) => /static/i.test(p)) ? 1 : 0;
                        const aDynamic = a.path.some((p) => /dynamic/i.test(p)) ? -1 : 0;
                        const bDynamic = b.path.some((p) => /dynamic/i.test(p)) ? -1 : 0;
                        return (aStatic + aDynamic) - (bStatic + bDynamic);
                    });

                const candidates = (scored.length >= 4 ? scored : numericNodes).slice(0, 4);

                nodeIdsRef.current = candidates.map((n) => n.node_id);

                const mappings: NodeMapping[] = candidates.map((n, i) => ({
                    field: FIELD_MAP[i],
                    displayName: n.display_name,
                    nodeId: n.node_id,
                    dataType: n.data_type,
                }));
                setNodeMappings(mappings);

                console.log('[Connector] Discovery complete (numeric nodes only):', {
                    connector: connectorId,
                    totalNodes: discovery.node_count,
                    numericFiltered: numericNodes.length,
                    selected: mappings.map((m) => ({ field: m.field, nodeId: m.nodeId, dataType: m.dataType, displayName: m.displayName })),
                });
            } catch (err: unknown) {
                if (cancelled) return;
                const httpStatus = err instanceof ApiError ? err.status : null;
                console.error('[Connector] Discovery failed:', err);
                setStatus(httpStatus === 404 ? 'not_found' : 'error');
                return;
            }

            if (nodeIdsRef.current.length === 0) {
                console.warn('[Connector] No numeric nodes found — cannot stream data');
                setStatus('error');
                return;
            }

            // Initial batch read — single OPC-UA session for all nodes
            try {
                const batch = await readConnectorBatch(connectorId!, nodeIdsRef.current);
                if (cancelled) return;

                for (const item of batch.results) {
                    const idx = nodeIdsRef.current.indexOf(item.node_id);
                    const field = FIELD_MAP[idx];
                    if (!field || item.error) continue;
                    const val = extractNumericFromBatchItem(item.value);
                    if (val !== null) prevRawRef.current[field] = val;
                }

                console.log('[Connector] Initial batch read:', batch.results.map((r) => ({
                    node_id: r.node_id, value: r.value, data_type: r.data_type, error: r.error,
                })));
            } catch (e) {
                console.warn('[Connector] Initial batch read failed:', e);
            }

            if (cancelled) return;
            connectedRef.current = true;
            setStatus('connected');
        }

        init();
        return () => { cancelled = true; };
    }, [connectorId]);

    // ── Live polling — ONE batch request per cycle ─────────────────────────
    useEffect(() => {
        if (!connectorId || status !== 'connected') return;

        const interval = setInterval(async () => {
            if (!connectedRef.current || nodeIdsRef.current.length === 0) return;

            let batchResult;
            try {
                batchResult = await readConnectorBatch(connectorId, nodeIdsRef.current);
            } catch (err) {
                consecutiveErrorsRef.current += 1;
                console.warn(`[Connector] Batch read failed (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS}):`, err);
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setStatus('error');
                }
                return;
            }

            const rawValues: Partial<Record<MappedField, number>> = {};
            let anySuccess = false;

            for (const item of batchResult.results) {
                const idx = nodeIdsRef.current.indexOf(item.node_id);
                const field = FIELD_MAP[idx];
                if (!field) continue;
                if (item.error) {
                    console.warn(`[Connector] Node read error — ${field} (${item.node_id}): ${item.error}`);
                    continue;
                }
                const val = extractNumericFromBatchItem(item.value);
                if (val !== null) {
                    rawValues[field] = val;
                    prevRawRef.current[field] = val;
                    anySuccess = true;
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

            // Use raw values (falling back to last known) for the reading
            const rawTemp = rawValues.temperature ?? prevRawRef.current.temperature ?? FIELD_DEFAULTS.temperature;
            const rawVib = rawValues.vibration ?? prevRawRef.current.vibration ?? FIELD_DEFAULTS.vibration;
            const rawPres = rawValues.pressure ?? prevRawRef.current.pressure ?? FIELD_DEFAULTS.pressure;
            const rawHum = rawValues.humidity ?? prevRawRef.current.humidity ?? FIELD_DEFAULTS.humidity;

            // Window-normalize counter-style sensors for chart visibility
            const currentBuf = bufferRef.current;
            const temperature = windowNormalize(rawTemp, 'temperature', currentBuf);
            const vibration = windowNormalize(rawVib, 'vibration', currentBuf);
            const pressure = windowNormalize(rawPres, 'pressure', currentBuf);
            const humidity = windowNormalize(rawHum, 'humidity', currentBuf);

            const anomaly = vibration > 80 || temperature > 80;
            const alertLevel: SensorReading['alertLevel'] =
                vibration > 80 || temperature > 80 ? 'critical' : vibration > 60 ? 'warning' : 'none';

            const reading: SensorReading = {
                timestamp: Date.now(),
                temperature,
                vibration,
                pressure,
                humidity,
                anomaly,
                alertLevel,
            };

            console.log('[Connector] Poll →', {
                timestamp: new Date().toISOString(),
                raw: { rawTemp, rawVib, rawPres, rawHum },
                normalized: { temperature, vibration, pressure, humidity },
            });

            setSensorBuffer((prev) => [...prev.slice(-(MAX_BUFFER - 1)), reading]);
        }, 2000);

        return () => clearInterval(interval);
    }, [connectorId, status]);

    // ── Anomaly injection (TEST ANOMALY button) ────────────────────────────
    const triggerAnomaly = useCallback(() => {
        if (!connectedRef.current) return;
        const prev = bufferRef.current[bufferRef.current.length - 1];
        const spike: SensorReading = {
            timestamp: Date.now(),
            temperature: Math.min(100, (prev?.temperature ?? 50) + 25),
            vibration: Math.min(100, (prev?.vibration ?? 30) + 40),
            pressure: Math.max(0, (prev?.pressure ?? 50) - 30),
            humidity: prev?.humidity ?? 50,
            anomaly: true,
            alertLevel: 'critical',
        };
        console.log('[Connector] TEST ANOMALY injected:', spike);
        setSensorBuffer((prev) => [...prev.slice(-(MAX_BUFFER - 1)), spike]);
    }, []);

    // ── Slice buffer by granularity window ────────────────────────────────
    const visibleSensor = useMemo(() => {
        const window = GRANULARITY_WINDOW[granularity];
        return sensorBuffer.slice(-window);
    }, [sensorBuffer, granularity]);

    const timestamps = useMemo(() => visibleSensor.map((s) => s.timestamp), [visibleSensor]);
    const energyData = useMemo(() => visibleSensor.map(deriveEnergy), [visibleSensor]);
    const productData = useMemo(() => visibleSensor.map(deriveProduct), [visibleSensor]);
    const actionData: ActionEvent[] = [];

    const isLive = connectorId !== undefined && status === 'connected';

    return {
        timestamps: isLive ? timestamps : [],
        sensorData: isLive ? visibleSensor : [],
        energyData: isLive ? energyData : [],
        productData: isLive ? productData : [],
        actionData: isLive ? actionData : [],
        pointCount: isLive ? visibleSensor.length : 0,
        predictionStart: isLive ? visibleSensor.length : 0,
        forecastBoundaryTimestamp: isLive ? (timestamps[timestamps.length - 1] ?? Date.now()) : Date.now(),
        isStreaming: isLive,
        triggerAnomaly,
        connectorStatus: status,
        nodeMappings,
    };
}
