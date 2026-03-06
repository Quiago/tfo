import { useOpshubStore } from '@/lib/store/opshub-store'
import type { AIAgentRecommendation } from '@/lib/types/opshub'
import { useMemo } from 'react'

export function useAIRecommendation(workOrderId: string | null): AIAgentRecommendation | undefined {
    const aiRecommendations = useOpshubStore(s => s.aiRecommendations)

    return useMemo(() => {
        if (!workOrderId) return undefined
        return aiRecommendations.find(r => r.workOrderId === workOrderId)
    }, [workOrderId, aiRecommendations])
}
