'use client'

import type { NodeMeta, WorkflowNode } from '@/lib/types/workflow'
import s from '@/styles/workflow/workflow.module.css'
import * as LucideIcons from 'lucide-react'
import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

interface OpsFlowNodeData extends WorkflowNode {
    meta: NodeMeta
}

const NodeIcon = memo(({ name, size = 16 }: { name: string; size?: number }) => {
    const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name]
    return Icon ? <Icon size={size} /> : null
})
NodeIcon.displayName = 'NodeIcon'

function OpsFlowNodeComponent({ data, selected }: NodeProps<OpsFlowNodeData>) {
    const { meta, label, type } = data
    const isDecision = type === 'decision'
    const isTrigger = meta.category === 'trigger'

    return (
        <div
            className={s.graphNode}
            data-type={type}
            data-category={meta.category}
            data-selected={selected}
        >
            {/* INPUTS */}
            {!isTrigger && (
                <>
                    {/* Left - Default Target */}
                    <Handle
                        type="target"
                        position={Position.Left}
                        className={`${s.handle} ${s.handleVertical}`}
                        style={{ left: '-6px' }}
                    />
                    {/* Top - Secondary Target */}
                    <Handle
                        type="target"
                        position={Position.Top}
                        id="top"
                        className={`${s.handle} ${s.handleHorizontal}`}
                        style={{ top: '-6px' }}
                    />
                </>
            )}

            <div className={s.nodeContent}>
                {/* Icon Container */}
                <div className={s.nodeIconContainer}>
                    <NodeIcon name={meta.icon} size={32} />
                </div>

                {/* Text Container */}
                <div className={s.nodeTextContainer}>
                    <div className={s.nodeSubtitle}>{label}</div>
                    <div className={s.nodeTitle}>{meta.label}</div>
                </div>
            </div>

            {/* OUTPUTS */}
            {isDecision ? (
                <>
                    {/* True branch */}
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="true"
                        className={`${s.handle} ${s.handleVertical} ${s.handleTrue}`}
                        style={{ right: '-6px', top: '30%' }}
                    />
                    {/* False branch */}
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="false"
                        className={`${s.handle} ${s.handleVertical} ${s.handleFalse}`}
                        style={{ right: '-6px', top: '70%' }}
                    />
                    {/* Labels */}
                    <div className="absolute right-[-30px] top-[22%] text-[10px] font-bold text-emerald-600">Yes</div>
                    <div className="absolute right-[-26px] top-[62%] text-[10px] font-bold text-rose-600">No</div>
                </>
            ) : (
                <>
                    {/* Right - Default Source */}
                    <Handle
                        type="source"
                        position={Position.Right}
                        className={`${s.handle} ${s.handleVertical}`}
                        style={{ right: '-6px' }}
                    />
                    {/* Bottom - Secondary Source */}
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="bottom"
                        className={`${s.handle} ${s.handleHorizontal}`}
                        style={{ bottom: '-6px' }}
                    />
                </>
            )}
        </div>
    )
}

export const OpsFlowNode = memo(OpsFlowNodeComponent)
