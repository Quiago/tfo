'use client'

import type { TfoModule } from '@/lib/types/tfo'
import { PLATFORM_CONTENT } from '@/lib/content/platform-content'
import { useAuthStore } from '@/lib/store/auth-store'
import rp from '@/styles/overview/right-panel.module.css'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts'

// ─── Constants ──────────────────────────────────────────────────────────────
const PRODUCTION_DATA = [
    { day: 'Mon', value: 65 },
    { day: 'Tue', value: 70 },
    { day: 'Wed', value: 60 },
    { day: 'Thu', value: 75 },
    { day: 'Fri', value: 80 },
    { day: 'Sat', value: 50 },
    { day: 'Sun', value: 70 },
]

const ENERGY_DATA = [
    { day: 'Mon', d1: 140, d2: 100, d3: 120 },
    { day: 'Tue', d1: 80, d2: 110, d3: 90 },
    { day: 'Wed', d1: 120, d2: 95, d3: 85 },
    { day: 'Thu', d1: 180, d2: 120, d3: 110 },
    { day: 'Fri', d1: 160, d2: 170, d3: 130 },
    { day: 'Sat', d1: 40, d2: 50, d3: 35 },
    { day: 'Sun', d1: 175, d2: 90, d3: 60 },
]

interface RightPanelProps {
    onNavigate: (mod: TfoModule) => void
    activeAlerts: { id: string; zone: string; sensor: string; severity: string; message: string; timeAgo: string }[]
}

export function RightPanel({
    onNavigate,
    activeAlerts,
}: RightPanelProps) {
    const platformMode = useAuthStore((s) => s.platformMode)
    const { rightPanel } = PLATFORM_CONTENT[platformMode]

    return (
        <aside className={rp.rightPanel}>
            {/* 1. Efficiency Chart (Stacked Area) */}
            <div className={`${rp.card} h-[28%]`}>
                <div className={rp.cardTitle}>{rightPanel.chart1Title}</div>
                <div className={`${rp.chartContainer} h-[calc(100%-20px)]`}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={PRODUCTION_DATA}>
                            <defs>
                                <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--tp-chart-area-light)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--tp-chart-area-light)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="var(--tp-chart-grid)" strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="day"
                                tick={{ fill: 'var(--tp-text-muted)', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tick={{ fill: 'var(--tp-text-muted)', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                domain={[0, 100]}
                                dx={-10}

                            />
                            <Tooltip contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px', color: '#64748B' }} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="var(--tp-chart-line-light)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorProd)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Consumption Chart (Grouped Bar) */}
            <div className={`${rp.card} h-[28%]`}>
                <div className="flex justify-between items-start mb-2">
                    <div className={rp.cardTitle}>{rightPanel.chart2Title}</div>
                    <div className={rp.chartLegend}>
                        <span className={rp.legendDot}>
                            <span className={`${rp.legendDotCircle} bg-emerald-300`} /> D1
                        </span>
                        <span className={rp.legendDot}>
                            <span className={`${rp.legendDotCircle} bg-teal-500`} /> D2
                        </span>
                        <span className={rp.legendDot}>
                            <span className={`${rp.legendDotCircle} bg-cyan-300`} /> D3
                        </span>
                    </div>
                </div>
                <div className={`${rp.chartContainer} h-[calc(100%-28px)]`}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={ENERGY_DATA} barGap={2}>
                            <CartesianGrid vertical={false} stroke="var(--tp-chart-grid)" strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="day"
                                tick={{ fill: 'var(--tp-text-muted)', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis
                                tick={{ fill: 'var(--tp-text-muted)', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                dx={-10}
                            />
                            <Tooltip
                                cursor={{ fill: 'var(--tp-bg-main)', opacity: 0.4 }}
                                contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px', color: '#64748B' }}
                            />
                            <Bar dataKey="d1" fill="#6EE7B7" radius={[2, 2, 0, 0]} />
                            <Bar dataKey="d2" fill="#2DD4BF" radius={[2, 2, 0, 0]} />
                            <Bar dataKey="d3" fill="#67E8F9" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 3. Active Alerts (Scrollable List) */}
            <div className={`${rp.card} flex-1 min-h-0 flex flex-col`}>
                <div className={rp.cardTitle}>{rightPanel.alertsTitle}</div>
                <div className="flex-1 overflow-y-auto pr-1 space-y-1">
                    {activeAlerts.map(alert => (
                        <div key={alert.id} className={rp.alertItem}>
                            <div className={`${rp.alertIcon} ${alert.severity === 'critical' ? rp.alertIconCritical : rp.alertIconWarning}`}>
                                <AlertTriangle size={14} />
                            </div>
                            <div className={rp.alertText}>
                                <div className={rp.alertTitle}>{alert.zone} — {alert.sensor}</div>
                                <div className={rp.alertDesc}>{alert.message}</div>
                            </div>
                            <button
                                onClick={() => onNavigate('opshub')}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-all"
                            >
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    ))}
                    {activeAlerts.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                            <CheckCircle2 size={24} className="text-emerald-500/50" />
                            <span className="text-xs font-medium">All systems normal</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Facility Status — label and items driven by platformMode */}
            <div className={`${rp.card} h-[14%] flex flex-col justify-center`}>
                <div className={rp.cardTitle}>{rightPanel.statusTitle}</div>
                <div className="space-y-2">
                    {rightPanel.statusItems.map((item) => (
                        <div key={item.label} className={rp.factoryStatus}>
                            <div className="flex items-center gap-2">
                                <div className={`${rp.statusDot} ${
                                    item.status === 'online'  ? rp.statusOnline  :
                                    item.status === 'error'   ? rp.statusError   :
                                    rp.statusWarning ?? rp.statusOnline
                                }`} />
                                {item.label}
                            </div>
                            <span className="text-xs font-mono text-slate-500">{item.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    )
}
