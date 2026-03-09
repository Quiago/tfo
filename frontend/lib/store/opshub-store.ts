import type {
    ActivityEntry,
    AIAgentRecommendation,
    ChangelogEntry,
    CrossFacilityPackage,
    DetectedAnomaly,
    DiscussionComment,
    ExecutionChecklist,
    Factory,
    FeedFilter,
    InputActionType,
    OpshubPost,
    OpshubTab,
    OpshubViewMode,
    TaskPriority,
    TaskType,
    TeamMember,
    WorkflowRepo,
    WorkOrderCard,
    WorkOrderInnerTab,
    WorkOrderTask,
} from '@/lib/types/opshub'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// ─── Store Shape ─────────────────────────────────────────────────
interface OpshubState {
    // Data (existing)
    factories: Factory[]
    workflowRepos: WorkflowRepo[]
    feed: OpshubPost[]
    anomalies: DetectedAnomaly[]
    changelog: ChangelogEntry[]

    // Data (new — WAM)
    workOrders: WorkOrderCard[]
    activityEntries: ActivityEntry[]
    discussionComments: DiscussionComment[]
    executionChecklists: ExecutionChecklist[]
    aiRecommendations: AIAgentRecommendation[]
    crossFacilityPackages: CrossFacilityPackage[]

    // Navigation
    activeTab: OpshubTab
    viewMode: OpshubViewMode
    selectedWorkOrderId: string | null
    selectedInnerTab: WorkOrderInnerTab
    pendingCreateWorkOrder: {
        equipmentName: string
        meshName: string
        title?: string
        description?: string
        priority?: TaskPriority
        facility?: string
        tags?: string[]
    } | null

    // User / Demo
    currentUser: TeamMember | null
    demoUserIndex: number
    currency: 'EUR' | 'SAR'

    // Filters (existing)
    selectedFactoryId: string | null
    feedFilter: FeedFilter
    searchQuery: string
    showOnlyAnomalies: boolean

    // UI State (existing)
    isInputExpanded: boolean
    activeInputAction: InputActionType | null
    isCreatingPost: boolean
    selectedPostId: string | null
    selectedAnomalyId: string | null

    // ── Data Setters (existing) ─────────────────────
    setFactories: (factories: Factory[]) => void
    setWorkflowRepos: (repos: WorkflowRepo[]) => void
    setFeed: (posts: OpshubPost[]) => void
    setAnomalies: (anomalies: DetectedAnomaly[]) => void
    setChangelog: (entries: ChangelogEntry[]) => void

    // ── Data Setters (new — WAM) ────────────────────
    setWorkOrders: (workOrders: WorkOrderCard[]) => void
    setActivityEntries: (entries: ActivityEntry[]) => void
    setDiscussionComments: (comments: DiscussionComment[]) => void
    setExecutionChecklists: (checklists: ExecutionChecklist[]) => void
    setAIRecommendations: (recs: AIAgentRecommendation[]) => void
    setCrossFacilityPackages: (pkgs: CrossFacilityPackage[]) => void

    // ── Navigation Setters ──────────────────────────
    setActiveTab: (tab: OpshubTab) => void
    setViewMode: (mode: OpshubViewMode) => void
    setSelectedWorkOrderId: (id: string | null) => void
    setSelectedInnerTab: (tab: WorkOrderInnerTab) => void
    setCurrency: (currency: 'EUR' | 'SAR') => void
    setPendingCreateWorkOrder: (data: OpshubState['pendingCreateWorkOrder']) => void

    // ── User / Demo ─────────────────────────────────
    setCurrentUser: (user: TeamMember | null) => void
    setDemoUser: (index: number) => void

    // ── Anomaly Actions (existing) ──────────────────
    approveAnomaly: (id: string) => void
    rejectAnomaly: (id: string) => void
    investigateAnomaly: (id: string) => void

    // ── Post Actions (existing) ─────────────────────
    createPost: (post: Omit<OpshubPost, 'id' | 'createdAt' | 'upvotes' | 'comments'>) => void
    upvotePost: (id: string) => void

    // ── Workflow Actions (existing) ─────────────────
    starWorkflow: (repoId: string) => void
    forkWorkflow: (repoId: string, targetFactoryId: string) => void

