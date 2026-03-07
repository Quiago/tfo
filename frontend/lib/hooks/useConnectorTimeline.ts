'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoverConnector, readConnectorNode } from '@/lib/services/connector.service';
import { ApiError } from '@/lib/services/backend';
import type {
    ActionEvent,
    EnergyReading,
    ProductMetric,
    SensorReading,
    TimeGranularity,
} from '@/lib/types/timeline';
import type { OpcUaReadValue } from '@/lib/types/connector';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ConnectorStatus =
    | 'idle'
    | 'discovering'
    | 'connected'
    | 'not_found'
    | 'error';

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

// Granularity → how many recent readings to display
const GRANULARITY_WINDOW: Record<TimeGranularity, number> = {
    Minute: 30,    // ~60s
    Hour: 90,      // ~3 min
    Day: 150,      // ~5 min
    Week: 225,     // ~7.5 min
    Year: 300,     // full buffer
};

const MAX_CONSECUTIVE_ERRORS = 4;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractNumeric(data: unknown, fallback: number): number {
    if (typeof data === 'number' && isFinite(data)) return data;
    if (typeof data === 'string') {
        const n = parseFloat(data);
        if (!isNaN(n) && isFinite(n)) return n;
    }
    if (typeof data === 'object' && data !== null) {
        const v = (data as OpcUaReadValue).value;
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'string') {
            const n = parseFloat(v);
            if (!isNaN(n) && isFinite(n)) return n;
        }
    }
    return fallback;
}

/**
 * Deterministic energy derivation from real sensor readings.
 * No PRNG — same sensor input always produces same energy output.
 */
function deriveEnergy(s: SensorReading): EnergyReading {
    const powerDraw = Math.round((50 + s.temperature * 1.5 + s.vibration * 8) * 10) / 10;
    const coolingLoad = Math.round(powerDraw * 0.3 * 10) / 10;
    const efficiency = Math.round(Math.max(60, 100 - Math.max(0, s.vibration - 3) * 5) * 10) / 10;
    const costPerHour = Math.round(powerDraw * 0.45 * 100) / 100;
    return { timestamp: s.timestamp, powerDraw, coolingLoad, efficiency, costPerHour };
}

/**
 * Deterministic product metric derivation from real sensor readings.
 * No PRNG — values are fully determined by sensor inputs.
 */
