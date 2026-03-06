import type {
    ConfirmationCard,
    NodeConfig,
    VoiceWorkflowIntent,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
    WorkflowNodeType
} from '@/lib/types/workflow'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// ─── UI Mode ─────────────────────────────────────────────────────
export type BuilderMode = 'canvas' | 'cards' | 'voice'

// ─── Store Shape ─────────────────────────────────────────────────
interface WorkflowBuilderState {
    // Current workflow being edited
    workflow: Workflow | null

    // UI state
    mode: BuilderMode
    selectedNodeId: string | null
    isPanelOpen: boolean
    isVoiceRecording: boolean
    voiceTranscript: string

    // Mobile confirmation cards
    confirmationCard: ConfirmationCard | null

    // Streaming state (nodes appearing one by one)
    isStreaming: boolean

    // Execution state
    isExecuting: boolean
    executionLog: { nodeId: string; status: string; message: string; timestamp: number }[]

    // Actions — Workflow CRUD
    // Actions — Workflow CRUD
    createWorkflow: (title: string, description?: string) => void
    loadWorkflow: (workflow: Workflow) => void
    updateWorkflowMeta: (updates: Partial<Pick<Workflow, 'title' | 'description' | 'tags' | 'targetAsset' | 'safetyCheck' | 'isPublic' | 'status'>>) => void
    generateWorkflowFromRecommendation: () => void

    // Actions — Node CRUD
    addNode: (type: WorkflowNodeType, position: { x: number; y: number }, config?: NodeConfig) => string
    updateNode: (nodeId: string, updates: Partial<Pick<WorkflowNode, 'label' | 'config' | 'position'>>) => void
    removeNode: (nodeId: string) => void
    selectNode: (nodeId: string | null) => void

    // Actions — Edge CRUD
    addEdge: (source: string, target: string, sourceHandle?: string, label?: string) => void
    removeEdge: (edgeId: string) => void

    // Actions — Voice / AI
    setVoiceRecording: (isRecording: boolean) => void
    setVoiceTranscript: (transcript: string) => void
    setConfirmationCard: (card: ConfirmationCard | null) => void
    confirmWorkflowIntent: () => void

    // Actions — Mode
    setMode: (mode: BuilderMode) => void
    togglePanel: () => void

    // Actions — Execution
    setExecuting: (isExecuting: boolean) => void
    addExecutionLog: (nodeId: string, status: string, message: string) => void
    clearExecutionLog: () => void

    // Export
    exportToJSON: () => string
}

