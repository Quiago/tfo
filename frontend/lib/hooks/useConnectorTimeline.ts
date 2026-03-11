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

// Maps a discovered OPC UA Energy node to an EnergyReading field.
// scaleFactor: applied before storing — e.g. PowerFactor (0–1) × 100 → %
interface EnergyNodeMapping {
    field: 'powerDraw' | 'coolingLoad' | 'efficiency';
    displayName: string;
    nodeId: string;
    scaleFactor: number;
}

// Which EnergyReading field each well-known energy display name maps to.
// Names are matched case-insensitively against the OPC UA node's display_name.
const ENERGY_DISPLAY_TO_FIELD: Record<string, Omit<EnergyNodeMapping, 'nodeId' | 'displayName'>> = {
    'totalpower':  { field: 'powerDraw',   scaleFactor: 1 },
    'auxpower':    { field: 'coolingLoad', scaleFactor: 1 },
    'powerfactor': { field: 'efficiency',  scaleFactor: 100 },
};

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
export function pruneBuffer<T extends { timestamp: number }>(buf: T[], cutoffMs: number): T[] {
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

function loadCachedEnergyMappings(connectorId: string): EnergyNodeMapping[] | null {
    try {
        const raw = localStorage.getItem(`energy_mappings_${connectorId}`);
        return raw ? (JSON.parse(raw) as EnergyNodeMapping[]) : null;
    } catch {
        return null;
    }
}

function saveEnergyMappings(connectorId: string, mappings: EnergyNodeMapping[]): void {
    try {
        localStorage.setItem(`energy_mappings_${connectorId}`, JSON.stringify(mappings));
    } catch {
        // localStorage unavailable (SSR, private mode) — non-fatal
    }
}

// ─── NORMALIZATION ────────────────────────────────────────────────────────────
//
// Maps each channel's raw engineering value to 0–100 relative to its OWN
// recent raw min/max. Using raw history (not normalized history) ensures:
//  - Each channel is normalised against its own physical scale (°C, mm/s, bar)
//  - Channels diverge visually because their raw ranges differ
//  - Static values (spread ≈ 0) map to 50 (centered, not clipped to 0)

// Which raw field to use for normalization history of each channel
const RAW_HISTORY_FIELD: Record<MappedField, 'rawTemperature' | 'rawVibration' | 'rawPressure' | 'rawHumidity'> = {
    temperature: 'rawTemperature',
    vibration:   'rawVibration',
    pressure:    'rawPressure',
    humidity:    'rawHumidity',
};

function windowNormalize(
    raw: number,
    field: MappedField,
    history: SensorReading[],
): number {
    if (history.length < 2) return 50;
    const win      = history.slice(-NORMALIZE_WINDOW);
    const rawField = RAW_HISTORY_FIELD[field];
    // Use raw engineering values from history so each channel normalises
    // against its own physical scale — not the previous normalised 0-100 values.
    const vals = win
        .map((s) => s[rawField] as number | null)
        .filter((v): v is number => v != null && isFinite(v));
    if (vals.length < 2) return 50;
    const min    = Math.min(...vals);
    const max    = Math.max(...vals);
    const spread = max - min;
    if (spread < 0.001) return 50;
    // Clamp to [0, 100] — raw value can temporarily exceed the rolling window
    // range (e.g. a new peak not yet in history), which would push the result
    // above 100 or below 0 and break both chart Y-axes and deriveEnergy.
    const pct = ((raw - min) / spread) * 100;
    return Math.round(Math.min(100, Math.max(0, pct)) * 100) / 100;
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

function aggregateEnergyBuckets(
    readings: EnergyReading[],
    bucketMs: number,
    windowStart: number,
): EnergyReading[] {
    const inWindow = readings.filter((r) => r.timestamp >= windowStart);
    if (bucketMs === 0 || inWindow.length === 0) return inWindow;

    const buckets = new Map<number, EnergyReading[]>();
    for (const r of inWindow) {
        const key = Math.floor(r.timestamp / bucketMs) * bucketMs;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(r);
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([key, group]) => ({
            timestamp:   key + bucketMs / 2,
            powerDraw:   Math.round(avgArr(group.map((r) => r.powerDraw))   * 10) / 10,
            coolingLoad: Math.round(avgArr(group.map((r) => r.coolingLoad)) * 10) / 10,
            efficiency:  Math.round(avgArr(group.map((r) => r.efficiency))  * 10) / 10,
            costPerHour: Math.round(avgArr(group.map((r) => r.costPerHour)) * 100) / 100,
        }));
}

// ─── DERIVED METRICS ─────────────────────────────────────────────────────────
//
// deriveEnergy: FALLBACK ONLY — used when the connector has no dedicated
// Energy OPC UA nodes. When real energy nodes are present (e.g. Factory/Energy/
// TotalPower, AuxPower, PowerFactor), the hook reads those directly and
// this function is not called.
//
// Exported so tests can still validate the formula.

export function deriveEnergy(s: SensorReading): EnergyReading {
    // powerDraw: driven by PRESSURE (compressors) + HUMIDITY (HVAC/cooling),
    // with only a small temperature contribution and almost no vibration.
    // This ensures the Energy chart has an independent visual shape from the
    // Sensor chart (which is vibration-dominated).
    const powerDraw   = Math.round((100 + s.pressure * 5 + s.humidity * 2 + s.temperature * 0.5) * 10) / 10;
    // coolingLoad: 35% of power, tracks pressure (compressor cooling circuits)
    const coolingLoad = Math.round(powerDraw * 0.35 * 10) / 10;
    // efficiency: INVERSE of vibration — high vibration = bearing friction = wasted power
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
    const [energyBuffer, setEnergyBuffer]  = useState<EnergyReading[]>([]);

    const nodeIdsRef           = useRef<string[]>([]);
    const energyMappingsRef    = useRef<EnergyNodeMapping[]>([]);
    const connectedRef         = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const prevRawRef           = useRef<Partial<Record<MappedField, number>>>({});
    const prevEnergyRef        = useRef<Partial<Record<EnergyNodeMapping['field'], number>>>({});
    const bufferRef            = useRef<SensorReading[]>([]);
    const energyBufferRef      = useRef<EnergyReading[]>([]);

    useEffect(() => { bufferRef.current = sensorBuffer; }, [sensorBuffer]);
    useEffect(() => { energyBufferRef.current = energyBuffer; }, [energyBuffer]);

    // ── Discovery ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!connectorId) {
            setStatus('idle');
            setNodeMappings([]);
            setSensorBuffer([]);
            setEnergyBuffer([]);
            nodeIdsRef.current = [];
            energyMappingsRef.current = [];
            connectedRef.current = false;
            return;
        }

        setStatus('discovering');
        setErrorDetail(null);
        setNodeMappings([]);
        setSignalMeta([]);
        setSensorBuffer([]);
        setEnergyBuffer([]);
        connectedRef.current = false;
        consecutiveErrorsRef.current = 0;
        prevRawRef.current = {};
        prevEnergyRef.current = {};
        let cancelled = false;

        async function init() {
            // ── Sensor node mapping: use localStorage cache to skip re-discovery ──
            const cached = loadCachedMappings(connectorId!);
            const cachedEnergy = loadCachedEnergyMappings(connectorId!);

            if (cached && cached.length > 0) {
                // Connector was used before — reuse known node IDs
                nodeIdsRef.current = cached.map((m) => m.nodeId);
                setNodeMappings(cached);
                console.log('[Connector] Using cached sensor mappings for', connectorId);

                if (cachedEnergy && cachedEnergy.length > 0) {
                    energyMappingsRef.current = cachedEnergy;
                    console.log('[Connector] Using cached energy mappings:', cachedEnergy.map((m) => `${m.field}=${m.nodeId}`));
                }
            } else {
                // First time this connector is used — run full OPC UA discovery
                try {
                    const discovery = await discoverConnector(connectorId!);
                    if (cancelled) return;

                    const numericNodes = discovery.nodes.filter(
                        (n) => NUMERIC_DATA_TYPES.has(n.data_type) || n.data_type === 'Unknown',
                    );

                    // ── Select sensor nodes (first 4 non-energy numerics) ──────────
                    const nonEnergyNodes = numericNodes.filter(
                        (n) => !n.path.some((p) => /^energy$/i.test(p)),
                    );
                    const scored = nonEnergyNodes
                        .filter((n) => n.data_type !== 'Unknown')
                        .sort((a, b) => {
                            const score = (n: typeof a) =>
                                (n.path.some((p) => /static/i.test(p))  ?  1 : 0) +
                                (n.path.some((p) => /dynamic/i.test(p)) ? -1 : 0);
                            return score(a) - score(b);
                        });

                    const pool = nonEnergyNodes.length > 0 ? (scored.length >= 4 ? scored : nonEnergyNodes) : discovery.nodes;
                    const candidates = pool.slice(0, 4);
                    nodeIdsRef.current = candidates.map((n) => n.node_id);

                    const mappings: NodeMapping[] = candidates.map((n, i) => ({
                        field:       FIELD_MAP[i],
                        displayName: n.display_name,
                        nodeId:      n.node_id,
                        dataType:    n.data_type,
                    }));
                    setNodeMappings(mappings);
                    saveMappings(connectorId!, mappings);

                    // ── Select energy nodes from Factory/Energy/ subtree ─────────
                    const energyNodes = numericNodes.filter(
                        (n) => n.path.some((p) => /^energy$/i.test(p)),
                    );
                    const energyMappings: EnergyNodeMapping[] = [];
                    for (const n of energyNodes) {
                        const key = n.display_name.toLowerCase().replace(/[^a-z]/g, '');
                        const spec = ENERGY_DISPLAY_TO_FIELD[key];
                        if (spec && !energyMappings.some((m) => m.field === spec.field)) {
                            energyMappings.push({
                                field:       spec.field,
                                displayName: n.display_name,
                                nodeId:      n.node_id,
                                scaleFactor: spec.scaleFactor,
                            });
                        }
                    }
                    energyMappingsRef.current = energyMappings;
                    if (energyMappings.length > 0) {
                        saveEnergyMappings(connectorId!, energyMappings);
                        console.log('[Connector] Energy nodes discovered:', energyMappings.map((m) => `${m.field}=${m.nodeId}`));
                    } else {
                        console.log('[Connector] No energy nodes found — will derive energy from sensor data');
                    }

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
                const allNodeIds = [
                    ...nodeIdsRef.current,
                    ...energyMappingsRef.current.map((m) => m.nodeId),
                ];
                const batch = await readConnectorBatch(connectorId!, allNodeIds);
                if (cancelled) return;
                for (const item of batch.results) {
                    // Sensor nodes
                    const sensorIdx = nodeIdsRef.current.indexOf(item.node_id);
                    if (sensorIdx >= 0) {
                        const field = FIELD_MAP[sensorIdx];
                        if (!field || item.error) continue;
                        const val = extractNumeric(item.value);
                        if (val !== null) prevRawRef.current[field] = val;
                    }
                    // Energy nodes
                    const energyMapping = energyMappingsRef.current.find((m) => m.nodeId === item.node_id);
                    if (energyMapping && !item.error) {
                        const val = extractNumeric(item.value);
                        if (val !== null) prevEnergyRef.current[energyMapping.field] = val * energyMapping.scaleFactor;
                    }
                }
            } catch {
                // Non-fatal — first poll tick will populate prevRaw
            }

            if (cancelled) return;

            // ── Pre-populate sensor buffer from stored telemetry ───────────────
            // Request enough history to fill the largest in-memory window (Hour).
            // The API now accepts up to 1440 min; we clamp to the buffer ceiling
            // so we never request more data than the buffer can hold.
            try {
                const seedMinutes = Math.ceil(MAX_BUFFER_MS / 60_000); // ≈ 62 min
                const history = await getTelemetryTimeline(seedMinutes);
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
                    console.log('[Connector] Seeded buffer:', kept.length, 'readings from last', seedMinutes, 'min');
                }
            } catch (err) {
                console.warn('[Connector] Telemetry seed failed (non-fatal):', err);
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

            // Read sensor nodes + energy nodes in a single HTTP request
            const allNodeIds = [
                ...nodeIdsRef.current,
                ...energyMappingsRef.current.map((m) => m.nodeId),
            ];

            let batchResult;
            try {
                batchResult = await readConnectorBatch(connectorId, allNodeIds);
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
            const rawEnergy: Partial<Record<EnergyNodeMapping['field'], number>> = {};
            let anySuccess = false;

            for (const item of batchResult.results) {
                if (item.error) {
                    console.debug(`[Connector] node ${item.node_id} error: ${item.error}`);
                    continue;
                }
                const val = extractNumeric(item.value);
                if (val === null) continue;

                // Classify as sensor or energy
                const sensorIdx = nodeIdsRef.current.indexOf(item.node_id);
                if (sensorIdx >= 0) {
                    const field = FIELD_MAP[sensorIdx];
                    if (field) {
                        rawValues[field]          = val;
                        prevRawRef.current[field] = val;
                        anySuccess                = true;
                    }
                    continue;
                }

                const energyMapping = energyMappingsRef.current.find((m) => m.nodeId === item.node_id);
                if (energyMapping) {
                    const scaled = val * energyMapping.scaleFactor;
                    rawEnergy[energyMapping.field]          = scaled;
                    prevEnergyRef.current[energyMapping.field] = scaled;
                    anySuccess = true;
                }
            }

            if (!anySuccess) {
                console.warn('[Connector] batch returned no numeric values — using previous.', batchResult.results);
            }
            consecutiveErrorsRef.current = 0;

            // ── Build SensorReading ────────────────────────────────────────────
            const buf = bufferRef.current;
            const rT  = rawValues.temperature ?? prevRawRef.current.temperature ?? 0;
            const rV  = rawValues.vibration   ?? prevRawRef.current.vibration   ?? 0;
            const rP  = rawValues.pressure    ?? prevRawRef.current.pressure    ?? 0;
            const rH  = rawValues.humidity    ?? prevRawRef.current.humidity    ?? 0;

            const temperature = windowNormalize(rT, 'temperature', buf);
            const vibration   = windowNormalize(rV, 'vibration',   buf);
            const pressure    = windowNormalize(rP, 'pressure',    buf);
            const humidity    = windowNormalize(rH, 'humidity',    buf);

            const reading: SensorReading = {
                timestamp:      Date.now(),
                temperature,
                vibration,
                pressure,
                humidity,
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

            // ── Build EnergyReading (real OPC UA data when available) ──────────
            if (energyMappingsRef.current.length > 0) {
                const powerDraw   = rawEnergy.powerDraw   ?? prevEnergyRef.current.powerDraw   ?? 0;
                const coolingLoad = rawEnergy.coolingLoad ?? prevEnergyRef.current.coolingLoad ?? 0;
                const efficiency  = rawEnergy.efficiency  ?? prevEnergyRef.current.efficiency  ?? 0;
                // costPerHour: electricity cost in AED — derived from TotalPower (0.45 AED/kWh)
                const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;

                const energyReading: EnergyReading = {
                    timestamp: reading.timestamp,
                    powerDraw:   Math.round(powerDraw   * 10) / 10,
                    coolingLoad: Math.round(coolingLoad * 10) / 10,
                    efficiency:  Math.round(Math.min(100, Math.max(0, efficiency)) * 10) / 10,
                    costPerHour,
                };

                setEnergyBuffer((prev) => {
                    const cutoff = energyReading.timestamp - MAX_BUFFER_MS;
                    return [...pruneBuffer(prev, cutoff), energyReading];
                });
            }
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
    // RULE 4 — energyData comes from real OPC UA Energy nodes when available;
    //   falls back to deriveEnergy (mathematical derivation from sensor data)
    //   for connectors that have no dedicated energy namespace.

    const { windowMs, bucketMs } = GRANULARITY_CONFIG[granularity];
    const hasEnergyNodes = energyMappingsRef.current.length > 0;

    const { xDomain, visibleSensor, energyData, productData } = useMemo(() => {
        const now      = Date.now();
        const fullLeft = now - windowMs;
        const vis      = aggregateToBuckets(sensorBuffer, bucketMs, fullLeft);

        // Real energy data from OPC UA nodes — or derived fallback
        const energy = hasEnergyNodes
            ? aggregateEnergyBuckets(energyBuffer, bucketMs, fullLeft)
            : vis.map(deriveEnergy);

        // ── Adaptive left boundary ────────────────────────────────────────────
        // When the buffer covers less than 20% of the selected window (typical
        // for Day/Month/Year views on a freshly-started system), anchor the
        // domain to the oldest available data point instead of showing a large
        // empty canvas on the left.
        // For Minute and Hour views the 62-min seed fills the window, so
        // coverageRatio ≥ 1 → the full configured window is always shown.
        const oldest         = vis.length > 0 ? vis[0].timestamp : null;
        const coverageRatio  = oldest !== null ? (now - oldest) / windowMs : 0;
        const domainLeft     = (oldest !== null && coverageRatio < 0.2)
            ? Math.max(fullLeft, oldest - Math.max(bucketMs, 5_000))
            : fullLeft;

        return {
            xDomain:       [domainLeft, now] as [number, number],
            visibleSensor: vis,
            energyData:    energy,
            productData:   vis.map(deriveProduct),
        };
    }, [sensorBuffer, energyBuffer, windowMs, bucketMs, hasEnergyNodes]);

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
