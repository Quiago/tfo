import { useOpshubStore } from '@/lib/store/opshub-store'
import type { WorkOrderTask } from '@/lib/types/opshub'
import { useMemo } from 'react'

export function useMyTasks(): {
    tasks: WorkOrderTask[]
    pendingCount: number
    inProgressCount: number
    completedCount: number
} {
    const currentUser = useOpshubStore(s => s.currentUser)
    const workOrders = useOpshubStore(s => s.workOrders)

    return useMemo(() => {
        if (!currentUser) {
            return { tasks: [], pendingCount: 0, inProgressCount: 0, completedCount: 0 }
        }

        const tasks = workOrders.flatMap(wo =>
            wo.tasks.filter(t => t.assignee.id === currentUser.id)
        )

        return {
            tasks,
            pendingCount: tasks.filter(t => t.status === 'pending' || t.status === 'accepted').length,
            inProgressCount: tasks.filter(t => t.status === 'in-progress').length,
            completedCount: tasks.filter(t => t.status === 'completed').length,
        }
    }, [currentUser, workOrders])
}
