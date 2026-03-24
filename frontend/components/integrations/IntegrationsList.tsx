'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, RefreshCw, Pencil, Trash2, FlaskConical, Power } from 'lucide-react'
import type { IntegrationConfig } from '@/lib/types/integrations'
import { fetchIntegrations, deleteIntegration, updateIntegration } from '@/lib/services/integrations.service'
import { IntegrationTypeBadge, TestStatusBadge } from './IntegrationBadge'
import { IntegrationForm } from './IntegrationForm'
import { IntegrationTestModal } from './IntegrationTestModal'

export function IntegrationsList() {
    const [items, setItems]     = useState<IntegrationConfig[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)

    const [showForm, setShowForm]       = useState(false)
    const [editing, setEditing]         = useState<IntegrationConfig | null>(null)
    const [testing, setTesting]         = useState<IntegrationConfig | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchIntegrations()
            setItems(data.items)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load integrations')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    async function handleDelete(id: string) {
        if (!confirm('Delete this integration?')) return
        try {
            await deleteIntegration(id)
            setItems(prev => prev.filter(i => i.id !== id))
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Delete failed')
        }
    }

    async function handleToggleActive(item: IntegrationConfig) {
        try {
            const updated = await updateIntegration(item.id, { is_active: !item.is_active })
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
        } catch { /* ignore */ }
    }

    function handleSaved(cfg: IntegrationConfig) {
        setItems(prev => {
            const idx = prev.findIndex(i => i.id === cfg.id)
            if (idx >= 0) {
                const next = [...prev]
                next[idx] = cfg
                return next
            }
            return [...prev, cfg]
        })
        setShowForm(false)
        setEditing(null)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 flex-shrink-0">
                <h2 className="text-xs font-semibold text-zinc-300">
                    Integrations
                    {!loading && <span className="ml-1.5 text-zinc-600">({items.length})</span>}
                </h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={load}
                        title="Refresh"
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors rounded"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => { setEditing(null); setShowForm(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus size={12} /> New Integration
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading && (
                    <p className="text-xs text-zinc-500 text-center py-8">Loading…</p>
                )}
                {!loading && error && (
                    <p className="text-xs text-red-400 text-center py-8">{error}</p>
                )}
                {!loading && !error && items.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-12 text-zinc-600">
                        <p className="text-xs">No integrations yet.</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                        >
                            <Plus size={12} /> Add first integration
                        </button>
                    </div>
                )}

                {!loading && !error && items.length > 0 && (
                    <div className="space-y-2">
                        {items.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
                            >
                                {/* Status dot */}
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-medium text-white truncate">{item.name}</span>
                                        <IntegrationTypeBadge type={item.type} />
                                        {item.last_test_status && <TestStatusBadge status={item.last_test_status} />}
                                    </div>
                                    {item.last_tested_at && (
                                        <p className="text-[11px] text-zinc-600 mt-0.5">
                                            Tested {new Date(item.last_tested_at).toLocaleString()}
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        onClick={() => setTesting(item)}
                                        title="Test connection"
                                        className="p-1.5 text-zinc-500 hover:text-violet-400 transition-colors"
                                    >
                                        <FlaskConical size={13} />
                                    </button>
                                    <button
                                        onClick={() => { setEditing(item); setShowForm(true) }}
                                        title="Edit"
                                        className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(item)}
                                        title={item.is_active ? 'Deactivate' : 'Activate'}
                                        className={`p-1.5 transition-colors ${item.is_active ? 'text-emerald-500 hover:text-zinc-400' : 'text-zinc-600 hover:text-emerald-400'}`}
                                    >
                                        <Power size={13} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        title="Delete"
                                        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modals */}
            {showForm && (
                <IntegrationForm
                    existing={editing}
                    onSaved={handleSaved}
                    onCancel={() => { setShowForm(false); setEditing(null) }}
                />
            )}
            {testing && (
                <IntegrationTestModal
                    integration={testing}
                    onClose={(updated) => {
                        if (updated) setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
                        setTesting(null)
                    }}
                />
            )}
        </div>
    )
}
