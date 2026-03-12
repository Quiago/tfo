'use client';

import { useConnectorTimeline, type ConnectorStatus, type NodeMapping } from '@/lib/hooks/useConnectorTimeline';
import { useTimelineStore } from '@/lib/store/timeline-store';
import type { SignalMeta } from '@/lib/types/timeline';
import { ConnectorModal } from './ConnectorModal';
import type {
    ActionEvent,
    EnergyReading,
    LayerConfig,
    ProductMetric,
    SensorReading,
    TimeGranularity,
} from '@/lib/types/timeline';
import {
    Activity,
    AlertTriangle,
    Bot,
    CalendarRange,
    Camera,
    Clock,
    Maximize2,
    Minimize2,
    Package,
    Plug2,
    User,
    X,
    Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceArea,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useScreenContext, type DateRange } from '@/lib/store/screen-context-store';
import { ChartDefs } from './ChartDefs';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const COMMON_Y_AXIS_WIDTH = 80;

// Date-range selection visual tokens
const RANGE_FILL_SELECTING  = 'rgba(56,189,248,0.18)';
const RANGE_FILL_COMMITTED  = 'rgba(56,189,248,0.08)';
const RANGE_STROKE          = '#38bdf8';
const RANGE_STROKE_WIDTH    = 1.5;
const RANGE_DASH_COMMITTED  = '4 2';
const MIN_RANGE_MS          = 1_000; // smallest committable drag (1 s)
const ACTION_CATEGORIES = [
    'Compliance',
    'Inspection',
    'Preventive',
    'Optimization',
    'Alert',
    'Corrective',
] as const;

const categoryToY: Record<string, number> = {
    Compliance: 0,
    Inspection: 1,
    Preventive: 2,
    Optimization: 3,
    Alert: 4,
    Corrective: 5,
};

// ─── FORMAT UTILS ───────────────────────────────────────────────────────────
//
// X-axis label resolution matches the visible window so each tick is always
// meaningful at that zoom level:
//
//   Minute  (last  60 s)  → HH:MM:SS  — 2-5 s between data points
//   Hour    (last   1 h)  → HH:MM     — 30 s buckets; minutes are the natural unit
//   Day     (last  24 h)  → HH:MM     — 5 min buckets; show time-of-day, not date
//   Month   (last  30 d)  → MMM DD    — 1 h buckets; day-of-month is the right label
//   Year    (last 365 d)  → MMM 'YY   — 1 d buckets; month+year labels
function formatTimestamp(ts: number, granularity: TimeGranularity): string {
    const d = new Date(ts);
    switch (granularity) {
        case 'Minute':
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        case 'Hour':
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case 'Day':
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case 'Month':
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        case 'Year':
            return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
    }
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed(1);
}

// ─── NORMALIZATION UTILITY ──────────────────────────────────────────────────
// ─── CUSTOM TOOLTIPS ────────────────────────────────────────────────────────

// Colors per field (stable — used in tooltip dots and filter bar)
const FIELD_COLORS: Record<string, string> = {
    vibration:   'bg-orange-400',
    temperature: 'bg-emerald-400',
    humidity:    'bg-blue-400',
    pressure:    'bg-violet-500',
};

// Default fallback metadata when DB data is not yet available
const DEFAULT_META: Record<string, { displayName: string; unit: string }> = {
    temperature: { displayName: 'Temperature',  unit: '°C'   },
    vibration:   { displayName: 'Vibration',    unit: 'mm/s' },
    pressure:    { displayName: 'Pressure',     unit: 'bar'  },
    humidity:    { displayName: 'Humidity',     unit: '%'    },
};

// Raw field key for each chart field
const RAW_FIELD: Record<string, keyof SensorReading> = {
    temperature: 'rawTemperature',
    vibration:   'rawVibration',
    pressure:    'rawPressure',
    humidity:    'rawHumidity',
};

