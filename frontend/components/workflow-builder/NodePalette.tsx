'use client'

import { NODE_REGISTRY, type NodeCategory, type WorkflowNodeType } from '@/lib/types/workflow'
import s from '@/styles/workflow/workflow.module.css'
import * as LucideIcons from 'lucide-react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useCallback, useState, type DragEvent } from 'react'

const CATEGORY_ORDER: { key: NodeCategory; label: string; icon: string }[] = [
    { key: 'trigger', label: 'Triggers', icon: 'Zap' },
    { key: 'condition', label: 'Conditions', icon: 'GitBranch' },
    { key: 'input', label: 'Inputs', icon: 'ScanLine' },
    { key: 'action', label: 'Actions', icon: 'Cog' },
    { key: 'utility', label: 'Utility', icon: 'Wrench' },
]

function getIcon(name: string, size = 14) {
    const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[name]
    return Icon ? <Icon size={size} /> : null
}

export function NodePalette() {
    const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
        new Set(['trigger', 'action', 'condition'])
    )

    const toggleCategory = useCallback((cat: NodeCategory) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }, [])

    const handleDragStart = useCallback((e: DragEvent, nodeType: WorkflowNodeType) => {
        e.dataTransfer.setData('application/opsflow-node-type', nodeType)
        e.dataTransfer.effectAllowed = 'move'
    }, [])

    const nodesByCategory = CATEGORY_ORDER.map(cat => ({
        ...cat,
        nodes: Object.values(NODE_REGISTRY).filter(n => n.category === cat.key),
    }))

    return (
        <div className={s.palette}>
            <div className={s.paletteHeader}>
                <h2 className={s.paletteTitle}>
                    Node Palette
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-1 pb-4">
                {nodesByCategory.map(({ key, label, icon, nodes }) => (
                    <div key={key} className={s.categoryGroup}>
                        {/* Category Header */}
                        <button
                            onClick={() => toggleCategory(key)}
                            className={s.categoryButton}
                        >
                            {expandedCategories.has(key)
                                ? <ChevronDown size={12} />
                                : <ChevronRight size={12} />
                            }
                            {getIcon(icon, 12)}
                            <span className="font-medium">{label}</span>
                            <span className="ml-auto text-[10px] text-zinc-600">{nodes.length}</span>
                        </button>

                        {/* Nodes */}
                        {expandedCategories.has(key) && (
                            <div className={s.nodeList}>
                                {nodes.map(node => {
                                    const isLocked = !node.availableIn.includes('free')
                                    return (
                                        <div
                                            key={node.type}
                                            draggable={!isLocked}
                                            onDragStart={(e) => handleDragStart(e, node.type)}
                                            className={s.nodeItem}
                                            data-category={node.category} // Used for CSS selector
                                            title={isLocked ? `Available in ${node.availableIn.join(', ')}` : node.description}
                                        >
                                            <span className={s.nodeIcon}>
                                                {getIcon(node.icon, 12)}
                                            </span>
                                            <span className={s.nodeLabel}>
                                                {node.label}
                                            </span>
                                            {isLocked && <Lock size={10} className="shrink-0 text-zinc-600" />}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
