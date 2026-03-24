// /lib/types/opshub.ts
// Types for OpsHub: Cross-Facility Learning & Anomaly Detection Hub
// GitHub-inspired industrial knowledge sharing platform

import type { Workflow } from './workflow'

// ─── Factory (like GitHub User/Organization) ─────────────────────
export interface Factory {
    id: string
    name: string              // "factory-1", "factory-2"
    displayName: string       // "Munich Plant", "Shanghai Facility"
    avatar?: string           // Optional factory icon
    location?: string         // "Germany", "China"
    metrics: {
        efficiency: number      // 0-100%
        uptime: number          // 0-100%
        activeWorkflows: number
        resolvedAnomalies: number
    }
}

// ─── Workflow Repository (Factory owns Workflows) ────────────────
export interface WorkflowRepo {
    id: string
    factoryId: string         // Owner factory
    name: string              // "motor-vibration-fix", "hvac-optimization"
    description: string
    workflowId?: string       // Reference to actual Workflow (if exists)
    workflow?: Workflow       // Embedded workflow for display
    stars: number
    forks: number
    isPublic: boolean
    tags: string[]
    language?: string         // Primary equipment type: "Motors", "HVAC", "Pumps"
    lastUpdated: string       // ISO 8601
    createdAt: string
}

// ─── Feed Post Types ─────────────────────────────────────────────
export type PostType =
    | 'insight'        // AI-discovered pattern or recommendation
    | 'question'       // Human asks for help (StackOverflow style)
    | 'issue'          // Problem reported for a workflow
    | 'pull_request'   // Proposed improvement to a workflow
    | 'announcement'   // System or admin announcement
    | 'anomaly_alert'  // AI-detected anomaly notification
    | 'discussion'     // Team discussion/comment from work orders
    | 'workflow_execution'  // Workflow execution/completion activity

export type PostAuthorType = 'human' | 'ai_agent' | 'system'

export interface OpshubPost {
    id: string
    type: PostType
    authorType: PostAuthorType
    authorId: string          // Factory ID or user ID
    authorName: string        // Display name
    authorAvatar?: string
    title: string
    content: string           // Markdown-supported content
    workflowRepoRef?: string  // Related workflow repo ID
    anomalyRef?: string       // Related anomaly ID
    tags: string[]
    upvotes: number
    downvotes?: number
    comments: number
    createdAt: string
    updatedAt?: string
    status?: 'open' | 'resolved' | 'merged' | 'rejected' | 'pending'
    // For pull requests
    sourceFacilityId?: string
    targetFacilityId?: string
}

// ─── Detected Anomaly ────────────────────────────────────────────
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical'
export type AnomalyStatus = 'pending' | 'approved' | 'rejected' | 'resolved' | 'investigating'

export interface DetectedAnomaly {
    id: string
    factoryId: string
    factoryName: string
    equipmentId: string
    equipmentName: string
    equipmentType: string     // "Motor", "Pump", "HVAC"
    severity: AnomalySeverity
    description: string
    detectedAt: string
    suggestedWorkflowId?: string
    suggestedWorkflowName?: string
    suggestedAction?: string  // Brief action description
    status: AnomalyStatus
    resolvedAt?: string
    resolvedBy?: string
    confidence: number        // AI confidence 0-1
    // Industrial context fields
    remainingUsefulLife?: string  // "72 hours", "5 days"
    estimatedCostIfIgnored?: number  // cost of unplanned downtime
    digitalTwinAssetId?: string  // Link to 3D asset in digital twin
}

// ─── Changelog Entry ─────────────────────────────────────────────
export interface ChangelogEntry {
    id: string
    date: string              // ISO 8601
    title: string
    description: string
    factoryId?: string
    factoryName?: string
    workflowRepoId?: string
    type: 'release' | 'insight' | 'integration' | 'improvement' | 'alert'
}

// ─── Filter Types ────────────────────────────────────────────────
export type FeedFilter = PostType | 'all'

export interface OpshubFilters {
    feedFilter: FeedFilter
    selectedFactoryId: string | null
    searchQuery: string
    showOnlyAnomalies: boolean
}

// ─── Task Types ─────────────────────────────────────────────────
export type TaskType = 'investigation' | 'execution' | 'verification' | 'approval'
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked' | 'accepted'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

// ─── Tabs ───────────────────────────────────────────────────────
export type OpshubTab = 'home' | 'my-tasks' | 'work-orders'
export type OpshubViewMode = 'executive' | 'engineering' | 'operations'
export type WorkOrderInnerTab = 'overview' | 'tasks' | 'workflows' | 'discussion' | 'activity'

// ─── Team ───────────────────────────────────────────────────────
export interface TeamMember {
    id: string
    name: string
    role: string
    facility: string
    avatarInitials: string
    avatarColor: string
    status: 'available' | 'busy' | 'in-field' | 'offline'
    isAI?: boolean
}

// ─── Work Order ─────────────────────────────────────────────────
export type WorkOrderStatus = 'open' | 'in-progress' | 'resolved' | 'closed'

export interface WorkOrderCard {
    id: string
    number: string // "WO-2026-0847"
    title: string
    description: string
    equipmentId: string
    equipmentName: string
    status: WorkOrderStatus
    priority: TaskPriority
    createdAt: string
    resolvedAt?: string
    owner: TeamMember
    team: TeamMember[]
    tags: string[]
    linkedAnomalyId?: string
    tasks: WorkOrderTask[]
    rootCause?: string
    costSaved?: number
    facility: string
}

