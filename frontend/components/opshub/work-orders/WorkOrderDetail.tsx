'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { useTfoStore } from '@/lib/store/tfo-store'
import { useWorkflowStore } from '@/lib/store/workflow-store'
import {
    ArrowLeft,
    FileText,
    History,
    LayoutList,
    MessageSquare,
    Workflow
} from 'lucide-react'
import { useState } from 'react'
import { WorkOrderTasks } from '../tasks/WorkOrderTasks'
import { WorkOrderActivity } from './WorkOrderActivity'
import { WorkOrderDiscussion } from './WorkOrderDiscussion'
import { WorkOrderOverview } from './WorkOrderOverview'
import { WorkOrderTeamSidebar } from './WorkOrderTeamSidebar'
import { WorkOrderWorkflows } from './WorkOrderWorkflows'

// TODO: import from opshub types when available
type WorkOrderInnerTab = 'overview' | 'tasks' | 'workflows' | 'discussion' | 'activity'

const INNER_TABS: { id: WorkOrderInnerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" /> },
    { id: 'tasks', label: 'Tasks', icon: <LayoutList className="w-4 h-4" /> },
    { id: 'workflows', label: 'Workflows', icon: <Workflow className="w-4 h-4" /> },
    { id: 'discussion', label: 'Discussion', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'activity', label: 'Activity', icon: <History className="w-4 h-4" /> },
]



interface WorkOrderDetailProps {
    workOrderId: string
    onBack: () => void
}

import s from '@/styles/opshub/work-orders.module.css'

// ... existing imports

export function WorkOrderDetail({ workOrderId, onBack }: WorkOrderDetailProps) {
    const workOrder = useOpshubStore(s => s.workOrders.find(w => w.id === workOrderId))
    const [innerTab, setInnerTab] = useState<WorkOrderInnerTab>('overview')

    if (!workOrder) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                Work Order not found
            </div>
        )
    }

    // Adapt store data for WorkOrderOverview
    const overviewData = {
        status: workOrder.status,
        priority: workOrder.priority,
        createdAt: workOrder.createdAt,
        resolvedAt: workOrder.resolvedAt,
        equipmentName: workOrder.equipmentName,
        equipmentId: workOrder.equipmentId,
        location: 'Factory Floor',
        factoryName: workOrder.facility || 'Unknown Facility',
        rootCause: undefined,
        spareParts: [],
        costSummary: undefined,
    }

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

    // Navigation to Workflow Builder
    const generateWorkflowFromRecommendation = useWorkflowStore(s => s.generateWorkflowFromRecommendation)
    const setActiveModule = useTfoStore(s => s.setActiveModule)

    const handleApproveRecommendation = () => {
        // 1. Generate the workflow in the store (starts streaming)
        generateWorkflowFromRecommendation()

        // 2. Navigate to the Workflow Builder module
        setActiveModule('workflows')
    }

    return (
        <div className={s.detailsContainer}>
            {/* Header */}
            <div className={s.detailsHeader}>
                <button onClick={onBack} className={s.backBtn}>
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className={s.detailsTitleBlock}>
                    <h1 className={s.detailsTitle}>{workOrder.title}</h1>
                    <div className={s.detailsMeta}>
                        <span>{workOrder.number}</span>
                        <span>•</span>
                        <span className={`${s.tag} ${statusClass}`}>
                            {workOrder.status.replace('-', ' ')}
                        </span>
                        <span>•</span>
                        <span className={priorityClass}>
                            {workOrder.priority}
                        </span>
                    </div>
                </div>
            </div>

            <div className={s.detailsContent}>
                {/* Left: inner tab navigation */}
                <div className={s.sidebarNav}>
                    {INNER_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setInnerTab(tab.id)}
                            className={innerTab === tab.id ? s.navItemActive : s.navItem}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Center: tab content */}
                <div className={s.mainContent}>
                    {innerTab === 'overview' && <WorkOrderOverview workOrder={overviewData} />}
                    {innerTab === 'tasks' && <WorkOrderTasks workOrderId={workOrderId} />}
                    {innerTab === 'workflows' && (
                        <WorkOrderWorkflows
                            onApprove={handleApproveRecommendation}
                        />
                    )}
                    {innerTab === 'discussion' && <WorkOrderDiscussion />}
                    {innerTab === 'activity' && <WorkOrderActivity />}
                </div>

                {/* Right: team sidebar */}
                <div className={s.teamSidebar}>
                    <WorkOrderTeamSidebar
                        team={workOrder.team}
                        riskAmount={0}
                        tags={workOrder.tags}
                        aiStatus={undefined}
                    />
                </div>
            </div>
        </div>
    )
}
