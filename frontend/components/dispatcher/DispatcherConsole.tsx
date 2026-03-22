'use client'

import { useEffect, useCallback, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react'
import { fetchEvents, fetchRules, deleteRule, updateRule } from '@/lib/services/dispatcher.service'
import { useDispatcherStore } from '@/lib/store/dispatcher-store'
import { EventFeed } from './EventFeed'
import { RuleBuilder } from './RuleBuilder'
import { AlarmSimulator } from './AlarmSimulator'
import type { DispatchRule } from '@/lib/types/dispatcher'

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// ─── Rule row ─────────────────────────────────────────────────────────────────

function RuleRow({
    rule,
    onEdit,
    onDelete,
    onToggle,
}: {
    rule: DispatchRule
    onEdit: (r: DispatchRule) => void
    onDelete: (id: string) => void
    onToggle: (r: DispatchRule) => void
}) {
    const actionLabels = rule.actions.map((a) => a.type.replace('_', ' ')).join(', ')

    return (
        <div className={`flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors ${!rule.enabled ? 'opacity-50' : ''}`}>
            <button
                onClick={() => onToggle(rule)}
                className="flex-shrink-0 text-zinc-500 hover:text-violet-400 transition-colors"
                title={rule.enabled ? 'Pause rule' : 'Activate rule'}
            >
                {rule.enabled
                    ? <ToggleRight size={18} className="text-violet-400" />
                    : <ToggleLeft  size={18} />}
            </button>

            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{rule.name}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                    P{rule.priority} · {rule.conditions.items.length} condition{rule.conditions.items.length !== 1 ? 's' : ''} · {actionLabels || 'no actions'}
                </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={() => onEdit(rule)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors rounded hover:bg-zinc-800"
                >
                    <Pencil size={12} />
                </button>
                <button
                    onClick={() => onDelete(rule.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded hover:bg-zinc-800"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    )
}

// ─── Main console ─────────────────────────────────────────────────────────────

type PanelView = 'rules' | 'builder'

export function DispatcherConsole() {
    const rules          = useDispatcherStore((s) => s.rules)
    const setRules       = useDispatcherStore((s) => s.setRules)
    const setEvents      = useDispatcherStore((s) => s.setEvents)
    const removeRule     = useDispatcherStore((s) => s.removeRule)
    const updateRuleSt   = useDispatcherStore((s) => s.updateRule)

    const [panelView, setPanelView]   = useState<PanelView>('rules')
    const [editingRule, setEditingRule] = useState<DispatchRule | null>(null)
    const [loading, setLoading]         = useState(true)

    // Initial data load
    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const [rulesRes, eventsRes] = await Promise.all([
                    fetchRules(),
                    fetchEvents({ page_size: 100 }),
                ])
                if (cancelled) return
                setRules(rulesRes.items)
                setEvents(eventsRes.items)
            } catch { /* non-fatal — show empty state */ }
            finally { if (!cancelled) setLoading(false) }
        }
        load()
        return () => { cancelled = true }
    }, [setRules, setEvents])

    const handleEdit = useCallback((rule: DispatchRule) => {
        setEditingRule(rule)
        setPanelView('builder')
    }, [])

    const handleNewRule = useCallback(() => {
        setEditingRule(null)
        setPanelView('builder')
    }, [])

    const handleBuilderClose = useCallback(() => {
        setEditingRule(null)
        setPanelView('rules')
    }, [])

    const handleDelete = useCallback(async (ruleId: string) => {
        try {
            await deleteRule(ruleId)
            removeRule(ruleId)
        } catch { /* show toast in future */ }
    }, [removeRule])

    const handleToggle = useCallback(async (rule: DispatchRule) => {
        try {
            const updated = await updateRule(rule.id, { enabled: !rule.enabled })
            updateRuleSt(updated)
        } catch { /* show toast in future */ }
    }, [updateRuleSt])

    return (
        <div className="flex h-full gap-0 overflow-hidden">
            {/* ── LEFT: Event Feed + Simulator ────────────────────────── */}
            <div className="flex flex-col w-[55%] border-r border-zinc-800 overflow-hidden">
                <div className="flex-1 overflow-hidden">
                    <EventFeed />
                </div>
                {IS_DEMO && (
                    <div className="border-t border-zinc-800 p-3 flex-shrink-0">
                        <AlarmSimulator />
                    </div>
                )}
            </div>

            {/* ── RIGHT: Rules list / Rule builder ────────────────────── */}
            <div className="flex flex-col w-[45%] overflow-hidden">
                {panelView === 'rules' ? (
                    <>
                        {/* Rules header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
                            <span className="text-xs font-medium text-zinc-300">
                                Dispatch Rules
                                {rules.length > 0 && (
                                    <span className="ml-1.5 text-[10px] text-zinc-500">({rules.length})</span>
                                )}
                            </span>
                            <button
                                onClick={handleNewRule}
                                className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                            >
                                <Plus size={12} /> New rule
                            </button>
                        </div>

                        {/* Rules list */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="flex items-center justify-center h-24 text-zinc-600 text-xs">
                                    Loading rules…
                                </div>
                            ) : rules.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-600 px-4 text-center">
                                    <ChevronRight size={18} />
                                    <p className="text-xs">No rules configured</p>
                                    <button
                                        onClick={handleNewRule}
                                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                                    >
                                        Create your first rule →
                                    </button>
                                </div>
                            ) : (
                                rules.map((rule) => (
                                    <RuleRow
                                        key={rule.id}
                                        rule={rule}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                        onToggle={handleToggle}
                                    />
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <RuleBuilder
                        editingRule={editingRule}
                        onClose={handleBuilderClose}
                    />
                )}
            </div>
        </div>
    )
}
