import { useEffect, useRef, type RefObject } from 'react';
import { discoverConnector, readConnectorNode } from '@/lib/services/connector.service';
import type { SensorReading } from '@/lib/types/timeline';
import type { OpcUaReadValue } from '@/lib/types/connector';

// ─── FIELD MAPPING ────────────────────────────────────────────────────────────
// Discovered nodes are mapped to SensorReading fields by position.
// The OPC-UA server's first 4 nodes are treated as: temperature, vibration, pressure, humidity.
// This is intentionally flexible — the exact values don't matter for the initial integration.
const FIELD_MAP = ['temperature', 'vibration', 'pressure', 'humidity'] as const;
type MappedField = (typeof FIELD_MAP)[number];

const FIELD_DEFAULTS: Record<MappedField, number> = {
  temperature: 28,
  vibration: 3.0,
  pressure: 6.5,
  humidity: 52,
};

const POLL_INTERVAL_MS = 2000;

// ─── VALUE EXTRACTION ────────────────────────────────────────────────────────
// OPC-UA read response wraps the actual value in `data.value`.
// We handle all shapes gracefully.
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
 * Polls a backend connector and maps the first 4 discovered nodes to
 * SensorReading fields (temperature, vibration, pressure, humidity).
 *
 * Returns a ref (not state) so the streaming interval in useMultiLayerData
 * can consume the latest reading without triggering extra re-renders.
 *
 * - If connectorId is undefined, the ref stays null (no-op: mock mode).
 * - If the connector is unreachable on a tick, the previous value is kept.
 * - If discovery fails, the hook silently stays in mock mode.
 */
export function useConnectorSensor(
  connectorId: string | undefined,
): RefObject<SensorReading | null> {
  const latestRef = useRef<SensorReading | null>(null);
  const nodeIdsRef = useRef<string[]>([]);
  const readyRef = useRef(false);

  // Step 1: Discover nodes once on mount
  useEffect(() => {
    if (!connectorId) return;
    let cancelled = false;

    discoverConnector(connectorId)
      .then((res) => {
        if (cancelled) return;
        nodeIdsRef.current = res.nodes.slice(0, 4).map((n) => n.node_id);
        readyRef.current = true;
      })
      .catch((err) => {
        console.warn(`[ConnectorSensor] discover failed for "${connectorId}":`, err);
      });

    return () => {
      cancelled = true;
    };
  }, [connectorId]);

  // Step 2: Poll nodes at the same cadence as the timeline streaming interval
  useEffect(() => {
    if (!connectorId) return;

    const interval = setInterval(async () => {
      if (!readyRef.current || nodeIdsRef.current.length === 0) return;

      const prev = latestRef.current;
      const values: Partial<Record<MappedField, number>> = {};

      await Promise.allSettled(
        nodeIdsRef.current.map(async (nodeId, i) => {
          const field = FIELD_MAP[i];
          if (!field) return;
          try {
            const res = await readConnectorNode(connectorId, nodeId);
            const fallback =
              (prev?.[field] as number | undefined) ?? FIELD_DEFAULTS[field];
            values[field] = extractNumeric(res.data, fallback);
          } catch {
            // Keep previous value — connector may be temporarily unreachable
          }
        }),
      );

      const temperature =
        values.temperature ?? prev?.temperature ?? FIELD_DEFAULTS.temperature;
      const vibration =
        values.vibration ?? prev?.vibration ?? FIELD_DEFAULTS.vibration;
      const pressure =
        values.pressure ?? prev?.pressure ?? FIELD_DEFAULTS.pressure;
      const humidity =
        values.humidity ?? prev?.humidity ?? FIELD_DEFAULTS.humidity;

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
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connectorId]);

  return latestRef;
}
