'use client'

import { UserAvatar } from '@/components/shared/UserAvatar'
import s from '@/styles/opshub/work-orders.module.css'
import {
    CheckCircle,
    ClipboardCheck,
    FlaskConical,
    Play,
    Settings,
    ShieldCheck,
} from 'lucide-react'

export type TaskType = 'investigation' | 'execution' | 'verification' | 'approval'
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked' | 'accepted'

interface WOTaskCardProps {
    taskNumber: number
    type: TaskType
    title: string
    assigneeName: string
    assigneeInitials: string
    assigneeColor: string
    status: TaskStatus
    blockedBy?: string[]
    onStart?: (e?: React.MouseEvent) => void
    onComplete?: (e?: React.MouseEvent) => void
    onCreateWorkflow?: (e?: React.MouseEvent) => void
    onClick?: () => void
}

const typeIcon: Record<TaskType, React.ReactNode> = {
    investigation: <FlaskConical className="w-3.5 h-3.5" />,
    execution: <Settings className="w-3.5 h-3.5" />,
    verification: <ClipboardCheck className="w-3.5 h-3.5" />,
    approval: <ShieldCheck className="w-3.5 h-3.5" />,
}

const typeColor: Record<TaskType, string> = {
    investigation: 'text-purple-400',
    execution: 'text-cyan-400',
    verification: 'text-emerald-400',
    approval: 'text-amber-400',
}

const statusConfig: Record<TaskStatus, { dot: string; label: string }> = {
    pending: { dot: 'bg-zinc-500', label: 'Pending' },
    'in-progress': { dot: 'bg-cyan-500 animate-pulse', label: 'In Progress' },
    completed: { dot: 'bg-emerald-500', label: 'Completed' },
    blocked: { dot: 'bg-red-500', label: 'Blocked' },
    accepted: { dot: 'bg-emerald-500', label: 'Accepted' },
}

export function WorkOrderTaskCard(props: WOTaskCardProps) {
    const {
        taskNumber, type, title, assigneeName, assigneeInitials, assigneeColor,
        status, blockedBy, onStart, onComplete, onCreateWorkflow
    } = props
    const sc = statusConfig[status]

    return (
        <div className={s.card} onClick={props.onClick}>
            <div className={s.cardHeader}>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-opacity-10 ${typeColor[type]?.replace('text-', 'bg-') || 'bg-gray-100'}`}>
                        {typeIcon[type]}
                    </div>
                    <div>
                        <div className={s.cardMetaLine}>
                            <span className="font-bold">#{taskNumber}</span>
                            <span className="uppercase text-[10px] tracking-wider opacity-70">{type}</span>
                        </div>
                        <h4 className={s.cardTitle}>{title}</h4>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <div className={`px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide border ${status === 'completed' ? s.statusResolved :
                        status === 'in-progress' ? s.statusProgress :
                            status === 'blocked' ? 'border-red-200 bg-red-50 text-red-700' :
                                s.statusClosed
                        }`}>
                        {sc.label}
                    </div>
                </div>
            </div>

            <div className={s.cardDetails}>
                <div className={s.cardDetailItem}>
                    <UserAvatar initials={assigneeInitials} color={assigneeColor} size="sm" />
                    <span>{assigneeName}</span>
                </div>

                {blockedBy && blockedBy.length > 0 && (
                    <div className={`${s.cardDetailItem} text-red-600`}>
                        <ShieldCheck className="w-3 h-3" />
                        <span>Blocked by #{blockedBy.join(', #')}</span>
                    </div>
                )}
            </div>

            {/* Actions Toolbar */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--tp-stroke-subtle)]">
                {status === 'in-progress' && onCreateWorkflow && (
                    <button
                        onClick={onCreateWorkflow}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tp-accent-blue)] hover:bg-[var(--tp-bg-hover)] rounded transition"
                    >
                        <Settings className="w-3.5 h-3.5" /> Workflow
                    </button>
                )}
                {status === 'pending' && onStart && (
                    <button onClick={onStart} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tp-accent-blue)] hover:bg-[var(--tp-bg-hover)] rounded transition">
                        <Play className="w-3.5 h-3.5" /> Start
                    </button>
                )}
                {status === 'in-progress' && onComplete && (
                    <button onClick={onComplete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tp-accent-green)] hover:bg-[var(--tp-bg-hover)] rounded transition">
                        <CheckCircle className="w-3.5 h-3.5" /> Mark Done
                    </button>
                )}
            </div>
        </div>
    )
}