function makeSensorTooltip(signalMeta: SignalMeta[]) {
    const metaByField = Object.fromEntries(signalMeta.map((m) => [m.field, m]));

    return function SensorTooltip({ active, payload }: any) {
        if (!active || !payload?.length) return null;
        const d = payload[0]?.payload as SensorReading;
        if (!d) return null;

        // Render each channel in a consistent order
        const fields = ['vibration', 'temperature', 'humidity', 'pressure'] as const;

        return (
            <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
                <p className="text-slate-400 mb-1">
                    {new Date(d.timestamp).toLocaleString()}
                </p>

                {fields.map((field) => {
                    const meta = metaByField[field] ?? DEFAULT_META[field];
                    const displayName = meta?.displayName ?? DEFAULT_META[field].displayName;
                    const unit = meta?.unit ?? DEFAULT_META[field].unit;
                    const rawKey = RAW_FIELD[field];
                    const rawVal = d[rawKey] as number | null | undefined;
                    const dotColor = FIELD_COLORS[field] ?? 'bg-slate-400';

                    // Use raw engineering value when available; fall back to normalized + label
                    const valueStr = rawVal != null
                        ? `${rawVal.toFixed(2)} ${unit}`
                        : `${(d[field] as number).toFixed(1)}% (norm)`;

                    return (
                        <div key={field} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor} inline-block`} />
                            <span className="text-slate-300">{displayName}:</span>
                            <span className="font-semibold text-white">{valueStr}</span>
                        </div>
                    );
                })}

                {d.videoFrame && (
                    <div className="flex items-center gap-2 mt-1">
                        <Camera size={10} className="text-slate-400" />
                        <span className="text-slate-300">{d.videoFrame.zone}</span>
                        {d.videoFrame.hasMotion && (
                            <span className="text-emerald-400 text-[10px]">Motion</span>
                        )}
                    </div>
                )}

                {d.anomaly && (
                    <div className="flex items-center gap-1 mt-1 text-amber-400">
                        <AlertTriangle size={10} /> <span>Anomaly detected</span>
                    </div>
                )}
            </div>
        );
    };
}

const EnergyTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as EnergyReading;
    if (!d) return null;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs z-50">
            <p className="text-slate-400 mb-1">
                {new Date(d.timestamp).toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                <span className="text-slate-300">Power:</span>
                <span className="text-white font-semibold">{d.powerDraw} kW</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                <span className="text-slate-300">Cooling:</span>
                <span className="text-white font-semibold">{d.coolingLoad.toFixed(0)} kW</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-300 inline-block" />
                <span className="text-slate-300">Efficiency:</span>
                <span className="text-white font-semibold">{d.efficiency.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2">
                <Zap size={8} className="text-yellow-400" />
                <span className="text-slate-300">Cost/Hour:</span>
                <span className="text-yellow-400 font-semibold">{d.costPerHour.toFixed(2)} AED</span>
            </div>
            {d.predicted && (
                <div className="text-blue-400 mt-1 text-[10px]">
                    ↗ Predicted: {d.predicted} kW
                </div>
            )}
        </div>
    );
};

const ActionTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as ActionEvent;
    if (!d?.title) return null;

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs max-w-xs">
            <p className="text-slate-400 mb-1">
                {new Date(d.timestamp).toLocaleString()}
            </p>
            <div className="flex items-center gap-1.5">
                {d.isAI ? (
                    <Bot size={12} className="text-indigo-400 shrink-0" />
                ) : (
                    <User size={12} className="text-indigo-400 shrink-0" />
                )}
                <span className="text-white font-semibold">{d.title}</span>
            </div>
            <p className="text-slate-500 mt-1">
                {d.source} · {d.category}
            </p>
            {d.description && (
                <p className="text-slate-400 mt-1 text-[10px] leading-tight">
                    {d.description}
                </p>
            )}
        </div>
    );
};

const ProductTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as ProductMetric;
    if (!d) return null;
    const diff = d.output - d.target;
    const isAbove = diff >= 0;
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs z-50">
            <p className="text-slate-400 mb-1">
                {new Date(d.timestamp).toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                <span className="text-slate-300">Output:</span>
                <span className="text-white font-semibold">{formatNumber(d.output)}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                <span className="text-slate-300">Target:</span>
                <span className="text-slate-400">{formatNumber(d.target)}</span>
            </div>
            <div className={`mt-1 ${isAbove ? 'text-emerald-400' : 'text-red-400'}`}>
                {isAbove ? '▲' : '▼'}{' '}
                {Math.abs((diff / d.target) * 100).toFixed(1)}% {isAbove ? 'above' : 'below'}{' '}
                target
            </div>
            <div className="text-slate-400">Uptime: {d.uptime.toFixed(1)}%</div>
        </div>
    );
};

// ─── VIDEO FRAME STRIP (continuous colored bar — video editor style) ─────────
function VideoFrameStrip({ data }: { data: SensorReading[] }) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Merge consecutive same-color segments for efficiency + visual clarity
    const segments = useMemo(() => {
        const result: { color: string; count: number; startIdx: number; readings: SensorReading[] }[] = [];
        for (let i = 0; i < data.length; i++) {
            const reading = data[i];
            const color =
                reading.alertLevel === 'critical' ? '#ef4444' :
                    reading.alertLevel === 'warning' ? '#f97316' :
                        '#22c55e';

            const last = result[result.length - 1];
            if (last && last.color === color) {
                last.count++;
                last.readings.push(reading);
            } else {
                result.push({ color, count: 1, startIdx: i, readings: [reading] });
            }
        }
        return result;
    }, [data]);

    return (
        <div className="flex items-stretch" style={{ marginLeft: 40, marginRight: 20 }}>
            {/* CAM label */}
            <div className="flex items-center justify-center shrink-0 pr-2">
                <Camera size={12} className="text-slate-400 mr-1" />
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                    CAM
                </span>
            </div>

            {/* Continuous colored bar */}
            <div className="flex flex-1 h-7 overflow-hidden rounded-sm border border-slate-700/30 bg-slate-800 relative">
                {segments.map((seg, idx) => {
                    const isHovered = hoveredIndex === idx;
                    return (
                        <div
                            key={idx}
                            className="relative"
                            style={{
                                flex: seg.count,
                                backgroundColor: seg.color,
                                opacity: seg.color === '#334155' ? 0.4 : 1,
                                borderRight: idx < segments.length - 1 ? '0.5px solid rgba(0,0,0,0.25)' : 'none',
                            }}
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            {/* Tick marks within segment for video-editor feel */}
                            {seg.count > 3 && (
                                <div className="absolute inset-0 flex">
                                    {Array.from({ length: Math.min(seg.count - 1, 4) }, (_, i) => (
                                        <div
                                            key={i}
                                            className="flex-1 border-r border-black/10"
                                        />
                                    ))}
                                    <div className="flex-1" />
                                </div>
                            )}

                            {/* Hover tooltip */}
                            {isHovered && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[9px] text-slate-300 whitespace-nowrap z-50 shadow-xl pointer-events-none">
                                    <div className="font-semibold text-white">
                                        {seg.readings[0]?.videoFrame?.zone ?? 'No feed'}
                                    </div>
                                    <div>{seg.count} frame{seg.count > 1 ? 's' : ''}</div>
                                    <div style={{ color: seg.color }}>
                                        {seg.color === '#ef4444' ? 'Critical' :
                                            seg.color === '#f97316' ? 'Warning' :
                                                seg.color === '#22c55e' ? 'Normal' : 'No data'}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── LAYER COMPONENTS ───────────────────────────────────────────────────────
//
// xTicks: returns N evenly-spaced integer timestamps within xDomain.
// Explicit ticks prevent Recharts from generating floating-point positions
// that collide when the domain scrolls continuously (duplicate key React warning).
//
function xTicks(domain: [number, number], count = 5): number[] {
    const [start, end] = domain;
    return Array.from({ length: count }, (_, i) =>
        Math.round(start + (i / (count - 1)) * (end - start)),
    );
}

// ─── RANGE SELECTION ─────────────────────────────────────────────────────────
//
// Passed down from MultiLayerTimeline to every chart layer so that:
//   • All layers share the same selection (one drag shows highlight everywhere)
//   • Mouse events are centralised — only one handler set, no duplication
//
interface RangeConfig {
    /** The range to visualise (live preview during drag OR committed range). */
    displayRange: DateRange | null;
    /** True while the user is actively dragging — changes stroke style. */
    isSelecting: boolean;
    onMouseDown: (e: any) => void;
    onMouseMove: (e: any) => void;
    onMouseUp: () => void;
}

// ─── BASE CHART COMPONENT ────────────────────────────────────────────────────
//
// Single source of truth for XAxis domain/ticks/styling and CartesianGrid.
// All 3 ComposedChart layers (Sensor, Energy, Product) extend this — they
// only supply their own series and Y-axis configuration.
// This guarantees visual alignment: same time domain, same tick positions,
// same grid strokes across every layer.

interface TimelineChartBaseProps {
    data: object[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    height: number;
    yDomain: [number | 'auto', number | 'auto'];
    yTickFormatter?: (v: number) => string;
    children: ReactNode; // Tooltip + series + optional extra YAxis
    rangeConfig?: RangeConfig;
}

const TimelineChartBase = memo(function TimelineChartBase({
    data,
    xDomain,
    granularity,
    height,
    yDomain,
    yTickFormatter,
    children,
    rangeConfig,
}: TimelineChartBaseProps) {
    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);
    return (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
            <ComposedChart
                data={data}
                margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
                onMouseDown={rangeConfig?.onMouseDown}
                onMouseMove={rangeConfig?.onMouseMove}
                onMouseUp={rangeConfig?.onMouseUp}
                style={rangeConfig ? { cursor: rangeConfig.isSelecting ? 'crosshair' : 'col-resize' } : undefined}
            >
                <ChartDefs />
                <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    ticks={ticks}
                    tickFormatter={(v) => formatTimestamp(v, granularity)}
                    tick={{ fontSize: 9, fill: '#FFFFFF' }}
                    axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                    tickLine={false}
                />
                <YAxis
                    tick={{ fontSize: 9, fill: '#FFFFFF' }}
                    axisLine={false}
                    tickLine={false}
                    width={COMMON_Y_AXIS_WIDTH}
                    domain={yDomain}
                    tickFormatter={yTickFormatter}
                />
                {children}
                {rangeConfig?.displayRange && (
                    <ReferenceArea
                        x1={rangeConfig.displayRange.start}
                        x2={rangeConfig.displayRange.end}
                        fill={rangeConfig.isSelecting ? RANGE_FILL_SELECTING : RANGE_FILL_COMMITTED}
                        stroke={RANGE_STROKE}
                        strokeWidth={RANGE_STROKE_WIDTH}
                        strokeDasharray={rangeConfig.isSelecting ? undefined : RANGE_DASH_COMMITTED}
                        ifOverflow="visible"
                    />
                )}
            </ComposedChart>
        </ResponsiveContainer>
    );
});

// ─── SENSOR LAYER ────────────────────────────────────────────────────────────
// Multiple Area series (one per channel) + anomaly Scatter markers.
// Overrides: fixed 0–100 Y-axis (normalized values), optional camera strip.

const SensorLayer = memo(function SensorLayer({
    data,
    xDomain,
    granularity,
    expanded,
    visibleSensors,
    signalMeta,
    rangeConfig,
}: {
    data: SensorReading[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    visibleSensors: Record<string, boolean>;
    signalMeta: SignalMeta[];
    rangeConfig?: RangeConfig;
}) {
    const height = expanded ? 300 : 100;
    const chartData = useMemo(() => data.map((s) => ({
        ...s,
        anomaly_y: s.anomaly ? s.vibration : null,
    })), [data]);
    const tooltipRenderer = useMemo(() => makeSensorTooltip(signalMeta), [signalMeta]);

    return (
        <div>
            <TimelineChartBase
                data={chartData}
                xDomain={xDomain}
                granularity={granularity}
                height={height}
                yDomain={[0, 100]}
                yTickFormatter={(v) => `${v}%`}
                rangeConfig={rangeConfig}
            >
                <Tooltip content={tooltipRenderer} wrapperStyle={{ zIndex: 50 }} />
                {visibleSensors.pressure    && <Area isAnimationActive={false} type="monotone" dataKey="pressure"    stroke="#A9FFB5" strokeWidth={2} fill="url(#gradient-pressure)"    dot={false} />}
                {visibleSensors.temperature && <Area isAnimationActive={false} type="monotone" dataKey="temperature" stroke="#FFCEBD" strokeWidth={2} fill="url(#gradient-temperature)" dot={false} />}
                {visibleSensors.vibration   && <Area isAnimationActive={false} type="monotone" dataKey="vibration"   stroke="#F7E2FF" strokeWidth={2} fill="url(#gradient-vibration)"   dot={false} />}
                {visibleSensors.humidity    && <Area isAnimationActive={false} type="monotone" dataKey="humidity"    stroke="#7BC3FF" strokeWidth={2} fill="url(#gradient-humidity)"    dot={false} />}
                <Scatter
                    dataKey="anomaly_y"
                    isAnimationActive={false}
                    shape={(props: any) => {
                        if (props.payload.anomaly_y === null) return <g />;
                        return (
                            <circle
                                cx={props.cx} cy={props.cy} r={7}
                                fill={props.payload.alertLevel === 'critical' ? '#ef4444' : '#f59e0b'}
                                stroke="#18181b" strokeWidth={2}
                            />
                        );
                    }}
                />
            </TimelineChartBase>
            {visibleSensors.camera && <VideoFrameStrip data={data} />}
        </div>
    );
});

// ─── ENERGY LAYER ────────────────────────────────────────────────────────────
// Power draw Area + optional cooling/efficiency in expanded mode.
// Overrides: dynamic Y-axis capped at 1.2× max powerDraw.

const EnergyLayer = memo(function EnergyLayer({
    data,
    xDomain,
    granularity,
    expanded,
    rangeConfig,
}: {
    data: EnergyReading[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    rangeConfig?: RangeConfig;
}) {
    const height = expanded ? 300 : 100;
    const yDomain = useMemo((): [number, number] => {
        if (data.length === 0) return [0, 200];
        const max = Math.max(...data.map((d) => d.powerDraw));
        return [0, Math.ceil(max * 1.2)];
    }, [data]);

    return (
        <TimelineChartBase data={data} xDomain={xDomain} granularity={granularity} height={height} yDomain={yDomain} rangeConfig={rangeConfig}>
            <Tooltip content={<EnergyTooltip />} wrapperStyle={{ zIndex: 50 }} />
            <Area isAnimationActive={false} type="monotone" dataKey="powerDraw" stroke="#fbbf24" strokeWidth={2} fill="url(#gradient-power)" dot={false} activeDot={{ r: 4, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }} />
            {expanded && <Area isAnimationActive={false} type="monotone" dataKey="coolingLoad" stroke="#fb923c" strokeWidth={2} strokeDasharray="3 3" fill="url(#gradient-cooling)" dot={false} />}
            {expanded && <Line isAnimationActive={false} type="monotone" dataKey="efficiency" stroke="#4ade80" strokeWidth={1} dot={false} strokeDasharray="2 2" yAxisId={0} />}
        </TimelineChartBase>
    );
});

const ActionsLayer = memo(function ActionsLayer({
    data,
    xDomain,
    granularity,
    expanded,
    rangeConfig,
}: {
    data: ActionEvent[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    rangeConfig?: RangeConfig;
}) {
    const height = expanded ? 300 : 160;

    const chartData = useMemo(() =>
        data.map((a) => ({ ...a, categoryY: categoryToY[a.category] ?? 0 })),
        [data]
    );

    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);

    return (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
            <ScatterChart
                margin={{ top: 5, right: 20, bottom: 20, left: 0 }}
                onMouseDown={rangeConfig?.onMouseDown}
                onMouseMove={rangeConfig?.onMouseMove}
                onMouseUp={rangeConfig?.onMouseUp}
                style={rangeConfig ? { cursor: rangeConfig.isSelecting ? 'crosshair' : 'col-resize' } : undefined}
            >
                <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    ticks={ticks}
                    tickFormatter={(v) => formatTimestamp(v, granularity)}
                    tick={{ fontSize: 9, fill: '#FFFFFF' }}
                    axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                    tickLine={false}
                />
                <YAxis
                    type="number"
                    dataKey="categoryY"
                    domain={[-1, 6]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                    tickFormatter={(v: number) => ACTION_CATEGORIES[v] ?? ''}
                    tick={{ fontSize: 8, fill: '#FFFFFF' }}
                    axisLine={false}
                    tickLine={false}
                    width={COMMON_Y_AXIS_WIDTH}
                />
                <Tooltip content={<ActionTooltip />} wrapperStyle={{ zIndex: 50 }} />
                <ChartDefs />
                {rangeConfig?.displayRange && (
                    <ReferenceArea
                        x1={rangeConfig.displayRange.start}
                        x2={rangeConfig.displayRange.end}
                        fill={rangeConfig.isSelecting ? RANGE_FILL_SELECTING : RANGE_FILL_COMMITTED}
                        stroke={RANGE_STROKE}
                        strokeWidth={RANGE_STROKE_WIDTH}
                        strokeDasharray={rangeConfig.isSelecting ? undefined : RANGE_DASH_COMMITTED}
                        ifOverflow="visible"
                    />
                )}
                <Scatter
                    data={chartData}
                    dataKey="categoryY"
                    shape={(props: any) => {
                        const event = props.payload as ActionEvent & { categoryY: number };
                        const color = event.isAI ? '#6366f1' : '#a855f7';
                        if (event.isAI) {
                            return (
                                <polygon
                                    points={`${props.cx},${props.cy - 6} ${props.cx + 6},${props.cy} ${props.cx},${props.cy + 6} ${props.cx - 6},${props.cy}`}
                                    fill={color}
                                    stroke="#fff"
                                    strokeWidth={1}
                                    filter="url(#neon-glow)"
                                />
                            );
                        }
                        return (
                            <circle
                                cx={props.cx}
                                cy={props.cy}
                                r={6}
                                fill={color}
                                stroke="#fff"
                                strokeWidth={1}
                                filter="url(#neon-glow)"
                            />
                        );
                    }}
                />
            </ScatterChart>
        </ResponsiveContainer>
    );
});

// ─── PRODUCT LAYER ───────────────────────────────────────────────────────────
// Output vs target Area + optional uptime line on a right Y-axis.
// Overrides: dynamic Y-axis scaled to data range, K/M tick formatter.

const ProductLayer = memo(function ProductLayer({
    data,
    xDomain,
    granularity,
    expanded,
    rangeConfig,
}: {
    data: ProductMetric[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    rangeConfig?: RangeConfig;
}) {
    const height = expanded ? 300 : 100;
    const yDomain = useMemo((): [number, number] => {
        if (data.length === 0) return [700, 1300];
        const vals = data.flatMap((d) => [d.output, d.target]);
        return [Math.min(...vals) * 0.95, Math.max(...vals) * 1.05];
    }, [data]);

    return (
        <TimelineChartBase data={data} xDomain={xDomain} granularity={granularity} height={height} yDomain={yDomain} yTickFormatter={formatNumber} rangeConfig={rangeConfig}>
            <Tooltip content={<ProductTooltip />} wrapperStyle={{ zIndex: 50 }} />
            <Area isAnimationActive={false} type="monotone" dataKey="target" fill="#a78bfa10" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Area isAnimationActive={false} type="monotone" dataKey="output" stroke="#a78bfa" strokeWidth={2} fill="url(#gradient-product)" dot={false} activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }} />
            {expanded && (
                <>
                    <YAxis yAxisId={1} orientation="right" tick={{ fontSize: 9, fill: '#FFFFFF' }} axisLine={false} tickLine={false} width={35} tickFormatter={(v: number) => `${v}%`} />
                    <Line isAnimationActive={false} type="monotone" dataKey="uptime" stroke="#4ade80" strokeWidth={1} dot={false} strokeDasharray="2 2" yAxisId={1} />
                </>
            )}
        </TimelineChartBase>
    );
});

// ─── LAYER HEADER ───────────────────────────────────────────────────────────
function LayerHeader({
    config,
    expanded,
    onToggleExpand,
    stats,
}: {
    config: LayerConfig;
    expanded: boolean;
    onToggleExpand: () => void;
    stats?: ReactNode;
}) {
    return (
        <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer select-none group border-l-4"
            style={{ borderLeftColor: config.color }}
            onClick={onToggleExpand}
        >
            <div className="flex items-center gap-3">
                <span style={{ color: config.color }}>{config.icon}</span>
                <span
                    className="text-sm font-bold uppercase tracking-wide"
                    style={{ color: config.color }}
                >
                    {config.name}
                </span>
                <span className="text-xs text-[#98A6D4] hidden sm:inline">
                    {config.description}
                </span>
            </div>
            <div className="flex items-center gap-3">
                {stats}
                <button className="p-1 rounded hover:bg-[#98A6D4]/20 text-[#98A6D4] group-hover:text-white transition-colors">
                    {expanded ? (
                        <Minimize2 size={14} />
                    ) : (
                        <Maximize2 size={14} />
                    )}
                </button>
            </div>
        </div>
    );
}

// ─── LIVE INDICATOR ─────────────────────────────────────────────────────────
function LiveIndicator({ isStreaming }: { isStreaming: boolean }) {
    if (!isStreaming) return null;
    return (
        <div className="flex items-center gap-1.5 ml-3">
            <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs font-bold text-red-500 uppercase tracking-widest">
                LIVE
            </span>
        </div>
    );
}

// ─── SENSOR FILTER BAR ──────────────────────────────────────────────────────
function SensorFilterBar({
    visibleSensors,
    setVisibleSensors,
    nodeMappings,
}: {
    visibleSensors: Record<string, boolean>;
    setVisibleSensors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    nodeMappings: NodeMapping[];
}) {
    // Build a lookup: field → real display name from connector
    const realNames: Record<string, string> = {};
    nodeMappings.forEach((m) => { realNames[m.field] = m.displayName; });

    const SENSOR_DEFS = [
        { key: 'vibration', label: 'Vibration', color: '#f97316' },
        { key: 'camera', label: 'Camera', color: '#64748b' },
        { key: 'temperature', label: 'Temperature', color: '#34d399' },
        { key: 'humidity', label: 'Humidity', color: '#60a5fa' },
        { key: 'pressure', label: 'Pressure', color: '#8b5cf6' },
    ];

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 bg-[#171921] border-b border-[#98A6D4]/30">
            {SENSOR_DEFS.map(({ key, label, color }) => {
                const realName = realNames[key];
                return (
                    <label
                        key={key}
                        className="flex items-center gap-1.5 cursor-pointer text-xs select-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={visibleSensors[key]}
                            onChange={() =>
                                setVisibleSensors((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                            className="w-3 h-3 rounded accent-current"
                            style={{ accentColor: color }}
                        />
                        <span className="w-2 h-0.5 inline-block" style={{ backgroundColor: color }} />
                        <span className={visibleSensors[key] ? 'text-white' : 'text-[#98A6D4]'}>
                            {realName ? (
                                <>
                                    <span className="text-zinc-500">{label}: </span>
                                    <span title={`node_id: ${nodeMappings.find(m => m.field === key)?.nodeId}`}>{realName}</span>
                                </>
                            ) : label}
                        </span>
                    </label>
                );
            })}
            {nodeMappings.length > 0 && (
                <span className="ml-auto text-[10px] text-emerald-500 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    LIVE · {nodeMappings.length} nodes
                </span>
            )}
        </div>
    );
}

// ─── SIM BADGE ───────────────────────────────────────────────────────────────
function SimBadge() {
    return (
        <span
            title="Derived from live sensor data — not a direct connector reading"
            className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 border border-zinc-600 px-1.5 py-0.5 rounded"
        >
            Simulated
        </span>
    );
}

// ─── CONNECTOR OVERLAY ───────────────────────────────────────────────────────
function ConnectorOverlay({
    status,
    connectorId,
    errorDetail,
    onRetry,
    onChangeConnector,
}: {
    status: ConnectorStatus;
    connectorId: string;
    errorDetail: string | null;
    onRetry: () => void;
    onChangeConnector: () => void;
}) {
    const config: Record<Exclude<ConnectorStatus, 'idle' | 'connected'>, { title: string; sub: string; isError: boolean }> = {
        discovering: {
            title: 'Connecting to data source',
            sub: `Discovering nodes on "${connectorId}"…`,
            isError: false,
        },
        not_found: {
            title: 'Connector not found',
            sub: `No connector with ID "${connectorId}". Register it first.`,
            isError: true,
        },
        error: {
            title: 'Stream interrupted',
            sub: 'Lost connection to the data source. Check that the server is running.',
            isError: true,
        },
    };

    if (status === 'idle' || status === 'connected') return null;
    const { title, sub, isError } = config[status];

    return (
        <div className="absolute inset-0 z-50 bg-[#171921]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            {isError ? (
                <AlertTriangle size={32} className="text-amber-400" />
            ) : (
                <span className="h-8 w-8 rounded-full border-2 border-zinc-600 border-t-cyan-400 animate-spin" />
            )}
            <div className="text-center max-w-sm">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-zinc-400 mt-1">{sub}</p>
                {errorDetail && (
                    <p className="text-[10px] font-mono text-red-400 mt-2 bg-red-950/30 border border-red-900/40 rounded px-2 py-1 text-left break-all">
                        {errorDetail}
                    </p>
                )}
            </div>
            {isError && (
                <div className="flex gap-2">
                    <button
                        onClick={onRetry}
                        className="px-4 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded-lg transition-colors"
                    >
                        Reconnect
                    </button>
                    <button
                        onClick={onChangeConnector}
                        className="px-4 py-2 text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                    >
                        Change Connector
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
interface MultiLayerTimelineProps {
    autoTriggerAnomaly?: boolean;
    onAnomalyTriggered?: () => void;
    /** If provided, the sensor layer streams real data from this connector instead of mock. */
    connectorId?: string;
}

export function MultiLayerTimeline({ autoTriggerAnomaly, onAnomalyTriggered, connectorId: connectorIdProp }: MultiLayerTimelineProps) {
    // Persisted across reloads — user never has to re-select the connector
    const {
        activeConnectorId: storedConnectorId,
        setActiveConnectorId: persistConnectorId,
        granularity,
        setGranularity,
    } = useTimelineStore();

    // Prop takes priority (e.g. Overview expand view passing a specific connector);
    // otherwise fall back to whatever the user last connected to.
    const activeConnectorId = connectorIdProp ?? storedConnectorId;
    const setActiveConnectorId = useCallback(
        (id: string | undefined) => persistConnectorId(id),
        [persistConnectorId],
    );

    const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
    const [visibleSensors, setVisibleSensors] = useState<Record<string, boolean>>({
        vibration: true,
        camera: true,
        temperature: false,
        humidity: false,
        pressure: false,
    });

    const [modalOpen, setModalOpen] = useState(false);

    // ── Sync timeline state to screen context (AI awareness) ─────────────────
    const screenCtx = useScreenContext();

    useEffect(() => {
        screenCtx.setActiveConnectorId(activeConnectorId);
    }, [activeConnectorId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        screenCtx.setGranularity(granularity);
    }, [granularity]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Date-range selection ─────────────────────────────────────────────────
    const [isRangeMode, setIsRangeMode] = useState(false);
    const [rangeStart, setRangeStart] = useState<number | null>(null);
    const [rangeCurrent, setRangeCurrent] = useState<number | null>(null);
    const [committedRange, setCommittedRange] = useState<DateRange | null>(null);
    const isSelectingRef = useRef(false);

    // Live preview during drag; falls back to committed range once drag ends
    const displayRange = useMemo((): DateRange | null => {
        if (isSelectingRef.current && rangeStart !== null && rangeCurrent !== null) {
            return {
                start: Math.min(rangeStart, rangeCurrent),
                end:   Math.max(rangeStart, rangeCurrent),
            };
        }
        return committedRange;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rangeStart, rangeCurrent, committedRange]);

    const handleChartMouseDown = useCallback((e: any) => {
        if (!isRangeMode || !e?.activeLabel) return;
        isSelectingRef.current = true;
        const ts = Number(e.activeLabel);
        setRangeStart(ts);
        setRangeCurrent(ts);
    }, [isRangeMode]);

    const handleChartMouseMove = useCallback((e: any) => {
        if (!isRangeMode || !isSelectingRef.current || !e?.activeLabel) return;
        setRangeCurrent(Number(e.activeLabel));
    }, [isRangeMode]);

    const handleChartMouseUp = useCallback(() => {
        if (!isRangeMode || !isSelectingRef.current) return;
        isSelectingRef.current = false;
        if (rangeStart !== null && rangeCurrent !== null) {
            const start = Math.min(rangeStart, rangeCurrent);
            const end   = Math.max(rangeStart, rangeCurrent);
            if (end - start >= MIN_RANGE_MS) {
                const range: DateRange = { start, end };
                setCommittedRange(range);
                screenCtx.setDateRange(range);
            }
        }
        setRangeStart(null);
        setRangeCurrent(null);
    }, [isRangeMode, rangeStart, rangeCurrent, screenCtx]);

    const clearRange = useCallback(() => {
        setCommittedRange(null);
        setRangeStart(null);
        setRangeCurrent(null);
        isSelectingRef.current = false;
        screenCtx.setDateRange(null);
    }, [screenCtx]);

    const toggleRangeMode = useCallback(() => {
        if (isRangeMode) clearRange(); // exiting range mode → clear selection
        setIsRangeMode((prev) => !prev);
    }, [isRangeMode, clearRange]);

    const rangeConfig: RangeConfig = useMemo(() => ({
        displayRange,
        isSelecting: isSelectingRef.current,
        onMouseDown: handleChartMouseDown,
        onMouseMove: handleChartMouseMove,
        onMouseUp:   handleChartMouseUp,
    }), [displayRange, handleChartMouseDown, handleChartMouseMove, handleChartMouseUp]);

    // Effect to handle auto-trigger from parent
    useEffect(() => {
        if (autoTriggerAnomaly) {
            // Force expand sensors layer to show the anomaly
            setExpandedLayer('sensors');
        }
    }, [autoTriggerAnomaly]);

    const granularities: TimeGranularity[] = [
        'Minute',
        'Hour',
        'Day',
        'Month',
        'Year',
    ];

    const {
        sensorData,
        energyData,
        productData,
        xDomain,
        pointCount,
        isStreaming,
        triggerAnomaly,
        connectorStatus,
        connectorError,
        nodeMappings,
        signalMeta,
    } = useConnectorTimeline(activeConnectorId, granularity);

    // Live actions are not yet wired to the connector — placeholder for future integration
    const actionData: ActionEvent[] = [];

    // Trigger anomaly effect
    useEffect(() => {
        if (autoTriggerAnomaly) {
            triggerAnomaly();
            onAnomalyTriggered?.();
        }
    }, [autoTriggerAnomaly, triggerAnomaly, onAnomalyTriggered]);

    const layers: LayerConfig[] = [
        {
            id: 'product',
            name: 'Product Output',
            icon: <Package size={14} />,
            color: '#a78bfa',
            accentColor: '#8b5cf6',
            bgGradient: 'from-violet-950/20',
            description: 'Primary output metric',
            visible: true,
        },
        {
            id: 'sensors',
            name: 'Sensors',
            icon: <Activity size={14} />,
            color: '#34d399',
            accentColor: '#10b981',
            bgGradient: 'from-emerald-950/20',
            description: 'Vibration · Camera',
            visible: true,
        },
        {
            id: 'energy',
            name: 'Energy',
            icon: <Zap size={14} />,
            color: '#fbbf24',
            accentColor: '#f59e0b',
            bgGradient: 'from-amber-950/20',
            description: 'Power · Cooling · Efficiency',
            visible: true,
        },
        {
            id: 'actions',
            name: 'Actions & Events',
            icon: <Clock size={14} />,
            color: '#38bdf8',
            accentColor: '#0ea5e9',
            bgGradient: 'from-sky-950/20',
            description: 'Maintenance · Compliance · AI',
            visible: true,
        },
    ];

    const handleToggleExpand = useCallback((layerId: string) => {
        setExpandedLayer((prev) => (prev === layerId ? null : layerId));
    }, []);

    // Live stats
    const latestSensor = sensorData[sensorData.length - 1];
    const latestEnergy = energyData[energyData.length - 1];
    const anomalyCount = sensorData.filter((s) => s.anomaly).length;
    const latestProduct = productData[productData.length - 1];

    // AI vs Human counts for action stats
    const aiCount = actionData.filter((a) => a.isAI).length;
    const humanCount = actionData.filter((a) => !a.isAI).length;

    return (
        <div className="w-full h-full bg-[#171921] text-white flex flex-col overflow-hidden relative">
            {/* Connector setup modal */}
            {modalOpen && (
                <ConnectorModal
                    onClose={() => setModalOpen(false)}
                    onConnected={(id) => setActiveConnectorId(id)}
                />
            )}
            {/* Connector loading / error overlay */}
            {activeConnectorId && (
                <ConnectorOverlay
                    status={connectorStatus}
                    connectorId={activeConnectorId}
                    errorDetail={connectorError ?? null}
                    onRetry={() => {
                        // Re-trigger discovery by resetting the connector id
                        const id = activeConnectorId;
                        setActiveConnectorId(undefined);
                        setTimeout(() => setActiveConnectorId(id), 50);
                    }}
                    onChangeConnector={() => {
                        setActiveConnectorId(undefined);
                        setModalOpen(true);
                    }}
                />
            )}
            {/* Header */}
            <div className="border-b border-[#98A6D4]/30 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <div
                                className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400' : 'bg-slate-400'
                                    }`}
                                style={
                                    isStreaming
                                        ? {
                                            animation: 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                                            boxShadow: '0 0 8px #34d399',
                                        }
                                        : undefined
                                }
                            />
                            Multi-Layer Timeline
                            <LiveIndicator isStreaming={isStreaming} />
                        </h1>
                        <p className="text-xs text-[#98A6D4] mt-1 uppercase tracking-wide">
                            {activeConnectorId && connectorStatus === 'connected'
                                ? `Live · ${activeConnectorId} · ${pointCount} data points`
                                : activeConnectorId
                                    ? `${connectorStatus}…`
                                    : 'No data source connected'}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Granularity Selector */}
                        <div className="flex gap-2">
                            {granularities.map((g) => (
                                <button
                                    key={g}
                                    onClick={() => {
                                        setGranularity(g);
                                        setExpandedLayer(null);
                                    }}
                                    className={`px-3 py-2 text-sm font-medium rounded transition-all ${g === granularity
                                        ? 'bg-violet-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                                        }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>

                        {/* Date-range selection toggle */}
                        <button
                            onClick={toggleRangeMode}
                            title={isRangeMode ? 'Exit range mode' : 'Select a time range by dragging on any chart'}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded border transition-all ${
                                isRangeMode
                                    ? 'border-sky-400 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20'
                                    : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            <CalendarRange size={13} />
                            {isRangeMode ? 'Cancel' : 'Range'}
                        </button>

                        {/* Committed range badge */}
                        {committedRange && !isRangeMode && (
                            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-sky-500/10 border border-sky-500/30 rounded text-sky-300 font-mono">
                                <CalendarRange size={10} />
                                <span>
                                    {new Date(committedRange.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    {' → '}
                                    {new Date(committedRange.end).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <button
                                    onClick={clearRange}
                                    className="ml-1 hover:text-white transition-colors"
                                    title="Clear range"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        )}

                        {/* Add / swap connector */}
                        <button
                            onClick={() => setModalOpen(true)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded border transition-all ${activeConnectorId
                                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20'
                                : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
                                }`}
                        >
                            <Plug2 size={13} />
                            {activeConnectorId ? activeConnectorId : 'Add Connector'}
                        </button>

                        {/* Demo: Trigger anomaly sequence */}
                        <button
                            onClick={triggerAnomaly}
                            className="px-4 py-2 text-sm font-mono font-bold rounded border-2 border-red-500 text-red-600 hover:bg-red-500 hover:text-white transition-all"
                        >
                            TEST ANOMALY
                        </button>
                    </div>
                </div>
            </div>

            {/* No connector empty state */}
            {!activeConnectorId && (
                <div className="flex-1 flex flex-col items-center justify-center gap-5 py-20">
                    <div className="h-14 w-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
                        <Plug2 size={24} className="text-zinc-600" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-semibold text-zinc-300">No data source connected</p>
                        <p className="text-xs text-zinc-500 mt-1.5 max-w-xs">
                            Connect an OPC-UA, MQTT or REST connector to start streaming live sensor data.
                        </p>
                    </div>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded-lg transition-colors"
                    >
                        <Plug2 size={14} />
                        Add Connector
                    </button>
                </div>
            )}

            {/* Layers: flex-1 + min-h-0 so this section owns vertical scroll */}
            <div className={`flex-1 min-h-0 overflow-y-auto divide-y divide-[#98A6D4]/30 ${!activeConnectorId ? 'hidden' : ''}`}>
                {/* Product Layer */}
                <div
                    className={`transition-all duration-300 ${expandedLayer && expandedLayer !== 'product'
                        ? 'opacity-50 max-h-14 overflow-hidden'
                        : ''
                        }`}
                >
                    <LayerHeader
                        config={layers[0]}
                        expanded={expandedLayer === 'product'}
                        onToggleExpand={() => handleToggleExpand('product')}
                        stats={
                            <div className="flex items-center gap-4 text-xs">
                                <SimBadge />
                                {latestProduct && (
                                    <>
                                        <span className="text-violet-600 font-mono">{formatNumber(latestProduct.output)} units/min</span>
                                        <span className={`font-mono ${latestProduct.uptime >= 95 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                            {latestProduct.uptime.toFixed(1)}% uptime
                                        </span>
                                    </>
                                )}
                            </div>
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'product') && (
                        <div className="px-2">
                            <ProductLayer
                                data={productData}
                                xDomain={xDomain}
                                granularity={granularity}
                                expanded={expandedLayer === 'product'}
                                rangeConfig={isRangeMode || committedRange ? rangeConfig : undefined}
                            />
                        </div>
                    )}
                </div>

                {/* Sensor Layer */}
                <div
                    className={`transition-all duration-300 ${expandedLayer && expandedLayer !== 'sensors'
                        ? 'opacity-50 max-h-14 overflow-hidden'
                        : ''
                        }`}
                >
                    <LayerHeader
                        config={layers[1]}
                        expanded={expandedLayer === 'sensors'}
                        onToggleExpand={() => handleToggleExpand('sensors')}
                        stats={latestSensor && (
                            <div className="flex items-center gap-4 text-xs">
                                {(() => {
                                    const tMeta = signalMeta.find((m) => m.field === 'temperature') ?? { displayName: 'Temp', unit: '°C' };
                                    const pMeta = signalMeta.find((m) => m.field === 'pressure')    ?? { displayName: 'Press', unit: 'bar' };
                                    const vMeta = signalMeta.find((m) => m.field === 'vibration')   ?? { displayName: 'Vib', unit: 'mm/s' };
                                    const tVal = latestSensor.rawTemperature != null ? `${latestSensor.rawTemperature.toFixed(1)} ${tMeta.unit}` : `${latestSensor.temperature.toFixed(0)}%`;
                                    const pVal = latestSensor.rawPressure    != null ? `${latestSensor.rawPressure.toFixed(2)} ${pMeta.unit}`    : `${latestSensor.pressure.toFixed(1)}%`;
                                    const vVal = latestSensor.rawVibration   != null ? `${latestSensor.rawVibration.toFixed(2)} ${vMeta.unit}`   : `${latestSensor.vibration.toFixed(1)}%`;
                                    return (<>
                                        <span className="text-emerald-600 font-mono">{tVal}</span>
                                        <span className="text-slate-600 font-mono">{pMeta.displayName} {pVal}</span>
                                        <span className="text-orange-600 font-mono">{vMeta.displayName} {vVal}</span>
                                    </>);
                                })()}
                                {anomalyCount > 0 && (
                                    <span className="text-amber-600 flex items-center gap-1">
                                        <AlertTriangle size={12} /> {anomalyCount}
                                    </span>
                                )}
                            </div>
                        )}
                    />
                    {(!expandedLayer || expandedLayer === 'sensors') && (
                        <>
                            {/* Sensor filter bar between header and chart */}
                            <SensorFilterBar
                                visibleSensors={visibleSensors}
                                setVisibleSensors={setVisibleSensors}
                                nodeMappings={nodeMappings}
                            />
                            <div className="px-2">
                                <SensorLayer
                                    data={sensorData}
                                    xDomain={xDomain}
                                    granularity={granularity}
                                    expanded={expandedLayer === 'sensors'}
                                    visibleSensors={visibleSensors}
                                    signalMeta={signalMeta}
                                    rangeConfig={isRangeMode || committedRange ? rangeConfig : undefined}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Energy Layer */}
                <div
                    className={`transition-all duration-300 ${expandedLayer && expandedLayer !== 'energy'
                        ? 'opacity-50 max-h-14 overflow-hidden'
                        : ''
                        }`}
                >
                    <LayerHeader
                        config={layers[2]}
                        expanded={expandedLayer === 'energy'}
                        onToggleExpand={() => handleToggleExpand('energy')}
                        stats={
                            <div className="flex items-center gap-4 text-xs">
                                <SimBadge />
                                {latestEnergy && (
                                    <>
                                        <span className="text-amber-600 font-mono">{latestEnergy.powerDraw} kW</span>
                                        <span className="text-yellow-600 font-mono">{latestEnergy.efficiency.toFixed(1)}% eff</span>
                                        <span className="text-yellow-700 flex items-center gap-1">
                                            <Zap size={12} /> {latestEnergy.costPerHour.toFixed(2)} AED/h
                                        </span>
                                    </>
                                )}
                            </div>
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'energy') && (
                        <div className="px-2">
                            <EnergyLayer
                                data={energyData}
                                xDomain={xDomain}
                                granularity={granularity}
                                expanded={expandedLayer === 'energy'}
                                rangeConfig={isRangeMode || committedRange ? rangeConfig : undefined}
                            />
                        </div>
                    )}
                </div>

                {/* Actions Layer */}
                <div
                    className={`transition-all duration-300 ${expandedLayer && expandedLayer !== 'actions'
                        ? 'opacity-50 max-h-14 overflow-hidden'
                        : ''
                        }`}
                >
                    <LayerHeader
                        config={layers[3]}
                        expanded={expandedLayer === 'actions'}
                        onToggleExpand={() => handleToggleExpand('actions')}
                        stats={
                            <div className="flex items-center gap-4 text-xs">
                                <SimBadge />
                                <span className="text-indigo-600 font-mono">{actionData.length} events</span>
                                <span className="text-indigo-500 flex items-center gap-1 font-mono">
                                    <Bot size={10} /> {aiCount} AI
                                </span>
                                <span className="text-indigo-500 flex items-center gap-1 font-mono">
                                    <User size={10} /> {humanCount} Human
                                </span>
                            </div>
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'actions') && (
                        <div className="px-2">
                            <ActionsLayer
                                data={actionData}
                                xDomain={xDomain}
                                granularity={granularity}
                                expanded={expandedLayer === 'actions'}
                                rangeConfig={isRangeMode || committedRange ? rangeConfig : undefined}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Legend */}
            <div className="border-t border-[#98A6D4]/30 px-6 py-3 flex items-center justify-between bg-[#171921]">
                <div className="flex items-center gap-6 text-xs text-[#98A6D4] flex-wrap">
                    <span className="flex items-center gap-2">
                        <span className="w-6 h-px bg-orange-400 inline-block" /> Vibration
                    </span>
                    <span className="flex items-center gap-2">
                        <Camera size={10} className="text-slate-500" /> Camera
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-6 h-px bg-amber-400 inline-block" /> Power
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-6 h-px bg-violet-400 inline-block" /> Output
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-6 h-px bg-violet-500 inline-block" /> Pressure
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{' '}
                        Anomaly
                    </span>
                </div>
                <div className="text-xs text-slate-500">
                    {isRangeMode
                        ? 'Click and drag on any chart to select a time range'
                        : 'Click layer name to expand · Hover for details · Range to analyse a period'}
                </div>
            </div>
        </div>
    );
}
