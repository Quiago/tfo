'use client'

import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import ReactFlow, {
    Controls,
    MarkerType,
    MiniMap,
    ReactFlowProvider,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useWorkflowStore } from '@/lib/store/workflow-store'
import type { Workflow, WorkflowNodeType } from '@/lib/types/workflow'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import { OpsFlowNode } from './OpsFlowNode'

interface WorkflowCanvasProps {
    workflow: Workflow
}

// Register our custom node type
const nodeTypes = {
    opsflow: OpsFlowNode,
}

function WorkflowCanvasInner({ workflow }: WorkflowCanvasProps) {
    const { addNode, addEdge, updateNode, removeNode, removeEdge, selectNode, isStreaming } = useWorkflowStore()
    const { fitView } = useReactFlow()
    const prevNodeCountRef = useRef(workflow.nodes.length)

    // Auto-fit viewport when nodes are added during streaming
    useEffect(() => {
        const currentCount = workflow.nodes.length

        // Trigger fitView if we are streaming OR if nodes were added
        if (isStreaming || (currentCount > prevNodeCountRef.current && currentCount > 0)) {
            // Use setTimeout within rAF to ensure React Flow has measured the new node
            requestAnimationFrame(() => {
                setTimeout(() => {
                    fitView({
                        padding: 0.2,
                        duration: 500, // Faster than stream delay to avoid overlap
                        minZoom: 0.1,
                        maxZoom: 1
                    })
                }, 100)
            })
            prevNodeCountRef.current = currentCount
        }
    }, [workflow.nodes.length, isStreaming, fitView])

    // Convert our workflow nodes to React Flow nodes
    const rfNodes: Node[] = useMemo(() =>
        workflow.nodes.map(n => ({
            id: n.id,
            type: 'opsflow',
            position: n.position,
            data: {
                ...n,
                meta: NODE_REGISTRY[n.type],
            },
            selected: false,
        })),
        [workflow.nodes]
    )

    // Convert our workflow edges to React Flow edges
    const rfEdges: Edge[] = useMemo(() =>
        workflow.edges.map(e => ({
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
            labelBgStyle: { fill: '#18181b', fillOpacity: 0.9 },
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 4,
        })),
        [workflow.edges]
    )

    // Handle node position changes
    const onNodesChange: OnNodesChange = useCallback((changes) => {
        changes.forEach(change => {
            if (change.type === 'position' && change.position && change.id) {
                updateNode(change.id, { position: change.position })
            }
            if (change.type === 'remove' && change.id) {
                removeNode(change.id)
            }
        })
    }, [updateNode, removeNode])

    // Handle edge changes
    const onEdgesChange: OnEdgesChange = useCallback((changes) => {
        changes.forEach(change => {
            if (change.type === 'remove' && change.id) {
                removeEdge(change.id)
            }
        })
    }, [removeEdge])

    // Handle new connections
    const onConnect: OnConnect = useCallback((connection: Connection) => {
        if (connection.source && connection.target) {
            addEdge(connection.source, connection.target, connection.sourceHandle ?? undefined)
        }
    }, [addEdge])

    // Handle node selection
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        selectNode(node.id)
    }, [selectNode])

    const onPaneClick = useCallback(() => {
        selectNode(null)
    }, [selectNode])

    // Handle drag-and-drop from palette
    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback((e: DragEvent) => {
        e.preventDefault()
        const nodeType = e.dataTransfer.getData('application/opsflow-node-type') as WorkflowNodeType
        if (!nodeType || !NODE_REGISTRY[nodeType]) return

        // Get the canvas bounds to calculate position
        const reactFlowBounds = (e.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
        if (!reactFlowBounds) return

        const position = {
            x: e.clientX - reactFlowBounds.left - 100,
            y: e.clientY - reactFlowBounds.top - 30,
        }

        addNode(nodeType, position)
    }, [addNode])

    return (
        <div className="h-full w-full">
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3, minZoom: 0.1 }}
                minZoom={0.1}
                defaultEdgeOptions={{
                    animated: false,
                    type: 'default',
                    style: { stroke: '#C7C7C7', strokeWidth: 2, strokeDasharray: '5,5' },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#C7C7C7' },
                }}
                proOptions={{ hideAttribution: true }}
                className="bg-[#E9ECF3]"
            >

                <Controls
                    showInteractive={false}
                    className="!border-[#98A6D4] !bg-[#FDFEFE] [&>button]:!border-[#DEE1EA] [&>button]:!bg-white [&>button]:!text-[#5d6b82] [&>button:hover]:!bg-[#F2F5FF]"
                />
                <MiniMap
                    nodeStrokeWidth={3}
                    nodeColor="#3f3f46"
                    maskColor="rgba(0,0,0,0.7)"
                    className="!border-[#98A6D4] !bg-[#FDFEFE]"
                />
            </ReactFlow>
        </div>
    )
}

// Wrap with ReactFlowProvider so useReactFlow() works
export function WorkflowCanvas({ workflow }: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner workflow={workflow} />
        </ReactFlowProvider>
    )
}
