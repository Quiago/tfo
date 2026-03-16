'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { useState } from 'react'

interface LogEntry {
    id: string
    time: string
    session: string    // grouping key
    type: 'system' | 'user' | 'error' | 'param'
    message: string
    detail?: string
    user?: string
}

const LOGS: LogEntry[] = [
    { id: 'lg-1', time: '10:42:15', session: 'Today — Session #12', type: 'system', message: 'Motor start cycle #1204', detail: 'Normal startup sequence. Motor current 42 A. No faults detected.' },
    { id: 'lg-2', time: '10:38:03', session: 'Today — Session #12', type: 'param', message: 'Parameter change: speed +5%', detail: 'Operator increased path velocity from 1800 mm/s to 1890 mm/s. Authorized by Carlos Méndez.', user: 'David Lee' },
    { id: 'lg-3', time: '10:34:07', session: 'Today — Session #12', type: 'error', message: 'Vibration fault E031 — Axis 3', detail: 'Axis 3 exceeded vibration limit. Auto-stop did not trigger (threshold 15 mm/s). Alert sent to on-call.' },
    { id: 'lg-4', time: '10:15:22', session: 'Today — Session #12', type: 'system', message: 'System self-check passed', detail: 'All 6 joints within calibration spec. Battery backup: 97%. Emergency stop: verified.' },
    { id: 'lg-5', time: '08:10:44', session: 'Today — Session #12', type: 'user', message: 'Firmware update applied v4.2.1', detail: 'KRC4 firmware updated via USB. System restarted. Startup OK.', user: 'Lisa Park' },
    { id: 'lg-6', time: '16:30:01', session: 'Yesterday — Session #11', type: 'system', message: 'Motor stop cycle #1203', detail: 'Planned end-of-shift stop. Total cycles today: 1203. OEE: 94.2%.' },
    { id: 'lg-7', time: '12:18:55', session: 'Yesterday — Session #11', type: 'user', message: 'LOTO procedure started', detail: 'Lock-out / tag-out initiated before lubrication maintenance.', user: 'Ahmed Nasser' },
    { id: 'lg-8', time: '11:55:30', session: 'Yesterday — Session #11', type: 'param', message: 'Acceleration profile reset to default', detail: 'Reverted acceleration ramp from 1200 mm/s² to 900 mm/s² (factory default). Reason: bearing noise report.', user: 'Omar Khalid' },
]

const TYPE_COLORS: Record<LogEntry['type'], { color: string; bg: string; label: string }> = {
    system: { color: '#2563eb', bg: '#eff6ff', label: 'System' },
    user:   { color: '#7c3aed', bg: '#f5f3ff', label: 'User' },
    error:  { color: '#dc2626', bg: '#fef2f2', label: 'Error' },
    param:  { color: '#d97706', bg: '#fffbeb', label: 'Param' },
}

function buildNavItems(): NavItem[] {
    const sessions = [...new Set(LOGS.map((l) => l.session))]
    return sessions.map((session) => ({
        id: `session_${session}`,
        label: session,
        meta: `${LOGS.filter((l) => l.session === session).length}`,
        children: LOGS
            .filter((l) => l.session === session)
            .map((l) => ({
                id: l.id,
                label: l.message,
                badge: { text: TYPE_COLORS[l.type].label, variant: l.type === 'error' ? 'red' : l.type === 'param' ? 'amber' : l.type === 'user' ? 'purple' : 'blue' as const },
            })),
    }))
}

const NAV_ITEMS = buildNavItems()

export function LogsPanel() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = selectedId ? LOGS.find((l) => l.id === selectedId) ?? null : null

    return (
        <PanelLayout
            leftNav={<NavTree items={NAV_ITEMS} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />}
            detail={selected ? <LogDetail entry={selected} /> : <LogsOverview />}
        />
    )
}

function LogsOverview() {
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>System Logs</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · Last 2 sessions</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
                {(['system', 'user', 'param', 'error'] as LogEntry['type'][]).map((type) => {
                    const count = LOGS.filter((l) => l.type === type).length
                    const cfg = TYPE_COLORS[type]
                    return (
                        <div key={type} className="rounded-xl p-3 text-center" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                            <p className="text-xl font-bold" style={{ color: cfg.color }}>{count}</p>
                            <p className="text-[9px] font-medium mt-0.5" style={{ color: cfg.color }}>{cfg.label}</p>
                        </div>
                    )
                })}
            </div>
            <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>Select a log entry to view full detail.</p>
        </div>
    )
}

function LogDetail({ entry }: { entry: LogEntry }) {
    const cfg = TYPE_COLORS[entry.type]
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                </span>
                <h3 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>{entry.message}</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
                {[
                    ['Time', entry.time],
                    ['Session', entry.session.split('—')[0].trim()],
                    ['User', entry.user ?? 'System'],
                ].map(([label, val]) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <p className="text-[9px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--tp-text-muted)' }}>{label}</p>
                        <p className="text-xs font-semibold" style={{ color: 'var(--tp-text-heading)' }}>{val}</p>
                    </div>
                ))}
            </div>
            {entry.detail && (
                <div className="rounded-xl p-4" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{entry.detail}</p>
                </div>
            )}
        </div>
    )
}
