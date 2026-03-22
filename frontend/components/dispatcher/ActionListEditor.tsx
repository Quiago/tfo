'use client'

import { X, Plus } from 'lucide-react'
import type { RuleAction } from '@/lib/types/dispatcher'

interface Props {
    value: RuleAction[]
    onChange: (value: RuleAction[]) => void
}

// Phase 0 actions.  Phase 1 will add: send_teams, create_servicenow_incident, send_email
const ACTION_TYPES: { value: RuleAction['type']; label: string; description: string }[] = [
    { value: 'log_only',          label: 'Log only',          description: 'Write event to server log (always safe, good for testing)' },
    { value: 'create_work_order', label: 'Create work order', description: 'Create a work order in OpsHub (Phase 1: real integration)' },
]

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500 transition-colors'
const selectCls = `${inputCls} appearance-none`

function ActionItem({
    action,
    onUpdate,
    onRemove,
}: {
    action: RuleAction
    onUpdate: (patch: Partial<RuleAction>) => void
    onRemove: () => void
}) {
    const meta = ACTION_TYPES.find((a) => a.value === action.type)

    return (
        <div className="p-2 bg-zinc-900 rounded border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
                <select
                    value={action.type}
                    onChange={(e) => onUpdate({ type: e.target.value as RuleAction['type'], config: {} })}
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
        </div>
    )
}

export function ActionListEditor({ value, onChange }: Props) {
    const updateItem = (idx: number, patch: Partial<RuleAction>) =>
        onChange(value.map((a, i) => (i === idx ? { ...a, ...patch } : a)))

    const removeItem = (idx: number) =>
        onChange(value.filter((_, i) => i !== idx))

    const addItem = () =>
        onChange([...value, { type: 'log_only', config: {} }])

    return (
        <div className="space-y-2">
            {value.map((action, idx) => (
                <ActionItem
                    key={idx}
                    action={action}
                    onUpdate={(patch) => updateItem(idx, patch)}
                    onRemove={() => removeItem(idx)}
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
