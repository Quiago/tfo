'use client'

import s from '@/styles/overview-expanded/expanded.module.css'
import { ExternalLink, Plus } from 'lucide-react'

const STATS = [
    { label: 'Health', value: '92%', color: 'var(--tp-success, #10b981)' },
    { label: 'Last Maintenance', value: '3 days ago', color: 'var(--tp-text-muted)' },
    { label: 'Avg Energy', value: '114.9 kW', color: 'var(--tp-text-muted)' },
    { label: 'Efficiency', value: '96.9%', color: 'var(--tp-blue-500, #3b82f6)' },
    { label: 'Uptime', value: '98.9%', color: 'var(--tp-success, #10b981)' },
    { label: 'Cycle Count', value: '1,204', color: 'var(--tp-text-muted)' },
]

export function MachineSummaryBar({ onCreateWorkOrder }: { onCreateWorkOrder?: () => void }) {
    return (
        <div className={s.summaryBar}>
            {/* Stats */}
            {STATS.map((s_item) => (
                <div key={s_item.label} className={s.summaryStat}>
                    <span className={s.summaryLabel}>{s_item.label}</span>
                    <span className={s.summaryValue} style={{ color: s_item.color }}>{s_item.value}</span>
                </div>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            <button
                onClick={onCreateWorkOrder}
                className={s.summaryBtn}
            >
                <Plus size={13} />
                Create Work Order
            </button>
            <button className={s.summaryBtn}>
                <ExternalLink size={13} />
                View Docs
            </button>
        </div>
    )
}
