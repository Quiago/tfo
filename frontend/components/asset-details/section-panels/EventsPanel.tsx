'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useState } from 'react'

type Severity = 'critical' | 'warning' | 'info' | 'ok'

interface FacilityEvent {
    id: string
    title: string
    severity: Severity
    description: string
    timestamp: string
    date: string    // grouping key
    resolvedBy?: string
    duration?: string
}

const EVENTS: FacilityEvent[] = [
    { id: 'ev-1', title: 'Axis 3 Vibration Spike', severity: 'critical', description: 'Vibration on Joint Axis 3 exceeded 13.5 mm/s RMS (threshold 7.0). Triggered automatic alert. Work order #WO-2847 created.', timestamp: '10:34', date: 'Today', duration: 'Active' },
    { id: 'ev-2', title: 'Cycle Time Optimization Detected', severity: 'ok', description: 'AI agent detected a 12% cycle time reduction opportunity via motion path recalibration. Workflow generated and pending approval.', timestamp: '10:22', date: 'Today', resolvedBy: 'AI Agent' },
    { id: 'ev-3', title: 'Firmware Update Completed', severity: 'info', description: 'KRC4 controller firmware updated to v4.2.1. Includes safety stack patch CVE-2026-0041. System rebooted and validated.', timestamp: '08:15', date: 'Today', resolvedBy: 'Lisa Park' },
    { id: 'ev-4', title: 'Lubrication Overdue Warning', severity: 'warning', description: 'Gear unit G-3 lubrication interval exceeded by 14 days. Scheduled maintenance not completed as planned on 2026-03-02.', timestamp: '07:50', date: 'Today' },
    { id: 'ev-5', title: 'Scheduled Maintenance Completed', severity: 'ok', description: 'Full preventive maintenance cycle completed: vibration check, lubrication, LOTO inspection. Duration 3h 20min.', timestamp: '16:45', date: 'Yesterday', resolvedBy: 'Ahmed Nasser', duration: '3h 20m' },
    { id: 'ev-6', title: 'OPC UA Connection Timeout', severity: 'warning', description: 'OPC UA connection to PLC dropped for 4 minutes. Auto-reconnect successful. No data loss detected.', timestamp: '11:08', date: 'Yesterday', resolvedBy: 'System', duration: '4 min' },
]

const SEVERITY_CONFIG: Record<Severity, { icon: typeof AlertCircle; color: string; bg: string; label: string }> = {
    critical: { icon: AlertCircle,   color: '#dc2626', bg: '#fef2f2', label: 'Critical' },
    warning:  { icon: AlertTriangle, color: '#d97706', bg: '#fffbeb', label: 'Warning' },
    info:     { icon: Info,          color: '#2563eb', bg: '#eff6ff', label: 'Info' },
    ok:       { icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4', label: 'OK' },
}

function buildNavItems(): NavItem[] {
    const dates = [...new Set(EVENTS.map((e) => e.date))]
    return dates.map((date) => ({
        id: `date_${date}`,
        label: date,
        meta: `${EVENTS.filter((e) => e.date === date).length}`,
        children: EVENTS
            .filter((e) => e.date === date)
            .map((e) => ({
                id: e.id,
                label: e.title,
                badge: { text: SEVERITY_CONFIG[e.severity].label, variant: e.severity === 'critical' ? 'red' : e.severity === 'warning' ? 'amber' : e.severity === 'ok' ? 'green' : 'blue' as const },
            })),
    }))
}

const NAV_ITEMS = buildNavItems()

export function EventsPanel() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = selectedId ? EVENTS.find((e) => e.id === selectedId) ?? null : null

    return (
        <PanelLayout
            leftNav={<NavTree items={NAV_ITEMS} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />}
            detail={selected ? <EventDetail event={selected} /> : <EventsOverview />}
        />
    )
}

function EventsOverview() {
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Events</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · Last 48 hours</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
                {(['critical', 'warning', 'info', 'ok'] as Severity[]).map((sev) => {
                    const count = EVENTS.filter((e) => e.severity === sev).length
                    const cfg = SEVERITY_CONFIG[sev]
                    const Icon = cfg.icon
                    return (
                        <div key={sev} className="rounded-xl p-3 text-center" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                            <Icon size={18} style={{ color: cfg.color, margin: '0 auto 6px' }} />
                            <p className="text-xl font-bold" style={{ color: cfg.color }}>{count}</p>
                            <p className="text-[9px] font-medium" style={{ color: cfg.color }}>{cfg.label}</p>
                        </div>
                    )
                })}
            </div>
            <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>Select an event from the list to view its full detail.</p>
        </div>
    )
}

function EventDetail({ event }: { event: FacilityEvent }) {
    const cfg = SEVERITY_CONFIG[event.severity]
    const Icon = cfg.icon
    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: cfg.bg }}>
                    <Icon size={18} style={{ color: cfg.color }} />
                </div>
                <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>{event.title}</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--tp-text-muted)' }}>{event.date} · {event.timestamp}</p>
                </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{event.description}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
                {[
                    ['Severity', cfg.label],
                    ['Resolved by', event.resolvedBy ?? '—'],
                    ['Duration', event.duration ?? '—'],
                ].map(([label, val]) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <p className="text-[9px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--tp-text-muted)' }}>{label}</p>
                        <p className="text-xs font-semibold" style={{ color: 'var(--tp-text-heading)' }}>{val}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
