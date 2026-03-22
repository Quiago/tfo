'use client'

import { X, Plus } from 'lucide-react'
import type { ConditionItem, RuleConditions, RuleOperator } from '@/lib/types/dispatcher'

interface Props {
    value: RuleConditions
    onChange: (value: RuleConditions) => void
}

const CONDITION_TYPES: { value: ConditionItem['type']; label: string; hint: string }[] = [
    { value: 'severity_gte', label: 'Severity ≥',    hint: 'info | warning | critical | emergency' },
    { value: 'contains',     label: 'Text contains', hint: 'Field + substring' },
    { value: 'threshold',    label: 'Threshold',     hint: 'Numeric field comparison' },
    { value: 'asset_tag',    label: 'Asset tag',     hint: 'Tag in raw_payload.tags[]' },
    { value: 'connector_id', label: 'Connector ID',  hint: 'Exact connector match' },
]

const THRESHOLD_OPS = ['gt', 'gte', 'lt', 'lte', 'eq'] as const
const SEVERITIES    = ['info', 'warning', 'critical', 'emergency'] as const

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500 transition-colors'
const selectCls = `${inputCls} appearance-none`

export function RuleConditionEditor({ value, onChange }: Props) {
    const updateOperator = (op: RuleOperator) =>
        onChange({ ...value, operator: op })

    const updateItem = (idx: number, patch: Partial<ConditionItem>) =>
        onChange({
            ...value,
            items: value.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
        })

    const addItem = () =>
        onChange({
            ...value,
            items: [...value.items, { type: 'severity_gte', value: 'warning' }],
        })

    const removeItem = (idx: number) =>
        onChange({ ...value, items: value.items.filter((_, i) => i !== idx) })

    return (
        <div className="space-y-3">
            {/* AND / OR toggle */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Match</span>
                {(['AND', 'OR'] as RuleOperator[]).map((op) => (
                    <button
                        key={op}
                        type="button"
                        onClick={() => updateOperator(op)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            value.operator === op
                                ? 'bg-violet-600 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                    >
                        {op}
                    </button>
                ))}
                <span className="text-xs text-zinc-500">conditions</span>
            </div>

            {/* Condition items */}
            <div className="space-y-2">
                {value.items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-zinc-900 rounded border border-zinc-800">
                        {/* Type selector */}
                        <select
                            value={item.type}
                            onChange={(e) => updateItem(idx, { type: e.target.value as ConditionItem['type'], field: undefined, operator: undefined })}
                            className={`${selectCls} w-36 flex-shrink-0`}
                        >
                            {CONDITION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>

                        {/* Condition-specific fields */}
                        <div className="flex-1 flex gap-2">
                            {item.type === 'severity_gte' && (
                                <select
                                    value={String(item.value)}
                                    onChange={(e) => updateItem(idx, { value: e.target.value })}
                                    className={selectCls}
                                >
                                    {SEVERITIES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            )}

                            {item.type === 'contains' && (
                                <>
                                    <input
                                        value={item.field ?? 'title'}
                                        onChange={(e) => updateItem(idx, { field: e.target.value })}
                                        placeholder="field (e.g. title)"
                                        className={inputCls}
                                    />
                                    <input
                                        value={String(item.value ?? '')}
                                        onChange={(e) => updateItem(idx, { value: e.target.value })}
                                        placeholder="substring"
                                        className={inputCls}
                                    />
                                </>
                            )}

                            {item.type === 'threshold' && (
                                <>
                                    <input
                                        value={item.field ?? 'value'}
                                        onChange={(e) => updateItem(idx, { field: e.target.value })}
                                        placeholder="field"
                                        className={`${inputCls} w-24`}
                                    />
                                    <select
                                        value={item.operator ?? 'gte'}
                                        onChange={(e) => updateItem(idx, { operator: e.target.value as ConditionItem['operator'] })}
                                        className={`${selectCls} w-20`}
                                    >
                                        {THRESHOLD_OPS.map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        value={String(item.value ?? '')}
                                        onChange={(e) => updateItem(idx, { value: Number(e.target.value) })}
                                        placeholder="value"
                                        className={inputCls}
                                    />
                                </>
                            )}

                            {(item.type === 'asset_tag' || item.type === 'connector_id') && (
                                <input
                                    value={String(item.value ?? '')}
                                    onChange={(e) => updateItem(idx, { value: e.target.value })}
                                    placeholder={item.type === 'asset_tag' ? 'e.g. ups' : 'e.g. ua-1'}
                                    className={inputCls}
                                />
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 mt-1"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
                <Plus size={12} /> Add condition
            </button>

            {value.items.length === 0 && (
                <p className="text-xs text-zinc-500 italic">No conditions — rule will match all events.</p>
            )}
        </div>
    )
}