    // ── Work Order CRUD Actions ─────────────────────
    addWorkOrder: (data: {
        title: string
        description: string
        equipmentName: string
        priority: TaskPriority
        facility: string
        tags: string[]
        owner: TeamMember
    }) => void
    createWorkOrderWithTask: (
        woData: {
            title: string
            description: string
            equipmentName: string
            priority: TaskPriority
            facility: string
            tags: string[]
            owner: TeamMember
        },
        taskData: {
            title: string
            description: string
            assignee: TeamMember
            assignedBy: TeamMember
            priority: TaskPriority
        }
    ) => void
    updateWorkOrder: (id: string, updates: Partial<Pick<WorkOrderCard, 'title' | 'description' | 'status' | 'priority' | 'tags' | 'rootCause' | 'costSaved'>>) => void
    removeWorkOrder: (id: string) => void

    // ── Task CRUD Actions ───────────────────────────
    addTask: (workOrderId: string, task: {
        type: TaskType
        title: string
        description: string
        assignee: TeamMember
        assignedBy: TeamMember
        priority: TaskPriority
    }) => void
    updateTask: (workOrderId: string, taskId: string, updates: Partial<Pick<WorkOrderTask, 'status' | 'title' | 'description' | 'note' | 'priority' | 'isBlocked' | 'updates'>>) => void
    removeTask: (workOrderId: string, taskId: string) => void

    // ── Filter Actions (existing) ───────────────────
    setSelectedFactory: (factoryId: string | null) => void
    setFeedFilter: (filter: FeedFilter) => void
    setSearchQuery: (query: string) => void
    toggleAnomaliesOnly: () => void

    // ── UI Actions (existing) ───────────────────────
    setInputExpanded: (expanded: boolean) => void
    setActiveInputAction: (action: InputActionType | null) => void
    setCreatingPost: (creating: boolean) => void
    selectPost: (id: string | null) => void
    selectAnomaly: (id: string | null) => void

    // ── Computed selectors (existing) ───────────────
    getFilteredFeed: () => OpshubPost[]
    getFilteredRepos: () => WorkflowRepo[]
    getPendingAnomalies: () => DetectedAnomaly[]

    // ── Computed selectors (new — WAM) ──────────────
    getMyTasks: () => WorkOrderTask[]
    getWorkOrderById: (id: string) => WorkOrderCard | undefined
    getLatestWorkOrders: () => WorkOrderCard[]
}

// ─── ID Generator ────────────────────────────────────────────────
let counter = 0
const generateId = (prefix: string) => `${prefix}_${Date.now()}_${++counter}`

// ─── Store ───────────────────────────────────────────────────────
import { persist } from 'zustand/middleware'

// ... existing imports

