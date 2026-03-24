import { apiFetch } from '@/lib/services/backend'
import type {
    IntegrationConfig,
    IntegrationCreate,
    IntegrationListOut,
    IntegrationTestResult,
    IntegrationUpdate,
} from '@/lib/types/integrations'

export async function fetchIntegrations(): Promise<IntegrationListOut> {
    return apiFetch('/integrations')
}

export async function createIntegration(payload: IntegrationCreate): Promise<IntegrationConfig> {
    return apiFetch('/integrations', {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export async function updateIntegration(id: string, payload: IntegrationUpdate): Promise<IntegrationConfig> {
    return apiFetch(`/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    })
}

export async function deleteIntegration(id: string): Promise<void> {
    await apiFetch(`/integrations/${id}`, { method: 'DELETE' })
}

export async function testIntegration(id: string): Promise<IntegrationTestResult> {
    return apiFetch(`/integrations/${id}/test`, { method: 'POST' })
}
