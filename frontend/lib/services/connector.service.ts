import { apiFetch } from './backend';
import type { BatchReadResponse, ConnectorCreate, ConnectorResponse, DataResponse, DiscoveryResponse } from '@/lib/types/connector';

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

export async function getConnector(connectorId: string): Promise<ConnectorResponse> {
  return apiFetch<ConnectorResponse>(`/connectors/${encodeURIComponent(connectorId)}`);
}

export async function saveNodeMappings(
  connectorId: string,
  node_mappings: object[],
  energy_mappings: object[],
): Promise<ConnectorResponse> {
  return apiFetch<ConnectorResponse>(
    `/connectors/${encodeURIComponent(connectorId)}/node-mappings`,
    {
      method: 'PATCH',
      body: JSON.stringify({ node_mappings, energy_mappings }),
    },
  );
}

export async function readConnectorBatch(
  connectorId: string,
  nodeIds: string[],
): Promise<BatchReadResponse> {
  return apiFetch<BatchReadResponse>(
    `/connectors/${encodeURIComponent(connectorId)}/read-batch`,
    {
      method: 'POST',
      body: JSON.stringify({ node_ids: nodeIds }),
    },
  );
}
