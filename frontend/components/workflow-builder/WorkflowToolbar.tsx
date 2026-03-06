'use client'

import { useTfoStore } from '@/lib/store/tfo-store'
import { useWorkflowStore, type BuilderMode } from '@/lib/store/workflow-store'
import type { Workflow as WorkflowType } from '@/lib/types/workflow'
import s from '@/styles/workflow/workflow.module.css'
import { CloudUpload, Download, LayoutGrid, PanelLeftClose, PanelLeftOpen, Play, Workflow } from 'lucide-react'

interface WorkflowToolbarProps {
    workflow: WorkflowType
    mode: BuilderMode
    onModeToggle: () => void
    isMobile: boolean
}

export function WorkflowToolbar({ workflow, mode, onModeToggle, isMobile }: WorkflowToolbarProps) {
    const { isPanelOpen, togglePanel, exportToJSON, isExecuting, setExecuting, addExecutionLog, clearExecutionLog } = useWorkflowStore()
    const { publishWorkflowUpdate } = useTfoStore()

    const handleExport = () => {
        const json = exportToJSON()
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${workflow.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handlePublish = () => {
        publishWorkflowUpdate(workflow)
        alert(`Workflow "${workflow.title}" published to Cross-Facility Learning Center!`)
    }

    const handleRun = () => {
        if (isExecuting) return
        clearExecutionLog()
        setExecuting(true)

        // Simulate execution of each node
        const nodes = workflow.nodes
        let i = 0
        const interval = setInterval(() => {
            if (i >= nodes.length) {
                clearInterval(interval)
                setExecuting(false)
                return
            }
            addExecutionLog(nodes[i].id, 'success', `Executed: ${nodes[i].label}`)
            i++
        }, 800)
    }

    return (
        <div className={s.toolbar}>
            {/* Panel toggle (desktop only) */}
            {!isMobile && mode === 'canvas' && (
                <button
                    onClick={togglePanel}
                    className={s.toolbarIconButton}
                    title={isPanelOpen ? 'Hide palette' : 'Show palette'}
                >
                    {isPanelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                </button>
            )}

            {/* Workflow title */}
            <div className={s.toolbarTitleSection}>
                <p className={s.toolbarTitle}>{workflow.title}</p>
                <p className={s.toolbarSubtitle}>
                    {workflow.nodes.length} nodes &middot; {workflow.edges.length} connections &middot; v{workflow.version}
                </p>
            </div>

            {/* Mode toggle */}
            {!isMobile && (
                <button
                    onClick={onModeToggle}
                    className={s.toolbarButton}
                >
                    {mode === 'canvas' ? (
                        <>
                            <LayoutGrid size={12} />
                            Cards
                        </>
                    ) : (
                        <>
                            <Workflow size={12} />
                            Canvas
                        </>
                    )}
                </button>
            )}

            {/* Run button */}
            <button
                onClick={handleRun}
                disabled={isExecuting || workflow.nodes.length === 0}
                className={s.runButton}
            >
                <Play size={10} fill="currentColor" />
                {isExecuting ? 'Running...' : 'Run'}
            </button>

            {/* Publish button */}
            <button
                onClick={handlePublish}
                className={s.toolbarIconButton}
                title="Publish to Cross-Facility Hub"
            >
                <CloudUpload size={14} />
            </button>

            {/* Export button */}
            <button
                onClick={handleExport}
                className={s.toolbarIconButton}
                title="Export JSON"
            >
                <Download size={14} />
            </button>
        </div>
    )
}