// ─── Store ───────────────────────────────────────────────────────
export const useOpshubStore = create<OpshubState>()(
    persist(
        immer((set, get) => ({
            // Initial state (existing)
            factories: [],
            workflowRepos: [],
            feed: [],
            anomalies: [],
            changelog: [],
            selectedFactoryId: null,
            feedFilter: 'all',
            searchQuery: '',
            showOnlyAnomalies: false,
            isInputExpanded: false,
            activeInputAction: null,
            isCreatingPost: false,
            selectedPostId: null,
            selectedAnomalyId: null,

            // Initial state (new — WAM)
            workOrders: [],
            activityEntries: [],
            discussionComments: [],
            executionChecklists: [],
            aiRecommendations: [],
            crossFacilityPackages: [],
            activeTab: 'home',
            viewMode: 'executive',
            selectedWorkOrderId: null,
            selectedInnerTab: 'overview',
            pendingCreateWorkOrder: null,
            currentUser: null,
            demoUserIndex: 0,
            currency: 'EUR',

            // ── Data Setters (existing) ─────────────────────
            setFactories: (factories) => set((state) => { state.factories = factories }),
            setWorkflowRepos: (repos) => set((state) => { state.workflowRepos = repos }),
            setFeed: (posts) => set((state) => { state.feed = posts }),
            setAnomalies: (anomalies) => set((state) => { state.anomalies = anomalies }),
            setChangelog: (entries) => set((state) => { state.changelog = entries }),

            // ── Data Setters (new — WAM) ────────────────────
            setWorkOrders: (workOrders) => set((state) => { state.workOrders = workOrders }),
            setActivityEntries: (entries) => set((state) => { state.activityEntries = entries }),
            setDiscussionComments: (comments) => set((state) => { state.discussionComments = comments }),
            setExecutionChecklists: (checklists) => set((state) => { state.executionChecklists = checklists }),
            setAIRecommendations: (recs) => set((state) => { state.aiRecommendations = recs }),
            setCrossFacilityPackages: (pkgs) => set((state) => { state.crossFacilityPackages = pkgs }),

            // ── Navigation Setters ──────────────────────────
            setActiveTab: (tab) => set((state) => { state.activeTab = tab }),
            setViewMode: (mode) => set((state) => { state.viewMode = mode }),
            setSelectedWorkOrderId: (id) => set((state) => { state.selectedWorkOrderId = id }),
            setSelectedInnerTab: (tab) => set((state) => { state.selectedInnerTab = tab }),
            setCurrency: (currency) => set((state) => { state.currency = currency }),
            setPendingCreateWorkOrder: (data) => set((state) => { state.pendingCreateWorkOrder = data }),

            // ── User / Demo ─────────────────────────────────
            setCurrentUser: (user) => set((state) => { state.currentUser = user }),
            setDemoUser: (index) => set((state) => { state.demoUserIndex = index }),

            // ── Anomaly Actions (existing) ──────────────────
            approveAnomaly: (id) => set((state) => {
                const anomaly = state.anomalies.find(a => a.id === id)
                if (!anomaly) return

                anomaly.status = 'resolved'
                anomaly.resolvedAt = new Date().toISOString()

                const newPost: OpshubPost = {
                    id: generateId('post'),
                    type: 'insight',
                    authorType: 'system',
                    authorId: anomaly.factoryId,
                    authorName: anomaly.factoryName,
                    title: `Anomaly resolved: ${anomaly.equipmentName}`,
                    content: `The ${anomaly.severity} severity anomaly on **${anomaly.equipmentName}** has been approved and resolved.\n\n**Original issue:** ${anomaly.description}\n\n**Applied workflow:** ${anomaly.suggestedWorkflowName || 'Manual resolution'}`,
                    anomalyRef: anomaly.id,
                    workflowRepoRef: anomaly.suggestedWorkflowId,
                    tags: [anomaly.equipmentType, 'resolved', anomaly.severity],
                    upvotes: 0,
                    comments: 0,
                    createdAt: new Date().toISOString(),
                    status: 'resolved',
                }
                state.feed.unshift(newPost)
            }),

            rejectAnomaly: (id) => set((state) => {
                const anomaly = state.anomalies.find(a => a.id === id)
                if (anomaly) {
                    anomaly.status = 'rejected'
                }
            }),

            investigateAnomaly: (id) => set((state) => {
                const anomaly = state.anomalies.find(a => a.id === id)
                if (anomaly) {
                    anomaly.status = 'investigating'
                }
            }),

            // ── Post Actions (existing) ─────────────────────
            createPost: (postData) => set((state) => {
                const newPost: OpshubPost = {
                    ...postData,
                    id: generateId('post'),
                    createdAt: new Date().toISOString(),
                    upvotes: 0,
                    comments: 0,
                }
                state.feed.unshift(newPost)
                state.isCreatingPost = false
                state.activeInputAction = null
            }),

            upvotePost: (id) => set((state) => {
                const post = state.feed.find(p => p.id === id)
                if (post) {
                    post.upvotes++
                }
            }),

            // ── Workflow Actions (existing) ─────────────────
            starWorkflow: (repoId) => set((state) => {
                const repo = state.workflowRepos.find(r => r.id === repoId)
                if (repo) {
                    repo.stars++
                }
            }),

            forkWorkflow: (repoId, targetFactoryId) => set((state) => {
                const sourceRepo = state.workflowRepos.find(r => r.id === repoId)
                const targetFactory = state.factories.find(f => f.id === targetFactoryId)
                if (!sourceRepo || !targetFactory) return

                sourceRepo.forks++

                const forkedRepo: WorkflowRepo = {
                    ...sourceRepo,
                    id: generateId('repo'),
                    factoryId: targetFactoryId,
                    name: `${sourceRepo.name}-fork`,
                    forks: 0,
                    stars: 0,
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                }
                state.workflowRepos.push(forkedRepo)

                const sourceFactory = state.factories.find(f => f.id === sourceRepo.factoryId)
                const newPost: OpshubPost = {
                    id: generateId('post'),
                    type: 'pull_request',
                    authorType: 'human',
                    authorId: targetFactoryId,
                    authorName: targetFactory.displayName,
                    title: `Forked: ${sourceRepo.name}`,
                    content: `**${targetFactory.displayName}** forked workflow **${sourceRepo.name}** from **${sourceFactory?.displayName || 'unknown'}** for cross-facility learning.`,
                    workflowRepoRef: forkedRepo.id,
                    tags: sourceRepo.tags,
                    upvotes: 0,
                    comments: 0,
                    createdAt: new Date().toISOString(),
                    status: 'merged',
                    sourceFacilityId: sourceRepo.factoryId,
                    targetFacilityId: targetFactoryId,
                }
                state.feed.unshift(newPost)
            }),

            // ── Work Order CRUD Actions ─────────────────────
            addWorkOrder: (data) => set((state) => {
                const woNumber = state.workOrders.length + 847
                const now = new Date().toISOString()
                const newWorkOrder: WorkOrderCard = {
                    id: generateId('wo'),
                    number: `WO-2026-${String(woNumber).padStart(4, '0')}`,
                    title: data.title,
                    description: data.description,
                    equipmentId: generateId('eq'),
                    equipmentName: data.equipmentName,
                    status: 'open',
                    priority: data.priority,
                    createdAt: now,
                    owner: data.owner,
                    team: [data.owner],
                    tags: data.tags,
                    tasks: [],
                    facility: data.facility,
                }
                state.workOrders.unshift(newWorkOrder)
            }),

            createWorkOrderWithTask: (woData, taskData) => set((state) => {
                const woNumber = state.workOrders.length + 847
                const now = new Date().toISOString()
                const woId = generateId('wo')

                // Create Initial Task
                const initialTask: WorkOrderTask = {
                    id: generateId('task'),
                    number: 1,
                    workOrderId: woId,
                    type: 'investigation', // Defaulting to investigation for initial task
                    title: taskData.title,
                    description: taskData.description,
                    assignee: taskData.assignee,
                    assignedBy: taskData.assignedBy,
                    priority: taskData.priority,
                    status: 'pending',
                    dependsOn: [],
                    isBlocked: false,
                    updates: [],
                    createdAt: now,
                    updatedAt: now,
                }

                const newWorkOrder: WorkOrderCard = {
                    id: woId,
                    number: `WO-2026-${String(woNumber).padStart(4, '0')}`,
                    title: woData.title,
                    description: woData.description,
                    equipmentId: generateId('eq'),
                    equipmentName: woData.equipmentName,
                    status: 'open', // Should this be in-progress if a task is assigned? Kept 'open' for now.
                    priority: woData.priority,
                    createdAt: now,
                    owner: woData.owner,
                    team: [woData.owner, taskData.assignee].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i), // Unique members
                    tags: woData.tags,
                    tasks: [initialTask],
                    facility: woData.facility,
                }
                state.workOrders.unshift(newWorkOrder)
            }),

            updateWorkOrder: (id, updates) => set((state) => {
                const wo = state.workOrders.find(w => w.id === id)
                if (!wo) return
                Object.assign(wo, updates)
            }),

            removeWorkOrder: (id) => set((state) => {
                state.workOrders = state.workOrders.filter(w => w.id !== id)
            }),

            // ── Task CRUD Actions ───────────────────────────
            addTask: (workOrderId, taskData) => set((state) => {
                const wo = state.workOrders.find(w => w.id === workOrderId)
                if (!wo) return
                const now = new Date().toISOString()
                const newTask: WorkOrderTask = {
                    id: generateId('task'),
                    number: wo.tasks.length + 1,
                    workOrderId,
                    type: taskData.type,
                    title: taskData.title,
                    description: taskData.description,
                    assignee: taskData.assignee,
                    assignedBy: taskData.assignedBy,
                    priority: taskData.priority,
                    status: 'pending',
                    dependsOn: [],
                    isBlocked: false,
                    updates: [],
                    createdAt: now,
                    updatedAt: now,
                }
                wo.tasks.push(newTask)
            }),

            updateTask: (workOrderId, taskId, updates) => set((state) => {
                const wo = state.workOrders.find(w => w.id === workOrderId)
                if (!wo) return
                const task = wo.tasks.find(t => t.id === taskId)
                if (!task) return
                Object.assign(task, updates)
                task.updatedAt = new Date().toISOString()
            }),

            removeTask: (workOrderId, taskId) => set((state) => {
                const wo = state.workOrders.find(w => w.id === workOrderId)
                if (!wo) return
                wo.tasks = wo.tasks.filter(t => t.id !== taskId)
            }),

            // ── Filter Actions (existing) ───────────────────
            setSelectedFactory: (factoryId) => set((state) => {
                state.selectedFactoryId = factoryId
            }),
            setFeedFilter: (filter) => set((state) => { state.feedFilter = filter }),
            setSearchQuery: (query) => set((state) => { state.searchQuery = query }),
            toggleAnomaliesOnly: () => set((state) => {
                state.showOnlyAnomalies = !state.showOnlyAnomalies
            }),

            // ── UI Actions (existing) ───────────────────────
            setInputExpanded: (expanded) => set((state) => { state.isInputExpanded = expanded }),
            setActiveInputAction: (action) => set((state) => {
                state.activeInputAction = action
                state.isInputExpanded = action !== null
            }),
            setCreatingPost: (creating) => set((state) => { state.isCreatingPost = creating }),
            selectPost: (id) => set((state) => { state.selectedPostId = id }),
            selectAnomaly: (id) => set((state) => { state.selectedAnomalyId = id }),

            // ── Computed Selectors (existing) ───────────────
            getFilteredFeed: () => {
                const { feed, feedFilter, searchQuery, showOnlyAnomalies } = get()
                let filtered = [...feed]

                // Note: We don't filter by selectedFactoryId here - the feed shows all posts from all factories
                // The factory selector only filters work orders and risk data

                if (feedFilter !== 'all') {
                    filtered = filtered.filter(p => p.type === feedFilter)
                }
                if (showOnlyAnomalies) {
                    filtered = filtered.filter(p => p.type === 'anomaly_alert' || p.anomalyRef)
                }
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase()
                    filtered = filtered.filter(p =>
                        p.title.toLowerCase().includes(q) ||
                        p.content.toLowerCase().includes(q) ||
                        p.tags.some(t => t.toLowerCase().includes(q))
                    )
                }
                return filtered
            },

            getFilteredRepos: () => {
                const { workflowRepos, selectedFactoryId, searchQuery } = get()
                let filtered = [...workflowRepos]

                if (selectedFactoryId) {
                    filtered = filtered.filter(r => r.factoryId === selectedFactoryId)
                }
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase()
                    filtered = filtered.filter(r =>
                        r.name.toLowerCase().includes(q) ||
                        r.description.toLowerCase().includes(q) ||
                        r.tags.some(t => t.toLowerCase().includes(q))
                    )
                }
                return filtered
            },

            getPendingAnomalies: () => {
                const { anomalies, selectedFactoryId } = get()
                let pending = anomalies.filter(a => a.status === 'pending' || a.status === 'investigating')

                if (selectedFactoryId) {
                    pending = pending.filter(a => a.factoryId === selectedFactoryId)
                }

                return pending.sort((a, b) => {
                    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
                    return severityOrder[a.severity] - severityOrder[b.severity]
                })
            },

            // ── Computed Selectors (new — WAM) ──────────────
            getMyTasks: () => {
                const { workOrders, currentUser } = get()
                if (!currentUser) return []
                return workOrders.flatMap(wo =>
                    wo.tasks.filter(t => t.assignee.id === currentUser.id)
                )
            },

            getWorkOrderById: (id: string) => {
                return get().workOrders.find(wo => wo.id === id)
            },

            getLatestWorkOrders: () => {
                const { workOrders, selectedFactoryId } = get()
                let filtered = [...workOrders]

                // Filter by selected factory
                if (selectedFactoryId) {
                    const selectedFactory = get().factories.find(f => f.id === selectedFactoryId)
                    if (selectedFactory) {
                        filtered = filtered.filter(wo => wo.facility === selectedFactory.displayName)
                    }
                }

                // Sort by creation date (newest first) and take top 10
                return filtered
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 10)
            },
        })),
        { name: 'opshub-storage' }
    )
)
