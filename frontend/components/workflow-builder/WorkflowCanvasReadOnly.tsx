'use client'

/**
 * WorkflowCanvasReadOnly — same visual as WorkflowCanvas but fully non-interactive.
 * No Zustand store, no drag/drop, no connections. Safe to embed inside modals or cards.
 */

import { OpsFlowNode } from './OpsFlowNode'
import type { Workflow } from '@/lib/types/workflow'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import { useMemo } from 'react'
import ReactFlow, { Controls, MarkerType, ReactFlowProvider, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'

const nodeTypes = { opsflow: OpsFlowNode }

function WorkflowCanvasReadOnlyInner({ workflow }: { workflow: Workflow }) {
    const rfNodes: Node[] = useMemo(() =>
        workflow.nodes.map((n) => ({
            id: n.id,
            type: 'opsflow',
            position: n.position,
            data: { ...n, meta: NODE_REGISTRY[n.type] },
            selected: false,
        })),
        [workflow.nodes],
    )

    const rfEdges: Edge[] = useMemo(() =>
        workflow.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            label: e.label,
            animated: false,
            type: 'default',
            style: { stroke: '#C7C7C7', strokeWidth: 2, strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#C7C7C7' },
            labelStyle: { fill: '#a1a1aa', fontSize: 10, fontWeight: 500 },
            labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 4,
        })),
        [workflow.edges],
    )

    return (
        <div className="h-full w-full">
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={true}
                zoomOnScroll={true}
                fitView
                fitViewOptions={{ padding: 0.35, minZoom: 0.1, maxZoom: 1 }}
                minZoom={0.1}
                proOptions={{ hideAttribution: true }}
                className="bg-[#E9ECF3]"
            >
                <Controls
                    showInteractive={false}
                    className="!border-[#98A6D4] !bg-[#FDFEFE] [&>button]:!border-[#DEE1EA] [&>button]:!bg-white [&>button]:!text-[#5d6b82] [&>button:hover]:!bg-[#F2F5FF]"
                />
            </ReactFlow>
        </div>
    )
}

export function WorkflowCanvasReadOnly({ workflow }: { workflow: Workflow }) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasReadOnlyInner workflow={workflow} />
        </ReactFlowProvider>
    )
}
