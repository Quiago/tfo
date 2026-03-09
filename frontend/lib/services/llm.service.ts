import { apiFetch } from '@/lib/services/backend';
import type { ModelCatalog } from '@/lib/types/chat';

export async function getModelCatalog(): Promise<ModelCatalog> {
    return apiFetch<ModelCatalog>('/llms/catalog');
}

export async function getCurrentModel(): Promise<{ model_id: string | null }> {
    return apiFetch<{ model_id: string | null }>('/llms/current');
}

export async function loadModel(modelId: string): Promise<{ status: string; model_id: string }> {
    return apiFetch<{ status: string; model_id: string }>('/llms/load', {
        method: 'POST',
        body: JSON.stringify({ model_id: modelId }),
    });
}
