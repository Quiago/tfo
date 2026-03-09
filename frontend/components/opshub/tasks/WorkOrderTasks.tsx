'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { useTfoStore } from '@/lib/store/tfo-store'
import { WorkOrderTaskCard } from './WorkOrderTaskCard'

import s from '@/styles/opshub/work-orders.module.css'

interface WorkOrderTasksProps {
    workOrderId: string
}

import { useState } from 'react'
import { TaskDetail } from './TaskDetail'

// ... imports

export function WorkOrderTasks({ workOrderId }: WorkOrderTasksProps) {
    const workOrder = useOpshubStore(s => s.workOrders.find(w => w.id === workOrderId))
    const updateTask = useOpshubStore(s => s.updateTask)
    const updateWorkOrder = useOpshubStore(s => s.updateWorkOrder)
    const setActiveModule = useTfoStore(s => s.setActiveModule)

    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

    if (!workOrder) return null

    const tasks = workOrder.tasks
    const completedCount = tasks.filter(t => t.status === 'completed').length

    const handleStart = (taskId: string) => {
        // Stop propagation helper if needed, but since card click opens detail, we might want separate actions
        updateTask(workOrderId, taskId, { status: 'in-progress' })
        if (workOrder.status === 'open') {
            updateWorkOrder(workOrderId, { status: 'in-progress' })
        }
    }

    const handleCreateWorkflow = () => {
        setActiveModule('workflows')
    }

    const handleComplete = (taskId: string) => {
        updateTask(workOrderId, taskId, { status: 'completed' })
        // ... (existing completion logic)
        const allCompleted = tasks.every(t =>
            t.id === taskId || t.status === 'completed'
        )

        if (allCompleted) {
            updateWorkOrder(workOrderId, { status: 'resolved' })
        }

        // Check for dependents to unblock
        const currentTask = tasks.find(t => t.id === taskId)
        if (currentTask) {
            tasks.forEach(t => {
                if (t.dependsOn?.includes(String(currentTask.number))) {
                    const remainingDeps = t.dependsOn.filter(d => d !== String(currentTask.number))
                    if (t.isBlocked && remainingDeps.length === 0) {
                        updateTask(workOrderId, t.id, { isBlocked: false, status: 'pending' })
                    }
                }
            })
        }
    }

    // Detail View Logic
    if (selectedTaskId) {
        const selectedTask = tasks.find(t => t.id === selectedTaskId)
        if (selectedTask) {
            return (
                <TaskDetail
                    task={selectedTask}
                    onBack={() => setSelectedTaskId(null)}
                    onStart={selectedTask.status === 'pending' ? () => handleStart(selectedTask.id) : undefined}
                    onComplete={selectedTask.status === 'in-progress' ? () => handleComplete(selectedTask.id) : undefined}
                />
            )
        }
    }

    return (
        <div className={s.tabContainer}>
            {/* Progress */}
            <div className={s.tabSection}>
                <div className={s.sectionTitle}>Progress</div>
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                            style={{ width: tasks.length > 0 ? `${(completedCount / tasks.length) * 100}%` : '0%' }}
                        />
                    </div>
                    <span className="text-xs text-zinc-400 font-medium">
                        {completedCount}/{tasks.length}
                    </span>
                </div>
            </div>

            {/* Task list with dependency lines */}
            <div className={s.tabSection}>
                <div className={s.sectionTitle}>Task List</div>
                <div className={s.sectionCard} style={{ background: 'transparent', border: 'none', overflow: 'visible' }}>
                    {/* Override section card for cleaner look with new separate cards */}
                    {tasks.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 text-sm bg-[var(--tp-bg-card)] border border-[var(--tp-stroke)] rounded-lg">
                            No tasks assigned.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0">
                            {tasks.map((task, i) => (
                                <WorkOrderTaskCard
                                    key={task.id}
                                    taskNumber={task.number}
                                    type={task.type}
                                    title={task.title}
                                    assigneeName={task.assignee.name}
                                    assigneeInitials={task.assignee.avatarInitials}
                                    assigneeColor={task.assignee.avatarColor}
                                    status={task.status}
                                    blockedBy={task.dependsOn}
                                    onStart={(e) => { e?.stopPropagation(); handleStart(task.id); }}
                                    onComplete={(e) => { e?.stopPropagation(); handleComplete(task.id); }}
                                    onCreateWorkflow={(e) => { e?.stopPropagation(); handleCreateWorkflow(); }}
                                    onClick={() => setSelectedTaskId(task.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
