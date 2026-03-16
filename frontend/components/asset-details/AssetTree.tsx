'use client'

import s from '@/styles/overview-expanded/expanded.module.css'
import { SECTIONS } from '@/lib/constants/asset-tree-sections'
import type { SectionId } from '@/lib/types/asset-tree'

interface AssetTreeProps {
    /** Currently highlighted section (shows active state) */
    activeSectionId?: SectionId | null
    /** Called when the user clicks a top-level section row */
    onSectionClick: (sectionId: SectionId) => void
    /** When true, highlights Workflows with a pulsing green AI badge */
    highlightWorkflows?: boolean
}

export function AssetTree({
    activeSectionId,
    onSectionClick,
    highlightWorkflows = false,
}: AssetTreeProps) {
    return (
        <div className="h-full flex flex-col bg-transparent">
            <div className={s.treeHeader}>Explorer</div>
            <div className="flex-1 overflow-auto py-2 space-y-0.5">
                {SECTIONS.map((section) => {
                    const isWorkflowsHighlighted = section.id === 'workflows' && highlightWorkflows
                    const isActive = activeSectionId === section.id
                    const Icon = section.icon

                    return (
                        <button
                            key={section.id}
                            onClick={() => onSectionClick(section.id)}
                            className={s.treeItem}
                            style={{
                                width: 'calc(100% - 8px)',
                                ...(isActive
                                    ? {
                                          background: 'rgba(37, 99, 235, 0.08)',
                                          border: '1px solid rgba(37, 99, 235, 0.25)',
                                          borderRadius: '6px',
                                      }
                                    : {}),
                                ...(isWorkflowsHighlighted
                                    ? {
                                          background: 'rgba(22, 163, 74, 0.08)',
                                          border: '1px solid rgba(22, 163, 74, 0.3)',
                                          borderRadius: '6px',
                                          boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.15)',
                                      }
                                    : {}),
                            }}
                        >
                            <Icon
                                size={14}
                                style={{
                                    opacity: isWorkflowsHighlighted ? 1 : 0.7,
                                    color: isWorkflowsHighlighted
                                        ? '#16a34a'
                                        : isActive
                                        ? 'var(--tp-accent-blue)'
                                        : undefined,
                                }}
                            />
                            <span
                                style={{
                                    color: isWorkflowsHighlighted
                                        ? '#15803d'
                                        : isActive
                                        ? 'var(--tp-accent-blue)'
                                        : undefined,
                                    fontWeight: isWorkflowsHighlighted || isActive ? 600 : undefined,
                                }}
                            >
                                {section.label}
                            </span>

                            {isWorkflowsHighlighted ? (
                                <span className="ml-auto flex items-center gap-1.5">
                                    <span
                                        className="animate-pulse inline-block w-2 h-2 rounded-full bg-green-500"
                                        style={{ boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)' }}
                                    />
                                    <span
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={{ background: '#16a34a', color: '#fff', lineHeight: 1 }}
                                    >
                                        AI
                                    </span>
                                </span>
                            ) : (
                                <span className="ml-auto text-[10px] opacity-60">›</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
