'use client'

import { useOpshubStore } from '@/lib/store/opshub-store';
import s from '@/styles/overview-expanded/expanded.module.css';
import { AlertTriangle, Calendar, CheckCircle2, Play } from 'lucide-react';
import { useMemo } from 'react';

// Ultra Compact SVG Gauge
const Gauge = ({ value }: { value: number }) => {
    const r = 20; // Reduced from 24
    const c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;

    return (
        <div className="relative flex items-center justify-center w-12 h-12">
            <svg className="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r={r} stroke="#E5E7EB" strokeWidth="5" fill="transparent" />
                <circle cx="24" cy="24" r={r} stroke="#10B981" strokeWidth="5" fill="transparent" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-xs font-bold text-[var(--tp-text-heading)]">{value}%</span>
            </div>
        </div>
    )
}

// Compact Sparkline
const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 100}`).join(' ');

    return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-5 overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

const ProgressBar = ({ value, color, label }: { value: number, color: string, label: string }) => (
    <div className="flex flex-col gap-0.5 w-full">
        <div className="flex justify-between items-end">
            <span className="text-xs font-bold text-[var(--tp-text-heading)]">{value}%</span>
        </div>
        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
        <div className="flex justify-between">
            <span className="text-[9px] text-[var(--tp-text-muted)] uppercase tracking-wider font-semibold">{label}</span>
        </div>
    </div>
)

/** Convert raw mesh/asset IDs like "KUKA_Robot_Arm" → "KUKA Robot Arm". */
function formatAssetName(raw: string): string {
    return raw
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

export function RichMachineSummary({ selectedAsset }: { selectedAsset?: string | null }) {
    const allWorkOrders = useOpshubStore(s => s.workOrders)

    // Get latest pending task for the selected asset (or global if none selected, though usually selected in this view)
    const latestTask = useMemo(() => {
        let relevantWOs = allWorkOrders

        if (selectedAsset) {
            // Match by equipment name or ID (store uses equipmentName often as the key from DT)
            relevantWOs = allWorkOrders.filter(wo =>
                wo.equipmentName === selectedAsset ||
                wo.equipmentId === selectedAsset
            )
        }

        // Get all pending/in-progress tasks
        const tasks = relevantWOs.flatMap(wo =>
            wo.tasks.filter(t => t.status === 'pending' || t.status === 'in-progress')
        )

        // Sort by newest first
        return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
    }, [allWorkOrders, selectedAsset])

    const updateTask = useOpshubStore(s => s.updateTask)

    const handleStartTask = () => {
        if (!latestTask) return
        updateTask(latestTask.workOrderId, latestTask.id, {
            status: 'in-progress',
            updates: [
                ...(latestTask.updates || []),
                {
                    id: `u-${Date.now()}`,
                    author: {
                        id: 'current-user', // In a real app, from store
                        name: 'You',
                        role: 'User',
                        avatarInitials: 'YO',
                        avatarColor: '#3B82F6',
                        facility: 'Munich Plant',
                        status: 'available'
                    },
                    content: 'Task started from Overview.',
                    createdAt: new Date().toISOString()
                }
            ]
        })
    }

    const teamName = selectedAsset ? formatAssetName(selectedAsset) : null;

    return (
        <div className={s.summaryCard}>
            {/* Team / Equipment name badge */}
            {teamName && (
                <div className="flex items-center gap-2 mb-2 px-0.5 flex-shrink-0">
                    <div className="w-1 h-4 bg-cyan-500 rounded-full flex-shrink-0" />
                    <span className="text-sm font-bold text-[var(--tp-text-heading)] truncate leading-none">
                        {teamName}
                    </span>
                    <span className="text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase tracking-widest ml-0.5 flex-shrink-0">
                        in focus
                    </span>
                </div>
            )}

            {/* Top Row: Stats Grid - 60% height */}
            <div className="grid grid-cols-4 gap-2 h-[60%] min-h-0">
                {/* 1. Health */}
                <div className="flex flex-col items-center justify-center p-1 bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)]">
                    <Gauge value={92} />
                    <span className="mt-0.5 text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase">Health</span>
                </div>

                {/* 2. Last Maintenance */}
                <div className="flex flex-col items-center justify-center p-1 bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)]">
                    <div className="p-1 bg-blue-50 rounded-md mb-0.5">
                        <Calendar size={16} className="text-blue-600" />
                    </div>
                    <span className="text-xs font-bold text-[var(--tp-text-heading)]">3 days ago</span>
                    <span className="text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase">Last Maint.</span>
                </div>

                {/* 3. Metrics (Stacked) */}
                <div className="flex flex-col gap-1 p-1.5 bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)] justify-center">
                    <ProgressBar value={95.8} color="#10B981" label="Uptime" />
                    <div className="h-px bg-gray-100 w-full" />
                    <ProgressBar value={96.9} color="#3B82F6" label="Efficiency" />
                </div>

                {/* 4. Sparklines (Stacked) */}
                <div className="flex flex-col gap-1 p-1.5 bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)] justify-center">
                    <div className="flex flex-col w-full">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase">Energ</span>
                            <span className="text-[10px] font-bold text-[var(--tp-text-heading)]">114kW</span>
                        </div>
                        <Sparkline data={[40, 60, 45, 70, 65, 80, 75, 50]} color="#10B981" />
                    </div>
                    <div className="h-px bg-gray-100 w-full" />
                    <div className="flex flex-col w-full">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase">Cycl</span>
                            <span className="text-[10px] font-bold text-[var(--tp-text-heading)]">1.2k</span>
                        </div>
                        <Sparkline data={[20, 30, 25, 40, 35, 50, 45, 60]} color="#F59E0B" />
                    </div>
                </div>
            </div>

            {/* Bottom Row: Latest Task Card - 40% height */}
            {latestTask ? (
                <div className="grid grid-cols-12 gap-2 w-full bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)] p-2 shadow-sm h-[40%] flex-shrink-0 items-center">

                    {/* Col 1: Identity (Icon + Title) - 4 cols */}
                    <div className="col-span-4 flex items-center gap-3 overflow-hidden h-full">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex-shrink-0">
                            <AlertTriangle size={14} />
                        </div>
                        <div className="flex flex-col justify-center overflow-hidden">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wide">High Priority</span>
                                <span className="text-[9px] text-zinc-400">•</span>
                                <span className="text-[9px] text-zinc-500 font-medium">#{latestTask.number}</span>
                            </div>
                            <span className="text-xs font-bold text-[var(--tp-text-heading)] truncate leading-tight" title={latestTask.title}>
                                {latestTask.title}
                            </span>
                        </div>
                    </div>

                    {/* Col 2: Description - 5 cols */}
                    <div className="col-span-5 flex flex-col justify-center h-full border-l border-gray-100 pl-3 overflow-hidden">
                        <span className="text-[9px] font-semibold text-[var(--tp-text-muted)] uppercase mb-0.5">Description</span>
                        <p className="text-[10px] text-zinc-600 leading-snug line-clamp-2" title={latestTask.description}>
                            {latestTask.description || 'No additional details provided for this task.'}
                        </p>
                    </div>

                    {/* Col 3: Details & Action - 3 cols */}
                    <div className="col-span-3 flex items-center justify-end gap-2 h-full pl-2 border-l border-gray-100">
                        <div className="flex flex-col items-end mr-1">
                            <span className="text-[9px] text-[var(--tp-text-muted)] uppercase">
                                {latestTask.status === 'in-progress' ? 'Running' : 'Assignee'}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold ${latestTask.assignee.avatarColor || 'bg-gray-500'}`}>
                                    {latestTask.assignee.avatarInitials}
                                </div>
                                <span className="text-[10px] font-semibold text-zinc-700 truncate max-w-[60px]">
                                    {latestTask.assignee.name.split(' ')[0]}
                                </span>
                            </div>
                        </div>

                        {latestTask.status !== 'in-progress' && (
                            <button
                                onClick={handleStartTask}
                                className="flex items-center justify-center w-6 h-6 bg-[var(--tp-text-heading)] text-white rounded-md hover:scale-105 active:scale-95 transition-all shadow-sm"
                                title="Start Task"
                            >
                                <Play size={10} fill="currentColor" className="ml-0.5" />
                            </button>
                        )}

                        {latestTask.status === 'in-progress' && (
                            <div className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-md">
                                <span className="animate-pulse">●</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center w-full bg-white rounded-[var(--tp-radius-md)] border border-[var(--tp-stroke-subtle)] p-1 h-[40%] text-zinc-400 text-xs flex-shrink-0">
                    <CheckCircle2 size={16} className="mr-2" />
                    No pending tasks
                </div>
            )}
        </div>
    )
}
