import { useOpshubStore } from '@/lib/store/opshub-store'
import type {
    ActivityEntry,
    DiscussionComment,
    ExecutionChecklist,
    WorkOrderCard,
    WorkOrderTask,
} from '@/lib/types/opshub'
import { useMemo } from 'react'

interface WorkOrderDetail {
    workOrder: WorkOrderCard | undefined
    tasks: WorkOrderTask[]
    activity: ActivityEntry[]
    discussion: DiscussionComment[]
    checklists: ExecutionChecklist[]
}

export function useWorkOrderDetail(workOrderId: string | null): WorkOrderDetail {
    const workOrders = useOpshubStore(s => s.workOrders)
    const activityEntries = useOpshubStore(s => s.activityEntries)
    const discussionComments = useOpshubStore(s => s.discussionComments)
    const executionChecklists = useOpshubStore(s => s.executionChecklists)

    return useMemo(() => {
        if (!workOrderId) {
            return { workOrder: undefined, tasks: [], activity: [], discussion: [], checklists: [] }
        }

        const workOrder = workOrders.find(wo => wo.id === workOrderId)

        return {
            workOrder,
            tasks: workOrder?.tasks ?? [],
            activity: activityEntries
                .filter(a => a.workOrderId === workOrderId)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
            discussion: discussionComments
                .filter(c => c.workOrderId === workOrderId)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
            checklists: executionChecklists.filter(cl => cl.workOrderId === workOrderId),
        }
    }, [workOrderId, workOrders, activityEntries, discussionComments, executionChecklists])
}
