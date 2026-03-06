import { useOpshubStore } from '@/lib/store/opshub-store'
import type { ActivityEntry } from '@/lib/types/opshub'
import { useMemo } from 'react'

export function useActivityTimeline(workOrderId: string | null): ActivityEntry[] {
    const activityEntries = useOpshubStore(s => s.activityEntries)

    return useMemo(() => {
        if (!workOrderId) return []

        return activityEntries
            .filter(a => a.workOrderId === workOrderId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    }, [workOrderId, activityEntries])
}
