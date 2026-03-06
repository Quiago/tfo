'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import type { DetectedAnomaly } from '@/lib/types/opshub'
import {
    Box,
    CheckCircle,
    Clock,
    Search,
    Workflow,
    XCircle
} from 'lucide-react'
import { useState } from 'react'
import { SparePartsModal } from './SparePartsModal'

interface AnomalyCardProps {
    anomaly: DetectedAnomaly
}

export function AnomalyCard({ anomaly }: AnomalyCardProps) {
    const { approveAnomaly, rejectAnomaly, investigateAnomaly } = useOpshubStore()
    const [isPartsModalOpen, setIsPartsModalOpen] = useState(false)

    const severityConfig: Record<string, { color: string; border: string; bg: string }> = {
        critical: { color: 'text-red-400', border: 'border-red-900/30', bg: 'bg-red-900/10' },
        high: { color: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10' },
        medium: { color: 'text-amber-400', border: 'border-amber-900/30', bg: 'bg-amber-900/10' },
        low: { color: 'text-blue-400', border: 'border-blue-900/30', bg: 'bg-blue-900/10' },
    }

    const config = severityConfig[anomaly.severity] || severityConfig.medium

    return (
        <>
            <div className={`group border rounded-md overflow-hidden transition-all ${config.border} ${config.bg} hover:border-opacity-50`}>
                <div className="p-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                                {anomaly.severity} Priority
                            </span>
                            <span className="text-zinc-600">&middot;</span>
                            <span className="text-xs text-zinc-500 font-medium">{anomaly.factoryName}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">
                            {Math.round(anomaly.confidence * 100)}% confidence
                        </span>
                    </div>

                    {/* Equipment */}
                    <h4 className="mt-1.5 text-sm font-semibold text-zinc-200">
                        {anomaly.equipmentName}
                    </h4>

                    {/* Description */}
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                        {anomaly.description}
                    </p>

                    {/* Context: RUL, Risk, 3D Link */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                        {anomaly.remainingUsefulLife && (
                            <div className="flex items-center gap-1.5 text-zinc-400">
                                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                <span>RUL: <span className="text-zinc-300 font-medium">{anomaly.remainingUsefulLife}</span></span>
                            </div>
                        )}

                        {anomaly.estimatedCostIfIgnored && (
                            <div className="flex items-center gap-1.5 text-zinc-400">
                                <span className="text-zinc-500 font-bold">€</span>
                                <span>Risk: <span className="text-zinc-300 font-medium">€{anomaly.estimatedCostIfIgnored.toLocaleString()}</span></span>
                            </div>
                        )}

                        {anomaly.digitalTwinAssetId && (
                            <button className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors">
                                <Box className="w-3.5 h-3.5" />
                                <span>Locate in 3D</span>
                            </button>
                        )}
                    </div>

                    {/* Suggested workflow */}
                    {anomaly.suggestedWorkflowName && (
                        <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center gap-1.5 text-xs text-zinc-500">
                            <Workflow className="w-3.5 h-3.5" />
                            <span>Suggested:</span>
                            <span className="font-medium text-zinc-300 truncate">
                                {anomaly.suggestedWorkflowName}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-2">
                        {/* Primary Action Group */}
                        <div className="flex-1 flex gap-1">
                            {anomaly.status !== 'investigating' && (
                                <button
                                    onClick={() => setIsPartsModalOpen(true)}
                                    className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 rounded transition-all"
                                >
                                    Check Spares
                                </button>
                            )}
                            <button
                                onClick={() => approveAnomaly(anomaly.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded transition-all"
                            >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                            </button>
                        </div>

                        {anomaly.status !== 'investigating' && (
                            <button
                                onClick={() => investigateAnomaly(anomaly.id)}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded transition-colors"
                                title="Investigate"
                            >
                                <Search className="w-3.5 h-3.5" />
                            </button>
                        )}

                        <button
                            onClick={() => rejectAnomaly(anomaly.id)}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                            title="Dismiss"
                        >
                            <XCircle className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            <SparePartsModal
                isOpen={isPartsModalOpen}
                onClose={() => setIsPartsModalOpen(false)}
                onApprove={() => approveAnomaly(anomaly.id)}
            />
        </>
    )
}
