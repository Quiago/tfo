import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useWorkflowStore } from '@/lib/store/workflow-store'
import type { Workflow } from '@/lib/types/workflow'
import s from '@/styles/workflow/workflow.module.css'
import { useCallback, useEffect } from 'react'
import { ConfirmationCardOverlay } from './ConfirmationCardOverlay'
import { NodeConfigPanel } from './NodeConfigPanel'
import { NodePalette } from './NodePalette'
import { VoiceInput } from './VoiceInput'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowCardView } from './WorkflowCardView'
import { WorkflowToolbar } from './WorkflowToolbar'

interface WorkflowBuilderProps {
    initialWorkflow?: Workflow
    className?: string
}

export function WorkflowBuilder({ initialWorkflow, className = '' }: WorkflowBuilderProps) {
    const isMobile = useMediaQuery('(max-width: 768px)')
    const {
        workflow,
        mode,
        setMode,
        createWorkflow,
        loadWorkflow,
        selectedNodeId,
        isPanelOpen,
        confirmationCard,
    } = useWorkflowStore()

    // Initialize workflow
    useEffect(() => {
        if (initialWorkflow) {
            loadWorkflow(initialWorkflow)
        } else if (!workflow) {
            createWorkflow('New Workflow', 'Created from scratch')
        }
    }, [initialWorkflow, loadWorkflow, createWorkflow, workflow])

    // Auto-switch mode based on screen size
    useEffect(() => {
        setMode(isMobile ? 'cards' : 'canvas')
    }, [isMobile, setMode])

    const handleModeToggle = useCallback(() => {
        setMode(mode === 'canvas' ? 'cards' : 'canvas')
    }, [mode, setMode])

    if (!workflow) return null

    return (
        <div className={`${s.container} ${className}`}>
            {/* ── Top Toolbar ─────────────────────────── */}
            <WorkflowToolbar
                workflow={workflow}
                mode={mode}
                onModeToggle={handleModeToggle}
                isMobile={isMobile}
            />

            {/* ── Main Content Area ─────────────────────── */}
            <div className={s.mainContent}>
                {/* Desktop: Palette sidebar */}
                {!isMobile && mode === 'canvas' && isPanelOpen && (
                    <NodePalette />
                )}

                {/* Canvas or Cards View */}
                <div className={s.canvasWrapper}>
                    {mode === 'canvas' ? (
                        <WorkflowCanvas workflow={workflow} />
                    ) : (
                        <WorkflowCardView workflow={workflow} />
                    )}

                    {/* Voice Input — always visible */}
                    <div className={s.voiceInputContainer}>
                        <VoiceInput />
                    </div>
                </div>

                {/* Desktop: Config panel for selected node */}
                {!isMobile && selectedNodeId && (
                    <NodeConfigPanel />
                )}
            </div>

            {/* ── Confirmation Card Overlay (from voice) ─── */}
            {confirmationCard && (
                <ConfirmationCardOverlay />
            )}
        </div>
    )
}
