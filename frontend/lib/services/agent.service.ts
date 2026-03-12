'use client';

import { BASE_URL } from '@/lib/services/backend';
import { ApiError } from '@/lib/services/backend';
import { getStoredToken } from '@/lib/store/auth-store';
import type { ScreenContextState } from '@/lib/store/screen-context-store';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentScreenContext {
    active_module: string;
    selected_team_id: string | null;
    selected_team_name: string | null;
    active_connector_id: string | undefined;
    granularity: string | null;
    date_range_start: number | null;
    date_range_end: number | null;
    summary: string;
}

export interface AgentRunRequest {
    prompt: string;
    screen_context: AgentScreenContext;
    max_steps?: number;
    max_tool_calls?: number;
}

export interface UIAction {
    type: 'navigate' | 'highlight_range' | 'focus_asset' | 'show_notification';
    payload: Record<string, unknown>;
}

export type AgentStreamEvent =
    | { type: 'plan';        plan: string[];  next_step: string }
    | { type: 'tool_call';   tool_name: string; tool_args: Record<string, unknown> }
    | { type: 'tool_result'; tool_name: string; tool_result_preview: string }
    | { type: 'thinking';    content: string }
    | { type: 'token';       content: string }
    | { type: 'ui_action';   ui_action: UIAction }
    | { type: 'done';        steps_taken: number; tool_calls_made: number; ui_actions: UIAction[] }
    | { type: 'error';       error: string };

// ── Screen context serialiser ─────────────────────────────────────────────────

/**
 * Converts the Zustand ScreenContextState into the flat shape the backend expects.
 * Call this right before submitting an agent request so the context is always fresh.
 */
export function serialiseScreenContext(ctx: ScreenContextState): AgentScreenContext {
    return {
        active_module:      ctx.activeModule,
        selected_team_id:   ctx.selectedTeamId,
        selected_team_name: ctx.selectedTeamName,
        active_connector_id: ctx.activeConnectorId,
        granularity:        ctx.granularity,
        date_range_start:   ctx.dateRange?.start ?? null,
        date_range_end:     ctx.dateRange?.end   ?? null,
        summary:            ctx.getAIContextSummary(),
    };
}

// ── SSE streaming runner ──────────────────────────────────────────────────────

/**
 * Runs the agent and yields SSE events one by one.
 * Mirrors the streamMessage pattern from chat.service.ts for drop-in reuse.
 */
export async function* runAgent(
    request: AgentRunRequest,
    signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
    const token = getStoredToken();

    const res = await fetch(`${BASE_URL}/agent/run`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
    });

    if (!res.ok) {
        if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('tfo_auth');
            window.location.reload();
        }
        throw new ApiError(res.status, `[${res.status}] POST /agent/run`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                    yield JSON.parse(raw) as AgentStreamEvent;
                } catch {
                    // skip malformed SSE line
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
