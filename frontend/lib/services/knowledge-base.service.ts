import { apiFetch, ApiError, BASE_URL } from '@/lib/services/backend';
import { getStoredToken } from '@/lib/store/auth-store';
import type { KBDocument } from '@/lib/types/chat';

export async function listDocuments(): Promise<KBDocument[]> {
    return apiFetch<KBDocument[]>('/knowledge-base/documents');
}

export async function uploadDocument(file: File, title: string): Promise<KBDocument> {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    // Do NOT set Content-Type — browser sets it with the correct multipart boundary
    const res = await fetch(`${BASE_URL}/knowledge-base/documents`, {
        method: 'POST',
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
    });

    if (!res.ok) {
        if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('tfo_auth');
            window.location.reload();
        }
        throw new ApiError(res.status, `[${res.status}] POST /knowledge-base/documents`);
    }

    return res.json() as Promise<KBDocument>;
}

export async function deleteDocument(id: string): Promise<void> {
    await apiFetch<void>(`/knowledge-base/documents/${id}`, { method: 'DELETE' });
}