function deriveProduct(s: SensorReading): ProductMetric {
    const uptime = Math.round(Math.max(60, 100 - Math.max(0, s.vibration - 3) * 5) * 10) / 10;
    const output = Math.round(1200 * (uptime / 100));
    return { timestamp: s.timestamp, output, target: 1200, uptime };
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

/**
 * Real-data-only timeline hook. ZERO mock/PRNG data.
 *
 * - Discovers connector nodes on mount
 * - Polls live values every 2s and appends to an accumulating buffer
 * - Changing granularity only changes the visible window — never regenerates data
 * - Console.logs every read so you can verify real values in the browser console
 * - Returns empty arrays until status === 'connected'
 */
export function useConnectorTimeline(connectorId: string | undefined, granularity: TimeGranularity) {
    const [status, setStatus] = useState<ConnectorStatus>(connectorId ? 'discovering' : 'idle');
    const [nodeMappings, setNodeMappings] = useState<NodeMapping[]>([]);
    const [sensorBuffer, setSensorBuffer] = useState<SensorReading[]>([]);

    const nodeIdsRef = useRef<string[]>([]);
    const connectedRef = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const prevValuesRef = useRef<Partial<Record<MappedField, number>>>({});

    // ── Discovery + initial read ───────────────────────────────────────────
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
        prevValuesRef.current = {};
        let cancelled = false;

        async function init() {
            // Step 1: discover nodes
            try {
                const discovery = await discoverConnector(connectorId!);
                if (cancelled) return;

                const topNodes = discovery.nodes.slice(0, 4);
                nodeIdsRef.current = topNodes.map((n) => n.node_id);

                setNodeMappings(
                    topNodes.map((n, i) => ({
                        field: FIELD_MAP[i],
                        displayName: n.display_name,
                        nodeId: n.node_id,
                        dataType: n.data_type,
                    })),
                );

                console.log('[Connector] Discovery complete:', {
                    connector: connectorId,
                    mappings: topNodes.map((n, i) => ({
                        field: FIELD_MAP[i],
                        nodeId: n.node_id,
                        displayName: n.display_name,
                        dataType: n.data_type,
                    })),
                });
            } catch (err: unknown) {
                if (cancelled) return;
                const httpStatus = err instanceof ApiError ? err.status : null;
                console.error('[Connector] Discovery failed:', err);
                setStatus(httpStatus === 404 ? 'not_found' : 'error');
                return;
            }

            // Step 2: read initial values
            const initial: Partial<Record<MappedField, number>> = {};
            await Promise.allSettled(
                nodeIdsRef.current.map(async (nodeId, i) => {
                    const field = FIELD_MAP[i];
                    if (!field) return;
                    try {
                        const res = await readConnectorNode(connectorId!, nodeId);
                        const val = extractNumeric(res.data, FIELD_DEFAULTS[field]);
                        initial[field] = val;
                        console.log(`[Connector] Initial read — ${field} (${nodeId}):`, val, '| raw:', res.data);
                    } catch (e) {
                        console.warn(`[Connector] Initial read failed — ${field} (${nodeId}):`, e);
                    }
                }),
            );

            if (cancelled) return;

            prevValuesRef.current = initial;
            connectedRef.current = true;
            setStatus('connected');
        }

        init();
        return () => { cancelled = true; };
    }, [connectorId]);

    // ── Live polling ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!connectorId || status !== 'connected') return;

        const interval = setInterval(async () => {
            if (!connectedRef.current || nodeIdsRef.current.length === 0) return;

            const values: Partial<Record<MappedField, number>> = {};

            const results = await Promise.allSettled(
                nodeIdsRef.current.map(async (nodeId, i) => {
                    const field = FIELD_MAP[i];
                    if (!field) return;
                    const res = await readConnectorNode(connectorId, nodeId);
                    const fallback = prevValuesRef.current[field] ?? FIELD_DEFAULTS[field];
                    values[field] = extractNumeric(res.data, fallback);
                }),
            );

            const anySuccess = results.some((r) => r.status === 'fulfilled');

            if (!anySuccess) {
                consecutiveErrorsRef.current += 1;
                console.warn(
                    `[Connector] All reads failed (${consecutiveErrorsRef.current}/${MAX_CONSECUTIVE_ERRORS})`,
                );
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setStatus('error');
                    clearInterval(interval);
                }
                return;
            }

            consecutiveErrorsRef.current = 0;

            const temperature = values.temperature ?? prevValuesRef.current.temperature ?? FIELD_DEFAULTS.temperature;
            const vibration = values.vibration ?? prevValuesRef.current.vibration ?? FIELD_DEFAULTS.vibration;
            const pressure = values.pressure ?? prevValuesRef.current.pressure ?? FIELD_DEFAULTS.pressure;
            const humidity = values.humidity ?? prevValuesRef.current.humidity ?? FIELD_DEFAULTS.humidity;

            prevValuesRef.current = { temperature, vibration, pressure, humidity };

            const anomaly = vibration > 12 || temperature > 50;
            const alertLevel: SensorReading['alertLevel'] =
                vibration > 12 || temperature > 50 ? 'critical' : vibration > 8 ? 'warning' : 'none';

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
                temperature: `${temperature}°C`,
                vibration: `${vibration} mm/s`,
                pressure: `${pressure} bar`,
                humidity: `${humidity}%`,
                rawFromServer: values,
            });

            setSensorBuffer((prev) => [...prev.slice(-(MAX_BUFFER - 1)), reading]);
        }, 2000);

        return () => clearInterval(interval);
    }, [connectorId, status]);

    // ── Anomaly injection (TEST ANOMALY button) ────────────────────────────
    const triggerAnomaly = useCallback(() => {
        if (!connectedRef.current) return;
        const prev = prevValuesRef.current;
        const spike: SensorReading = {
            timestamp: Date.now(),
            temperature: (prev.temperature ?? 28) + 25,
            vibration: (prev.vibration ?? 3) + 14,
            pressure: Math.max(1, (prev.pressure ?? 6.5) - 2.5),
            humidity: prev.humidity ?? 52,
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
        // No forecast: predictionStart = end of data (all points are historical)
        predictionStart: isLive ? visibleSensor.length : 0,
        forecastBoundaryTimestamp: isLive ? (timestamps[timestamps.length - 1] ?? Date.now()) : Date.now(),
        isStreaming: isLive,
        triggerAnomaly,
        connectorStatus: status,
        nodeMappings,
    };
}
