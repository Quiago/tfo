import { BASE_URL, apiFetch, ApiError } from '@/lib/services/backend'
import { getStoredToken } from '@/lib/store/auth-store'
import type {
    AlarmEvent,
    DispatchRule,
    DispatchStreamEvent,
    EventListOut,
    ExecutionListOut,
    RuleCreate,
    RuleListOut,
    RuleUpdate,
} from '@/lib/types/dispatcher'

export type EventIn = {
    source_connector_id?: string | null
    severity?: AlarmEvent['severity']
    category?: AlarmEvent['category']
    asset_id?: string | null
    title: string
    raw_payload?: Record<string, unknown>
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

/**
 * Opens an authenticated SSE connection to the given path and yields
 * parsed event objects.  Caller is responsible for aborting via AbortSignal.
 */
export async function* openEventStream(
    path: string,
    signal?: AbortSignal,
): AsyncGenerator<DispatchStreamEvent> {
    const token = getStoredToken()
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
    })
    if (!res.ok || !res.body) throw new ApiError(res.status, path)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    yield JSON.parse(line.slice(6)) as DispatchStreamEvent
                } catch { /* skip malformed */ }
            }
        }
    }
}

/**
 * POST an event and consume the SSE processing stream as an async generator.
 */
export async function* ingestEvent(
    payload: EventIn,
    signal?: AbortSignal,
): AsyncGenerator<DispatchStreamEvent> {
    const token = getStoredToken()
    const res = await fetch(`${BASE_URL}/dispatcher/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal,
    })
    if (!res.ok || !res.body) throw new ApiError(res.status, '/dispatcher/events')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    yield JSON.parse(line.slice(6)) as DispatchStreamEvent
                } catch { /* skip malformed */ }
            }
        }
    }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function fetchEvents(params?: {
    page?: number
    page_size?: number
    severity?: string
    category?: string
    status?: string
}): Promise<EventListOut> {
    const qs = new URLSearchParams()
    if (params?.page)       qs.set('page',      String(params.page))
    if (params?.page_size)  qs.set('page_size', String(params.page_size))
    if (params?.severity)   qs.set('severity',  params.severity)
    if (params?.category)   qs.set('category',  params.category)
    if (params?.status)     qs.set('status',    params.status)
    const query = qs.toString() ? `?${qs}` : ''
    return apiFetch(`/dispatcher/events${query}`)
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function fetchRules(): Promise<RuleListOut> {
    return apiFetch('/dispatcher/rules')
}

export async function createRule(payload: RuleCreate): Promise<DispatchRule> {
    return apiFetch('/dispatcher/rules', {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export async function updateRule(ruleId: string, payload: RuleUpdate): Promise<DispatchRule> {
    return apiFetch(`/dispatcher/rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    })
}

export async function deleteRule(ruleId: string): Promise<void> {
    await apiFetch(`/dispatcher/rules/${ruleId}`, { method: 'DELETE' })
}

// ─── Executions ───────────────────────────────────────────────────────────────

export async function fetchExecutions(params?: {
    page?: number
    page_size?: number
    rule_id?: string
    event_id?: string
}): Promise<ExecutionListOut> {
    const qs = new URLSearchParams()
    if (params?.page)      qs.set('page',     String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    if (params?.rule_id)   qs.set('rule_id',  params.rule_id)
    if (params?.event_id)  qs.set('event_id', params.event_id)
    const query = qs.toString() ? `?${qs}` : ''
    return apiFetch(`/dispatcher/executions${query}`)
}
