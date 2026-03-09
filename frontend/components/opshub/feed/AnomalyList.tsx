'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { useMemo } from 'react'
import { AnomalyCard } from './AnomalyCard'

export function AnomalyList() {
    const anomalies = useOpshubStore(s => s.anomalies)
    const viewMode = useOpshubStore(s => s.viewMode)
    const selectedFactoryId = useOpshubStore(s => s.selectedFactoryId)
    const showOnlyAnomalies = useOpshubStore(s => s.showOnlyAnomalies)

    // Filter active anomalies
    const activeAnomalies = useMemo(() => {
        let filtered = anomalies.filter(a => a.status === 'pending' || a.status === 'investigating')

        if (selectedFactoryId) {
            filtered = filtered.filter(a => a.factoryId === selectedFactoryId)
        }

        return filtered
    }, [anomalies, selectedFactoryId])

    // Sort based on View Mode
    const sortedAnomalies = useMemo(() => {
        const sorted = [...activeAnomalies]

        if (viewMode === 'executive') {
            // Sort by Estimated Cost (Risk)
            sorted.sort((a, b) => (b.estimatedCostIfIgnored || 0) - (a.estimatedCostIfIgnored || 0))
        } else if (viewMode === 'engineering') {
            // Sort by Confidence (Certainty)
            sorted.sort((a, b) => b.confidence - a.confidence)
        } else {
            // Operations: Sort by Severity / Urgency
            const severityScore = (s: string) => {
                if (s === 'critical') return 4
                if (s === 'high') return 3
                if (s === 'medium') return 2
                return 1
            }
            sorted.sort((a, b) => severityScore(b.severity) - severityScore(a.severity))
        }

        return sorted
    }, [activeAnomalies, viewMode])

    if (activeAnomalies.length === 0) return null

    return (
        <div className="mb-6 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex items-center justify-between">
                <span>Pending Anomalies</span>
                <span className="bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded text-[10px]">
                    {activeAnomalies.length} Requires Action
                </span>
            </h3>

            <div className="grid grid-cols-1 gap-3">
                {sortedAnomalies.map(anomaly => (
                    <AnomalyCard key={anomaly.id} anomaly={anomaly} />
                ))}
            </div>

            <div className="h-px bg-zinc-800 my-4" />
        </div>
    )
}
