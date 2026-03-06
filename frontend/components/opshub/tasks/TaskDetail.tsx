'use client'

import { UserAvatar } from '@/components/shared/UserAvatar'
import { useOpshubStore } from '@/lib/store/opshub-store'
import s from '@/styles/opshub/work-orders.module.css'
import {
    ArrowLeft,
    CheckCircle,
    Clock,
    FlaskConical,
    Image as ImageIcon,
    Mic,
    Paperclip,
    Play,
    Send,
    Settings,
    ShieldCheck
} from 'lucide-react'
import { useState } from 'react'
import { TaskStatus, TaskType } from './WorkOrderTaskCard'

interface TaskDetailProps {
    task: {
        id: string
        number: number
        type: TaskType
        title: string
        description?: string
        status: TaskStatus
        assignee: {
            name: string
            avatarInitials: string
            avatarColor: string
        }
        steps?: string[]
        estimatedDuration?: string
        blockedBy?: string[]
    }
    onBack: () => void
    onStart?: () => void
    onComplete?: () => void
}

const typeIcon: Record<TaskType, React.ReactNode> = {
    investigation: <FlaskConical className="w-4 h-4" />,
    execution: <Settings className="w-4 h-4" />,
    verification: <CheckCircle className="w-4 h-4" />,
    approval: <ShieldCheck className="w-4 h-4" />,
}

function TaskUpdateInput({ taskId, workOrderId }: { taskId: string, workOrderId: string }) {
    const [text, setText] = useState('')
    const [hasAttachment, setHasAttachment] = useState(false)
    const updateTask = useOpshubStore(s => s.updateTask)
    const currentUser = useOpshubStore(s => s.currentUser)

    const handleSend = () => {
        if (!text.trim() && !hasAttachment) return

        updateTask(workOrderId, taskId, {
            updates: [
                {
                    id: `u-${Date.now()}`,
                    author: {
                        id: currentUser?.id || 'u-tech',
                        name: currentUser?.name || 'Technician', // Fallback or use current user
                        role: currentUser?.role || 'Technician',
                        avatarInitials: currentUser?.avatarInitials || 'ME',
                        avatarColor: currentUser?.avatarColor || 'bg-blue-500',
                        status: 'available',
                        facility: 'Global'
                    },
                    content: text,
                    createdAt: new Date().toISOString(),
                    attachments: hasAttachment ? ['/mock-bearing-photo.jpg'] : [] // Mock attachment
                }
            ]
        })

        setText('')
        setHasAttachment(false)
    }

    return (
        <div className="mt-4 bg-white border border-[var(--tp-stroke)] rounded-xl p-3 shadow-sm">
            <h4 className="text-xs font-semibold text-[var(--tp-text-heading)] mb-2 px-1">Add Update</h4>
            <div className="relative">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full bg-[var(--tp-bg-surface)] border border-[var(--tp-stroke)] rounded-lg p-2 text-sm text-[var(--tp-text-body)] placeholder:text-[var(--tp-text-muted)] focus:outline-none focus:border-[var(--tp-accent-blue)] min-h-[80px] resize-none pr-2"
                />
            </div>

            <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setHasAttachment(!hasAttachment)}
                        className={`p-1.5 rounded-md transition-colors ${hasAttachment ? 'bg-blue-50 text-blue-600' : 'text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-hover)]'}`}
                        title="Attach Photo"
                    >
                        <Paperclip className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-hover)] transition-colors">
                        <Mic className="w-4 h-4" />
                    </button>
                    {hasAttachment && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> Photo attached
                        </span>
                    )}
                </div>
                <button
                    onClick={handleSend}
                    disabled={!text.trim() && !hasAttachment}
                    className="p-1.5 bg-[var(--tp-accent-blue)] text-white rounded-lg hover:bg-[var(--tp-accent-blue-light)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

