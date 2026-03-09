'use client'

import { AvatarStack } from '@/components/shared/AvatarStack'
import { Calendar, Trash2 } from 'lucide-react'

import { type WorkOrderCard } from '@/lib/types/opshub'
import s from '@/styles/opshub/work-orders.module.css'

interface WorkOrderListCardProps {
    workOrder: WorkOrderCard
    onClick?: (id: string) => void
    onDelete?: (id: string) => void
}

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

export function WorkOrderListCard({ workOrder, onClick, onDelete }: WorkOrderListCardProps) {
    const statusClass = {
        open: s.statusOpen,
        'in-progress': s.statusProgress,
        resolved: s.statusResolved,
        closed: s.statusClosed,
    }[workOrder.status]

    const priorityClass = {
        critical: s.priorityCritical,
        high: s.priorityHigh,
        medium: s.priorityMedium,
        low: s.priorityLow,
    }[workOrder.priority] || s.priorityLow

    return (
        <div className={s.card}>
            <div
                className={s.cardContentWrapper}
                onClick={() => onClick?.(workOrder.id)}
            >
                <div className="flex-1 min-w-0">
                    {/* Meta Line */}
                    <div className={s.cardMetaLine}>
                        <span className={s.workOrderNumber}>{workOrder.number}</span>
                        <span className={`${s.statusBadge} ${statusClass}`}>
                            {workOrder.status.replace('-', ' ')}
                        </span>
                        <span className={`${s.priorityText} ${priorityClass}`}>
                            {workOrder.priority}
                        </span>
                    </div>

                    {/* Title */}
                    <h3 className={s.cardTitle}>
                        {workOrder.title}
                    </h3>

                    {/* Details */}
                    <div className={s.cardDetails}>
                        <div className={s.locationRow}>
                            {workOrder.facility && (
                                <>
                                    <span>{workOrder.facility}</span>
                                    <span className="mx-1">·</span>
                                </>
                            )}
                            {workOrder.equipmentName && (
                                <span>{workOrder.equipmentName}</span>
                            )}
                        </div>
                        <div className={s.timeDetail}>
                            <Calendar className="w-3 h-3" />
                            {timeAgo(workOrder.createdAt)}
                        </div>
                    </div>

                    {/* Tags */}
                    {workOrder.tags.length > 0 && (
                        <div className={s.cardTags}>
                            {workOrder.tags.slice(0, 3).map(tag => (
                                <span key={tag} className={s.tag}>
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Actions Section: Avatars + Delete */}
            <div className={s.cardActionsRight}>
                {/* Team Avatars */}
                {workOrder.team.length > 0 && (
                    <div className={s.cardAvatarsRelative}>
                        <AvatarStack
                            members={workOrder.team.map(m => ({
                                initials: m.avatarInitials,
                                color: m.avatarColor,
                            }))}
                            max={3}
                        />
                    </div>
                )}

                {/* Delete Button */}
                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Are you sure you want to delete this Work Order?')) {
                                onDelete(workOrder.id)
                            }
                        }}
                        className={s.deleteBtnRelative}
                        title="Delete Work Order"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    )
}
