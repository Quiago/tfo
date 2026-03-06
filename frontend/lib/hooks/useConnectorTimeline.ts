'use client';

import { useEffect, useRef, useState } from 'react';
import { discoverConnector, readConnectorNode } from '@/lib/services/connector.service';
import { ApiError } from '@/lib/services/backend';
import type { SensorReading, TimeGranularity } from '@/lib/types/timeline';
import type { OpcUaReadValue } from '@/lib/types/connector';
import { useMultiLayerData, type SensorSeed } from './useMultiLayerData';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ConnectorStatus =
    | 'idle'
    | 'discovering'
    | 'connected'
    | 'not_found'
    | 'error';

// ─── FIELD MAPPING ────────────────────────────────────────────────────────────
// First 4 discovered nodes mapped to sensor fields by position.

const FIELD_MAP = ['temperature', 'vibration', 'pressure', 'humidity'] as const;
type MappedField = (typeof FIELD_MAP)[number];

const FIELD_DEFAULTS: Record<MappedField, number> = {
    temperature: 28,
    vibration: 3.0,
    pressure: 6.5,
    humidity: 52,
};

// ─── VALUE EXTRACTION ─────────────────────────────────────────────────────────

function extractNumeric(data: unknown, fallback: number): number {
    if (typeof data === 'number') return data;
    if (typeof data === 'string') {
        const n = parseFloat(data);
        if (!isNaN(n)) return n;
    }
    if (typeof data === 'object' && data !== null) {
        const v = (data as OpcUaReadValue).value;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const n = parseFloat(v);
            if (!isNaN(n)) return n;
        }
    }
    return fallback;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

/**
 * Wraps `useMultiLayerData` with real connector data:
 * - Discovers nodes on mount
 * - Reads baseline values to seed historical data (no mock PRNG baselines)
 * - Polls live values every 2 s and injects them into the streaming window
 * - Returns the full useMultiLayerData result + `connectorStatus`
 *
 * When `connectorId` is undefined, behaves exactly like `useMultiLayerData` (mock mode).
 */
export function useConnectorTimeline(connectorId: string | undefined, granularity: TimeGranularity) {
    const [status, setStatus] = useState<ConnectorStatus>(connectorId ? 'discovering' : 'idle');
    const [initialSeed, setInitialSeed] = useState<SensorSeed | undefined>();
    const nodeIdsRef = useRef<string[]>([]);
    const latestRef = useRef<SensorReading | null>(null);
    const connectedRef = useRef(false);
    const consecutiveErrorsRef = useRef(0);
    const MAX_CONSECUTIVE_ERRORS = 4;

    // ── Step 1: discover + baseline read ──────────────────────────────────
    useEffect(() => {
        if (!connectorId) {
            setStatus('idle');
            setInitialSeed(undefined);
            return;
        }

        setStatus('discovering');
        setInitialSeed(undefined);
        connectedRef.current = false;
        consecutiveErrorsRef.current = 0;
        let cancelled = false;

        async function init() {
            // Discover nodes
            let nodeIds: string[];
            try {
                const discovery = await discoverConnector(connectorId!);
                nodeIds = discovery.nodes.slice(0, 4).map((n) => n.node_id);
            } catch (err: unknown) {
                if (cancelled) return;
                const httpStatus = err instanceof ApiError ? err.status : null;
                setStatus(httpStatus === 404 ? 'not_found' : 'error');
                return;
            }

            if (cancelled) return;
            nodeIdsRef.current = nodeIds;

            // Read current values to seed historical data
            const values: Partial<Record<MappedField, number>> = {};
            await Promise.allSettled(
                nodeIds.map(async (nodeId, i) => {
                    const field = FIELD_MAP[i];
                    if (!field) return;
                    try {
                        const res = await readConnectorNode(connectorId!, nodeId);
                        values[field] = extractNumeric(res.data, FIELD_DEFAULTS[field]);
                    } catch {
                        // Keep default for this field
                    }
                }),
            );

            if (cancelled) return;

            const seed: SensorSeed = {
                temperature: values.temperature ?? FIELD_DEFAULTS.temperature,
                vibration: values.vibration ?? FIELD_DEFAULTS.vibration,
                pressure: values.pressure ?? FIELD_DEFAULTS.pressure,
                humidity: values.humidity ?? FIELD_DEFAULTS.humidity,
            };

            // Seed the live ref with the baseline so the first tick has a real value
            latestRef.current = {
                timestamp: Date.now(),
                temperature: seed.temperature!,
                vibration: seed.vibration!,
                pressure: seed.pressure!,
                humidity: seed.humidity!,
                anomaly: (seed.vibration ?? 3) > 12 || (seed.temperature ?? 28) > 50,
                alertLevel:
                    (seed.vibration ?? 3) > 12 || (seed.temperature ?? 28) > 50
                        ? 'critical'
                        : (seed.vibration ?? 3) > 8
                            ? 'warning'
                            : 'none',
            };

            setInitialSeed(seed);
            connectedRef.current = true;
            setStatus('connected');
        }

        init();
        return () => { cancelled = true; };
    }, [connectorId]);

    // ── Step 2: live polling ───────────────────────────────────────────────
    useEffect(() => {
        if (!connectorId || !connectedRef.current) return;

        const interval = setInterval(async () => {
            if (!connectedRef.current || nodeIdsRef.current.length === 0) return;

            const prev = latestRef.current;
            const values: Partial<Record<MappedField, number>> = {};
            let anySuccess = false;

            const results = await Promise.allSettled(
                nodeIdsRef.current.map(async (nodeId, i) => {
                    const field = FIELD_MAP[i];
                    if (!field) return;
                    const fallback = (prev?.[field] as number | undefined) ?? FIELD_DEFAULTS[field];
                    const res = await readConnectorNode(connectorId, nodeId);
                    values[field] = extractNumeric(res.data, fallback);
                }),
            );

            anySuccess = results.some((r) => r.status === 'fulfilled');

            if (!anySuccess) {
                consecutiveErrorsRef.current += 1;
                if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
                    connectedRef.current = false;
                    setStatus('error');
                    clearInterval(interval);
                }
                return; // keep previous latestRef values, don't update
            }

            consecutiveErrorsRef.current = 0;

            const temperature = values.temperature ?? prev?.temperature ?? FIELD_DEFAULTS.temperature;
            const vibration = values.vibration ?? prev?.vibration ?? FIELD_DEFAULTS.vibration;
            const pressure = values.pressure ?? prev?.pressure ?? FIELD_DEFAULTS.pressure;
            const humidity = values.humidity ?? prev?.humidity ?? FIELD_DEFAULTS.humidity;

            latestRef.current = {
                timestamp: Date.now(),
                temperature,
                vibration,
                pressure,
                humidity,
                anomaly: vibration > 12 || temperature > 50,
                alertLevel:
                    vibration > 12 || temperature > 50
                        ? 'critical'
                        : vibration > 8
                            ? 'warning'
                            : 'none',
            };
        }, 2000);

        return () => clearInterval(interval);
        // Re-subscribe when connectorId or status changes to 'connected'
    }, [connectorId, status]);

    const data = useMultiLayerData(granularity, {
        sensorOverrideRef: latestRef,
        initialSeed,
    });

    // Never expose mock data — only return real data once the connector is live
    const isLive = connectorId !== undefined && status === 'connected';

    return {
        ...data,
        timestamps: isLive ? data.timestamps : [],
        sensorData: isLive ? data.sensorData : [],
        energyData: isLive ? data.energyData : [],
        productData: isLive ? data.productData : [],
        actionData: isLive ? data.actionData : [],
        connectorStatus: status,
    };
}
