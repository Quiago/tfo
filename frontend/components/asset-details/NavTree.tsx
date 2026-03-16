'use client'

import type { NavItem } from '@/lib/types/asset-tree'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'

const BADGE_STYLES: Record<string, string> = {
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    zinc:   'bg-zinc-100 text-zinc-600',
    purple: 'bg-purple-100 text-purple-700',
}

interface NavTreeProps {
    items: NavItem[]
    selectedId: string | null
    onSelect: (item: NavItem) => void
    /** Depth level — used internally for indentation */
    depth?: number
}

export function NavTree({ items, selectedId, onSelect, depth = 0 }: NavTreeProps) {
    return (
        <ul className="space-y-0.5">
            {items.map((item) => (
                <NavTreeNode
                    key={item.id}
                    item={item}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={depth}
                />
            ))}
        </ul>
    )
}

function NavTreeNode({
    item,
    selectedId,
    onSelect,
    depth,
}: {
    item: NavItem
    selectedId: string | null
    onSelect: (item: NavItem) => void
    depth: number
}) {
    const [expanded, setExpanded] = useState(depth === 0)
    const hasChildren = !!item.children?.length
    const isSelected = selectedId === item.id
    const Icon = item.icon ?? (hasChildren ? null : FileText)

    const handleClick = () => {
        if (hasChildren) setExpanded((v) => !v)
        onSelect(item)
    }

    return (
        <li>
            <button
                onClick={handleClick}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                className={`w-full flex items-center gap-2 py-1.5 pr-3 rounded-md text-left transition-all duration-150 ${
                    isSelected
                        ? 'bg-[var(--tp-bg-pill)] text-[var(--tp-accent-blue)] font-semibold'
                        : 'text-[var(--tp-text-muted)] hover:bg-black/5 hover:text-[var(--tp-text-heading)]'
                }`}
            >
                {/* Expand arrow — only for parent nodes */}
                {hasChildren ? (
                    <span className="flex-shrink-0 w-3">
                        {expanded
                            ? <ChevronDown size={11} />
                            : <ChevronRight size={11} />}
                    </span>
                ) : (
                    <span className="flex-shrink-0 w-3" />
                )}

                {Icon && <Icon size={13} className="flex-shrink-0 opacity-70" />}

                <span className="flex-1 truncate text-[11px] leading-tight">{item.label}</span>

                {item.meta && (
                    <span className="text-[9px] opacity-50 flex-shrink-0">{item.meta}</span>
                )}

                {item.badge && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${BADGE_STYLES[item.badge.variant] ?? BADGE_STYLES.zinc}`}>
                        {item.badge.text}
                    </span>
                )}
            </button>

            {hasChildren && expanded && (
                <NavTree
                    items={item.children!}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={depth + 1}
                />
            )}
        </li>
    )
}
