'use client'

import { UserAvatar } from '@/components/shared/UserAvatar'
import s from '@/styles/opshub/work-orders.module.css'

// TODO: import from opshub types when available
type ActivityAction =
    | 'created' | 'assigned' | 'status_change' | 'comment' | 'task_completed'
    | 'ai_recommendation' | 'part_reserved' | 'schedule_updated' | 'approval'

interface ActivityEntry {
    id: string
    action: ActivityAction
    actorName: string
    actorInitials: string
    actorColor: string
    isAI?: boolean
    description: string
    timestamp: string
}

const MOCK_ACTIVITY: ActivityEntry[] = [
    { id: 'a1', action: 'created', actorName: 'AI Monitor', actorInitials: 'AI', actorColor: '#7c3aed', isAI: true, description: 'Work order created from anomaly detection — Motor A7 vibration threshold exceeded', timestamp: '2026-02-09T14:30:00Z' },
    { id: 'a2', action: 'assigned', actorName: 'System', actorInitials: 'SY', actorColor: '#6b7280', description: 'Assigned to Klaus Muller (Lead Technician)', timestamp: '2026-02-09T14:31:00Z' },
    { id: 'a3', action: 'ai_recommendation', actorName: 'AI Agent', actorInitials: 'AI', actorColor: '#7c3aed', isAI: true, description: 'Generated maintenance recommendation based on cross-facility pattern analysis (87% match to Munich Jan failure)', timestamp: '2026-02-09T14:32:00Z' },
    { id: 'a4', action: 'part_reserved', actorName: 'System', actorInitials: 'SY', actorColor: '#6b7280', description: 'Spare part SKF-6205 reserved from warehouse (Bay 3, Shelf C)', timestamp: '2026-02-09T14:33:00Z' },
    { id: 'a5', action: 'status_change', actorName: 'Klaus Muller', actorInitials: 'KM', actorColor: '#3b82f6', description: 'Started investigation — Task #1', timestamp: '2026-02-09T14:45:00Z' },
    { id: 'a6', action: 'task_completed', actorName: 'Klaus Muller', actorInitials: 'KM', actorColor: '#3b82f6', description: 'Completed Task #1: Inspect Motor A7 vibration readings', timestamp: '2026-02-09T15:00:00Z' },
    { id: 'a7', action: 'comment', actorName: 'Anna Schmidt', actorInitials: 'AS', actorColor: '#8b5cf6', description: 'Added comment about oil sample collection', timestamp: '2026-02-09T15:10:00Z' },
    { id: 'a8', action: 'schedule_updated', actorName: 'Hans Weber', actorInitials: 'HW', actorColor: '#f59e0b', description: 'Approved downtime window: Thursday 06:00-08:00', timestamp: '2026-02-09T15:30:00Z' },
]

const actionDotColor: Record<ActivityAction, string> = {
    created: 'bg-emerald-500',
    assigned: 'bg-blue-500',
    status_change: 'bg-cyan-500',
    comment: 'bg-zinc-500',
    task_completed: 'bg-emerald-500',
    ai_recommendation: 'bg-violet-500',
    part_reserved: 'bg-amber-500',
    schedule_updated: 'bg-cyan-500',
    approval: 'bg-emerald-500',
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function WorkOrderActivity() {
    return (
        <div className={s.tabContainer}>
            <div className={s.tabSection}>
                <div className={s.sectionTitle}>Activity Log</div>
                <div className={s.activityTimeline}>
                    {/* Vertical line */}
                    <div className={s.timelineLine} />

                    <div className="space-y-4">
                        {MOCK_ACTIVITY.map(entry => (
                            <div key={entry.id} className={s.timelineItem}>
                                {/* Dot */}
                                <div className={`${s.timelineDot} ${actionDotColor[entry.action]}`} />

                                {/* Content */}
                                <div className="flex-1 min-w-0 pb-1">
                                    <div className="flex items-center gap-2">
                                        <UserAvatar initials={entry.actorInitials} color={entry.actorColor} size="sm" isAI={entry.isAI} />
                                        <span className="text-xs font-semibold text-[var(--tp-text-body)]">{entry.actorName}</span>
                                        <span className="text-[10px] text-[var(--tp-text-muted)]">
                                            {formatDate(entry.timestamp)} {formatTime(entry.timestamp)}
                                        </span>
                                    </div>
                                    <p className={`mt-1 text-sm leading-relaxed ${entry.isAI ? 'text-[var(--tp-accent-purple)]' : 'text-[var(--tp-text-subtle)]'}`}>
                                        {entry.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
