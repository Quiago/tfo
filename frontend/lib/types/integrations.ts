// ─── Integration types ────────────────────────────────────────────────────────

export type IntegrationType = 'teams' | 'servicenow' | 'email'
export type TestStatus = 'ok' | 'failed' | null

export interface IntegrationConfig {
    id: string
    name: string
    type: IntegrationType
    is_active: boolean
    platform_mode: string
    created_at: string   // ISO datetime
    updated_at: string
    last_tested_at: string | null
    last_test_status: TestStatus
}

export interface IntegrationListOut {
    items: IntegrationConfig[]
    total: number
}

export interface IntegrationTestResult {
    integration_id: string
    success: boolean
    message: string
    tested_at: string
}

// ─── Create / Update payloads ─────────────────────────────────────────────────

export interface IntegrationCreate {
    name: string
    type: IntegrationType
    config: Record<string, unknown>
    is_active?: boolean
}

export interface IntegrationUpdate {
    name?: string
    config?: Record<string, unknown>
    is_active?: boolean
}

// ─── Per-type config shapes (for form rendering) ─────────────────────────────

export interface TeamsConfig {
    webhook_url: string
}

export interface ServiceNowConfig {
    instance_url: string
    username: string
    password: string
    default_assignment_group?: string
    default_caller_id?: string
}

export interface EmailConfig {
    host: string   // smtp.host.com:587
    username: string
    password: string
    from_addr?: string
    use_tls?: boolean
    recipients?: string[]
}
