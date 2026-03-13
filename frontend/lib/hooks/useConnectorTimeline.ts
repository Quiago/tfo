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
// windowMs    = total time span shown on X-axis (like the "timeframe" in TradingView)
// bucketMs    = size of each aggregation bucket (0 = raw, no aggregation)
// seedMinutes = how many minutes of history to fetch from /telemetry/timeline on init
//               or when switching to this granularity
// maxBufferMs = in-memory buffer ceiling for this granularity
//
// Switching granularity changes what portion of the buffer you see and how
// readings are averaged into buckets — exactly like 1m / 5m / 1h candles.

interface GranularityConfig {
    windowMs: number;
    bucketMs: number;
    seedMinutes: number;  // minutes requested from the history API
    maxBufferMs: number;  // buffer pruning ceiling
}

const GRANULARITY_CONFIG: Record<TimeGranularity, GranularityConfig> = {
    Minute: { windowMs: 60_000,         bucketMs: 0,          seedMinutes: 1,      maxBufferMs: 300_000       },
    Hour:   { windowMs: 3_600_000,      bucketMs: 30_000,     seedMinutes: 60,     maxBufferMs: 3_900_000     },
    Day:    { windowMs: 86_400_000,     bucketMs: 300_000,    seedMinutes: 1440,   maxBufferMs: 90_000_000    },
    Month:  { windowMs: 2_592_000_000,  bucketMs: 3_600_000,  seedMinutes: 43_200, maxBufferMs: 2_700_000_000 },
    Year:   { windowMs: 31_536_000_000, bucketMs: 86_400_000, seedMinutes: 525_600,maxBufferMs: 32_000_000_000},
};

// API hard limit for the /telemetry/timeline endpoint (matches backend le=525_600)
const TIMELINE_API_MAX_MINUTES = 525_600;

const MAX_BUFFER_MS          = 3_900_000; // default ceiling used before granularity is known
const MAX_CONSECUTIVE_ERRORS = 4;
const NORMALIZE_WINDOW       = 60;      // readings used for rolling min/max per channel
const RIGHT_PAD_RATIO        = 0.2;     // 20% right margin — live data sits at ~83% width (TradingView style)

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
    // Tracks how many minutes were last fetched so the re-seed effect only
    // fires when switching to a granularity that needs *more* history.
    const lastSeedMinsRef      = useRef<number>(0);
    // Mutable ceiling used by the live polling prune — updated on granularity change.
    const maxBufferMsRef       = useRef<number>(MAX_BUFFER_MS);
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

            // ── Pre-populate sensor + energy buffers from stored telemetry ────
            // Use granularity-appropriate seedMinutes so Day/Month/Year views
            // are pre-filled with the right amount of history on first connect.
            try {
                const cfg = GRANULARITY_CONFIG[granularity];
                const seedMins = Math.min(cfg.seedMinutes, TIMELINE_API_MAX_MINUTES);
                const history = await getTelemetryTimeline(seedMins);
                if (!cancelled && history.length > 0) {
                    const cutoff = Date.now() - cfg.maxBufferMs;
                    const seeded: SensorReading[] = pruneBuffer(
                        history.map((p) => ({
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
                        })),
                        cutoff,
                    );
                    setSensorBuffer(seeded);
                    bufferRef.current = seeded;

                    // Seed energy buffer from the same history so the Energy chart
                    // is populated immediately. Real OPC UA energy readings append
                    // on top as they arrive from the live polling loop.
                    const seededEnergy = seeded.map(deriveEnergy);
                    setEnergyBuffer(seededEnergy);
                    energyBufferRef.current = seededEnergy;

                    maxBufferMsRef.current = cfg.maxBufferMs;
                    lastSeedMinsRef.current = seedMins;
                    console.log('[Connector] Seeded buffer:', seeded.length, 'readings from last', seedMins, 'min');
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
                const cutoff = reading.timestamp - maxBufferMsRef.current;
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
                    const cutoff = energyReading.timestamp - maxBufferMsRef.current;
                    return [...pruneBuffer(prev, cutoff), energyReading];
                });
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [connectorId, status]);

    // ── Re-seed when switching to a larger granularity ────────────────────────
    //
    // When the user switches from e.g. Hour → Day, the live buffer only holds
    // ~65 min of data. This effect fetches the additional history from the API
    // (up to 1440 min / 24 h) so the larger window has data immediately.
    // It is a no-op when the new granularity needs no more data than what was
    // already seeded (tracked by lastSeedMinsRef).
    useEffect(() => {
        if (status !== 'connected' || !connectorId) return;

        const { seedMinutes, maxBufferMs } = GRANULARITY_CONFIG[granularity];
        const needed = Math.min(seedMinutes, TIMELINE_API_MAX_MINUTES);

        // Already have enough history for this granularity
        if (needed <= lastSeedMinsRef.current) {
            maxBufferMsRef.current = maxBufferMs;
            return;
        }

        maxBufferMsRef.current = maxBufferMs;
        lastSeedMinsRef.current = needed;

        getTelemetryTimeline(needed)
            .then((history) => {
                if (!history.length) return;
                const cutoff = Date.now() - maxBufferMs;
                const seeded: SensorReading[] = pruneBuffer(
                    history.map((p) => ({
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
                    })),
                    cutoff,
                );

                setSensorBuffer((prev) => {
                    // Historical seed fills the left side; existing live readings
                    // (prev) take priority for any overlapping timestamps.
                    const liveTs = new Set(prev.map((r) => r.timestamp));
                    const older  = seeded.filter((r) => !liveTs.has(r.timestamp));
                    return [...older, ...prev].sort((a, b) => a.timestamp - b.timestamp);
                });

                setEnergyBuffer((prev) => {
                    const seededEnergy = seeded.map(deriveEnergy);
                    const liveTs = new Set(prev.map((r) => r.timestamp));
                    const older  = seededEnergy.filter((r) => !liveTs.has(r.timestamp));
                    return [...older, ...prev].sort((a, b) => a.timestamp - b.timestamp);
                });

                console.log('[Connector] Re-seeded for', granularity, '—', seeded.length, 'readings');
            })
            .catch(() => { /* non-fatal: chart shows what it has */ });
    }, [connectorId, granularity, status]);

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

        // ── Fixed sliding window (TradingView-style) ─────────────────────────
        //
        // domainLeft is always exactly "now - windowMs" regardless of how much
        // data is in the buffer. This guarantees that the Year view always shows
        // a 12-month axis, the Month view a 30-day axis, etc. — the chart fills
        // left-to-right as backfilled + live data arrives, never compresses.
        //
        // domainRight = now + visibleSpan * RIGHT_PAD_RATIO
        //   ∙ Live data always lands at ~83% of chart width
        //   ∙ Right padding is proportional so the gap stays consistent across
        //     all granularities (bucketMs/2 overshoot stays in the padding zone)
        const domainLeft  = now - windowMs;
        const visibleSpan = Math.max(windowMs, bucketMs > 0 ? bucketMs : 5_000);
        const domainRight = now + Math.round(visibleSpan * RIGHT_PAD_RATIO);

        return {
            xDomain:       [domainLeft, domainRight] as [number, number],
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
