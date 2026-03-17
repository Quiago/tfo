'use client'

import { SECTIONS } from '@/lib/constants/asset-tree-sections'
import type { PanelSectionId, SectionId, SectionPanelProps } from '@/lib/types/asset-tree'
import type { TfoModule } from '@/lib/types/tfo'
import { X } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { PANEL_REGISTRY } from './section-panels'

interface SectionModalProps {
    sectionId: SectionId
    onClose: () => void
    highlightOptimization?: boolean
    onNavigateToModule?: (module: TfoModule) => void
}

export function SectionModal({ sectionId, onClose, highlightOptimization, onNavigateToModule }: SectionModalProps) {
    const section = SECTIONS.find((s) => s.id === sectionId)!
    const Icon = section.icon
    // 'home' has no panel (renders summary+timeline) — SectionModal should not be called with it, but guard anyway
    const Panel = sectionId !== 'home' ? PANEL_REGISTRY[sectionId as PanelSectionId] : null
    if (!Panel) return null

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const handleNavigateToModule = useCallback((mod: TfoModule) => {
        onClose()
        onNavigateToModule?.(mod)
    }, [onClose, onNavigateToModule])

    const panelProps: SectionPanelProps = {
        highlightOptimization,
        onClose,
        onNavigateToModule: handleNavigateToModule,
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal — 3/4 of screen, centered */}
            <div
                className="fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-[85vh] flex flex-col overflow-hidden shadow-2xl"
                style={{
                    background: 'var(--tp-bg-surface)',
                    border: '2px solid var(--tp-stroke)',
                    borderRadius: 'var(--tp-radius-card)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b"
                    style={{ borderColor: 'var(--tp-stroke)', background: 'var(--tp-bg-card)' }}
                >
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--tp-bg-pill)' }}
                    >
                        <Icon size={16} style={{ color: 'var(--tp-accent-blue)' }} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>
                            {section.label}
                        </h2>
                        <p className="text-[11px]" style={{ color: 'var(--tp-text-muted)' }}>
                            KUKA KR120 · Munich Plant
                        </p>
                    </div>

                    {/* Windows-style close — top-right */}
                    <button
                        onClick={onClose}
                        className="ml-auto flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-red-500/10 hover:text-red-600"
                        style={{ color: 'var(--tp-text-muted)' }}
                        title="Close (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Panel body */}
                <div className="flex-1 overflow-hidden">
                    <Panel {...panelProps} />
                </div>
            </div>
        </>
    )
}
