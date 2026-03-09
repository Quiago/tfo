'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { ArrowUpRight, CheckCircle2, Clock, FileText } from 'lucide-react'
import { useMemo } from 'react'

export function RecentActivity({ onViewWorkOrders }: { onViewWorkOrders: () => void }) {
    const allWorkOrders = useOpshubStore(s => s.workOrders)
    const currentUser = useOpshubStore(s => s.currentUser)

    const workOrders = useMemo(() => {
        return [...allWorkOrders]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 3)
    }, [allWorkOrders])

    const tasks = useMemo(() => {
        if (!currentUser) return []
        return allWorkOrders.flatMap(wo =>
            wo.tasks.filter(t => t.assignee.id === currentUser.id)
        )
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 3)
    }, [allWorkOrders, currentUser])

    // Fallback if no tasks (for demo)
    const displayTasks = tasks.length > 0 ? tasks : []

    return (
        <div className="flex w-full gap-4 p-4 pt-0">
            {/* Recent Work Orders Column */}
            <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--tp-text-muted)] uppercase tracking-wider">
                    <FileText size={12} />
                    <span>Recent Work Orders</span>
                </div>
                <div className="flex flex-col gap-2">
                    {workOrders.map(wo => (
                        <div key={wo.id} className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.5)] border border-[var(--tp-stroke-subtle)] hover:bg-white transition-colors cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-[var(--tp-text-heading)]">{wo.title}</span>
                                <span className="text-xs text-[var(--tp-text-muted)]">{wo.number} • {wo.status}</span>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold
                                ${wo.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                    wo.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                        'bg-blue-100 text-blue-700'}`}>
                                {wo.priority}
                            </div>
                        </div>
                    ))}
                    {workOrders.length === 0 && (
                        <div className="text-xs text-center py-4 text-[var(--tp-text-muted)]">No recent work orders</div>
                    )}
                </div>
            </div>

            {/* Recent Tasks Column */}
            <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--tp-text-muted)] uppercase tracking-wider">
                    <CheckCircle2 size={12} />
                    <span>Recent Tasks</span>
                </div>
                <div className="flex flex-col gap-2">
                    {displayTasks.map(task => (
                        <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.5)] border border-[var(--tp-stroke-subtle)] hover:bg-white transition-colors cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-[var(--tp-text-heading)]">{task.title}</span>
                                <span className="text-xs text-[var(--tp-text-muted)]">{task.status}</span>
                            </div>
                            <Clock size={14} className="text-[var(--tp-text-muted)]" />
                        </div>
                    ))}
                    {displayTasks.length === 0 && (
                        <div className="text-xs text-center py-4 text-[var(--tp-text-muted)]">No assigned tasks</div>
                    )}
                </div>
            </div>

            {/* Action Button Area */}
            <div className="flex flex-col justify-end">
                <button
                    onClick={onViewWorkOrders}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--tp-stroke)] rounded-lg text-sm font-medium text-[var(--tp-text-heading)] hover:bg-[var(--tp-bg-pill)] hover:border-[#98A6D4] transition-all h-[42px]"
                >
                    <span>View Work Orders</span>
                    <ArrowUpRight size={14} />
                </button>
            </div>
        </div>
    )
}
