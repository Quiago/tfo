export type ConnectorType = 'opcua' | 'mqtt' | 'rest';

export interface ConnectorCreate {
  id: string;
  name: string;
  type: ConnectorType;
  endpoint: string;
  backend_config?: Record<string, unknown>;
}

export interface ConnectorResponse {
  id: string;
  name: string;
  type: ConnectorType;
  endpoint: string;
  backend_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  node_mappings: Record<string, unknown>[] | null;
  energy_mappings: Record<string, unknown>[] | null;
}

export interface NodeInfoResponse {
  node_id: string;
  display_name: string;
  path: string[];
  data_type: string;
  writable: boolean;
  unit: string | null;
  description: string | null;
}

export interface DiscoveryResponse {
  connector_id: string;
  node_count: number;
  cached: boolean;
  nodes: NodeInfoResponse[];
}

/** Backend wraps OPC-UA read results in this envelope */
export interface DataResponse {
  connector_id: string;
  path: string;
  data: unknown;
}

/** Shape of `data` field when the connector is OPC-UA */
export interface OpcUaReadValue {
  node_id: string;
  value: number | string | null;
  status_code: string;
  source_timestamp: string | null;
}

export interface BatchReadItem {
  node_id: string;
  value: number | string | boolean | null;
  data_type: string | null;
  status: string | null;
  source_timestamp: string | null;
  error: string | null;
}

export interface BatchReadResponse {
  connector_id: string;
  results: BatchReadItem[];
}
