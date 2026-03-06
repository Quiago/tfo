'use client';

import { useMultiLayerData } from '@/lib/hooks/useMultiLayerData';
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
    User,
    Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
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
// ─── LAYER COMPONENTS ───────────────────────────────────────────────────────
function SensorLayer({
    data,
    granularity,
    expanded,
    predictionStart,
    visibleSensors,
}: {
    data: SensorReading[];
    granularity: TimeGranularity;
    expanded: boolean;
    predictionStart: number;
    visibleSensors: Record<string, boolean>;
}) {
    const height = expanded ? 300 : 100;
    const safePredictionStart = Math.min(predictionStart, data.length);
    const yDomain: [number, number] = [0, 100];

    // 1. AÑADIMOS 'anomaly_y' DENTRO DE LA DATA PRINCIPAL
    const historicalData = useMemo(() => {
        return data.slice(0, safePredictionStart).map(sensor => ({
            ...sensor,
            vibration_norm: normalizeForDisplay(sensor.vibration, 'vibration'),
            temperature_norm: normalizeForDisplay(sensor.temperature, 'temperature'),
            pressure_norm: normalizeForDisplay(sensor.pressure, 'pressure'),
            humidity_norm: normalizeForDisplay(sensor.humidity, 'humidity'),
            // Si es anomalía, guardamos el valor normalizado. Si no, null (Recharts ignora nulls)
            anomaly_y: sensor.anomaly ? normalizeForDisplay(sensor.vibration, 'vibration') : null
        }));
    }, [data, safePredictionStart]);

    const forecastData = useMemo(() => {
        return data.slice(safePredictionStart).map(sensor => ({
            ...sensor,
            vibration_norm: normalizeForDisplay(sensor.vibration, 'vibration'),
            temperature_norm: normalizeForDisplay(sensor.temperature, 'temperature'),
            pressure_norm: normalizeForDisplay(sensor.pressure, 'pressure'),
            humidity_norm: normalizeForDisplay(sensor.humidity, 'humidity'),
            // Lo mismo para el futuro
            anomaly_y: sensor.anomaly ? normalizeForDisplay(sensor.vibration, 'vibration') : null
        }));
    }, [data, safePredictionStart]);

    return (
        <div>
            <div className="flex w-full">
                {/* Historical Chart */}
                <div className="w-[80%]">
                    <ResponsiveContainer width="100%" height={height} minWidth={0}>
                        <ComposedChart
                            data={historicalData}
                            margin={{ top: 5, right: 0, bottom: 0, left: 0 }}
                        >
                            <ChartDefs />
                            <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(v) => formatTimestamp(v, granularity)}
                                tick={{ fontSize: 9, fill: '#FFFFFF' }}
                                axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 9, fill: '#FFFFFF' }}
                                axisLine={false}
                                tickLine={false}
                                domain={yDomain}
                                width={COMMON_Y_AXIS_WIDTH}
                                label={{ value: 'Norm', angle: -90, position: 'insideLeft', offset: -5, fontSize: 8, fill: '#98A6D4' }}
                            />
                            <Tooltip content={<SensorTooltip />} wrapperStyle={{ zIndex: 50 }} />

                            {/* Reference Lines */}
                            {expanded && (
                                <>
                                    <ReferenceLine
                                        y={normalizeForDisplay(8, 'vibration')}
                                        stroke="#f59e0b"
                                        strokeDasharray="6 3"
                                        strokeWidth={1}
                                        label={{ value: 'Vib Warning', position: 'right', fontSize: 8, fill: '#f59e0b' }}
                                    />
                                    <ReferenceLine
                                        y={normalizeForDisplay(12, 'vibration')}
                                        stroke="#ef4444"
                                        strokeDasharray="6 3"
                                        strokeWidth={1}
                                        label={{ value: 'Vib Critical', position: 'right', fontSize: 8, fill: '#ef4444' }}
                                    />
                                </>
                            )}

                            {/* Lines / Areas */}
                            {visibleSensors.pressure && <Area type="monotone" dataKey="pressure_norm" stroke="#A9FFB5" strokeWidth={3} fill="url(#gradient-pressure)" />}
                            {visibleSensors.temperature && <Area type="monotone" dataKey="temperature_norm" stroke="#FFCEBD" strokeWidth={3} fill="url(#gradient-temperature)" />}
                            {visibleSensors.vibration && <Area type="monotone" dataKey="vibration_norm" stroke="#F7E2FF" strokeWidth={3} fill="url(#gradient-vibration)" />}
                            {visibleSensors.humidity && <Area type="monotone" dataKey="humidity_norm" stroke="#7BC3FF" strokeWidth={3} fill="url(#gradient-humidity)" />}

                            {/* SCATTER */}
                            <Scatter
                                dataKey="anomaly_y"
                                fill="#f59e0b"
                                isAnimationActive={false}
                                shape={(props: any) => {
                                    if (props.payload.anomaly_y === null) return null;
                                    return (
                                        <circle
                                            cx={props.cx}
                                            cy={props.cy}
                                            r={6}
                                            fill={props.payload.alertLevel === 'critical' ? '#ef4444' : '#f59e0b'}
                                            stroke="#18181b"
                                            strokeWidth={2}
                                        />
                                    );
                                }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* Separator */}
                <div className="w-[2px] bg-[#98A6D4] relative opacity-30">
                    <div className="absolute inset-0 border-l-2 border-dashed border-[#98A6D4]" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#98A6D4] text-[#171921] text-[8px] px-1 py-0.5 rounded font-bold whitespace-nowrap">
                        NOW
                    </div>
                </div>

                {/* Forecast Chart */}
                <div className="w-[20%]">
                    <ResponsiveContainer width="100%" height={height} minWidth={0}>
                        <ComposedChart
                            data={forecastData}
                            margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
                        >
                            <ChartDefs />
                            <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(v) => formatTimestamp(v, granularity)}
                                tick={{ fontSize: 9, fill: '#FFFFFF' }}
                                axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                                tickLine={false}
                            />
                            <YAxis tick={false} axisLine={false} tickLine={false} domain={yDomain} width={0} />
                            <Tooltip content={<SensorTooltip />} wrapperStyle={{ zIndex: 50 }} />

                            {/* Using Areas for forecast too, but maybe with dashed stroke if supported or less opacity */}
                            {visibleSensors.pressure && <Area type="monotone" dataKey="pressure_norm" stroke="#A9FFB5" strokeWidth={2} strokeDasharray="4 4" fill="url(#gradient-pressure)" fillOpacity={0.5} />}
                            {visibleSensors.temperature && <Area type="monotone" dataKey="temperature_norm" stroke="#FFCEBD" strokeWidth={2} strokeDasharray="4 4" fill="url(#gradient-temperature)" fillOpacity={0.5} />}
                            {visibleSensors.vibration && <Area type="monotone" dataKey="vibration_norm" stroke="#F7E2FF" strokeWidth={2} strokeDasharray="4 4" fill="url(#gradient-vibration)" fillOpacity={0.5} />}
                            {visibleSensors.humidity && <Area type="monotone" dataKey="humidity_norm" stroke="#7BC3FF" strokeWidth={2} strokeDasharray="4 4" fill="url(#gradient-humidity)" fillOpacity={0.5} />}

                            <Scatter
                                dataKey="anomaly_y"
                                fill="#f59e0b"
                                isAnimationActive={false}
                                shape={(props: any) => {
                                    if (props.payload.anomaly_y === null) return null;
                                    return (
                                        <circle
                                            cx={props.cx}
                                            cy={props.cy}
                                            r={5}
                                            fill={props.payload.alertLevel === 'critical' ? '#ef4444' : '#f59e0b'}
                                            stroke="#18181b"
                                            strokeWidth={1}
                                            opacity={0.7}
                                        />
                                    );
                                }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {visibleSensors.camera && <VideoFrameStrip data={data} />}
        </div>
    );
}

