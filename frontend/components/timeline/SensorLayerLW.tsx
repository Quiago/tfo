'use client';

/**
 * SensorLayerLW — Canvas-based drop-in replacement for the Recharts SensorLayer.
 *
 * WHY lightweight-charts instead of Recharts for streaming data:
 * ┌────────────────────┬────────────────────────────┬────────────────────────────┐
 * │                    │ Recharts (SVG)             │ lightweight-charts (Canvas) │
 * ├────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ New data point     │ React diffing + SVG DOM    │ series.update() → O(1)     │
 * │                    │ update = O(n) reconcile    │ canvas paint, zero React   │
 * ├────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ Parent re-renders  │ Full SVG re-draw every 2s  │ Zero — chart lives in ref  │
 * ├────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ Window change      │ Re-render + new xDomain    │ setVisibleRange() instant  │
 * ├────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ Tooltip            │ React portal on crosshair  │ subscribeCrosshairMove()   │
 * ├────────────────────┼────────────────────────────┼────────────────────────────┤
 * │ Main thread cost   │ High (JS + layout + paint) │ Very low (canvas only)     │
 * └────────────────────┴────────────────────────────┴────────────────────────────┘
 *
 * Streaming strategy:
 *   • On initial mount / window change → series.setData(allPoints) - O(n) one-shot
 *   • On each new 2s poll → series.update(latestPoint) - O(1), no React re-render
 *   • xDomain changes → chart.timeScale().setVisibleRange() - sub-millisecond
 *
 * Drop-in: replace <SensorLayer ... /> with <SensorLayerLW ... /> in Timeline.tsx.
 * Same props, same behaviour — just faster.
 */

import {
    createChart,
    CrosshairMode,
    LineStyle,
    ColorType,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp,
    type LineData,
} from 'lightweight-charts';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { SensorReading, SignalMeta } from '@/lib/types/timeline';
import type { TimeGranularity } from '@/lib/types/timeline';

// ─── CHANNEL CONFIG ──────────────────────────────────────────────────────────

type Field = 'temperature' | 'vibration' | 'pressure' | 'humidity';

const CHANNELS: { field: Field; lineColor: string; topColor: string; bottomColor: string }[] = [
    { field: 'temperature', lineColor: '#FFCEBD', topColor: 'rgba(255,206,189,0.25)', bottomColor: 'rgba(255,206,189,0.01)' },
    { field: 'vibration',   lineColor: '#F7E2FF', topColor: 'rgba(247,226,255,0.20)', bottomColor: 'rgba(247,226,255,0.01)' },
    { field: 'pressure',    lineColor: '#A9FFB5', topColor: 'rgba(169,255,181,0.20)', bottomColor: 'rgba(169,255,181,0.01)' },
    { field: 'humidity',    lineColor: '#7BC3FF', topColor: 'rgba(123,195,255,0.20)', bottomColor: 'rgba(123,195,255,0.01)' },
];

const DOT_COLOR: Record<Field, string> = {
    temperature: 'bg-emerald-400',
    vibration:   'bg-orange-400',
    pressure:    'bg-green-400',
    humidity:    'bg-blue-400',
};

// ─── TOOLTIP STATE ───────────────────────────────────────────────────────────

