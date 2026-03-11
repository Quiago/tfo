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
 * Fetch pre-computed timeline data to seed the frontend chart buffer.
 * Returns normalized (0–100) values + raw engineering-unit values
 * for the last `minutes` of stored telemetry.
 */
export async function getTelemetryTimeline(minutes = 10): Promise<TelemetryTimelinePoint[]> {
  return apiFetch<TelemetryTimelinePoint[]>(`/telemetry/timeline?minutes=${minutes}`);
}

/**
 * Fetch display names and units for the 4 chart channels from the backend.
 * Sourced from the latest DB readings (falls back to static catalogue).
 */
export async function getChannelMetadata(): Promise<ChannelMeta[]> {
  return apiFetch<ChannelMeta[]>('/telemetry/channels');
}
