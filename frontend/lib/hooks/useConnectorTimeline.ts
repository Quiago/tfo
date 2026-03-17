'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoverConnector, getConnector, readConnectorBatch, saveNodeMappings } from '@/lib/services/connector.service';
import {
    getChannelMetadata,
    getNodeMap,
    getTelemetrySignals,
    getTelemetryTimeline,
    type TelemetrySignalPoint,
} from '@/lib/services/telemetry.service';
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
    /** DB signal_id resolved via /telemetry/node-map after discovery. Null if node not in catalog. */
    signalId: string | null;
}

interface EnergyNodeMapping {
    field: 'powerDraw' | 'coolingLoad' | 'efficiency';
    displayName: string;
    nodeId: string;
    scaleFactor: number;
    /** DB signal_id resolved via /telemetry/node-map after discovery. */
    signalId: string | null;
}

const ENERGY_DISPLAY_TO_FIELD: Record<string, Omit<EnergyNodeMapping, 'nodeId' | 'displayName' | 'signalId'>> = {
    'totalpower':  { field: 'powerDraw',   scaleFactor: 1 },
    'auxpower':    { field: 'coolingLoad', scaleFactor: 1 },
    'powerfactor': { field: 'efficiency',  scaleFactor: 100 },
};

// ─── GRANULARITY CONFIG ───────────────────────────────────────────────────────

interface GranularityConfig {
    windowMs: number;
    bucketMs: number;
    seedMinutes: number;
}

const GRANULARITY_CONFIG: Record<TimeGranularity, GranularityConfig> = {
    Minute: { windowMs: 60_000,         bucketMs: 0,          seedMinutes: 1       },
    Hour:   { windowMs: 3_600_000,      bucketMs: 30_000,     seedMinutes: 61      },
    Day:    { windowMs: 86_400_000,     bucketMs: 300_000,    seedMinutes: 1440    },
    Month:  { windowMs: 2_592_000_000,  bucketMs: 3_600_000,  seedMinutes: 43_200  },
    Year:   { windowMs: 31_536_000_000, bucketMs: 86_400_000, seedMinutes: 525_600 },
};

// API hard limit for the /telemetry/timeline endpoint (matches backend le=525_600)
const TIMELINE_API_MAX_MINUTES = 525_600;

// Live ring buffer covers exactly this window — always small regardless of granularity.
const LIVE_TAIL_MS = 300_000; // 5 min

const MAX_CONSECUTIVE_ERRORS = 4;
const RIGHT_PAD_RATIO        = 0.2;

/** Remove readings older than `cutoffMs`. Assumes array is chronologically sorted. */
export function pruneBuffer<T extends { timestamp: number }>(buf: T[], cutoffMs: number): T[] {
    if (buf.length === 0) return buf;
    let lo = 0, hi = buf.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (buf[mid].timestamp < cutoffMs) lo = mid + 1; else hi = mid;
    }
    return lo === 0 ? buf : buf.slice(lo);
}

// ─── DISCOVERY CACHE (backend) ───────────────────────────────────────────────
// Node/energy mappings are persisted server-side on the Connector record so they
// survive across machines, browsers, and incognito sessions.

function persistMappings(connectorId: string, mappings: NodeMapping[], energyMappings: EnergyNodeMapping[]): void {
    // Fire-and-forget — local state is already set; backend is the durable copy.
    saveNodeMappings(connectorId, mappings, energyMappings).catch(() => { /* non-fatal */ });
}

function clearPersistedMappings(connectorId: string): void {
    saveNodeMappings(connectorId, [], []).catch(() => { /* non-fatal */ });
}