interface TooltipState {
    x: number;
    y: number;
    time: number;          // epoch ms
    values: Partial<Record<Field, number>>;
    rawValues: Partial<Record<Field, number | null>>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Convert epoch-ms to lightweight-charts UTCTimestamp (epoch-seconds). */
function toUTC(ms: number): UTCTimestamp {
    return Math.floor(ms / 1000) as UTCTimestamp;
}

function formatTs(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

interface SensorLayerLWProps {
    data: SensorReading[];
    xDomain: [number, number];
    granularity: TimeGranularity;
    expanded: boolean;
    visibleSensors: Record<string, boolean>;
    signalMeta: SignalMeta[];
}

export const SensorLayerLW = memo(function SensorLayerLW({
    data,
    xDomain,
    expanded,
    visibleSensors,
    signalMeta,
}: SensorLayerLWProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef     = useRef<IChartApi | null>(null);
    const seriesRef    = useRef<Partial<Record<Field, ISeriesApi<'Area'>>>>({});
    const prevDataLen  = useRef(0);   // tracks whether to use update() vs setData()
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const height = expanded ? 300 : 100;

    // ── Signal metadata lookup ────────────────────────────────────────────────
    const metaByField = useMemo(
        () => Object.fromEntries(signalMeta.map((m) => [m.field, m])),
        [signalMeta],
    );

    // ── Chart initialization (once per mount) ─────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            width:  containerRef.current.clientWidth,
            height,
            layout: {
                background:  { type: ColorType.Solid, color: 'transparent' },
                textColor:   '#FFFFFF',
                fontFamily:  'inherit',
                fontSize:    9,
            },
            grid: {
                vertLines: { color: 'rgba(152,166,212,0.25)', style: LineStyle.Dashed },
                horzLines: { color: 'rgba(152,166,212,0.25)', style: LineStyle.Dashed },
            },
            timeScale: {
                timeVisible:     true,
                secondsVisible:  true,
                borderColor:     'rgba(152,166,212,0.3)',
                fixLeftEdge:     false,
                fixRightEdge:    false,
                rightOffset:     3,
            },
            rightPriceScale: {
                borderColor: 'rgba(152,166,212,0.3)',
                scaleMargins: { top: 0.05, bottom: 0.05 },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: 'rgba(152,166,212,0.6)', width: 1, style: LineStyle.Solid },
                horzLine: { color: 'rgba(152,166,212,0.6)', width: 1, style: LineStyle.Solid },
            },
            handleScroll: false,
            handleScale:  false,
        });

        // Y-axis auto-scale is fine — normalized values stay in 0–100 naturally
        chart.priceScale('right').applyOptions({ autoScale: true });

        // Create one area series per channel
        for (const ch of CHANNELS) {
            const series = chart.addAreaSeries({
                lineColor:       ch.lineColor,
                topColor:        ch.topColor,
                bottomColor:     ch.bottomColor,
                lineWidth:       2,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius:  4,
            });
            seriesRef.current[ch.field] = series;
        }

        // Custom tooltip via crosshair subscription
        chart.subscribeCrosshairMove((param) => {
            if (!param.point || !param.time || !containerRef.current) {
                setTooltip(null);
                return;
            }

            const values: Partial<Record<Field, number>>         = {};
            const rawValues: Partial<Record<Field, number | null>> = {};

            for (const ch of CHANNELS) {
                const series = seriesRef.current[ch.field];
                if (!series) continue;
                const sd = param.seriesData.get(series) as LineData | undefined;
                if (sd?.value != null) values[ch.field] = sd.value;
            }

            // Match the closest data point for raw engineering values
            if (param.time) {
                const targetMs = (param.time as number) * 1000;
                // Find the reading whose timestamp is closest to the crosshair
                let closest: SensorReading | undefined;
                let minDiff = Infinity;
                for (const r of data) {
                    const diff = Math.abs(r.timestamp - targetMs);
                    if (diff < minDiff) { minDiff = diff; closest = r; }
                }
                if (closest) {
                    rawValues.temperature = closest.rawTemperature ?? null;
                    rawValues.vibration   = closest.rawVibration   ?? null;
                    rawValues.pressure    = closest.rawPressure    ?? null;
                    rawValues.humidity    = closest.rawHumidity    ?? null;
                }
            }

            const containerRect = containerRef.current.getBoundingClientRect();
            setTooltip({
                x:         param.point.x,
                y:         param.point.y,
                time:      (param.time as number) * 1000,
                values,
                rawValues,
            });
        });

        chartRef.current = chart;

        // Responsive width
        const ro = new ResizeObserver(() => {
            chart.applyOptions({ width: containerRef.current?.clientWidth ?? 0 });
        });
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = {};
            prevDataLen.current = 0;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally once

    // ── Height sync ───────────────────────────────────────────────────────────
    useEffect(() => {
        chartRef.current?.applyOptions({ height });
    }, [height]);

