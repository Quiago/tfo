import { apiFetch } from './backend';

export interface LatestReading {
  signal_id: string;
  display_name: string;
  value: number;
  unit: string;
  recorded_at: string;
}

export interface TimeSeriesPoint {
  ts: number;   // epoch ms
  value: number;
}

export interface SignalHistory {
  signal_id: string;
  display_name: string;
  unit: string;
  series: TimeSeriesPoint[];
}

export interface SignalStats {
  signal_id: string;
  display_name: string;
  unit: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  last: number;
}

/** 4-channel reading for the timeline chart. */
export interface TelemetryTimelinePoint {
  timestamp: number;   // epoch ms
  // Normalized 0–100 (for chart Y-axis)
  temperature: number;
  vibration: number;
  pressure: number;
  humidity: number;
  // Raw engineering-unit values (for tooltip display, null if no DB data yet)
  rawTemperature?: number | null;
  rawVibration?: number | null;
  rawPressure?: number | null;
  rawHumidity?: number | null;
}

/** Metadata for one of the 4 frontend chart channels. */
export interface ChannelMeta {
  field: string;        // 'temperature' | 'vibration' | 'pressure' | 'humidity'
  signal_id: string;
  display_name: string;
  unit: string;
}

/** OPC UA node → signal metadata entry returned by /telemetry/node-map. */
export interface NodeMapEntry {
  signal_id: string;
  display_name: string;
  unit: string;
}

/** Generic downsampled timeline point keyed by signal_id. */
export type TelemetrySignalPoint = { timestamp: number } & Record<string, number>;

export async function getLatestReadings(signalIds?: string[]): Promise<LatestReading[]> {
  const qs = signalIds?.length ? `?signal_ids=${signalIds.join(',')}` : '';
  return apiFetch<LatestReading[]>(`/telemetry/readings/latest${qs}`);
}

export async function getSignalHistory(
  signalIds: string[],
  minutes = 60,
): Promise<SignalHistory[]> {
  const qs = new URLSearchParams({
    signal_ids: signalIds.join(','),
    minutes: String(minutes),
  });
  return apiFetch<SignalHistory[]>(`/telemetry/readings/history?${qs}`);
}

export async function getSignalStats(
  signalIds: string[],
  minutes = 60,
): Promise<SignalStats[]> {
  const qs = new URLSearchParams({
    signal_ids: signalIds.join(','),
    minutes: String(minutes),
  });
  return apiFetch<SignalStats[]>(`/telemetry/readings/stats?${qs}`);
}

/**
 * Fetch pre-computed 4-channel timeline data to seed the frontend chart buffer.
 *
 * When signalIds is provided (up to 4 items), those DB signals are mapped to the
 * temperature / vibration / pressure / humidity slots so the historical data
 * matches the connector's live polling channels.
 */
export async function getTelemetryTimeline(
  minutes = 10,
  signalIds?: string[],
): Promise<TelemetryTimelinePoint[]> {
  const params = new URLSearchParams({ minutes: String(minutes) });
  if (signalIds && signalIds.length > 0) {
    params.set('signal_ids', signalIds.join(','));
  }
  return apiFetch<TelemetryTimelinePoint[]>(`/telemetry/timeline?${params}`);
}

/**
 * Fetch downsampled time-series data for arbitrary signal IDs.
 * Returns one object per time bucket: { timestamp, <signal_id>: normalised, raw_<signal_id>: raw }
 * Used for energy channel history (total_power, aux_power, power_factor).
 */
export async function getTelemetrySignals(
  signalIds: string[],
  minutes = 10,
): Promise<TelemetrySignalPoint[]> {
  const params = new URLSearchParams({
    signal_ids: signalIds.join(','),
    minutes: String(minutes),
  });
  return apiFetch<TelemetrySignalPoint[]>(`/telemetry/timeline/signals?${params}`);
}

/**
 * Fetch the OPC UA node_id → signal metadata map for a connector.
 * Populated after the first TelemetryPoller discovery cycle.
 * Returns an empty object if discovery has not happened yet.
 */
export async function getNodeMap(connectorId: string): Promise<Record<string, NodeMapEntry>> {
  return apiFetch<Record<string, NodeMapEntry>>(
    `/telemetry/node-map?connector_id=${encodeURIComponent(connectorId)}`,
  );
}

/**
 * Fetch display names and units for the 4 chart channels from the backend.
 */
export async function getChannelMetadata(): Promise<ChannelMeta[]> {
  return apiFetch<ChannelMeta[]>('/telemetry/channels');
}