export function TaskDetail({ task: initialTask, onBack, onStart, onComplete }: TaskDetailProps) {
    // Fetch full task from store to get updates and real-time status
    const workOrders = useOpshubStore(s => s.workOrders)

    // Find the Work Order containing this task
    const workOrder = workOrders.find(wo => wo.tasks.some(t => t.id === initialTask.id))
    const realTask = workOrder?.tasks.find(t => t.id === initialTask.id)

    // Use realTask if found (for updates), otherwise fallback to initialTask props
    const task = realTask || initialTask
    const updates = realTask?.updates || []

    return (
        <div className={s.taskDetailContainer}>
            {/* Header */}
            <div className={s.taskDetailHeader}>
                <button onClick={onBack} className={s.backBtn}>
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-xs text-[var(--tp-text-muted)] uppercase tracking-wider font-semibold">
                        <span>#{task.number}</span>
                        <span>•</span>
                        <span>{task.type}</span>
                    </div>
                </div>
            </div>

            <div className={s.taskDetailContent}>
                <div className={s.taskDetailMain}>
                    <h2 className={s.taskDetailTitle}>{task.title}</h2>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-6">
                        <span className={`${s.tag} ${task.status === 'completed' ? s.statusResolved :
                            task.status === 'in-progress' ? s.statusProgress :
                                task.status === 'blocked' ? 'border-red-200 bg-red-50 text-red-700' :
                                    s.statusClosed
                            }`}>
                            {task.status.replace('-', ' ').toUpperCase()}
                        </span>
                        {task.estimatedDuration && (
                            <span className="flex items-center gap-1.5 text-xs text-[var(--tp-text-muted)] bg-[var(--tp-bg-surface)] px-2 py-1 rounded border border-[var(--tp-stroke)]">
                                <Clock className="w-3 h-3" />
                                {task.estimatedDuration}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    <div className="mb-8">
                        <h3 className={s.detailSectionTitle}>Description</h3>
                        <p className={s.taskDescription}>
                            {task.description || "No description provided for this task."}
                        </p>
                    </div>

                    {/* Steps / Checklist */}
                    {task.steps && task.steps.length > 0 && (
                        <div className="mb-8">
                            <h3 className={s.detailSectionTitle}>Checklist</h3>
                            <div className="space-y-3">
                                {task.steps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-3 p-3 bg-[var(--tp-bg-surface)] border border-[var(--tp-stroke-subtle)] rounded-lg">
                                        <div className={`mt-0.5 w-4 h-4 rounded border ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--tp-stroke)]'} flex items-center justify-center`}>
                                            {task.status === 'completed' && <CheckCircle className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm text-[var(--tp-text-body)]">{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Updates Section (Full Width) */}
                    {updates.length > 0 && (
                        <div className="mt-8 border-t border-[var(--tp-stroke-subtle)] pt-8">
                            <h3 className={s.detailSectionTitle}>Activity & Updates</h3>
                            <div className="space-y-4">
                                {updates.map((update) => (
                                    <div key={update.id} className="bg-[var(--tp-bg-surface)] border border-[var(--tp-stroke)] rounded-xl p-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <UserAvatar
                                                initials={update.author.avatarInitials}
                                                color={update.author.avatarColor}
                                                size="sm"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-[var(--tp-text-heading)]">{update.author.name}</span>
                                                <span className="text-xs text-[var(--tp-text-muted)]">{new Date(update.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                            </div>
                                        </div>
                                        {update.content && <p className="text-sm text-[var(--tp-text-body)] mb-3 whitespace-pre-wrap leading-relaxed">{update.content}</p>}

                                        {/* Attachments */}
                                        {update.attachments && update.attachments.length > 0 && (
                                            <div className="flex gap-3 mt-2">
                                                {update.attachments.map((att, idx) => (
                                                    <div key={idx} className="relative group bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200 w-48 aspect-video flex items-center justify-center hover:bg-zinc-200 transition-colors cursor-pointer">
                                                        {/* Mock Image Display */}
                                                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                                                            <ImageIcon className="w-6 h-6" />
                                                            <span className="text-xs font-medium">View Attachment</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar Info */}
                <div className={s.taskDetailSidebar}>
                    <div className={s.sidebarBox}>
                        <h4 className={s.sidebarBoxTitle}>Assignee</h4>
                        <div className="flex items-center gap-3 mt-3">
                            <UserAvatar
                                initials={task.assignee.avatarInitials}
                                color={task.assignee.avatarColor}
                                size="md"
                            />
                            <div>
                                <p className="text-sm font-medium text-[var(--tp-text-heading)]">{task.assignee.name}</p>
                                <p className="text-xs text-[var(--tp-text-muted)]">Technician</p>
                            </div>
                        </div>
                    </div>

                    {/* Task Input Component */}
                    {workOrder && (
                        <TaskUpdateInput taskId={task.id} workOrderId={workOrder.id} />
                    )}

                    {task.blockedBy && task.blockedBy.length > 0 && (
                        <div className={`${s.sidebarBox} border-red-200 bg-red-50/50 mt-4`}>
                            <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                                <ShieldCheck className="w-3.5 h-3.5" /> Blocked By
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {task.blockedBy.map(id => (
                                    <span key={id} className="px-2 py-1 bg-white border border-red-200 rounded text-xs font-medium text-red-600">
                                        Task #{id}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col gap-3 mt-4">
                        {task.status === 'pending' && onStart && (
                            <button
                                onClick={onStart}
                                className="w-full py-2.5 px-4 bg-[var(--tp-accent-blue)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--tp-accent-blue-light)] transition flex items-center justify-center gap-2"
                            >
                                <Play className="w-4 h-4" /> Start Task
                            </button>
                        )}
                        {task.status === 'in-progress' && onComplete && (
                            <button
                                onClick={onComplete}
                                className="w-full py-2.5 px-4 bg-[var(--tp-accent-green)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--tp-accent-green-light)] transition flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" /> Mark Complete
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
