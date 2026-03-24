'use client'

import type { IntegrationType, TestStatus } from '@/lib/types/integrations'

const TYPE_COLORS: Record<IntegrationType, string> = {
    teams:       'bg-blue-900/40 text-blue-300 border-blue-700/50',
    servicenow:  'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
    email:       'bg-amber-900/40 text-amber-300 border-amber-700/50',
}

const TYPE_LABELS: Record<IntegrationType, string> = {
    teams:       'Teams',
    servicenow:  'ServiceNow',
    email:       'Email',
}

export function IntegrationTypeBadge({ type }: { type: IntegrationType }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${TYPE_COLORS[type]}`}>
            {TYPE_LABELS[type]}
        </span>
    )
}

export function TestStatusBadge({ status }: { status: TestStatus }) {
    if (status === null) return null
    const cls = status === 'ok'
        ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
        : 'bg-red-900/40 text-red-300 border-red-700/50'
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}>
            {status === 'ok' ? '✓ OK' : '✗ Failed'}
        </span>
    )
}
