'use client';

import { apiFetch, ApiError } from '@/lib/services/backend';
import { getStoredToken } from '@/lib/store/auth-store';
import type { Conversation, ChatMessage, StreamEvent, MemoryEntry } from '@/lib/types/chat';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
    return apiFetch<Conversation[]>('/chat/conversations');
}

export async function createConversation(params: {
    model_id: string;
    title?: string;
    system_prompt?: string;
}): Promise<Conversation> {
    return apiFetch<Conversation>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function deleteConversation(id: string): Promise<void> {
    await apiFetch<void>(`/chat/conversations/${id}`, { method: 'DELETE' });
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
    return apiFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`);
}

// ─── STREAMING ────────────────────────────────────────────────────────────────

export async function* streamMessage(
    conversationId: string,
    content: string,
    options: { max_new_tokens?: number; temperature?: number } = {},
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const token = getStoredToken();

    const res = await fetch(`${BASE_URL}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, stream: true, ...options }),
    });

    if (!res.ok) {
        if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('tfo_auth');
            window.location.reload();
        }
        throw new ApiError(res.status, `[${res.status}] POST /chat/conversations/${conversationId}/messages`);
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
                    yield JSON.parse(raw) as StreamEvent;
                } catch {
                    // skip malformed SSE line
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ─── MEMORY ───────────────────────────────────────────────────────────────────

export async function listMemories(): Promise<MemoryEntry[]> {
    return apiFetch<MemoryEntry[]>('/chat/memory');
}

export async function addMemory(content: string): Promise<MemoryEntry> {
    return apiFetch<MemoryEntry>('/chat/memory', {
        method: 'POST',
        body: JSON.stringify({ content }),
    });
}

export async function deleteMemory(id: number): Promise<void> {
    await apiFetch<void>(`/chat/memory/${id}`, { method: 'DELETE' });
}
