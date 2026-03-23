'use client'

import { MOCK_TEAM, useOpshubMockData } from '@/lib/hooks/useOpshubMockData'
import { useOpshubStore } from '@/lib/store/opshub-store'
import { useAuthStore } from '@/lib/store/auth-store'
import { CreateWorkOrderForm, type WorkOrderFormData } from './CreateWorkOrderForm'
import { WorkOrderDetail } from './work-orders/WorkOrderDetail'
import { WorkOrderList } from './work-orders/WorkOrderList'
import { DispatcherConsole } from '@/components/dispatcher/DispatcherConsole'
import type { OpshubTab } from '@/lib/types/opshub'

export function OpshubLayout() {
    useOpshubMockData()

    const activeTab = useOpshubStore(s => s.activeTab)
    const setActiveTab = useOpshubStore(s => s.setActiveTab)
    const platformMode = useAuthStore(s => s.platformMode)
    const selectedWorkOrderId = useOpshubStore(s => s.selectedWorkOrderId)
    const setSelectedWorkOrderId = useOpshubStore(s => s.setSelectedWorkOrderId)
    const pendingCreateWorkOrder = useOpshubStore(s => s.pendingCreateWorkOrder)
    const setPendingCreateWorkOrder = useOpshubStore(s => s.setPendingCreateWorkOrder)
    const addWorkOrder = useOpshubStore(s => s.addWorkOrder)
    const currentUser = useOpshubStore(s => s.currentUser)

    // Priority 1: Creating a work order (from DT overlay or summary bar)
    const createWorkOrderWithTask = useOpshubStore(s => s.createWorkOrderWithTask)

    if (pendingCreateWorkOrder) {
        return (
            <div className="flex flex-col h-full w-full overflow-y-auto">
                <CreateWorkOrderForm
                    initialData={pendingCreateWorkOrder} // Pass auto-fill data
                    prefillEquipment={pendingCreateWorkOrder.equipmentName}
                    onSubmit={(woData: WorkOrderFormData, taskData) => {
                        const owner = currentUser ?? {
                            id: 'demo-user',
                            name: 'Demo Operator',
                            role: 'Plant Manager',
                            facility: woData.facility,
                            avatarInitials: 'DO',
                            avatarColor: 'bg-cyan-500',
                            status: 'available',
                        }

                        const assignee = MOCK_TEAM.find(m => m.id === taskData.assigneeId) || owner

                        // Use the new atomic action
                        createWorkOrderWithTask(
                            { ...woData, owner },
                            {
                                title: `Initial Investigation`,
                                description: taskData.instructions,
                                assignee: assignee,
                                assignedBy: owner,
                                priority: woData.priority
                            }
                        )

                        setPendingCreateWorkOrder(null)
                        setActiveTab('work-orders')
                    }}
                    onCancel={() => setPendingCreateWorkOrder(null)}
                />
            </div>
        )
    }

    // Priority 2: Viewing a specific work order detail
    if (selectedWorkOrderId) {
        return (
            <div className="flex flex-col h-full w-full">
                <WorkOrderDetail
                    workOrderId={selectedWorkOrderId}
                    onBack={() => {
                        setSelectedWorkOrderId(null)
                        // Stay on work-orders list if that's where we came from
                    }}
                />
            </div>
        )
    }

    const isDatacenter = platformMode === 'datacenter'

    // Dispatcher tab: datacenter mode only
    if (activeTab === 'dispatcher') {
        if (!isDatacenter) {
            setActiveTab('work-orders')
            return null
        }
        return (
            <div className="flex flex-col h-full w-full">
                {isDatacenter && (
                    <TabBar
                        activeTab={activeTab}
                        onSelect={setActiveTab}
                        isDatacenter={isDatacenter}
                    />
                )}
                <div className="flex-1 overflow-hidden">
                    <DispatcherConsole />
                </div>
            </div>
        )
    }

    // Default: Work Orders Panel (All Work Orders)
    // Replaces the previous Feed view as the main entry point per user request
    return (
        <div className="flex flex-col h-full w-full">
            {isDatacenter && (
                <TabBar
                    activeTab={activeTab}
                    onSelect={setActiveTab}
                    isDatacenter={isDatacenter}
                />
            )}
            <div className="flex-1 min-h-0 overflow-hidden">
                <WorkOrderList
                    onSelectWorkOrder={setSelectedWorkOrderId}
                />
            </div>
        </div>
    )
}

// ─── Tab Bar (datacenter mode only) ───────────────────────────────────────────

function TabBar({
    activeTab,
    onSelect,
    isDatacenter,
}: {
    activeTab: OpshubTab
    onSelect: (tab: OpshubTab) => void
    isDatacenter: boolean
}) {
    return (
        <div className="flex items-center gap-0 border-b border-zinc-800 flex-shrink-0 px-3">
            <TabButton
                label="Work Orders"
                active={activeTab === 'work-orders' || activeTab === 'home' || activeTab === 'my-tasks'}
                onClick={() => onSelect('work-orders')}
            />
            {isDatacenter && (
                <TabButton
                    label="Dispatcher"
                    active={activeTab === 'dispatcher'}
                    onClick={() => onSelect('dispatcher')}
                    badge="DC"
                />
            )}
        </div>
    )
}

function TabButton({
    label,
    active,
    onClick,
    badge,
}: {
    label: string
    active: boolean
    onClick: () => void
    badge?: string
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                active
                    ? 'border-violet-500 text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
        >
            {label}
            {badge && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-violet-900/50 text-violet-400 font-semibold">
                    {badge}
                </span>
            )}
        </button>
    )
}
