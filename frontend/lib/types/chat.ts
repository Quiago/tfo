// ─── CONVERSATION ─────────────────────────────────────────────────────────────

export interface Conversation {
    id: string
    user_id: number
    title: string | null
    model_id: string
    system_prompt: string | null
    max_context_messages: number
    created_at: string
    updated_at: string
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export interface ToolCallEntry {
    name: string
    arguments?: Record<string, unknown>
    result?: string
}

export interface ChatMessage {
    id: string
    conversation_id: string
    role: 'user' | 'assistant'
    content: string
    tool_calls: ToolCallEntry[] | null
    created_at: string
}

/** Local message state — used in the UI (may have streaming flag) */
export interface LocalMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    tool_calls?: ToolCallEntry[]
    thinking?: string
    created_at: string
    streaming?: boolean
    /** Agent mode: plan steps shown before the answer */
    agent_plan?: string[]
    /** Agent mode: UI actions returned in the final step */
    agent_ui_actions?: import('@/lib/services/agent.service').UIAction[]
}

// ─── SSE EVENTS ───────────────────────────────────────────────────────────────

export interface StreamEvent {
    type: 'token' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error'
    content?: string
    name?: string
    arguments?: Record<string, unknown>
    result_preview?: string
    message_id?: string
    conversation_id?: string
    error?: string
}

// ─── LLM CATALOG ─────────────────────────────────────────────────────────────

export interface ModelInfo {
    id: string
    display_name: string
    description: string
    context_length: number
    memory_required_gb: number
    supports_tools: boolean
    quantization: string | null
    is_loaded: boolean
}

export interface ModelCatalog {
    models: ModelInfo[]
    default_model: string
    current_model: string | null
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────

export interface KBDocument {
    id: string
    title: string
    filename: string
    mime_type: string
    chunk_count: number
    uploaded_by: string
    created_at: string
}

// ─── MEMORY ───────────────────────────────────────────────────────────────────

export interface MemoryEntry {
    id: number
    user_id: number
    content: string
    created_at: string
}