// ─── NORMALIZATION ────────────────────────────────────────────────────────────

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
            rawTemperature:   avgNullable(group.map((r) => r.rawTemperature)),
            rawVibration:     avgNullable(group.map((r) => r.rawVibration)),
            rawPressure:      avgNullable(group.map((r) => r.rawPressure)),
            rawHumidity:      avgNullable(group.map((r) => r.rawHumidity)),
            anomaly:          group.some((r) => r.anomaly),
            alertLevel:       group.reduce<SensorReading['alertLevel']>(
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

export function deriveEnergy(s: SensorReading): EnergyReading {
    const powerDraw   = Math.round((100 + s.pressure * 5 + s.humidity * 2 + s.temperature * 0.5) * 10) / 10;
    const coolingLoad = Math.round(powerDraw * 0.35 * 10) / 10;
    const efficiency  = Math.round(Math.max(60, 100 - s.vibration * 0.4) * 10) / 10;
    const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;
    return { timestamp: s.timestamp, powerDraw, coolingLoad, efficiency, costPerHour };
}

export function deriveProduct(s: SensorReading): ProductMetric {
    const pressurePenalty = Math.max(0, (50 - s.pressure) * 0.3);
    const humidityPenalty = Math.max(0, (s.humidity - 60) * 0.2);
    const uptime = Math.round(Math.max(60, 100 - pressurePenalty - humidityPenalty) * 10) / 10;
    const output = Math.round(1200 * (uptime / 100));
    return { timestamp: s.timestamp, output, target: 1200, uptime };
}

// ─── SEED HELPERS ─────────────────────────────────────────────────────────────

type ApiTimelinePoint = Awaited<ReturnType<typeof getTelemetryTimeline>>[number];

function apiPointToReading(p: ApiTimelinePoint): SensorReading {
    const rT = p.rawTemperature ?? p.temperature;
    const rV = p.rawVibration   ?? p.vibration;
    const rP = p.rawPressure    ?? p.pressure;
    const rH = p.rawHumidity    ?? p.humidity;
    return {
        timestamp:      p.timestamp,
        temperature:    rT,
        vibration:      rV,
        pressure:       rP,
        humidity:       rH,
        rawTemperature: rT,
        rawVibration:   rV,
        rawPressure:    rP,
        rawHumidity:    rH,
        anomaly:        false,
        alertLevel:     'none' as const,
    };
}

/**
 * Convert generic signal timeline points to EnergyReading[] using the
 * energy node mappings to identify which signal_id maps to which field.
 */
function signalPointsToEnergyReadings(
    points: TelemetrySignalPoint[],
    energyMappings: EnergyNodeMapping[],
): EnergyReading[] {
    return points.map((p) => {
        let powerDraw   = 0;
        let coolingLoad = 0;
        let efficiency  = 90;

        for (const em of energyMappings) {
            if (!em.signalId) continue;
            // Use raw value when available (raw_ prefix), else use normalised
            const raw = p[`raw_${em.signalId}`] ?? p[em.signalId];
            if (raw == null || !isFinite(raw)) continue;
            const scaled = raw * em.scaleFactor;
            if (em.field === 'powerDraw')   powerDraw   = scaled;
            if (em.field === 'coolingLoad') coolingLoad = scaled;
            if (em.field === 'efficiency')  efficiency  = Math.min(100, Math.max(0, scaled));
        }

        return {
            timestamp:   p.timestamp,
            powerDraw:   Math.round(powerDraw   * 10) / 10,
            coolingLoad: coolingLoad > 0 ? Math.round(coolingLoad * 10) / 10 : Math.round(powerDraw * 0.35 * 10) / 10,
            efficiency:  Math.round(efficiency  * 10) / 10,
            costPerHour: Math.round(powerDraw * 0.45 * 100) / 100,
        };
    });
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

    // ── Two-tier data model ───────────────────────────────────────────────────
    //
    // historicalData — fetched from /telemetry/timeline on connect and granularity change.
    //   Pre-bucketed by the backend using the connector's actual signal_ids.
    //
    // liveBuffer — append-only ring buffer capped at LIVE_TAIL_MS (5 min).
    //   Populated by the 2s OPC UA polling loop.
    //
    // historicalEnergyData — fetched from /telemetry/timeline/signals using the
    //   connector's energy node signal_ids. Replaces deriveEnergy() for historical
    //   timeframes when real energy nodes are present.
    //
    // energyBuffer — live OPC UA energy readings (5 min ring buffer).
    const [historicalData,       setHistoricalData]       = useState<SensorReading[]>([]);
    const [liveBuffer,           setLiveBuffer]           = useState<SensorReading[]>([]);
    const [historicalEnergyData, setHistoricalEnergyData] = useState<EnergyReading[]>([]);
    const [energyBuffer,         setEnergyBuffer]         = useState<EnergyReading[]>([]);

    const nodeIdsRef           = useRef<string[]>([]);
    const energyMappingsRef    = useRef<EnergyNodeMapping[]>([]);
    const signalIdsRef         = useRef<string[]>([]);  // sensor signal_ids in FIELD_MAP order
    const connectedRef         = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const prevRawRef           = useRef<Partial<Record<MappedField, number>>>({});
    const prevEnergyRef        = useRef<Partial<Record<EnergyNodeMapping['field'], number>>>({});
    const historicalRef        = useRef<SensorReading[]>([]);
    const liveRef              = useRef<SensorReading[]>([]);
    const energyBufferRef      = useRef<EnergyReading[]>([]);
    // Track the last granularity we seeded to skip redundant re-fetches.
    // Set by init() after its own seed, and by the re-seed effect.
    const lastSeedGranRef      = useRef<TimeGranularity | null>(null);

    useEffect(() => { historicalRef.current    = historicalData;       }, [historicalData]);
    useEffect(() => { liveRef.current          = liveBuffer;           }, [liveBuffer]);
    useEffect(() => { energyBufferRef.current  = energyBuffer;         }, [energyBuffer]);

    // ── Discovery ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!connectorId) {
            setStatus('idle');
            setNodeMappings([]);
            setHistoricalData([]);
            setLiveBuffer([]);
            setHistoricalEnergyData([]);
            setEnergyBuffer([]);
            nodeIdsRef.current = [];
            signalIdsRef.current = [];
            energyMappingsRef.current = [];
            connectedRef.current = false;
            lastSeedGranRef.current = null;
            return;
        }

        setStatus('discovering');
        setErrorDetail(null);
        setNodeMappings([]);
        setSignalMeta([]);
        setHistoricalData([]);
        setLiveBuffer([]);
        setHistoricalEnergyData([]);
        setEnergyBuffer([]);
        connectedRef.current = false;
        consecutiveErrorsRef.current = 0;
        prevRawRef.current = {};
        prevEnergyRef.current = {};
        lastSeedGranRef.current = null;
        let cancelled = false;

        async function init() {
            // ── Sensor node mapping ───────────────────────────────────────────
            // Load from backend first — avoids re-discovery on new sessions/machines.
            let cached: NodeMapping[] | null = null;
            let cachedEnergy: EnergyNodeMapping[] | null = null;
            try {
                const connector = await getConnector(connectorId!);
                if (cancelled) return;
                cached       = (connector.node_mappings   as NodeMapping[]   | null) ?? null;
                cachedEnergy = (connector.energy_mappings as EnergyNodeMapping[] | null) ?? null;
            } catch { /* non-fatal — fall through to fresh discovery */ }

            if (cached && cached.length > 0) {
                nodeIdsRef.current   = cached.map((m) => m.nodeId);
                signalIdsRef.current = cached.map((m) => m.signalId ?? '').filter(Boolean);
                setNodeMappings(cached);
                console.log('[Connector] Using persisted sensor mappings for', connectorId);

                if (cachedEnergy && cachedEnergy.length > 0) {
                    energyMappingsRef.current = cachedEnergy;
                }
            } else {
                try {
                    const discovery = await discoverConnector(connectorId!);
                    if (cancelled) return;

                    const numericNodes = discovery.nodes.filter(
                        (n) => NUMERIC_DATA_TYPES.has(n.data_type) || n.data_type === 'Unknown',
                    );

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

                    const pool       = nonEnergyNodes.length > 0 ? (scored.length >= 4 ? scored : nonEnergyNodes) : discovery.nodes;
                    const candidates = pool.slice(0, 4);
                    nodeIdsRef.current = candidates.map((n) => n.node_id);

                    // Resolve signal_ids for discovered nodes via the backend node-map
                    let nodeMapData: Record<string, { signal_id: string; display_name: string; unit: string }> = {};
                    try {
                        nodeMapData = await getNodeMap(connectorId!);
                    } catch {
                        // Non-fatal — signal_ids will be null, falls back to default TIMELINE_FIELD_MAP
                    }
                    if (cancelled) return;

                    const mappings: NodeMapping[] = candidates.map((n, i) => ({
                        field:       FIELD_MAP[i],
                        displayName: n.display_name,
                        nodeId:      n.node_id,
                        dataType:    n.data_type,
                        signalId:    nodeMapData[n.node_id]?.signal_id ?? null,
                    }));
                    signalIdsRef.current = mappings.map((m) => m.signalId ?? '').filter(Boolean);
                    setNodeMappings(mappings);

                    // ── Energy nodes ──────────────────────────────────────────
                    const energyNodes = numericNodes.filter(
                        (n) => n.path.some((p) => /^energy$/i.test(p)),
                    );
                    const energyMappings: EnergyNodeMapping[] = [];
                    for (const n of energyNodes) {
                        const key  = n.display_name.toLowerCase().replace(/[^a-z]/g, '');
                        const spec = ENERGY_DISPLAY_TO_FIELD[key];
                        if (spec && !energyMappings.some((m) => m.field === spec.field)) {
                            energyMappings.push({
                                field:       spec.field,
                                displayName: n.display_name,
                                nodeId:      n.node_id,
                                scaleFactor: spec.scaleFactor,
                                signalId:    nodeMapData[n.node_id]?.signal_id ?? null,
                            });
                        }
                    }
                    energyMappingsRef.current = energyMappings;

                    // Persist to backend (fire-and-forget)
                    persistMappings(connectorId!, mappings, energyMappings);

                    if (energyMappings.length > 0) {
                        console.log('[Connector] Energy nodes discovered:',
                            energyMappings.map((m) => `${m.field}=${m.nodeId}(${m.signalId})`));
                    }

                    console.log('[Connector] Discovery complete →', {
                        total:    discovery.nodes.length,
                        numeric:  numericNodes.length,
                        selected: mappings.map((m) => `${m.field}=${m.nodeId}(sig:${m.signalId})`),
                    });
                } catch (err) {
                    if (cancelled) return;
                    const httpStatus = err instanceof ApiError ? err.status : null;
                    if (httpStatus === 404) clearPersistedMappings(connectorId!);
                    const detail = err instanceof ApiError
                        ? `HTTP ${err.status}: ${err.message}`
                        : (err instanceof Error ? err.message : String(err));
                    setErrorDetail(detail);
                    setStatus(httpStatus === 404 ? 'not_found' : 'error');
                    return;
                }

                if (nodeIdsRef.current.length === 0) {
                    setErrorDetail('No readable nodes found on this connector.');
                    setStatus('error');
                    return;
                }
            }

            // ── Signal metadata labels ────────────────────────────────────────
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
            } catch { /* non-fatal */ }

            // ── Seed prevRaw from a single live batch read ─────────────────────
            try {
                const allNodeIds = [
                    ...nodeIdsRef.current,
                    ...energyMappingsRef.current.map((m) => m.nodeId),
                ];
                const batch = await readConnectorBatch(connectorId!, allNodeIds);
                if (cancelled) return;
                for (const item of batch.results) {
                    const sensorIdx = nodeIdsRef.current.indexOf(item.node_id);
                    if (sensorIdx >= 0) {
                        const field = FIELD_MAP[sensorIdx];
                        if (!field || item.error) continue;
                        const val = extractNumeric(item.value);
                        if (val !== null) prevRawRef.current[field] = val;
                    }
                    const energyMapping = energyMappingsRef.current.find((m) => m.nodeId === item.node_id);
                    if (energyMapping && !item.error) {
                        const val = extractNumeric(item.value);
                        if (val !== null) prevEnergyRef.current[energyMapping.field] = val * energyMapping.scaleFactor;
                    }
                }
            } catch (err) {
                if (err instanceof ApiError && err.status === 404) {
                    clearCachedMappings(connectorId!);
                    setStatus('not_found');
                    setErrorDetail(`HTTP 404: ${err.message}`);
                    return;
                }
            }

            if (cancelled) return;

            // ── Seed historical tier ───────────────────────────────────────────
            await _seedHistorical(
                connectorId!, granularity,
                signalIdsRef.current, energyMappingsRef.current,
                cancelled, setHistoricalData, setHistoricalEnergyData,
            );
            if (cancelled) return;
            lastSeedGranRef.current = granularity;

            connectedRef.current = true;
            setStatus('connected');
        }

        init();
        return () => { cancelled = true; };
    }, [connectorId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Live polling — one batch request per 2s cycle ─────────────────────────
    useEffect(() => {
        if (!connectorId || status !== 'connected') return;

        const interval = setInterval(async () => {
            if (!connectedRef.current || nodeIdsRef.current.length === 0) return;

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
                console.warn(`[Connector] batch read failed (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS}): ${detail}`);
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
                if (item.error) continue;
                const val = extractNumeric(item.value);
                if (val === null) continue;

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
                    rawEnergy[energyMapping.field]              = scaled;
                    prevEnergyRef.current[energyMapping.field]  = scaled;
                    anySuccess = true;
                }
            }

            if (!anySuccess) return;
            consecutiveErrorsRef.current = 0;

            const now = Date.now();

            const rT = rawValues.temperature ?? prevRawRef.current.temperature ?? 0;
            const rV = rawValues.vibration   ?? prevRawRef.current.vibration   ?? 0;
            const rP = rawValues.pressure    ?? prevRawRef.current.pressure    ?? 0;
            const rH = rawValues.humidity    ?? prevRawRef.current.humidity    ?? 0;

            const reading: SensorReading = {
                timestamp:      now,
                temperature:    rT,
                vibration:      rV,
                pressure:       rP,
                humidity:       rH,
                rawTemperature: rT,
                rawVibration:   rV,
                rawPressure:    rP,
                rawHumidity:    rH,
                anomaly:        false,
                alertLevel:     'none',
            };

            setLiveBuffer((prev) => {
                const cutoff = now - LIVE_TAIL_MS;
                return [...pruneBuffer(prev, cutoff), reading];
            });

            // ── Live energy readings ───────────────────────────────────────────
            if (energyMappingsRef.current.length > 0) {
                const powerDraw   = rawEnergy.powerDraw   ?? prevEnergyRef.current.powerDraw   ?? 0;
                const coolingLoad = rawEnergy.coolingLoad ?? prevEnergyRef.current.coolingLoad ?? 0;
                const efficiency  = rawEnergy.efficiency  ?? prevEnergyRef.current.efficiency  ?? 0;

                setEnergyBuffer((prev) => {
                    const cutoff = now - LIVE_TAIL_MS;
                    return [...pruneBuffer(prev, cutoff), {
                        timestamp:   now,
                        powerDraw:   Math.round(powerDraw   * 10) / 10,
                        coolingLoad: Math.round(coolingLoad * 10) / 10,
                        efficiency:  Math.round(Math.min(100, Math.max(0, efficiency)) * 10) / 10,
                        costPerHour: Math.round(powerDraw * 0.45 * 100) / 100,
                    }];
                });
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [connectorId, status]);

    // ── Re-seed historical tier on granularity change ─────────────────────────
    //
    // Runs only when granularity changes — NOT when status changes.
    // connectedRef.current is checked inside the effect body (not as a dep)
    // to avoid triggering a re-run on every status transition.
    useEffect(() => {
        if (!connectorId || !connectedRef.current) return;
        if (granularity === lastSeedGranRef.current) return;

        lastSeedGranRef.current = granularity;

        (async () => {
            await _seedHistorical(
                connectorId, granularity,
                signalIdsRef.current, energyMappingsRef.current,
                false, setHistoricalData, setHistoricalEnergyData,
            );
        })();
    }, [connectorId, granularity]); // intentionally NO 'status' — avoids re-seed on every poll error/reconnect

    // ── Manual anomaly injection ──────────────────────────────────────────────
    const triggerAnomaly = useCallback(() => {
        if (!connectedRef.current) return;
        const prev = liveRef.current[liveRef.current.length - 1];
        const spike: SensorReading = {
            timestamp:      Date.now(),
            temperature:    (prev?.temperature ?? 50) * 1.5,
            vibration:      (prev?.vibration   ?? 50) * 1.8,
            pressure:       (prev?.pressure    ?? 50) * 0.6,
            humidity:       prev?.humidity ?? 50,
            rawTemperature: null,
            rawVibration:   null,
            rawPressure:    null,
            rawHumidity:    null,
            anomaly:        true,
            alertLevel:     'critical',
        };
        setLiveBuffer((prev) => [...prev, spike]);
    }, []);

    // ── Aggregation + X-axis domain ───────────────────────────────────────────
    const { windowMs, bucketMs } = GRANULARITY_CONFIG[granularity];
    const hasEnergyNodes = energyMappingsRef.current.length > 0;

    const { xDomain, visibleSensor, energyData, productData } = useMemo(() => {
        const now        = Date.now();
        const domainLeft = now - windowMs;

        const hist = historicalData.filter((r) => r.timestamp >= domainLeft);

        const liveBucketed = aggregateToBuckets(liveBuffer, bucketMs, domainLeft);

        // Normalization reference: historical only (prevents live spikes shifting scale)
        const normSource = hist.length >= 2 ? hist : liveBucketed;
        const normRanges = FIELD_MAP.map(f => {
            const vals = normSource.map(r => r[f] as number).filter(isFinite);
            if (vals.length < 2) return { min: 0, spread: 1 };
            const min = Math.min(...vals);
            const spread = Math.max(Math.max(...vals) - min, 0.001);
            return { min, spread };
        });

        const applyNorm = (readings: SensorReading[]): SensorReading[] =>
            readings.map(r => {
                const updates: Partial<SensorReading> = {};
                FIELD_MAP.forEach((f, i) => {
                    const { min, spread } = normRanges[i];
                    const raw = r[f] as number;
                    updates[f] = isFinite(raw)
                        ? Math.round(Math.min(100, Math.max(0, (raw - min) / spread * 100)) * 100) / 100
                        : 50;
                });
                return { ...r, ...updates };
            });

        // Merge: live tail overrides rightmost historical buckets
        let merged: SensorReading[];
        if (bucketMs > 0 && liveBucketed.length > 0) {
            const liveBucketFloor = Math.floor(liveBucketed[0].timestamp / bucketMs) * bucketMs;
            merged = [
                ...applyNorm(hist.filter(r => r.timestamp < liveBucketFloor)),
                ...applyNorm(liveBucketed),
            ];
        } else {
            const liveCutoff = now - LIVE_TAIL_MS;
            merged = [
                ...applyNorm(hist.filter(r => r.timestamp < liveCutoff)),
                ...applyNorm(liveBuffer.filter(r => r.timestamp >= domainLeft)),
            ];
        }

        // ── Energy: real OPC UA nodes (historical + live) or derived ──────────
        //
        // When energy nodes exist, use:
        //   - historicalEnergyData for the pre-backfill range (all granularities)
        //   - energyBuffer for the live 5-min tail
        // Only fall back to deriveEnergy() when no energy nodes were discovered.
        let energy: EnergyReading[];
        if (hasEnergyNodes) {
            const histEnergy = historicalEnergyData.filter((r) => r.timestamp >= domainLeft);
            const liveEnergy = aggregateEnergyBuckets(energyBuffer, bucketMs, domainLeft);

            if (bucketMs > 0 && liveEnergy.length > 0) {
                const liveBucketFloor = Math.floor(liveEnergy[0].timestamp / bucketMs) * bucketMs;
                energy = [
                    ...histEnergy.filter(r => r.timestamp < liveBucketFloor),
                    ...liveEnergy,
                ];
            } else {
                const liveCutoff = now - LIVE_TAIL_MS;
                energy = [
                    ...histEnergy.filter(r => r.timestamp < liveCutoff),
                    ...energyBuffer.filter(r => r.timestamp >= domainLeft),
                ];
            }
        } else {
            // Fallback: derive energy from normalized sensor data
            energy = merged.map(deriveEnergy);
        }

        const visibleSpan  = Math.max(windowMs, bucketMs > 0 ? bucketMs : 5_000);
        const domainRight  = now + Math.round(visibleSpan * RIGHT_PAD_RATIO);

        return {
            xDomain:       [domainLeft, domainRight] as [number, number],
            visibleSensor: merged,
            energyData:    energy,
            productData:   merged.map(deriveProduct),
        };
    }, [historicalData, historicalEnergyData, liveBuffer, energyBuffer, windowMs, bucketMs, hasEnergyNodes]);

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

// ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

async function _seedHistorical(
    connectorId: string,
    granularity: TimeGranularity,
    signalIds: string[],
    energyMappings: EnergyNodeMapping[],
    cancelled: boolean,
    setHistoricalData: (d: SensorReading[]) => void,
    setHistoricalEnergyData: (d: EnergyReading[]) => void,
): Promise<void> {
    const { seedMinutes } = GRANULARITY_CONFIG[granularity];
    const needed = Math.min(seedMinutes, TIMELINE_API_MAX_MINUTES);

    // ── Sensor historical ──────────────────────────────────────────────────
    try {
        // Pass the connector's signal_ids so the backend uses the correct signals
        // for each chart slot (not the hardcoded TIMELINE_FIELD_MAP fallback).
        const idsToRequest = signalIds.length >= 4 ? signalIds.slice(0, 4) : undefined;
        const history = await getTelemetryTimeline(needed, idsToRequest);
        if (cancelled || !history.length) return;
        const seeded = history.map(apiPointToReading);
        setHistoricalData(seeded);
        console.log('[Connector] Seeded sensor buffer:', seeded.length, 'readings,', granularity, 'view,',
            idsToRequest ? `signals: ${idsToRequest.join(',')}` : 'default signals');
    } catch (err) {
        console.warn('[Connector] Sensor seed failed (non-fatal):', err);
    }

    if (cancelled) return;

    // ── Energy historical — only when real energy nodes are known ──────────
    const energySignalIds = energyMappings
        .filter((m) => m.signalId)
        .map((m) => m.signalId!);

    if (energySignalIds.length === 0) return;

    try {
        const energyPoints = await getTelemetrySignals(energySignalIds, needed);
        if (cancelled || !energyPoints.length) return;
        const seeded = signalPointsToEnergyReadings(energyPoints, energyMappings);
        setHistoricalEnergyData(seeded);
        console.log('[Connector] Seeded energy buffer:', seeded.length, 'readings,', granularity, 'view');
    } catch (err) {
        console.warn('[Connector] Energy seed failed (non-fatal):', err);
    }
}
