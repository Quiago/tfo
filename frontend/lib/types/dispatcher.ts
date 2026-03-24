// ─── Shared enums ────────────────────────────────────────────────────────────

export type AlarmSeverity = 'info' | 'warning' | 'critical' | 'emergency'
export type AlarmCategory = 'power' | 'cooling' | 'network' | 'security' | 'env' | 'general'
export type EventStatus   = 'pending' | 'matched' | 'no_match' | 'executing' | 'completed' | 'failed' | 'suppressed'
export type RuleOperator  = 'AND' | 'OR'
export type ConditionType = 'severity_gte' | 'contains' | 'threshold' | 'asset_tag' | 'connector_id'
export type ThresholdOp   = 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
export type ActionType    = 'log_only' | 'create_work_order' | 'send_teams' | 'create_servicenow_incident' | 'send_email'
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed'

// ─── Events ───────────────────────────────────────────────────────────────────

export interface AlarmEvent {
    id: string
    source_connector_id: string | null
    severity: AlarmSeverity
    category: AlarmCategory
    asset_id: string | null
    title: string
    raw_payload: Record<string, unknown>
    enriched: Record<string, unknown>
    status: EventStatus
    platform_mode: string
    received_at: string  // ISO datetime
}

export interface EventListOut {
    items: AlarmEvent[]
    total: number
    page: number
    page_size: number
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export interface ConditionItem {
    type: ConditionType
    field?: string
    operator?: ThresholdOp
    value: unknown
}

export interface RuleConditions {
    operator: RuleOperator
    items: ConditionItem[]
}

export interface RuleAction {
    type: ActionType
    config: Record<string, unknown>
}

export interface DispatchRule {
    id: string
    name: string
    description: string
    platform_mode: string
    conditions: RuleConditions
    actions: RuleAction[]
    enabled: boolean
    priority: number
    suppression_window_secs: number
    created_by: number | null
    created_at: string
    updated_at: string
}

export interface RuleListOut {
    items: DispatchRule[]
    total: number
}

export type RuleCreate = Omit<DispatchRule, 'id' | 'platform_mode' | 'created_by' | 'created_at' | 'updated_at'>
export type RuleUpdate = Partial<RuleCreate>

// ─── Executions ───────────────────────────────────────────────────────────────

export interface DispatchExecution {
    id: string
    rule_id: string
    event_id: string
    started_at: string
    completed_at: string | null
    status: ExecutionStatus
    action_results: Record<string, unknown>[]
    error_detail: string | null
}

export interface ExecutionListOut {
    items: DispatchExecution[]
    total: number
    page: number
    page_size: number
}

// ─── SSE stream event shapes ──────────────────────────────────────────────────

export type DispatchStreamEvent =
    | { type: 'event_received';    event_id: string; title: string }
    | { type: 'no_rules_matched';  event_id: string }
    | { type: 'rules_matched';     event_id: string; rule_count: number; rules: { id: string; name: string }[] }
    | { type: 'execution_started'; execution_id: string; rule_name: string }
    | { type: 'action_completed';  action_type: string; result: Record<string, unknown> }
    | { type: 'action_error';      action_type: string; error: string }
    | { type: 'execution_completed'; execution_id: string; rule_name: string }
    | { type: 'execution_failed';  execution_id: string; rule_name: string }
    | { type: 'done';              event_id: string; status: EventStatus }
    | { type: 'new_event';         event: AlarmEvent }

// ─── Simulator ────────────────────────────────────────────────────────────────

export interface SimulatedEventTemplate {
    label: string
    severity: AlarmSeverity
    category: AlarmCategory
    title: string
    raw_payload: Record<string, unknown>
}
