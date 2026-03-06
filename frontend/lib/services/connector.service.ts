import { apiFetch } from './backend';
import type { ConnectorCreate, ConnectorResponse, DataResponse, DiscoveryResponse } from '@/lib/types/connector';

export async function createConnector(data: ConnectorCreate): Promise<ConnectorResponse> {
  return apiFetch<ConnectorResponse>('/connectors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listConnectors(): Promise<ConnectorResponse[]> {
  return apiFetch<ConnectorResponse[]>('/connectors');
}

export async function discoverConnector(connectorId: string): Promise<DiscoveryResponse> {
  return apiFetch<DiscoveryResponse>(
    `/connectors/${encodeURIComponent(connectorId)}/discover`,
    { method: 'POST' },
  );
}

export async function readConnectorNode(
  connectorId: string,
  path: string,
): Promise<DataResponse> {
  return apiFetch<DataResponse>(
    `/connectors/${encodeURIComponent(connectorId)}/read`,
    {
      method: 'POST',
      body: JSON.stringify({ path, params: {} }),
    },
  );
}
