'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle, XCircle } from 'lucide-react'
import type { IntegrationConfig, IntegrationTestResult } from '@/lib/types/integrations'
import { testIntegration } from '@/lib/services/integrations.service'

interface Props {
    integration: IntegrationConfig
    onClose: (updated?: IntegrationConfig) => void
}

export function IntegrationTestModal({ integration, onClose }: Props) {
    const [state, setState] = useState<'idle' | 'testing' | 'done'>('idle')
    const [result, setResult] = useState<IntegrationTestResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function runTest() {
        setState('testing')
        setError(null)
        try {
            const res = await testIntegration(integration.id)
            setResult(res)
            setState('done')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Test request failed')
            setState('done')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">Test Connection</h3>
                    <button onClick={() => onClose()} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-xs text-zinc-400">
                        Send a test message/ping to <span className="text-white font-medium">{integration.name}</span> ({integration.type}).
                    </p>

                    {state === 'idle' && (
                        <button
                            onClick={runTest}
                            className="w-full py-2 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
                        >
                            Run Test
                        </button>
                    )}

                    {state === 'testing' && (
                        <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs">Testing connection…</span>
                        </div>
                    )}

                    {state === 'done' && result && (
                        <div className={`p-3 rounded-lg border ${result.success ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {result.success
                                    ? <CheckCircle size={14} className="text-emerald-400" />
                                    : <XCircle    size={14} className="text-red-400" />
                                }
                                <span className={`text-xs font-semibold ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {result.success ? 'Connection OK' : 'Connection Failed'}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 font-mono">{result.message}</p>
                        </div>
                    )}

                    {state === 'done' && error && (
                        <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50">
                            <p className="text-xs text-red-300">{error}</p>
                        </div>
                    )}

                    {state === 'done' && (
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={runTest}
                                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                            >
                                Retry
                            </button>
                            <button
                                onClick={() => onClose()}
                                className="px-4 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