// ─── Work Order Task ────────────────────────────────────────────
export interface WorkOrderTask {
    id: string
    number: number
    workOrderId: string
    type: TaskType
    title: string
    description: string
    assignee: TeamMember
    assignedBy: TeamMember
    priority: TaskPriority
    status: TaskStatus
    dueDate?: string
    note?: string
    dependsOn: string[]
    blockedBy?: string[]
    isBlocked: boolean
    checklist?: ChecklistStep[]
    steps?: string[]
    estimatedDuration?: string
    updates: TaskUpdate[]
    createdAt: string
    updatedAt: string
}

export interface TaskUpdate {
    id: string
    author: TeamMember
    content: string
    createdAt: string
    attachments?: string[]
}

// ─── Execution Checklist ────────────────────────────────────────
export interface ExecutionChecklist {
    id: string
    workOrderId: string
    taskId: string
    title: string
    steps: ChecklistStep[]
    startedAt?: string
    completedAt?: string
}

export interface ChecklistStep {
    id: string
    order: number
    title: string
    instructions: string
    caution?: string
    requiresPhoto: boolean
    requiresSignoff: boolean
    estimatedTime: string
    completed: boolean
    completedAt?: string
    completedBy?: TeamMember
    note?: string
    photoUrl?: string
}

// ─── Activity ───────────────────────────────────────────────────
export type ActivityAction =
    | 'anomaly-detected' | 'work-order-created' | 'task-assigned' | 'task-accepted'
    | 'task-started' | 'task-completed' | 'checklist-step-completed' | 'comment-posted'
    | 'annotation-added' | 'finding-shared' | 'verification-complete' | 'work-order-resolved'
    | 'ai-recommendation-generated' | 'recommendation-approved' | 'recommendation-published'
    | 'package-received' | 'package-adapted'

export interface ActivityEntry {
    id: string
    workOrderId: string
    action: ActivityAction
    actor: TeamMember | { id: string; name: string; role: string }
    description: string
    details?: string
    timestamp: string
    metadata?: Record<string, unknown>
}

// ─── Discussion ─────────────────────────────────────────────────
export interface DiscussionComment {
    id: string
    workOrderId: string
    author: TeamMember
    content: string
    mentions: string[]
    createdAt: string
    reactions?: { emoji: string; count: number }[]
}

// ─── AI Agent ───────────────────────────────────────────────────
export interface AIAgentRecommendation {
    id: string
    workOrderId: string
    generatedAt: string
    status: 'pending-review' | 'approved' | 'rejected' | 'modified'
    reviewedBy?: TeamMember
    reviewedAt?: string
    workflow: AIGeneratedWorkflow
    sop: AIGeneratedSOP
    summary: AIRecommendationSummary
}

export interface AIRecommendationSummary {
    patternDetected: string
    dataSourcesUsed: string[]
    confidenceScore: number
    estimatedPreventionValue: number
    estimatedEarlyDetection: string
    applicableFacilities: string[]
}

export interface AIGeneratedWorkflow {
    id: string
    name: string
    description: string
    version: string
    trigger: { type: string; description: string; config: Record<string, unknown> }
    conditions: { type: string; description: string; config: Record<string, unknown> }[]
    actions: { type: string; description: string; config: Record<string, unknown> }[]
    generatedFrom: {
        anomalyPattern: string
        sensorThresholds: { metric: string; operator: string; value: number; unit: string }[]
        correlations: string[]
    }
}

export interface AIGeneratedSOP {
    id: string
    title: string
    version: string
    description: string
    basedOn: string
    steps: SOPStep[]
    safetyNotes: string[]
    partsRequired: { partName: string; partNumber: string; quantity: number }[]
    estimatedDuration: string
    toolsRequired: string[]
}

export interface SOPStep {
    order: number
    title: string
    instructions: string
    caution?: string
    requiresPhoto: boolean
    requiresSignoff: boolean
    estimatedTime: string
    sourceNote?: string
}

// ─── KPI / Risk ─────────────────────────────────────────────────
export interface KPICard {
    label: string
    value: string
    trend: 'up' | 'down' | 'flat'
    trendValue: string
    status: 'good' | 'warning' | 'critical'
}

export interface RiskSummaryCard {
    totalExposure: number
    currency: 'EUR' | 'SAR'
    items: { label: string; amount: number; severity: 'low' | 'medium' | 'high' | 'critical' }[]
}

// ─── Cross-Facility Package ─────────────────────────────────────
export interface CrossFacilityPackage {
    id: string
    sourceWorkOrderId: string
    sourceFacility: string
    recommendation: AIAgentRecommendation
    sentBy: TeamMember
    sentAt: string
    targetFacilities: string[]
    status: 'pending' | 'adapted' | 'dismissed'
}

// ─── UI State Types ──────────────────────────────────────────────
export type InputActionType = 'ask_ai' | 'work_order' | 'report_issue' | 'propose_workflow'

export interface OpshubUIState {
    isInputExpanded: boolean
    activeInputAction: InputActionType | null
    isCreatingPost: boolean
    selectedPostId: string | null
    selectedAnomalyId: string | null
}
