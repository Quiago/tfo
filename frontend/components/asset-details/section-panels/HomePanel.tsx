'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge, Zap } from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS: NavItem[] = [
    {
        id: 'overview', label: 'Overview',
        children: [
            { id: 'kpis',   label: 'KPIs & Metrics' },
            { id: 'health', label: 'System Health' },
            { id: 'alerts', label: 'Active Alerts', badge: { text: '2', variant: 'red' } },
        ],
    },
    {
        id: 'quick', label: 'Quick Actions',
        children: [
            { id: 'qa-wo',  label: 'Create Work Order' },
            { id: 'qa-ack', label: 'Acknowledge Alert' },
            { id: 'qa-log', label: 'Add Log Entry' },
        ],
    },
    {
        id: 'recent', label: 'Recent Activity',
        children: [
            { id: 'ra-1', label: 'Vibration fault detected', meta: '10:34' },
            { id: 'ra-2', label: 'Firmware updated v4.2.1', meta: '08:15' },
            { id: 'ra-3', label: 'Self-check passed', meta: '08:00' },
        ],
    },
]

export function HomePanel() {
    const [selectedId, setSelectedId] = useState<string | null>('kpis')

    return (
        <PanelLayout
            leftNav={<NavTree items={NAV_ITEMS} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />}
            detail={<HomeDetail selectedId={selectedId} />}
        />
    )
}

function HomeDetail({ selectedId }: { selectedId: string | null }) {
    if (selectedId === 'alerts') return <AlertsView />
    if (selectedId === 'health') return <HealthView />
    return <KPIsView />
}

function KPIsView() {
    const kpis = [
        { label: 'Uptime',     value: '98.7%',    icon: Clock,   color: '#16a34a', sub: 'Last 30 days' },
        { label: 'OEE',        value: '94.2%',    icon: Gauge,   color: '#2563eb', sub: 'Today' },
        { label: 'Throughput', value: '1,204',    icon: Activity, color: '#7c3aed', sub: 'Cycles today' },
        { label: 'Energy',     value: '142 kWh',  icon: Zap,     color: '#d97706', sub: 'Today' },
    ]

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>KPIs & Metrics</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · Live</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                {kpis.map(({ label, value, icon: Icon, color, sub }) => (
                    <div key={label} className="rounded-xl p-4" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <Icon size={14} style={{ color }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>{label}</span>
                        </div>
                        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--tp-text-muted)' }}>{sub}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function HealthView() {
    const systems = [
        { label: 'Joints 1–6',    status: 'ok',       note: 'Within spec (except J3 vibration)' },
        { label: 'KRC4 Controller', status: 'ok',      note: 'v4.2.1 — All services running' },
        { label: 'Hydraulics',    status: 'ok',       note: '187 bar — normal range' },
        { label: 'Lubrication',   status: 'warning',  note: 'Gearbox G3 overdue 14 days' },
        { label: 'Vibration J3',  status: 'critical', note: '13.5 mm/s — threshold exceeded' },
        { label: 'Comms (OPC UA)', status: 'ok',      note: 'Connected — 12 ms latency' },
    ]
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>System Health</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>All subsystems</p>
            </div>
            <div className="space-y-2">
                {systems.map(({ label, status, note }) => (
                    <div key={label} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        {status === 'ok'
                            ? <CheckCircle2 size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
                            : status === 'warning'
                            ? <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                            : <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />}
                        <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--tp-text-heading)' }}>{label}</p>
                            <p className="text-[10px]" style={{ color: 'var(--tp-text-muted)' }}>{note}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AlertsView() {
    const alerts = [
        { title: 'Axis 3 Vibration Spike', severity: 'critical', desc: '13.5 mm/s RMS — threshold 7.0 mm/s RMS', time: '10:34' },
        { title: 'Lubrication Overdue', severity: 'warning', desc: 'Gearbox G3 — 14 days past scheduled interval', time: '07:50' },
    ]
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Active Alerts</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>Requires attention</p>
            </div>
            <div className="space-y-3">
                {alerts.map((a) => (
                    <div key={a.title} className="p-4 rounded-xl" style={{ background: a.severity === 'critical' ? '#fef2f2' : '#fffbeb', border: `1px solid ${a.severity === 'critical' ? '#fecaca' : '#fde68a'}` }}>
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle size={13} style={{ color: a.severity === 'critical' ? '#dc2626' : '#d97706' }} />
                            <p className="text-xs font-bold" style={{ color: a.severity === 'critical' ? '#b91c1c' : '#b45309' }}>{a.title}</p>
                            <span className="ml-auto text-[9px]" style={{ color: 'var(--tp-text-muted)' }}>{a.time}</span>
                        </div>
                        <p className="text-[10px]" style={{ color: a.severity === 'critical' ? '#7f1d1d' : '#78350f' }}>{a.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
