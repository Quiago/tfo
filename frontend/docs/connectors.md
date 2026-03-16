# Connectors & API Services

## Purpose

The `lib/services/` layer is the single interface between the frontend and backend. All HTTP calls go through a shared `apiFetch` wrapper that handles authentication, error typing, and session expiration automatically.

No component or hook should ever call `fetch()` directly.

---

## apiFetch (`lib/services/backend.ts`)

The core HTTP utility. Every service file uses this.

```typescript
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T>
```

**What it does automatically:**
- Reads `NEXT_PUBLIC_API_URL` for the base URL
- Reads the JWT token from `auth-store` and injects `Authorization: Bearer <token>`
- On **401** response: clears the token from localStorage and reloads the page (forces login)
- On non-2xx: throws `ApiError(status, message)`

**ApiError:**
```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) { super(message) }
}
```

**Usage example:**
```typescript
import { apiFetch, ApiError } from '@/lib/services/backend'

try {
  const data = await apiFetch<TelemetryPoint[]>('/telemetry/timeline?minutes=60')
} catch (e) {
  if (e instanceof ApiError && e.status === 404) {
    // handle not found
  }
}
```

---

## Service Files

Each module has its own service file that wraps `apiFetch` with typed functions.

### auth.service.ts

```typescript
// POST /auth/login → returns JWT token
login(email: string, password: string): Promise<{ access_token: string }>

// POST /auth/register
register(email: string, password: string): Promise<User>

// GET /auth/me → current user
getMe(): Promise<User>
```

### telemetry.service.ts

```typescript
// GET /telemetry/timeline
getTimeline(params: { minutes?: number; maxPoints?: number; connectorId?: string }): Promise<TimelinePoint[]>

// GET /telemetry/readings/latest
getLatestReadings(params?: { connectorId?: string }): Promise<LatestReading[]>

// GET /telemetry/stats
getStats(signalId: string, minutes?: number): Promise<TelemetryStats>
```

### connector.service.ts

```typescript
// CRUD
listConnectors(): Promise<Connector[]>
getConnector(id: string): Promise<Connector>
createConnector(data: CreateConnectorDTO): Promise<Connector>
updateConnector(id: string, data: Partial<CreateConnectorDTO>): Promise<Connector>
deleteConnector(id: string): Promise<void>

// Actions
discoverConnector(id: string): Promise<DiscoveryResult>
readValue(id: string, nodeId: string): Promise<ReadResult>
writeValue(id: string, nodeId: string, value: unknown): Promise<void>
checkHealth(id: string): Promise<ConnectorHealth>
```

### llm.service.ts

```typescript
// GET /llms/health
getLlmHealth(): Promise<LlmHealth>

// POST /llms/load
loadModel(modelId: string): Promise<void>
```

### chat.service.ts

```typescript
sendMessage(content: string, history: Message[]): Promise<Message>
getChatHistory(): Promise<Message[]>
```

### knowledge-base.service.ts

```typescript
uploadDocument(file: File): Promise<Document>
listDocuments(): Promise<Document[]>
queryKnowledgeBase(query: string): Promise<SearchResult[]>
```

---

## Connector Types

The backend supports 4 protocol backends. The frontend sends a `type` field when creating a connector:

| Type | Protocol | `backend_config` Fields |
|------|----------|------------------------|
| `opcua` | OPC UA | `security_mode`, `poll_interval_seconds` |
| `mqtt` | MQTT | `broker_url`, `topic_filter`, `qos` |
| `rest` | HTTP/JSON | `method`, `headers`, `auth_header` |
| `mcp` | Model Context Protocol | `server_url`, `tool_name` |

**Create connector example:**
```typescript
import { createConnector } from '@/lib/services/connector.service'

const connector = await createConnector({
  name: 'Production Line PLC',
  type: 'opcua',
  endpoint: 'opc.tcp://192.168.1.10:4840',
  backend_config: {
    security_mode: 'None',
    poll_interval_seconds: 5
  }
})
```

---

## TypeScript Interfaces (`lib/types/connector.ts`)

```typescript
export interface Connector {
  id: string
  name: string
  type: 'opcua' | 'mqtt' | 'rest' | 'mcp'
  endpoint: string
  backend_config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface DiscoveryResult {
  nodes: {
    node_id: string
    display_name: string
    data_type: string
    value?: unknown
  }[]
}

export interface ConnectorHealth {
  connected: boolean
  latency_ms?: number
  error?: string
}
```

---

## Error Handling Pattern

Use `ApiError` to distinguish network vs. application errors:

```typescript
import { apiFetch, ApiError } from '@/lib/services/backend'

async function loadData() {
  try {
    return await apiFetch<SomeType>('/some/endpoint')
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) return  // apiFetch already reloads
      if (e.status === 503) {
        showToast('Backend is starting up, please wait...')
        return
      }
      console.error(`API error ${e.status}: ${e.message}`)
    } else {
      console.error('Network error:', e)
    }
    return null
  }
}
```

---

## Demo Mode

When `NEXT_PUBLIC_DEV_MODE=true`, some services skip the RunPod wake-up probe and return mock data immediately. This is controlled in `lib/hooks/useDemoMode.ts`.

Set `NEXT_PUBLIC_MOCK_DATA_MODE=true` to bypass all API calls entirely and use static mock data from hooks like `useWorkflowMockData` and `useMockData`.
