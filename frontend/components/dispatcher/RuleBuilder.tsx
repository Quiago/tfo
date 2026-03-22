'use client'

import { useState, useCallback } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { createRule, updateRule } from '@/lib/services/dispatcher.service'
import { useDispatcherStore } from '@/lib/store/dispatcher-store'
import { RuleConditionEditor } from './RuleConditionEditor'
import { ActionListEditor } from './ActionListEditor'
import type { DispatchRule, RuleConditions, RuleAction } from '@/lib/types/dispatcher'

interface Props {
    editingRule?: DispatchRule | null
    onClose: () => void
}

const EMPTY_CONDITIONS: RuleConditions = { operator: 'AND', items: [] }

export function RuleBuilder({ editingRule, onClose }: Props) {
    const addRule    = useDispatcherStore((s) => s.addRule)
    const updateRuleInStore = useDispatcherStore((s) => s.updateRule)

    const [name,        setName]        = useState(editingRule?.name        ?? '')
    const [description, setDescription] = useState(editingRule?.description ?? '')
    const [priority,    setPriority]    = useState(editingRule?.priority    ?? 100)
    const [enabled,     setEnabled]     = useState(editingRule?.enabled     ?? true)
    const [suppression, setSuppression] = useState(editingRule?.suppression_window_secs ?? 0)
    const [conditions,  setConditions]  = useState<RuleConditions>(
        editingRule?.conditions ?? EMPTY_CONDITIONS
    )
    const [actions, setActions] = useState<RuleAction[]>(editingRule?.actions ?? [])
    const [errors,  setErrors]  = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(false)

    const validate = useCallback(() => {
        const errs: Record<string, string> = {}
        if (!name.trim()) errs.name = 'Name is required'
        if (actions.length === 0) errs.actions = 'Add at least one action'
        return errs
    }, [name, actions])

    const handleSave = useCallback(async () => {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }

        setLoading(true)
        try {
            const payload = {
                name: name.trim(),
                description: description.trim(),
                conditions,
                actions,
                enabled,
                priority,
                suppression_window_secs: suppression,
            }

            if (editingRule) {
                const updated = await updateRule(editingRule.id, payload)
                updateRuleInStore(updated)
            } else {
                const created = await createRule(payload)
                addRule(created)
            }
            onClose()
        } catch {
            setErrors({ submit: 'Failed to save rule. Check your connection.' })
        } finally {
            setLoading(false)
        }
    }, [name, description, conditions, actions, enabled, priority, suppression, editingRule, addRule, updateRuleInStore, onClose, validate])

    const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-violet-500 transition-colors'

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-white">
                    {editingRule ? 'Edit Rule' : 'New Dispatch Rule'}
                </h3>
                <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 custom-scrollbar">
                {/* Name */}
                <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Rule name *</label>
                    <input
                        value={name}
                        onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })) }}
                        placeholder="e.g. Critical UPS Alert → Teams"
                        className={`${inputCls} ${errors.name ? 'border-red-500' : ''}`}
                    />
                    {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                </div>

                {/* Description */}
                <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this rule do?"
                        rows={2}
                        className={`${inputCls} resize-none`}
                    />
                </div>

                {/* Priority + Enabled + Suppression */}
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1.5">Priority</label>
                        <input
                            type="number"
                            min={1}
                            max={1000}
                            value={priority}
                            onChange={(e) => setPriority(Number(e.target.value))}
                            className={inputCls}
                        />
                        <p className="text-[11px] text-zinc-600 mt-1">Lower = first</p>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1.5">Suppress (secs)</label>
                        <input
                            type="number"
                            min={0}
                            value={suppression}
                            onChange={(e) => setSuppression(Number(e.target.value))}
                            className={inputCls}
                        />
                        <p className="text-[11px] text-zinc-600 mt-1">0 = off</p>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1.5">Enabled</label>
                        <button
                            type="button"
                            onClick={() => setEnabled(!enabled)}
                            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                                enabled
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                        >
                            {enabled ? 'Active' : 'Paused'}
                        </button>
                    </div>
                </div>

                {/* Conditions */}
                <div>
                    <label className="block text-xs text-zinc-400 mb-2">Conditions</label>
                    <RuleConditionEditor value={conditions} onChange={setConditions} />
                </div>

                {/* Actions */}
                <div>
                    <label className="block text-xs text-zinc-400 mb-2">Actions *</label>
                    <ActionListEditor value={actions} onChange={(a) => { setActions(a); setErrors((p) => ({ ...p, actions: '' })) }} />
                    {errors.actions && <p className="text-xs text-red-400 mt-1">{errors.actions}</p>}
                </div>

                {errors.submit && (
                    <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">
                        {errors.submit}
                    </p>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
                <button
                    onClick={onClose}
                    className="flex-1 py-2 rounded text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {editingRule ? 'Update' : 'Create Rule'}
                </button>
            </div>
        </div>
    )
}
