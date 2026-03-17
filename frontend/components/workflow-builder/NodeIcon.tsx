'use client'

/**
 * NodeIcon — shared icon renderer for workflow nodes.
 * Used by both OpsFlowNode (canvas) and StandaloneNodeCard (overlay).
 */
import * as LucideIcons from 'lucide-react'
import { memo } from 'react'

export const NodeIcon = memo(({ name, size = 24 }: { name: string; size?: number }) => {
    const Icon = (
        LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>
    )[name]
    return Icon ? <Icon size={size} /> : null
})
NodeIcon.displayName = 'NodeIcon'
