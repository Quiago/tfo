'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { Building2, ChevronDown } from 'lucide-react'
import { AnomalyList } from './AnomalyList'
import { OpshubFeed } from './OpshubFeed'
import { RiskSummaryCard } from './RiskSummaryCard'
import { TotalRiskPanel } from './TotalRiskPanel'
import { WorkOrderShortcutList } from '../work-orders/WorkOrderShortcutList'

export function OpshubHome() {
    const factories = useOpshubStore(s => s.factories)
    const selectedFactoryId = useOpshubStore(s => s.selectedFactoryId)
    const setSelectedFactory = useOpshubStore(s => s.setSelectedFactory)

    const selectedFactory = selectedFactoryId
        ? factories.find(f => f.id === selectedFactoryId)
        : null

    const viewMode = useOpshubStore(s => s.viewMode)
    const setViewMode = useOpshubStore(s => s.setViewMode)

    // Mock KPIs for demo
    const KPIs = [
        { label: 'OEE', value: '87.3', unit: '%', trend: 'up', trendValue: '+2.1%', status: 'good' },
        { label: 'Cycle Time', value: '42.1', unit: 's', trend: 'down', trendValue: '-0.8s', status: 'good' },
        { label: 'Robots', value: '18/20', unit: '', trend: 'stable', trendValue: '0', status: 'warning' },
    ]

    return (
        <div className="flex flex-col h-full w-full bg-zinc-950">
            {/* OpsHub Header */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-sm z-10">
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
                    <span className="text-cyan-500">OpsHub</span>
                    <span className="text-zinc-600 font-light">|</span>
                    <span className="text-sm font-medium text-zinc-400">Operations Control Center</span>
                </h1>

                <div className="flex items-center gap-4">
                    {/* View Mode Toggle */}
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
                        {(['executive', 'engineering', 'operations'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === mode
                                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/50'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Export Button */}
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-md text-xs font-medium transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export Report
                    </button>
                </div>
            </div>

            <div className="flex-1 flex gap-6 px-6 py-6 overflow-hidden">
                {/* Left Sidebar - Factory Selector + Work Orders */}
                <div className="w-[240px] flex-shrink-0 overflow-y-auto">
                    <div className="sticky top-0">
                        {/* Factory Selector */}
                        <div className="mb-6">
                            <label className="text-xs text-zinc-500 font-medium uppercase tracking-wide mb-2 block">
                                Facility
                            </label>
                            <div className="relative mb-3">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                                <select
                                    value={selectedFactoryId || ''}
                                    onChange={(e) => setSelectedFactory(e.target.value || null)}
                                    className="w-full pl-9 pr-8 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 appearance-none cursor-pointer hover:border-zinc-700 focus:outline-none focus:border-cyan-500 transition-colors"
                                >
                                    <option value="">All Facilities</option>
                                    {factories.map(factory => (
                                        <option key={factory.id} value={factory.id}>
                                            {factory.displayName}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                            </div>

                            {/* Metrics with Trends */}
                            {selectedFactory && (
                                <div className="grid grid-cols-2 gap-2">
                                    {KPIs.map((kpi, i) => (
                                        <div key={i} className="p-2.5 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
                                            <p className="text-[10px] text-zinc-500 uppercase">{kpi.label}</p>
                                            <div className="flex items-baseline gap-1 mt-0.5">
                                                <span className="text-lg font-semibold text-zinc-200">{kpi.value}</span>
                                                <span className="text-xs text-zinc-500">{kpi.unit}</span>
                                            </div>
                                            <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${kpi.trend === 'up' ? 'text-emerald-500' :
                                                kpi.trend === 'down' ? 'text-rose-500' : 'text-zinc-500'
                                                }`}>
                                                {kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '−'}
                                                {kpi.trendValue}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Work Order Shortcuts */}
                        <WorkOrderShortcutList />
                    </div>
                </div>

                {/* Center Feed */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                    <AnomalyList />
                    <OpshubFeed />
                </div>

                {/* Right Sidebar - Risk & Health */}
                <div className="flex-shrink-0 w-[300px] overflow-y-auto">
                    <div className="sticky top-0 space-y-4">
                        <RiskSummaryCard />
                        <TotalRiskPanel />
                    </div>
                </div>
            </div>
        </div>
    )
}
