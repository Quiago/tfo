'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import s from '@/styles/opshub/work-orders.module.css'
import { ClipboardList } from 'lucide-react'

export function WorkOrderShortcutList() {
    const getLatestWorkOrders = useOpshubStore(s => s.getLatestWorkOrders)
    const setSelectedWorkOrderId = useOpshubStore(s => s.setSelectedWorkOrderId)
    const setActiveTab = useOpshubStore(s => s.setActiveTab)

    const latestWorkOrders = getLatestWorkOrders()

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical':
                return 'bg-red-500'
            case 'high':
                return 'bg-orange-500'
            case 'medium':
                return 'bg-yellow-500'
            case 'low':
                return 'bg-blue-500'
            default:
                return 'bg-zinc-500'
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-blue-900/30 text-blue-400 border-blue-800'
            case 'in-progress':
                return 'bg-amber-900/30 text-amber-400 border-amber-800'
            case 'resolved':
                return 'bg-green-900/30 text-green-400 border-green-800'
            case 'closed':
                return 'bg-zinc-800 text-zinc-400 border-zinc-700'
            default:
                return 'bg-zinc-800 text-zinc-400 border-zinc-700'
        }
    }

    const handleViewAll = () => {
        setActiveTab('work-orders')
    }

    return (
        <div className={s.shortcutContainer}>
            {/* Header */}
            <div className={s.shortcutHeader}>
                <ClipboardList className="w-4 h-4 text-[var(--tp-accent-cyan)]" />
                <h3 className={s.shortcutTitle}>Latest Work Orders</h3>
            </div>

            {/* Work Order List */}
            <div className={s.shortcutList}>
                {latestWorkOrders.length === 0 ? (
                    <div className="px-2 py-4 text-center">
                        <p className="text-xs text-[var(--tp-text-muted)]">No work orders</p>
                    </div>
                ) : (
                    latestWorkOrders.map(wo => (
                        <button
                            key={wo.id}
                            onClick={() => setSelectedWorkOrderId(wo.id)}
                            className={s.shortcutItem}
                        >
                            {/* WO-ID - status - priority */}
                            <div className={s.shortcutMeta}>
                                <span className={s.shortcutNumber}>{wo.number}</span>
                                <span className={s.shortcutSeparator}>-</span>
                                <span className={`${s.shortcutStatus} ${wo.status === 'open' ? s.statusOpenText :
                                    wo.status === 'in-progress' ? s.statusProgressText :
                                        wo.status === 'resolved' ? s.statusResolvedText :
                                            s.statusClosedText // Need to define text variants or use inline colors if simpler, but user wants NO tailwind
                                    }`} style={{ color: wo.status === 'open' ? 'var(--tp-accent-green)' : wo.status === 'in-progress' ? 'var(--tp-accent-blue)' : wo.status === 'resolved' ? 'var(--tp-accent-purple)' : 'var(--tp-text-muted)' }}>
                                    {wo.status.replace('-', '_')}
                                </span>
                                <span className={s.shortcutSeparator}>-</span>
                                <span className={s.shortcutStatus} style={{ color: wo.priority === 'critical' ? 'var(--tp-accent-red)' : wo.priority === 'high' ? 'var(--tp-accent-orange)' : wo.priority === 'medium' ? 'var(--tp-accent-yellow)' : 'var(--tp-accent-blue)' }}>
                                    {wo.priority}
                                </span>
                            </div>

                            {/* Title */}
                            <p className={s.shortcutTitleText}>
                                {wo.title}
                            </p>
                        </button>
                    ))
                )}
            </div>

            {/* View All Button */}
            {latestWorkOrders.length > 0 && (
                <button
                    onClick={handleViewAll}
                    className={s.viewAllBtn}
                >
                    View All Work Orders →
                </button>
            )}
        </div>
    )
}
