'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { Activity, Droplets, Gauge, Thermometer, Vibrate } from 'lucide-react'
import { useState } from 'react'

type SensorStatus = 'normal' | 'warning' | 'critical'

interface SensorReading {
    id: string
    name: string
    type: string
    value: number
    unit: string
    min: number
    max: number          // warning threshold
    critical: number     // critical threshold
    status: SensorStatus
    lastUpdated: string
    trend: 'up' | 'down' | 'stable'
    description: string
}

const SENSORS: SensorReading[] = [
    { id: 's-vibration', name: 'Joint Axis 3 — Vibration', type: 'Vibration', value: 13.5, unit: 'mm/s', min: 0, max: 7.0, critical: 12.0, status: 'critical', lastUpdated: '10:34:22', trend: 'up', description: 'RMS vibration on the primary rotary joint. Critical threshold exceeded — immediate inspection required.' },
    { id: 's-temp-motor', name: 'Motor A1 — Temperature', type: 'Temperature', value: 68, unit: '°C', min: 10, max: 75, critical: 90, status: 'normal', lastUpdated: '10:34:20', trend: 'stable', description: 'Drive motor winding temperature. Operating within normal range.' },
    { id: 's-temp-gearbox', name: 'Gearbox G3 — Temperature', type: 'Temperature', value: 82, unit: '°C', min: 10, max: 80, critical: 95, status: 'warning', lastUpdated: '10:34:18', trend: 'up', description: 'Gearbox oil temperature. Elevated — likely related to lubrication overdue state.' },
    { id: 's-pressure', name: 'Hydraulic — Pressure', type: 'Pressure', value: 187, unit: 'bar', min: 160, max: 210, critical: 230, status: 'normal', lastUpdated: '10:34:15', trend: 'stable', description: 'Main hydraulic circuit pressure. Operating within specification.' },
    { id: 's-humidity', name: 'Cabinet — Humidity', type: 'Humidity', value: 34, unit: '%RH', min: 20, max: 60, critical: 75, status: 'normal', lastUpdated: '10:33:58', trend: 'down', description: 'Internal humidity of the KRC4 controller cabinet. Normal range maintained.' },
]

const TYPE_ICONS: Record<string, typeof Activity> = {
    Vibration: Vibrate,
    Temperature: Thermometer,
    Pressure: Gauge,
    Humidity: Droplets,
}

const STATUS_CONFIG: Record<SensorStatus, { color: string; bg: string; label: string }> = {
    normal:   { color: '#16a34a', bg: '#f0fdf4', label: 'Normal' },
    warning:  { color: '#d97706', bg: '#fffbeb', label: 'Warning' },
    critical: { color: '#dc2626', bg: '#fef2f2', label: 'Critical' },
}

const TREND_LABEL: Record<string, string> = { up: '↑ Rising', down: '↓ Falling', stable: '→ Stable' }

function buildNavItems(): NavItem[] {
    const types = [...new Set(SENSORS.map((s) => s.type))]
    return types.map((type) => ({
        id: `type_${type}`,
        label: type,
        children: SENSORS
            .filter((s) => s.type === type)
            .map((s) => ({
                id: s.id,
                label: s.name,
                badge: { text: STATUS_CONFIG[s.status].label, variant: s.status === 'critical' ? 'red' : s.status === 'warning' ? 'amber' : 'green' as const },
            })),
    }))
}

const NAV_ITEMS = buildNavItems()

export function SensorsPanel() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = selectedId ? SENSORS.find((s) => s.id === selectedId) ?? null : null

    return (
        <PanelLayout
            leftNav={<NavTree items={NAV_ITEMS} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />}
            detail={selected ? <SensorDetail sensor={selected} /> : <SensorsOverview />}
        />
    )
}

function SensorsOverview() {
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Sensors</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · Live readings</p>
            </div>
            <div className="space-y-2">
                {SENSORS.map((s) => {
                    const cfg = STATUS_CONFIG[s.status]
                    const Icon = TYPE_ICONS[s.type] ?? Activity
                    const pct = Math.min(100, (s.value / s.critical) * 100)
                    return (
                        <div key={s.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                                <Icon size={15} style={{ color: cfg.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--tp-text-heading)' }}>{s.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="flex-1 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cfg.color }} />
                                    </div>
                                    <span className="text-[10px] font-bold flex-shrink-0" style={{ color: cfg.color }}>
                                        {s.value} {s.unit}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function SensorDetail({ sensor: s }: { sensor: SensorReading }) {
    const cfg = STATUS_CONFIG[s.status]
    const Icon = TYPE_ICONS[s.type] ?? Activity
    const pct = Math.min(100, (s.value / s.critical) * 100)

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                    <Icon size={20} style={{ color: cfg.color }} />
                </div>
                <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>{s.name}</h3>
                    <p className="text-[11px]" style={{ color: 'var(--tp-text-muted)' }}>Updated {s.lastUpdated} · {TREND_LABEL[s.trend]}</p>
                </div>
                <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                </span>
            </div>

            {/* Gauge */}
            <div className="rounded-xl p-5 text-center" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                <p className="text-4xl font-bold" style={{ color: cfg.color }}>{s.value}</p>
                <p className="text-sm font-semibold mt-1" style={{ color: 'var(--tp-text-muted)' }}>{s.unit}</p>
                <div className="mt-4 h-2.5 rounded-full bg-zinc-200 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cfg.color }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px]" style={{ color: 'var(--tp-text-muted)' }}>
                    <span>0</span>
                    <span>Warn: {s.max}</span>
                    <span>Crit: {s.critical}</span>
                </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{s.description}</p>
            </div>
        </div>
    )
}
