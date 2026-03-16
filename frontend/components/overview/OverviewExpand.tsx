import { AssetTree } from '@/components/asset-details/AssetTree'
import { RichMachineSummary } from '@/components/asset-details/RichMachineSummary'
import { SectionModal } from '@/components/asset-details/SectionModal'
import { useOpshubStore } from '@/lib/store/opshub-store'
import type { SectionId } from '@/lib/types/asset-tree'
import type { TfoModule } from '@/lib/types/tfo'
import s from '@/styles/overview-expanded/expanded.module.css'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

const MultiLayerTimeline = dynamic(
    () =>
        import('@/components/timeline/Timeline').then((m) => m.MultiLayerTimeline),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full w-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-500" />
                    <span className="text-xs text-zinc-500">Loading Timeline...</span>
                </div>
            </div>
        )
    }
)

interface OverviewExpandProps {
    viewMode: 'overview' | 'details'
    selectedAsset: string | null
    autoTriggerAnomaly: boolean
    onAnomalyTriggered: () => void
    onSelectAsset: (id: string) => void
    setActiveModule: (mod: TfoModule) => void
    /** When true, highlights Workflows in the tree and auto-opens the Workflows modal */
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
    const [activeSectionId, setActiveSectionId] = useState<SectionId | null>(null)

    // Auto-open Workflows modal when arriving via optimization expand flow
    useEffect(() => {
        if (highlightWorkflowsInTree && viewMode === 'details') {
            setActiveSectionId('workflows')
        }
    }, [highlightWorkflowsInTree, viewMode])

    // Close modal when leaving details view
    useEffect(() => {
        if (viewMode !== 'details') {
            setActiveSectionId(null)
        }
    }, [viewMode])

    const handleSectionClick = useCallback((sectionId: SectionId) => {
        setActiveSectionId(sectionId)
    }, [])

    const handleModalClose = useCallback(() => {
        setActiveSectionId(null)
    }, [])

    return (
        <>
            {/* Asset Tree Card - Bottom Left (Below 3D) */}
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

            {/* Right Panel Container - Timeline + Summary */}
            <div
                className={`absolute right-4 top-4 bottom-4 flex flex-col gap-4 transition-opacity duration-300
                ${viewMode === 'details'
                        ? 'w-[calc(80%-2rem)] opacity-100'
                        : 'w-0 opacity-0 overflow-hidden pointer-events-none'
                    }`}
            >
                {/* Machine Summary Card */}
                <div className={`${s.card} h-[30%] flex-shrink-0 p-2`}>
                    <RichMachineSummary selectedAsset={selectedAsset} />
                </div>

                {/* Timeline Card */}
                <div className={`${s.timelineCard} flex-grow relative h-full w-full overflow-y-auto`}>
                    {/* @ts-ignore - Dynamic import props issue */}
                    <MultiLayerTimeline
                        autoTriggerAnomaly={autoTriggerAnomaly}
                        onAnomalyTriggered={onAnomalyTriggered}
                    />
                </div>
            </div>

            {/* Section Modal — rendered at this level so it overlays the expand view */}
            {activeSectionId && viewMode === 'details' && (
                <SectionModal
                    sectionId={activeSectionId}
                    onClose={handleModalClose}
                    highlightOptimization={highlightWorkflowsInTree && activeSectionId === 'workflows'}
                    onNavigateToModule={setActiveModule}
                />
            )}
        </>
    )
}