// ─── ID Generator ────────────────────────────────────────────────
let nodeCounter = 0
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${++nodeCounter}`

// ─── Auto-Layout Helper ─────────────────────────────────────────
const autoLayoutPosition = (index: number): { x: number; y: number } => ({
    x: 100 + index * 700,
    y: 300,
})

// ─── Intent → Nodes/Edges Converter ─────────────────────────────
function intentToNodesAndEdges(intent: VoiceWorkflowIntent): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const nodes: WorkflowNode[] = []
    const edges: WorkflowEdge[] = []

    // Create trigger node
    const triggerId = generateId('node')
    nodes.push({
        id: triggerId,
        type: intent.trigger.type,
        label: intent.trigger.keywords?.length
            ? `Trigger: "${intent.trigger.keywords.join(', ')}"`
            : 'Start',
        config: intent.trigger.keywords ? { keywords: intent.trigger.keywords } : {},
        position: autoLayoutPosition(0),
    })

    let prevId = triggerId

    // Create step nodes
    intent.steps.forEach((step, i) => {
        const nodeId = generateId('node')
        nodes.push({
            id: nodeId,
            type: step.type,
            label: step.label,
            config: step.config,
            position: autoLayoutPosition(i + 1),
        })

        // Connect to previous
        edges.push({
            id: generateId('edge'),
            source: prevId,
            target: nodeId,
            animated: true,
        })

        prevId = nodeId
    })

    return { nodes, edges }
}

// ─── Store ───────────────────────────────────────────────────────
export const useWorkflowStore = create<WorkflowBuilderState>()(
    immer((set, get) => ({
        workflow: null,
        mode: 'canvas',
        selectedNodeId: null,
        isPanelOpen: true,
        isVoiceRecording: false,
        voiceTranscript: '',
        confirmationCard: null,
        isStreaming: false,
        isExecuting: false,
        executionLog: [],

        // ── Workflow CRUD ─────────────────────────────
        createWorkflow: (title, description = '') => {
            set((state) => {
                state.workflow = {
                    id: generateId('wf'),
                    title,
                    description,
                    authorId: 'user_current',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    isPublic: false,
                    status: 'draft',
                    nodes: [],
                    edges: [],
                    tags: [],
                    executionCount: 0,
                }
            })
        },

        loadWorkflow: (workflow) => {
            set((state) => {
                state.workflow = workflow
                state.selectedNodeId = null
            })
        },

        updateWorkflowMeta: (updates) => {
            set((state) => {
                if (!state.workflow) return
                Object.assign(state.workflow, updates)
                state.workflow.updatedAt = new Date().toISOString()
            })
        },

        // ── Node CRUD ─────────────────────────────────
        addNode: (type, position, config = {}) => {
            const id = generateId('node')
            const meta = (
                // Dynamic import would be cleaner but for Zustand sync we inline
                { label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
            )
            set((state) => {
                if (!state.workflow) return
                state.workflow.nodes.push({
                    id,
                    type,
                    label: meta.label,
                    config,
                    position,
                })
                state.workflow.updatedAt = new Date().toISOString()
            })
            return id
        },

        updateNode: (nodeId, updates) => {
            set((state) => {
                if (!state.workflow) return
                const node = state.workflow.nodes.find(n => n.id === nodeId)
                if (node) {
                    if (updates.label !== undefined) node.label = updates.label
                    if (updates.config !== undefined) node.config = updates.config
                    if (updates.position !== undefined) node.position = updates.position
                    state.workflow.updatedAt = new Date().toISOString()
                }
            })
        },

        removeNode: (nodeId) => {
            set((state) => {
                if (!state.workflow) return
                state.workflow.nodes = state.workflow.nodes.filter(n => n.id !== nodeId)
                state.workflow.edges = state.workflow.edges.filter(
                    e => e.source !== nodeId && e.target !== nodeId
                )
                if (state.selectedNodeId === nodeId) state.selectedNodeId = null
                state.workflow.updatedAt = new Date().toISOString()
            })
        },

        selectNode: (nodeId) => {
            set((state) => { state.selectedNodeId = nodeId })
        },

        // ── Edge CRUD ─────────────────────────────────
        addEdge: (source, target, sourceHandle, label) => {
            set((state) => {
                if (!state.workflow) return
                // Prevent duplicates
                const exists = state.workflow.edges.some(
                    e => e.source === source && e.target === target && e.sourceHandle === sourceHandle
                )
                if (exists) return
                state.workflow.edges.push({
                    id: generateId('edge'),
                    source,
                    target,
                    sourceHandle,
                    label,
                    animated: true,
                })
                state.workflow.updatedAt = new Date().toISOString()
            })
        },

        removeEdge: (edgeId) => {
            set((state) => {
                if (!state.workflow) return
                state.workflow.edges = state.workflow.edges.filter(e => e.id !== edgeId)
            })
        },

        // ── Voice / AI ────────────────────────────────
        setVoiceRecording: (isRecording) => {
            set((state) => { state.isVoiceRecording = isRecording })
        },

        setVoiceTranscript: (transcript) => {
            set((state) => { state.voiceTranscript = transcript })
        },

        setConfirmationCard: (card) => {
            set((state) => { state.confirmationCard = card })
        },

        confirmWorkflowIntent: () => {
            const { confirmationCard, workflow } = get()
            if (!confirmationCard || !workflow) return

            const intent = confirmationCard.userEdits
                ? { ...confirmationCard.workflowIntent, ...confirmationCard.userEdits }
                : confirmationCard.workflowIntent

            const { nodes, edges } = intentToNodesAndEdges(intent)

            // Set metadata immediately, clear overlay, start streaming
            set((state) => {
                if (!state.workflow) return
                state.workflow.nodes = []
                state.workflow.edges = []
                state.workflow.title = intent.title
                state.workflow.description = intent.description
                state.workflow.targetAsset = intent.targetAsset
                state.workflow.safetyCheck = intent.safetyCheck
                state.workflow.updatedAt = new Date().toISOString()
                state.confirmationCard = null
                state.voiceTranscript = ''
                state.isStreaming = true
            })

            // Stream nodes in one-by-one with delay
            const STREAM_DELAY = 600 // ms between each node
            nodes.forEach((node, i) => {
                setTimeout(() => {
                    set((state) => {
                        if (!state.workflow) return
                        state.workflow.nodes.push(node)
                        // Add the edge connecting to this node (if any)
                        const incomingEdge = edges.find(e => e.target === node.id)
                        if (incomingEdge) {
                            state.workflow.edges.push(incomingEdge)
                        }
                        // Also add any edges where this node is the source for decision branches
                        // that connect to already-existing nodes
                        edges
                            .filter(e => e.source === node.id)
                            .forEach(e => {
                                const targetExists = state.workflow!.nodes.some(n => n.id === e.target)
                                if (targetExists && !state.workflow!.edges.some(ex => ex.id === e.id)) {
                                    state.workflow!.edges.push(e)
                                }
                            })
                        state.workflow.updatedAt = new Date().toISOString()
                        // Mark streaming complete after last node
                        if (i === nodes.length - 1) {
                            state.isStreaming = false
                        }
                    })
                }, (i + 1) * STREAM_DELAY)
            })
        },

        // Action to generate workflow from AI Recommendation (OpsHub)
        generateWorkflowFromRecommendation: () => {
            // 1. Reset and set metadata
            set((state) => {
                state.workflow = {
                    id: generateId('wf'),
                    title: 'Bearing Failure Prevention (Auto-Generated)',
                    description: 'AI-generated workflow based on vibration analysis pattern matching. Intended to prevent inner race degradation failure.',
                    authorId: 'ai-agent',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: 1,
                    isPublic: false,
                    status: 'draft',
                    nodes: [],
                    edges: [],
                    tags: ['AI-Generated', 'Bearing', 'Predictive'],
                    executionCount: 0,
                }
                state.isStreaming = true
                state.mode = 'canvas' // Ensure we are in canvas mode
            })

            // 2. Define the nodes for this specific workflow using VALID WorkflowNodeType values
            // 2. Define the nodes for this specific workflow using VALID WorkflowNodeType values
            const nodesToAdd: WorkflowNode[] = [
                // 1. Trigger
                {
                    id: 'n-trigger', type: 'sensor_trigger', label: 'Trigger: High Vibration detected',
                    position: autoLayoutPosition(0), config: { condition: 'Vibration > 8mm/s (Critical)' }
                },
                // 2. Decision
                {
                    id: 'n-decision', type: 'decision', label: 'Check: AI Confidence > 90%?',
                    position: autoLayoutPosition(1), config: { condition: 'Confidence Score > 0.90' }
                },
                // 3. AI Analysis (True path)
                {
                    id: 'n-analyze', type: 'ai_suggest', label: 'Action: Analyze Spectrum',
                    position: autoLayoutPosition(2), config: { prompt: 'Analyze vibration spectrum for inner race degradation patterns.' }
                },
                // 4. Inventory Check (True path)
                {
                    id: 'n-inventory', type: 'update_sheet', label: 'Action: Check SAP Inventory',
                    position: autoLayoutPosition(3), config: { sheetName: 'Spare Parts', columns: [{ header: 'Item', valueTemplate: 'BRG-SKF-22218' }] }
                },
                // 5. Schedule (True path)
                {
                    id: 'n-schedule', type: 'checklist_gate', label: 'Action: Schedule Replacement',
                    position: autoLayoutPosition(4), config: { items: [{ id: 'approve', label: 'Auto-Schedule Work Order', required: true }] }
                },
                // 6. Manual Review (False path - positioned below)
                {
                    id: 'n-review', type: 'create_ticket', label: 'Action: Flag for Review',
                    position: { x: autoLayoutPosition(2).x, y: 500 }, // Manually positioned below
                    config: { service: 'jira', titleTemplate: 'Review Anomaly', descriptionTemplate: 'Low confidence detection', priority: 'medium' }
                }
            ]

            const edgesToAdd: WorkflowEdge[] = [
                // Trigger -> Decision
                { id: 'e1', source: 'n-trigger', target: 'n-decision', animated: true },

                // Decision -> Analyze (True)
                { id: 'e2', source: 'n-decision', target: 'n-analyze', sourceHandle: 'true', label: 'Yes', animated: true },

                // Decision -> Review (False)
                { id: 'e-false', source: 'n-decision', target: 'n-review', sourceHandle: 'false', label: 'No', animated: true },

                // Analyze -> Inventory
                { id: 'e3', source: 'n-analyze', target: 'n-inventory', animated: true },

                // Inventory -> Schedule
                { id: 'e4', source: 'n-inventory', target: 'n-schedule', animated: true },
            ]

            // 3. Stream them in
            const STREAM_DELAY = 800
            nodesToAdd.forEach((node, i) => {
                setTimeout(() => {
                    set((state) => {
                        if (!state.workflow) return
                        state.workflow.nodes.push(node)

                        // Add edges connecting to this new node
                        const incomingEdges = edgesToAdd.filter(e => e.target === node.id)
                        state.workflow.edges.push(...incomingEdges)

                        state.workflow.updatedAt = new Date().toISOString()
                        if (i === nodesToAdd.length - 1) {
                            state.isStreaming = false
                        }
                    })
                }, (i + 1) * STREAM_DELAY)
            })
        },

        // ── Mode ──────────────────────────────────────
        setMode: (mode) => {
            set((state) => { state.mode = mode })
        },

        togglePanel: () => {
            set((state) => { state.isPanelOpen = !state.isPanelOpen })
        },

        // ── Execution ─────────────────────────────────
        setExecuting: (isExecuting) => {
            set((state) => { state.isExecuting = isExecuting })
        },

        addExecutionLog: (nodeId, status, message) => {
            set((state) => {
                state.executionLog.push({ nodeId, status, message, timestamp: Date.now() })
            })
        },

        clearExecutionLog: () => {
            set((state) => { state.executionLog = [] })
        },

        // ── Export ─────────────────────────────────────
        exportToJSON: () => {
            const { workflow } = get()
            if (!workflow) return '{}'
            return JSON.stringify(workflow, null, 2)
        },
    }))
)