    // ── Data update + visible range (merged into one effect) ─────────────────
    //
    // WHY merged: setVisibleRange throws "Value is null" when called before any
    // data is loaded. Merging guarantees the range is only set after the series
    // have data — the only safe moment to call it.
    //
    // Streaming strategy:
    //   isIncremental = previousLength > 0 AND grew by exactly 1
    //   → series.update() O(1), no full redraw
    //   anything else (initial load, history pre-population, window change)
    //   → series.setData() then setVisibleRange
    useEffect(() => {
        if (!data.length || !chartRef.current) return;

        // prevDataLen.current > 0 guards against treating the very first batch
        // as incremental (data.length === 1 would match 0+1 incorrectly).
        const isIncremental =
            prevDataLen.current > 0 && data.length === prevDataLen.current + 1;
        prevDataLen.current = data.length;

        for (const ch of CHANNELS) {
            const series = seriesRef.current[ch.field];
            if (!series) continue;

            series.applyOptions({ visible: visibleSensors[ch.field] !== false });

            if (!visibleSensors[ch.field]) continue;

            if (isIncremental) {
                // ── RULE 4: O(1) streaming update — zero React reconciliation ──
                const last = data[data.length - 1];
                series.update({ time: toUTC(last.timestamp), value: last[ch.field] as number });
            } else {
                // ── Full redraw (initial load, window/granularity change) ──────
                // Deduplicate consecutive points with the same epoch-second to prevent
                // "data must be asc ordered by time" assertion from lightweight-charts.
                const points: LineData[] = data
                    .map((r) => ({ time: toUTC(r.timestamp), value: r[ch.field] as number }))
                    .filter((p, i, arr) => i === 0 || p.time !== arr[i - 1].time);
                series.setData(points);
            }
        }

        // Defer setVisibleRange via rAF so it runs after LW's internal fitContent
        // that fires synchronously after setData() — this fixes the left-vs-right
        // misalignment between the sensor chart and the Recharts energy/product charts.
        const chart = chartRef.current;
        requestAnimationFrame(() => {
            try {
                chart?.timeScale().setVisibleRange({
                    from: toUTC(xDomain[0]),
                    to:   toUTC(xDomain[1]),
                });
            } catch {
                // Thrown when loaded range doesn't intersect xDomain — chart auto-fits.
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, xDomain]); // xDomain included so granularity/window switches scroll correctly

    // Visibility-only changes (filter bar toggles, no new data)
    useEffect(() => {
        for (const ch of CHANNELS) {
            seriesRef.current[ch.field]?.applyOptions({
                visible: visibleSensors[ch.field] !== false,
            });
        }
    }, [visibleSensors]);

    // ── Tooltip positioning logic ─────────────────────────────────────────────
    const TOOLTIP_W = 220;
    const tooltipStyle = useCallback(
        (x: number, y: number): React.CSSProperties => {
            const w = containerRef.current?.clientWidth ?? 800;
            const left = x + TOOLTIP_W > w ? x - TOOLTIP_W - 8 : x + 16;
            return { position: 'absolute', top: Math.max(4, y - 8), left };
        },
        [],
    );

    return (
        <div className="relative w-full" style={{ height }}>
            <div ref={containerRef} className="w-full h-full" />

            {/* Custom tooltip rendered in React, data from crosshair subscription */}
            {tooltip && (
                <div
                    className="pointer-events-none z-50 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs"
                    style={tooltipStyle(tooltip.x, tooltip.y)}
                >
                    <p className="text-slate-400 mb-1">{formatTs(tooltip.time)}</p>
                    {CHANNELS.map(({ field }) => {
                        if (visibleSensors[field] === false) return null;
                        const meta    = metaByField[field];
                        const label   = meta?.displayName ?? field;
                        const unit    = meta?.unit ?? '';
                        const rawVal  = tooltip.rawValues[field];
                        const normVal = tooltip.values[field];
                        const display = rawVal != null
                            ? `${rawVal.toFixed(2)} ${unit}`
                            : normVal != null ? `${normVal.toFixed(1)}% (norm)` : '—';
                        return (
                            <div key={field} className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full inline-block ${DOT_COLOR[field]}`} />
                                <span className="text-slate-300">{label}:</span>
                                <span className="font-semibold text-white">{display}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
