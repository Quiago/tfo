'use client'

import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { ActionType, RuleAction } from '@/lib/types/dispatcher'
import type { IntegrationConfig, IntegrationType } from '@/lib/types/integrations'
import { fetchIntegrations } from '@/lib/services/integrations.service'

interface Props {
    value: RuleAction[]
    onChange: (value: RuleAction[]) => void
}

const ACTION_TYPES: { value: ActionType; label: string; description: string; integrationRequired?: IntegrationType }[] = [
    { value: 'log_only',                    label: 'Log only',                    description: 'Write event to server log (always safe, good for testing)' },
    { value: 'create_work_order',           label: 'Create work order',           description: 'Create a work order in OpsHub' },
    { value: 'send_teams',                  label: 'Send Teams message',          description: 'Send an Adaptive Card to a Microsoft Teams channel', integrationRequired: 'teams' },
    { value: 'create_servicenow_incident',  label: 'Create ServiceNow incident',  description: 'Create an Incident in ServiceNow via Table API', integrationRequired: 'servicenow' },
    { value: 'send_email',                  label: 'Send email',                  description: 'Send an alert email via SMTP relay', integrationRequired: 'email' },
]

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500 transition-colors'
const selectCls = `${inputCls} appearance-none`

function IntegrationSelect({
    type,
    value,
    onChange,
    integrations,
}: {
    type: IntegrationType
    value: string
    onChange: (id: string) => void
    integrations: IntegrationConfig[]
}) {
    const filtered = integrations.filter(i => i.type === type && i.is_active)
    return (
        <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Integration *</label>
            <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
                <option value="">— Select integration —</option>
                {filtered.map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                ))}
            </select>
            {filtered.length === 0 && (
                <p className="text-[11px] text-amber-500 mt-1">
                    No active {type} integration. Add one in the Integrations tab.
                </p>
            )}
        </div>
    )
}

function ActionItem({
    action,
    onUpdate,
    onRemove,
    integrations,
}: {
    action: RuleAction & { type: ActionType }
    onUpdate: (patch: Partial<typeof action>) => void
    onRemove: () => void
    integrations: IntegrationConfig[]
}) {
    const meta = ACTION_TYPES.find((a) => a.value === action.type)

    return (
        <div className="p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
                <select
                    value={action.type}
                    onChange={(e) => onUpdate({ type: e.target.value as ActionType, config: {} })}
                    className={`${selectCls} flex-1`}
                >
                    {ACTION_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                    <X size={14} />
                </button>
            </div>

            {meta && (
                <p className="text-[11px] text-zinc-500">{meta.description}</p>
            )}

            {/* create_work_order config */}
            {action.type === 'create_work_order' && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Priority</label>
                        <select
                            value={String(action.config.priority ?? 'medium')}
                            onChange={(e) => onUpdate({ config: { ...action.config, priority: e.target.value } })}
                            className={selectCls}
                        >
                            {['low', 'medium', 'high', 'critical'].map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Facility (optional)</label>
                        <input
                            value={String(action.config.facility ?? '')}
                            onChange={(e) => onUpdate({ config: { ...action.config, facility: e.target.value } })}
                            placeholder="Frankfurt DC Campus"
                            className={inputCls}
                        />
                    </div>
                </div>
            )}

            {/* send_teams config */}
            {action.type === 'send_teams' && (
                <div className="space-y-2">
                    <IntegrationSelect
                        type="teams"
                        value={String(action.config.integration_id ?? '')}
                        onChange={id => onUpdate({ config: { ...action.config, integration_id: id } })}
                        integrations={integrations}
                    />
                </div>
            )}

            {/* create_servicenow_incident config */}
            {action.type === 'create_servicenow_incident' && (
                <div className="space-y-2">
                    <IntegrationSelect
                        type="servicenow"
                        value={String(action.config.integration_id ?? '')}
                        onChange={id => onUpdate({ config: { ...action.config, integration_id: id } })}
                        integrations={integrations}
                    />
                    <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Table (default: incident)</label>
                        <input
                            value={String(action.config.table ?? '')}
                            onChange={e => onUpdate({ config: { ...action.config, table: e.target.value } })}
                            placeholder="incident"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Assignment Group (override)</label>
                        <input
                            value={String(action.config.assignment_group ?? '')}
                            onChange={e => onUpdate({ config: { ...action.config, assignment_group: e.target.value } })}
                            placeholder="NOC"
                            className={inputCls}
                        />
                    </div>
                </div>
            )}

            {/* send_email config */}
            {action.type === 'send_email' && (
                <div className="space-y-2">
                    <IntegrationSelect
                        type="email"
                        value={String(action.config.integration_id ?? '')}
                        onChange={id => onUpdate({ config: { ...action.config, integration_id: id } })}
                        integrations={integrations}
                    />
                    <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Recipients override (comma-separated)</label>
                        <input
                            value={String(action.config.to ?? '')}
                            onChange={e => onUpdate({ config: { ...action.config, to: e.target.value } })}
                            placeholder="ops@company.com (leave empty to use integration defaults)"
                            className={inputCls}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

export function ActionListEditor({ value, onChange }: Props) {
    const [integrations, setIntegrations] = useState<IntegrationConfig[]>([])

    useEffect(() => {
        fetchIntegrations()
            .then(data => setIntegrations(data.items))
            .catch(() => { /* non-critical — just won't pre-fill selects */ })
    }, [])

    const updateItem = (idx: number, patch: Partial<RuleAction & { type: ActionType }>) =>
        onChange(value.map((a, i) => (i === idx ? { ...a, ...patch } : a)) as RuleAction[])

    const removeItem = (idx: number) =>
        onChange(value.filter((_, i) => i !== idx))

    const addItem = () =>
        onChange([...value, { type: 'log_only', config: {} }])

    return (
        <div className="space-y-2">
            {value.map((action, idx) => (
                <ActionItem
                    key={idx}
                    action={action as RuleAction & { type: ActionType }}
                    onUpdate={(patch) => updateItem(idx, patch)}
                    onRemove={() => removeItem(idx)}
                    integrations={integrations}
                />
            ))}

            <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
                <Plus size={12} /> Add action
            </button>

            {value.length === 0 && (
                <p className="text-xs text-zinc-500 italic">No actions — add at least one action to trigger on match.</p>
            )}
        </div>
    )
}
