import { AssetTree } from '@/components/asset-details/AssetTree'
import { RichMachineSummary } from '@/components/asset-details/RichMachineSummary'
import { PANEL_REGISTRY } from '@/components/asset-details/section-panels'
import { useOpshubStore } from '@/lib/store/opshub-store'
import type { PanelSectionId, SectionId } from '@/lib/types/asset-tree'
import type { TfoModule } from '@/lib/types/tfo'
import s from '@/styles/overview-expanded/expanded.module.css'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

const MultiLayerTimeline = dynamic(
    () => import('@/components/timeline/Timeline').then((m) => m.MultiLayerTimeline),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-500" />
                    <span className="text-xs text-zinc-500">Loading Timeline...</span>
                </div>
            </div>
        ),
    },
)

// Type guard: is this section backed by a PANEL_REGISTRY component?
// 'home' renders the native summary+timeline view — everything else uses the registry.
function isPanelSection(id: SectionId): id is PanelSectionId {
    return id !== 'home'
}

interface OverviewExpandProps {
    viewMode: 'overview' | 'details'
    selectedAsset: string | null
    autoTriggerAnomaly: boolean
    onAnomalyTriggered: () => void
    onSelectAsset: (id: string) => void
    setActiveModule: (mod: TfoModule) => void
    /** When true, highlights Workflows in the tree and auto-switches to Workflows panel */
    highlightWorkflowsInTree?: boolean
}

export function OverviewExpand({
    viewMode,
    selectedAsset,
    autoTriggerAnomaly,
    onAnomalyTriggered,
    onSelectAsset,
    setActiveModule,
    highlightWorkflowsInTree = false,
}: OverviewExpandProps) {
    const setPendingCreateWorkOrder = useOpshubStore(s => s.setPendingCreateWorkOrder)

    // Default: Home shows summary + timeline. No modal needed.
    const [activeSectionId, setActiveSectionId] = useState<SectionId>('home')

    // Auto-switch to Workflows panel when arriving via optimization expand flow
    useEffect(() => {
        if (highlightWorkflowsInTree && viewMode === 'details') {
            setActiveSectionId('workflows')
        }
    }, [highlightWorkflowsInTree, viewMode])

    // Reset to Home when leaving details view
    useEffect(() => {
        if (viewMode !== 'details') {
            setActiveSectionId('home')
        }
    }, [viewMode])

    const handleSectionClick = useCallback((sectionId: SectionId) => {
        setActiveSectionId(sectionId)
    }, [])

    // Panels call onClose to return to the default Home view
    const handlePanelClose = useCallback(() => {
        setActiveSectionId('home')
    }, [])

    // Resolve panel component (null for machine_health)
    const ActivePanel = isPanelSection(activeSectionId) ? PANEL_REGISTRY[activeSectionId] : null

    return (
        <>
            {/* Asset Tree Card — bottom left, below 3D model */}
            <div
                className={`absolute ${s.card} flex flex-col overflow-hidden transition-opacity duration-300
                ${viewMode === 'details'
                    ? 'left-4 top-[calc(35%+2rem)] w-[calc(20%-1rem)] bottom-4 opacity-100'
                    : 'left-0 top-[100%] w-[25%] h-0 opacity-0 pointer-events-none'
                }`}
            >
                <AssetTree
                    activeSectionId={activeSectionId}
                    onSectionClick={handleSectionClick}
                    highlightWorkflows={highlightWorkflowsInTree}
                />
            </div>

            {/* Right Panel — swaps between Machine Health and section panels */}
            <div
                className={`absolute right-4 top-4 bottom-4 flex flex-col gap-4 transition-opacity duration-300
                ${viewMode === 'details'
                    ? 'w-[calc(80%-2rem)] opacity-100'
                    : 'w-0 opacity-0 overflow-hidden pointer-events-none'
                }`}
            >
                {ActivePanel ? (
                    /* Section panel — fills the full right column */
                    <div className={`${s.card} flex-1 min-h-0 overflow-hidden`}>
                        <ActivePanel
                            highlightOptimization={
                                highlightWorkflowsInTree && activeSectionId === 'workflows'
                            }
                            onClose={handlePanelClose}
                            onNavigateToModule={setActiveModule}
                        />
                    </div>
                ) : (
                    /* Machine Health: summary card + timeline (original layout) */
                    <>
                        <div className={`${s.card} h-[30%] flex-shrink-0 p-2`}>
                            <RichMachineSummary selectedAsset={selectedAsset} />
                        </div>
                        <div className={`${s.timelineCard} flex-grow relative h-full w-full overflow-y-auto`}>
                            {/* @ts-ignore - Dynamic import props issue */}
                            <MultiLayerTimeline
                                autoTriggerAnomaly={autoTriggerAnomaly}
                                onAnomalyTriggered={onAnomalyTriggered}
                            />
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
