'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { GitFork, Star, Workflow } from 'lucide-react'
import { AIRecommendationCard } from './AIRecommendationCard'

interface LinkedWorkflow {
    id: string
    name: string
    description: string
    stars: number
    forks: number
    tags: string[]
}

interface WorkOrderWorkflowsProps {
    hasAIRecommendation?: boolean
    linkedWorkflows?: LinkedWorkflow[]
}

const MOCK_LINKED: LinkedWorkflow[] = [
    {
        id: 'repo-3', name: 'Bearing Failure Early Warning',
        description: 'ML-based bearing degradation detection with 72h advance notice',
        stars: 5, forks: 4, tags: ['bearings', 'predictive', 'SOP-M-047'],
    },
    {
        id: 'repo-1', name: 'Motor Vibration Protocol',
        description: 'Standard procedure for motor vibration monitoring',
        stars: 4, forks: 2, tags: ['motors', 'predictive'],
    },
]

export function WorkOrderWorkflows({ hasAIRecommendation = true, linkedWorkflows = MOCK_LINKED, onApprove }: WorkOrderWorkflowsProps & { onApprove?: () => void }) {
    return (
        <div className={s.tabContainer}>
            {/* AI Recommendation */}
            {hasAIRecommendation && <AIRecommendationCard onApprove={onApprove} />}

            {/* Linked Workflow Repos - Tree View */}
            <div className={s.tabSection}>
                <h3 className={s.sectionTitle}>Linked Workflows</h3>
                <div className={s.sectionCard}>
                    <div className={s.workflowListHeader}>
                        <span className="w-5"></span>
                        <span>Name</span>
                        <span>Description</span>
                        <span className="text-right">Activity</span>
                    </div>
                    {linkedWorkflows.map((wf, i) => (
                        <div
                            key={wf.id}
                            className={s.workflowItem}
                        >
                            <div className="flex items-center justify-center text-zinc-500">
                                <Workflow className="w-4 h-4" />
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={s.workflowItemName}>
                                    {wf.name}
                                </span>
                                {wf.tags.map(t => (
                                    <span key={t} className={s.workflowItemTag}>
                                        {t}
                                    </span>
                                ))}
                            </div>
                            <div className="text-zinc-500 text-xs truncate max-w-[300px]">
                                {wf.description}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500 justify-end">
                                <div className="flex items-center gap-1">
                                    <Star className="w-3.5 h-3.5" />
                                    <span>{wf.stars}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <GitFork className="w-3.5 h-3.5" />
                                    <span>{wf.forks}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
