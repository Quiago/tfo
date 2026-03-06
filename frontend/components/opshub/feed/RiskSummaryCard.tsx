'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { TrendingDown } from 'lucide-react'

export function RiskSummaryCard() {
    const currency = useOpshubStore(s => s.currency)
    const anomalies = useOpshubStore(s => s.anomalies)

    // Calculate total risk
    // In a real app this would sum up estimated cost of all active anomalies
    // For demo, we stick to the script value usually, but let's make it dynamic-ish
    const activeAnomalies = anomalies.filter(a => a.status === 'pending' || a.status === 'investigating')

    const riskValue = 36500 // Hardcoded for demo script consistency "€36,500"

    // Currency conversion (Mock)
    const displayValue = currency === 'SAR'
        ? (riskValue * 3.75).toLocaleString('en-US')
        : riskValue.toLocaleString('en-US')

    const currencySymbol = currency === 'SAR' ? 'SAR' : '€'

    const criticalCount = activeAnomalies.filter(a => a.severity === 'critical').length
    const highCount = activeAnomalies.filter(a => a.severity === 'high').length
    const mediumCount = activeAnomalies.filter(a => a.severity === 'medium').length

    return (
        <div className="bg-zinc-950 border border-red-900/30 rounded-lg p-4 mb-4 relative overflow-hidden group">
            {/* Gradient Glow */}
            <div className="absolute top-0 right-0 w-[100px] h-[100px] bg-red-500/5 blur-[60px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="relative z-10">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                    Total Risk Exposure
                </p>
                <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-2xl font-bold text-zinc-100">
                        {currencySymbol} {displayValue}
                    </h2>
                </div>

                {/* Mini Visualization */}
                <div className="flex items-center gap-1 h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-red-500" style={{ width: '25%' }} /> {/* Critical */}
                    <div className="h-full bg-orange-500" style={{ width: '50%' }} /> {/* High */}
                    <div className="h-full bg-amber-500" style={{ width: '25%' }} /> {/* Medium */}
                </div>

                {/* Footer Stats */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span className="font-medium">15% vs last week</span>
                    </div>

                    <span className="text-xs text-zinc-500">
                        {activeAnomalies.length} Active Anomalies
                    </span>
                </div>
            </div>
        </div>
    )
}