function EnergyLayer({
    data,
    granularity,
    expanded,
    predictionStart,
}: {
    data: EnergyReading[];
    granularity: TimeGranularity;
    expanded: boolean;
    predictionStart: number;
}) {
    const height = expanded ? 300 : 100;

    // Guard: during granularity transition, predictionStart may exceed data.length
    const safePredictionStart = Math.min(predictionStart, data.length);

    // Split data into historical and forecast
    const historicalData = useMemo(() => data.slice(0, safePredictionStart), [data, safePredictionStart]);
    const forecastData = useMemo(() => data.slice(safePredictionStart), [data, safePredictionStart]);

    // Calculate shared Y-axis domain
    const yDomain = useMemo(() => {
        const allPower = data.map(d => d.powerDraw);
        const maxVal = Math.max(...allPower);
        return [0, Math.ceil(maxVal * 1.2)];
    }, [data]);

    return (
        <div className="flex w-full">
            {/* Historical Chart - 80% */}
            <div className="w-[80%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ComposedChart
                        data={historicalData}
                        margin={{ top: 5, right: 0, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="timestamp"
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
                        <ChartDefs />
                        {/* Power - Area with Neon Gradient */}
                        <Area
                            type="monotone"
                            dataKey="powerDraw"
                            stroke="#fbbf24"
                            strokeWidth={2}
                            fill="url(#gradient-power)"
                            activeDot={{ r: 4, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
                        />
                        {/* Cooling - Area with Neon Gradient (expanded only) */}
                        {expanded && (
                            <Area
                                type="monotone"
                                dataKey="coolingLoad"
                                stroke="#fb923c"
                                strokeWidth={2}
                                strokeDasharray="3 3"
                                fill="url(#gradient-cooling)"
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Dashed separator */}
            <div className="w-[2px] bg-[#98A6D4] relative opacity-30">
                <div className="absolute inset-0 border-l-2 border-dashed border-[#98A6D4]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#98A6D4] text-[#171921] text-[8px] px-1 py-0.5 rounded font-bold whitespace-nowrap">
                    NOW
                </div>
            </div>

            {/* Forecast Chart - 20% */}
            <div className="w-[20%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ComposedChart
                        data={forecastData}
                        margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(v) => formatTimestamp(v, granularity)}
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                            tickLine={false}
                        />
                        {/* Hidden Y-axis with same domain */}
                        <YAxis tick={false} axisLine={false} tickLine={false} width={0} domain={yDomain} />
                        <Tooltip content={<EnergyTooltip />} wrapperStyle={{ zIndex: 50 }} />

                        <ChartDefs />
                        {/* Confidence bands */}
                        <Area type="monotone" dataKey="upperBound" stroke="none" fill="#3b82f610" />
                        <Area type="monotone" dataKey="lowerBound" stroke="none" fill="#f3f4f610" />

                        {/* Predicted Power - Area with lower opacity */}
                        <Area
                            type="monotone"
                            dataKey="predicted"
                            stroke="#818cf8"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            fill="url(#gradient-power)"
                            fillOpacity={0.5}
                        />
                        {/* Cooling load - dashed (expanded only) */}
                        {expanded && (
                            <Area
                                type="monotone"
                                dataKey="coolingLoad"
                                stroke="#fb923c"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                fill="url(#gradient-cooling)"
                                fillOpacity={0.5}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ActionsLayer({
    data,
    granularity,
    expanded,
    forecastBoundaryTimestamp,
    lastTimestamp,
    firstTimestamp,
}: {
    data: ActionEvent[];
    granularity: TimeGranularity;
    expanded: boolean;
    forecastBoundaryTimestamp: number;
    lastTimestamp: number;
    firstTimestamp: number;
}) {
    const height = expanded ? 300 : 160; // Increased collapsed height from 120 to 160

    // BUG #4 FIX: Use forecastBoundaryTimestamp from hook instead of data.length * 0.8
    const historicalData = useMemo(() =>
        data.filter(a => a.timestamp < forecastBoundaryTimestamp).map((a) => ({
            ...a,
            categoryY: categoryToY[a.category] ?? 0,
        })),
        [data, forecastBoundaryTimestamp]
    );

    const forecastData = useMemo(() =>
        data.filter(a => a.timestamp >= forecastBoundaryTimestamp).map((a) => ({
            ...a,
            categoryY: categoryToY[a.category] ?? 0,
        })),
        [data, forecastBoundaryTimestamp]
    );

    return (
        <div className="flex w-full bg-[#171921]">
            {/* Historical Scatter - 80% */}
            <div className="w-[80%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ScatterChart
                        margin={{ top: 5, right: 0, bottom: 20, left: 0 }}
                        syncId="actions-layer"
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={[firstTimestamp, forecastBoundaryTimestamp]}
                            tickFormatter={(v) => formatTimestamp(v, granularity)}
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                            tickLine={false}
                        />
                        <YAxis
                            type="number"
                            dataKey="categoryY"
                            domain={[-1, 6]} // Add padding for top/bottom
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
                            data={historicalData}
                            dataKey="categoryY"
                            shape={(props: any) => {
                                const event = props.payload as ActionEvent & { categoryY: number };
                                const color = event.isAI ? '#6366f1' : '#a855f7'; // AI: Indigo, Human: Purple
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
            </div>

            {/* Dashed separator */}
            <div className="w-[2px] bg-[#98A6D4] relative opacity-30">
                <div className="absolute inset-0 border-l-2 border-dashed border-[#98A6D4]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#98A6D4] text-[#171921] text-[8px] px-1 py-0.5 rounded font-bold whitespace-nowrap">
                    NOW
                </div>
            </div>

            {/* Forecast Scatter - 20% */}
            <div className="w-[20%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ScatterChart
                        margin={{ top: 5, right: 20, bottom: 20, left: 0 }}
                        syncId="actions-layer"
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        {/* Explicit domain prevents empty chart collapse when no forecast actions exist */}
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={[forecastBoundaryTimestamp, lastTimestamp]}
                            tickFormatter={(v) => formatTimestamp(v, granularity)}
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                            tickLine={false}
                        />
                        {/* Hidden Y-axis */}
                        <YAxis
                            type="number"
                            dataKey="categoryY"
                            domain={[-0.5, 5.5]}
                            tick={false}
                            axisLine={false}
                            tickLine={false}
                            width={0}
                        />
                        <Tooltip content={<ActionTooltip />} wrapperStyle={{ zIndex: 50 }} />

                        <ChartDefs />
                        <Scatter
                            data={forecastData}
                            dataKey="categoryY"
                            shape={(props: any) => {
                                const event = props.payload as ActionEvent & { categoryY: number };
                                const color = event.isAI ? '#6366f1' : '#a855f7';
                                if (event.isAI) {
                                    return (
                                        <polygon
                                            points={`${props.cx},${props.cy - 5} ${props.cx + 5},${props.cy} ${props.cx},${props.cy + 5} ${props.cx - 5},${props.cy}`}
                                            fill={color}
                                            fillOpacity={0.1}
                                            stroke={color}
                                            strokeWidth={2}
                                            strokeDasharray="4 4"
                                            filter="url(#neon-glow)"
                                        />
                                    );
                                }
                                return (
                                    <circle
                                        cx={props.cx}
                                        cy={props.cy}
                                        r={5}
                                        fill={color}
                                        fillOpacity={0.1}
                                        stroke={color}
                                        strokeWidth={2}
                                        strokeDasharray="4 4"
                                        filter="url(#neon-glow)"
                                    />
                                );
                            }}
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function ProductLayer({
    data,
    granularity,
    expanded,
    predictionStart,
}: {
    data: ProductMetric[];
    granularity: TimeGranularity;
    expanded: boolean;
    predictionStart: number;
}) {
    const height = expanded ? 300 : 100;

    // Guard: during granularity transition, predictionStart may exceed data.length
    const safePredictionStart = Math.min(predictionStart, data.length);

    // Split data into historical and forecast
    const historicalData = useMemo(() => data.slice(0, safePredictionStart), [data, safePredictionStart]);
    const forecastData = useMemo(() => data.slice(safePredictionStart), [data, safePredictionStart]);

    // Calculate shared Y-axis domain from full dataset
    const yDomain = useMemo(() => {
        const allOutputs = data.map(d => d.output);
        const allTargets = data.map(d => d.target);
        const maxVal = Math.max(...allOutputs, ...allTargets);
        return [0, Math.ceil(maxVal * 1.1)];
    }, [data]);

    return (
        <div className="flex w-full">
            {/* Historical Chart - 80% */}
            <div className="w-[80%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ComposedChart
                        data={historicalData}
                        margin={{ top: 5, right: 0, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(v) => formatTimestamp(v, granularity)}
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            domain={yDomain}
                            tickFormatter={formatNumber}
                        />
                        <Tooltip content={<ProductTooltip />} wrapperStyle={{ zIndex: 50 }} />
                        <ChartDefs />
                        {/* Target area - solid */}
                        <Area type="monotone" dataKey="target" fill="#a78bfa15" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                        {/* Output - Area with Neon Gradient */}
                        <Area
                            type="monotone"
                            dataKey="output"
                            stroke="#a78bfa"
                            strokeWidth={2}
                            fill="url(#gradient-product)"
                            activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }}
                        />
                        {/* Uptime (expanded only) */}
                        {expanded && (
                            <YAxis yAxisId={1} orientation="right" tick={{ fontSize: 9, fill: '#FFFFFF' }} axisLine={false} tickLine={false} width={35} tickFormatter={(v: number) => v + '%'} />
                        )}
                        {expanded && (
                            <Line isAnimationActive={false} type="monotone" dataKey="uptime" stroke="#4ade80" strokeWidth={1} dot={false} strokeDasharray="2 2" yAxisId={1} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Dashed separator */}
            <div className="w-[2px] bg-[#98A6D4] relative opacity-30">
                <div className="absolute inset-0 border-l-2 border-dashed border-[#98A6D4]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#98A6D4] text-[#171921] text-[8px] px-1 py-0.5 rounded font-bold whitespace-nowrap">
                    NOW
                </div>
            </div>

            {/* Forecast Chart - 20% */}
            <div className="w-[20%]">
                <ResponsiveContainer width="100%" height={height} minWidth={0}>
                    <ComposedChart
                        data={forecastData}
                        margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
                    >
                        <CartesianGrid strokeDasharray="2 4" stroke="#98A6D4" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(v) => formatTimestamp(v, granularity)}
                            tick={{ fontSize: 9, fill: '#FFFFFF' }}
                            axisLine={{ stroke: '#98A6D4', strokeOpacity: 0.3 }}
                            tickLine={false}
                        />
                        {/* Hidden Y-axis with same domain */}
                        <YAxis tick={false} axisLine={false} tickLine={false} width={0} domain={yDomain} />
                        <Tooltip content={<ProductTooltip />} wrapperStyle={{ zIndex: 50 }} />

                        <ChartDefs />
                        {/* Target area - forecast (lighter) */}
                        <Area type="monotone" dataKey="target" fill="#a78bfa10" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                        {/* Output - Forecast Area */}
                        <Area
                            type="monotone"
                            dataKey="output"
                            stroke="#a78bfa"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            fill="url(#gradient-product)"
                            fillOpacity={0.5}
                        />
                        {/* Uptime - dashed (expanded only) */}
                        {expanded && (
                            <YAxis yAxisId={1} orientation="right" tick={false} axisLine={false} tickLine={false} width={0} />
                        )}
                        {expanded && (
                            <Line isAnimationActive={false} type="monotone" dataKey="uptime" stroke="#4ade80" strokeWidth={1} dot={false} strokeDasharray="4 2" yAxisId={1} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

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
}: {
    visibleSensors: Record<string, boolean>;
    setVisibleSensors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-[#171921] border-b border-[#98A6D4]/30">
            {[
                { key: 'vibration', label: 'Vibration', color: '#f97316' },
                { key: 'camera', label: 'Camera', color: '#64748b' },
                { key: 'temperature', label: 'Temperature', color: '#34d399' },
                { key: 'humidity', label: 'Humidity', color: '#60a5fa' },
                { key: 'pressure', label: 'Pressure', color: '#8b5cf6' },
            ].map(({ key, label, color }) => (
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
                        {label}
                    </span>
                </label>
            ))}
        </div>
    );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
interface MultiLayerTimelineProps {
    autoTriggerAnomaly?: boolean;
    onAnomalyTriggered?: () => void;
}

export function MultiLayerTimeline({ autoTriggerAnomaly, onAnomalyTriggered }: MultiLayerTimelineProps) {
    const [granularity, setGranularity] = useState<TimeGranularity>('Day');
    const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
    const [visibleSensors, setVisibleSensors] = useState<Record<string, boolean>>({
        vibration: true,
        camera: true,
        temperature: false,
        humidity: false,
        pressure: false,
    });

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
        timestamps,
        sensorData,
        energyData,
        actionData,
        productData,
        pointCount,
        predictionStart,
        forecastBoundaryTimestamp,
        isStreaming,
        triggerAnomaly,
    } = useMultiLayerData(granularity);

    const lastTimestamp = useMemo(
        () => (timestamps.length > 0 ? timestamps[timestamps.length - 1] : null),
        [timestamps]
    );

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
    const aiCount = useMemo(
        () => actionData.filter((a) => a.isAI).length,
        [actionData]
    );
    const humanCount = useMemo(
        () => actionData.filter((a) => !a.isAI).length,
        [actionData]
    );

    return (
        <div className="w-full min-h-full bg-[#171921] text-white flex flex-col">
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
                            Zoom: {granularity} · {pointCount} data points · syncId: tripolar-timeline
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

            {/* Layers */}
            <div className="divide-y divide-[#98A6D4]/30">
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
                                <span className="text-violet-600 font-mono">
                                    {formatNumber(latestProduct.output)} units/min
                                </span>
                                <span
                                    className={`font-mono ${latestProduct.uptime >= 95
                                        ? 'text-emerald-600'
                                        : 'text-slate-500'
                                        }`}
                                >
                                    {latestProduct.uptime.toFixed(1)}% uptime
                                </span>
                            </div>
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'product') && (
                        <div className="px-2">
                            <ProductLayer
                                data={productData}
                                granularity={granularity}
                                expanded={expandedLayer === 'product'}
                                predictionStart={predictionStart}
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
                        stats={
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
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'sensors') && (
                        <>
                            {/* Sensor filter bar between header and chart */}
                            <SensorFilterBar
                                visibleSensors={visibleSensors}
                                setVisibleSensors={setVisibleSensors}
                            />
                            <div className="px-2">
                                <SensorLayer
                                    data={sensorData}
                                    granularity={granularity}
                                    expanded={expandedLayer === 'sensors'}
                                    predictionStart={predictionStart}
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
                                <span className="text-amber-600 font-mono">
                                    {latestEnergy.powerDraw} kW
                                </span>
                                <span className="text-yellow-600 font-mono">
                                    {latestEnergy.efficiency.toFixed(1)}% eff
                                </span>
                                <span className="text-yellow-700 flex items-center gap-1">
                                    <Zap size={12} /> {latestEnergy.costPerHour.toFixed(2)} AED/h
                                </span>
                            </div>
                        }
                    />
                    {(!expandedLayer || expandedLayer === 'energy') && (
                        <div className="px-2">
                            <EnergyLayer
                                data={energyData}
                                granularity={granularity}
                                expanded={expandedLayer === 'energy'}
                                predictionStart={predictionStart}
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
                                <span className="text-indigo-600 font-mono">
                                    {actionData.length} events
                                </span>
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
                                granularity={granularity}
                                expanded={expandedLayer === 'actions'}
                                forecastBoundaryTimestamp={forecastBoundaryTimestamp}
                                lastTimestamp={lastTimestamp ?? Date.now()}
                                firstTimestamp={timestamps[0] ?? Date.now()}
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
                        <span
                            className="w-6 h-px bg-indigo-400 inline-block"
                            style={{ borderTop: '1px dashed #818cf8' }}
                        />{' '}
                        Predicted
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
