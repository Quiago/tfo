'use client';

import { useConnectorTimeline, type ConnectorStatus, type NodeMapping } from '@/lib/hooks/useConnectorTimeline';
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
    Camera,
    Clock,
    Maximize2,
    Minimize2,
    Package,
    Plug2,
    User,
    Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { ChartDefs } from './ChartDefs';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const COMMON_Y_AXIS_WIDTH = 80;
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
function formatTimestamp(ts: number, granularity: TimeGranularity): string {
    const d = new Date(ts);
    switch (granularity) {
        case 'Minute':
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case 'Hour':
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case 'Day':
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        case 'Week':
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
// Fixed operational ranges — no dynamic extension from outliers.
// Gives good visual spread for normal values; anomaly spikes clip at top (100%).
const SENSOR_RANGES: Record<'vibration' | 'temperature' | 'pressure' | 'humidity', [number, number]> = {
    vibration: [0, 10],      // Normal 2-4 at 20-40%, warning 8 at 80%, critical clips at top
    temperature: [20, 45],   // Normal 25-35 at 20-60%, heat events visible at top
    pressure: [4, 8.5],      // Normal 6-7.5 at 44-78%, low pressure visible at bottom
    humidity: [45, 68],      // Normal 50-58 at 22-57%, high humidity visible at top
};

// Normalize to 0-100, clamped — extreme values hit ceiling/floor instead of compressing everything
function normalizeForDisplay(
    value: number,
    sensorType: 'vibration' | 'temperature' | 'pressure' | 'humidity',
): number {
    const [min, max] = SENSOR_RANGES[sensorType];
    const normalized = ((value - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, normalized));
}

// ─── CUSTOM TOOLTIPS ────────────────────────────────────────────────────────
const SensorTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as SensorReading;
    if (!d) return null;

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="text-slate-400 mb-1">
                {new Date(d.timestamp).toLocaleString()}
            </p>

            {/* Vibration */}
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                <span className="text-slate-300">Vibration:</span>
                <span className={`font-semibold ${d.vibration > 12 ? 'text-red-400' :
                    d.vibration > 8 ? 'text-amber-400' :
                        'text-white'
                    }`}>
                    {d.vibration.toFixed(1)} mm/s
                </span>
            </div>

            {/* Temperature */}
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span className="text-slate-300">Temperature:</span>
                <span className={`font-semibold ${d.temperature > 50 ? 'text-red-400' :
                    d.temperature > 45 ? 'text-amber-400' :
                        'text-white'
                    }`}>
                    {d.temperature.toFixed(1)}°C
                </span>
            </div>

            {/* Humidity */}
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                <span className="text-slate-300">Humidity:</span>
                <span className={`font-semibold ${d.humidity > 70 ? 'text-red-400' :
                    d.humidity > 65 ? 'text-amber-400' :
                        'text-white'
                    }`}>
                    {d.humidity.toFixed(1)}%
                </span>
            </div>

            {/* Pressure */}
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                <span className="text-slate-300">Pressure:</span>
                <span className={`font-semibold ${d.pressure < 4 ? 'text-red-400' :
                    d.pressure < 5.5 ? 'text-amber-400' :
                        'text-white'
                    }`}>
                    {d.pressure.toFixed(1)} bar
                </span>
            </div>

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

const SensorLayer = memo(function SensorLayer({
    data,
    xDomain,
    granularity,
    expanded,
    visibleSensors,
}: {
    data: SensorReading[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    visibleSensors: Record<string, boolean>;
}) {
    const height = expanded ? 300 : 100;

    // data values are already normalized 0–100 by the hook (windowNormalize).
    // anomaly_y is only non-null when anomaly===true (manual TEST ANOMALY button).
    const chartData = useMemo(() => data.map((s) => ({
        ...s,
        anomaly_y: s.anomaly ? s.vibration : null,
    })), [data]);

    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);

    return (
        <div>
            <ResponsiveContainer width="100%" height={height} minWidth={0}>
                <ComposedChart
                    data={chartData}
                    margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
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
                        domain={[0, 100]}
                        width={COMMON_Y_AXIS_WIDTH}
                        tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip content={<SensorTooltip />} wrapperStyle={{ zIndex: 50 }} />

                    {visibleSensors.pressure    && <Area isAnimationActive={false} type="monotone" dataKey="pressure"    stroke="#A9FFB5" strokeWidth={2} fill="url(#gradient-pressure)"    dot={false} />}
                    {visibleSensors.temperature && <Area isAnimationActive={false} type="monotone" dataKey="temperature" stroke="#FFCEBD" strokeWidth={2} fill="url(#gradient-temperature)" dot={false} />}
                    {visibleSensors.vibration   && <Area isAnimationActive={false} type="monotone" dataKey="vibration"   stroke="#F7E2FF" strokeWidth={2} fill="url(#gradient-vibration)"   dot={false} />}
                    {visibleSensors.humidity    && <Area isAnimationActive={false} type="monotone" dataKey="humidity"    stroke="#7BC3FF" strokeWidth={2} fill="url(#gradient-humidity)"    dot={false} />}

                    {/* Anomaly markers — only appear when triggerAnomaly() is called */}
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
                </ComposedChart>
            </ResponsiveContainer>
            {visibleSensors.camera && <VideoFrameStrip data={data} />}
        </div>
    );
});

const EnergyLayer = memo(function EnergyLayer({
    data,
    xDomain,
    granularity,
    expanded,
}: {
    data: EnergyReading[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
}) {
    const height = expanded ? 300 : 100;

    const yDomain = useMemo((): [number, number] => {
        if (data.length === 0) return [0, 200];
        const max = Math.max(...data.map((d) => d.powerDraw));
        return [0, Math.ceil(max * 1.2)];
    }, [data]);

    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);

    return (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
            <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
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
                />
                <Tooltip content={<EnergyTooltip />} wrapperStyle={{ zIndex: 50 }} />
                <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="powerDraw"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    fill="url(#gradient-power)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
                />
                {expanded && (
                    <Area
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="coolingLoad"
                        stroke="#fb923c"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        fill="url(#gradient-cooling)"
                        dot={false}
                    />
                )}
                {expanded && (
                    <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="efficiency"
                        stroke="#4ade80"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="2 2"
                        yAxisId={0}
                    />
                )}
            </ComposedChart>
        </ResponsiveContainer>
    );
});

const ActionsLayer = memo(function ActionsLayer({
    data,
    xDomain,
    granularity,
    expanded,
}: {
    data: ActionEvent[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
}) {
    const height = expanded ? 300 : 160;

    const chartData = useMemo(() =>
        data.map((a) => ({ ...a, categoryY: categoryToY[a.category] ?? 0 })),
        [data]
    );

    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);

    return (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
            <ScatterChart margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
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

const ProductLayer = memo(function ProductLayer({
    data,
    xDomain,
    granularity,
    expanded,
}: {
    data: ProductMetric[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
}) {
    const height = expanded ? 300 : 100;

    const yDomain = useMemo((): [number, number] => {
        if (data.length === 0) return [700, 1300];
        const vals = data.flatMap((d) => [d.output, d.target]);
        return [Math.min(...vals) * 0.95, Math.max(...vals) * 1.05];
    }, [data]);

    const ticks = useMemo(() => xTicks(xDomain), [xDomain]);

    return (
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
            <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
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
                    tickFormatter={formatNumber}
                />
                <Tooltip content={<ProductTooltip />} wrapperStyle={{ zIndex: 50 }} />
                {/* Target — dashed reference line */}
                <Area isAnimationActive={false} type="monotone" dataKey="target" fill="#a78bfa10" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                {/* Output — main line */}
                <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="output"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    fill="url(#gradient-product)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }}
                />
                {expanded && (
                    <>
                        <YAxis yAxisId={1} orientation="right" tick={{ fontSize: 9, fill: '#FFFFFF' }} axisLine={false} tickLine={false} width={35} tickFormatter={(v: number) => `${v}%`} />
                        <Line isAnimationActive={false} type="monotone" dataKey="uptime" stroke="#4ade80" strokeWidth={1} dot={false} strokeDasharray="2 2" yAxisId={1} />
                    </>
                )}
            </ComposedChart>
        </ResponsiveContainer>
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
    const [granularity, setGranularity] = useState<TimeGranularity>('Day');
    const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
    const [visibleSensors, setVisibleSensors] = useState<Record<string, boolean>>({
        vibration: true,
        camera: true,
        temperature: false,
        humidity: false,
        pressure: false,
    });

    // Active connector — can be set via prop (initial) or by the user through the modal
    const [activeConnectorId, setActiveConnectorId] = useState<string | undefined>(connectorIdProp);
    const [modalOpen, setModalOpen] = useState(false);

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
        'Week',
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
        <div className="w-full min-h-full bg-[#171921] text-white flex flex-col relative">
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

            {/* Layers */}
            <div className={`divide-y divide-[#98A6D4]/30 ${!activeConnectorId ? 'hidden' : ''}`}>
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
                                <span className="text-emerald-600 font-mono">
                                    {latestSensor.temperature}°C
                                </span>
                                <span className={`font-mono ${latestSensor.pressure < 4 ? 'text-red-600' :
                                    latestSensor.pressure < 5.5 ? 'text-amber-600' :
                                        'text-slate-600'
                                    }`}>
                                    Press {latestSensor.pressure.toFixed(1)} bar
                                </span>
                                <span className="text-orange-600 font-mono">
                                    Vib {latestSensor.vibration.toFixed(1)} mm/s
                                </span>
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
                    Click layer name to expand · Hover for details
                </div>
            </div>
        </div>
    );
}
