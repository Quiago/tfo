'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'

export function TotalRiskPanel() {
    const anomalies = useOpshubStore(s => s.anomalies)
    const selectedFactoryId = useOpshubStore(s => s.selectedFactoryId)

    // Filter anomalies by selected factory
    let filteredAnomalies = anomalies.filter(a => a.status === 'pending' || a.status === 'investigating')
    if (selectedFactoryId) {
        filteredAnomalies = filteredAnomalies.filter(a => a.factoryId === selectedFactoryId)
    }

    // Count by severity
    const severityCounts = {
        critical: filteredAnomalies.filter(a => a.severity === 'critical').length,
        high: filteredAnomalies.filter(a => a.severity === 'high').length,
        medium: filteredAnomalies.filter(a => a.severity === 'medium').length,
        low: filteredAnomalies.filter(a => a.severity === 'low').length,
    }

    return (
        <div className="w-[280px] sticky top-4">
            {/* System Health / Anomalies Overview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-100">
                        System Health
                    </h3>
                    <span className="text-xs text-zinc-500">
                        {filteredAnomalies.length} Issues
                    </span>
                </div>

                {/* Severity Breakdown - Cleaner List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-zinc-300">Critical</span>
                        </div>
                        <span className="font-medium text-zinc-200">{severityCounts.critical}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <span className="text-zinc-300">High</span>
                        </div>
                        <span className="font-medium text-zinc-200">{severityCounts.high}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-zinc-300">Medium</span>
                        </div>
                        <span className="font-medium text-zinc-200">{severityCounts.medium}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-zinc-300">Low</span>
                        </div>
                        <span className="font-medium text-zinc-200">{severityCounts.low}</span>
                    </div>
                </div>

                {/* View All Button */}
                <button
                    onClick={() => {
                        // Filter feed to show only anomalies
                        useOpshubStore.getState().toggleAnomaliesOnly()
                    }}
                    className="w-full mt-4 px-3 py-1.5 text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600 rounded transition-colors"
                >
                    View All Anomalies
                </button>
            </div>
        </div>
    )
}
