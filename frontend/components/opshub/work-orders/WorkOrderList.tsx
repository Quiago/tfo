'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { type WorkOrderStatus } from '@/lib/types/opshub'
import s from '@/styles/opshub/work-orders.module.css'
import { ArrowLeft, ClipboardList, Search } from 'lucide-react'
import { useState } from 'react'
import { WorkOrderListCard } from './WorkOrderListCard'

type FilterStatus = 'all' | WorkOrderStatus

interface WorkOrderListProps {
    onSelectWorkOrder: (id: string) => void
    onBack?: () => void
}

export function WorkOrderList({ onSelectWorkOrder, onBack }: WorkOrderListProps) {
    const workOrders = useOpshubStore(s => s.workOrders)
    const removeWorkOrder = useOpshubStore(s => s.removeWorkOrder)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')

    const filtered = workOrders.filter(wo => {
        if (statusFilter !== 'all' && wo.status !== statusFilter) return false
        if (search.trim()) {
            const q = search.toLowerCase()
            return (
                wo.title.toLowerCase().includes(q) ||
                wo.number.toLowerCase().includes(q) ||
                wo.tags.some(t => t.toLowerCase().includes(q))
            )
        }
        return true
    })

    const filters: { value: FilterStatus; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'in-progress', label: 'In Progress' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'closed', label: 'Closed' },
    ]

    return (
        <div className={s.container}>
            <div className={s.wrapper}>
                <div className={s.header}>
                    <div className={s.headerLeft}>
                        {onBack && (
                            <button onClick={onBack} className={s.backBtn}>
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        )}
                        <ClipboardList className="w-5 h-5 text-[var(--tp-accent-cyan)]" />
                        <h1 className={s.title}>Work Orders</h1>
                        <span className={s.countBadge}>
                            {filtered.length}
                        </span>
                    </div>
                </div>

                {/* Search + Filters */}
                <div className={s.controls}>
                    <div className={s.searchBar}>
                        <Search className={s.searchIcon} size={16} />
                        <input
                            type="text"
                            placeholder="Search work orders..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className={s.searchInput}
                        />
                    </div>

                    <div className={s.filterTabs}>
                        {filters.map(f => (
                            <button
                                key={f.value}
                                onClick={() => setStatusFilter(f.value)}
                                className={statusFilter === f.value ? s.filterBtnActive : s.filterBtn}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Work Order Cards */}
                {filtered.length === 0 ? (
                    <div className={s.emptyState}>
                        No work orders match your search
                    </div>
                ) : (
                    <div className={s.teamList}> {/* reusing vertical stack gap */}
                        {filtered.map(wo => (
                            <WorkOrderListCard
                                key={wo.id}
                                workOrder={wo}
                                onClick={onSelectWorkOrder}
                                onDelete={removeWorkOrder}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
