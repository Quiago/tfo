# TFO Backend

FastAPI backend for TRIPOLAR Facility Operations. Provides real-time telemetry ingestion, industrial protocol connectors (OPC UA, MQTT, REST), LLM inference via vLLM, and JWT-based authentication.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | FastAPI (async) |
| Language | Python 3.12+ |
| ORM | SQLModel (SQLAlchemy + Pydantic) |
| Database | SQLite (dev/MVP) · PostgreSQL ready |
| Package Manager | uv |
| LLM Inference | vLLM |
| Industrial Protocol | asyncua (OPC UA) |
| Auth | JWT (HS256) + bcrypt |
| Container | Docker · NVIDIA CUDA 12.4 |
| Deployment | RunPod (GPU serverless) |

---

## Quick Start

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager
- (Optional) NVIDIA GPU with CUDA 12.4 for LLM features

### Development

```bash
cd backend

# Copy environment file
cp .env.example .env

# Install dependencies
uv sync

# Start API only
make dev

# Start API + OPC UA simulator together
make dev-all
```

Server runs at `http://localhost:8000`.
Interactive docs at `http://localhost:8000/docs`.

### Docker

```bash
docker build -t tripolar-backend .
docker run -p 8000:8000 --env-file .env tripolar-backend
```

For GPU support (RunPod/local NVIDIA):

```bash
docker run --gpus all -p 8000:8000 --env-file .env tripolar-backend
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

```env
# Database
DATABASE_URL=sqlite:///./tripolar.db          # Dev
# DATABASE_URL=sqlite:////runpod-volume/tripolar.db  # RunPod

# Auth
SECRET_KEY=<generate: openssl rand -hex 32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480               # 8 hours

# CORS
ALLOWED_ORIGINS=http://localhost:3000
ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app    # Preview deploys

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json                               # json | text
```

---

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app entry point, CORS, lifespan
│   ├── core/
│   │   ├── config.py              # Settings (pydantic_settings + .env)
│   │   └── logging.py             # Structured logging setup
│   ├── db/
│   │   └── engine.py              # SQLModel session factory + table registration
│   ├── models/
│   │   └── user.py                # User SQLModel
│   └── api/v1/
│       ├── router.py              # Route aggregator (includes all sub-routers)
│       ├── auth/                  # JWT authentication module
│       ├── connectors/            # Industrial protocol adapters
│       ├── telemetry/             # Time-series sensor data
│       ├── chat/                  # Conversation history
│       ├── llms/                  # LLM lifecycle management (vLLM)
│       ├── agent/                 # AI agent orchestration
│       ├── knowledge_base/        # Document upload + RAG
│       └── assets/                # Equipment inventory (auto-discovered)
├── simulator/                     # Python OPC UA test server
├── Dockerfile
├── Makefile
├── pyproject.toml
└── .env.example
```

---

## API Reference

All endpoints are under `/api/v1`. The API is versioned and fully documented at `/docs` (Swagger UI) and `/redoc`.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Get JWT access token |
| GET | `/auth/me` | Get current user profile |

**Login example:**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret"}'
# Returns: {"access_token": "eyJ...", "token_type": "bearer"}
```

All protected endpoints require the header:
```
Authorization: Bearer <access_token>
```

---

### Connectors

Industrial protocol adapters. Supports OPC UA, MQTT, REST, and MCP.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/connectors` | List all connectors |
| POST | `/connectors` | Register a new connector |
| GET | `/connectors/{id}` | Get connector details |
| PATCH | `/connectors/{id}` | Update connector config |
| DELETE | `/connectors/{id}` | Remove connector |
| POST | `/connectors/{id}/discover` | Browse address space (OPC UA) |
| POST | `/connectors/{id}/read` | Read a single value |
| POST | `/connectors/{id}/write` | Write a single value |
| GET | `/connectors/{id}/health` | Test connection |

**Create an OPC UA connector:**
```json
POST /api/v1/connectors
{
  "name": "Bosch Pump PLC",
  "type": "opcua",
  "endpoint": "opc.tcp://192.168.1.10:4840",
  "backend_config": {
    "security_mode": "None",
    "poll_interval_seconds": 5
  }
}
```

**Connector types:**

| Type | Protocol | Use Case |
|------|----------|----------|
| `opcua` | OPC UA (asyncua) | PLCs, SCADA, industrial controllers |
| `mqtt` | MQTT | IoT sensors, message brokers |
| `rest` | HTTP/JSON | External APIs, webhooks |
| `mcp` | Model Context Protocol | AI agent tool integration |

---

### Telemetry

Time-series sensor data collected from connectors.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/telemetry/readings/latest` | Latest value per signal |
| GET | `/telemetry/readings/history` | Raw readings (paginated) |
| GET | `/telemetry/stats` | Min/max/avg aggregations |
| GET | `/telemetry/timeline` | 4-channel normalized chart data |
| GET | `/telemetry/timeline/signals` | Multi-signal downsampled data |

**Timeline query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `minutes` | `60` | Time window in minutes |
| `max_points` | `500` | Max data points (downsampled) |
| `connector_id` | — | Filter by connector |

**Response format (TimelinePoint):**
```json
{
  "timestamp": "2025-03-16T14:30:00Z",
  "signal_id": "ns=2;s=Pump1.Temperature",
  "display_name": "Pump 1 Temperature",
  "value": 72.4,
  "normalized": 0.63,
  "unit": "°C"
}
```

The `normalized` field maps raw values to 0–100 scale for multi-channel chart display.

---

### LLMs

Manages local LLM inference via vLLM on GPU.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/llms/health` | GPU/RAM status + loaded model info |
| POST | `/llms/load` | Load a model from HuggingFace |

**Supported models:**

| Model | VRAM | Context | Notes |
|-------|------|---------|-------|
| `mistralai/Mistral-7B-Instruct-v0.3-AWQ` | ~5 GB | 8K | Fast, good for structured output |
| `meta-llama/Llama-3.1-8B-Instruct-AWQ` | ~6 GB | 8K | Balanced quality/speed |
| `Qwen/Qwen3-8B-AWQ` | ~10 GB | 32K | Best reasoning, recommended |

**Health response:**
```json
{
  "status": "ready",
  "model": "Qwen/Qwen3-8B-AWQ",
  "gpu_memory_free_gb": 14.2,
  "context_length": 32768
}
```

---

### Assets

Equipment inventory auto-discovered from connector address spaces.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assets` | List all discovered equipment |
| GET | `/assets/{id}` | Get asset details |

---

### Knowledge Base

Document storage for RAG (Retrieval-Augmented Generation).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/knowledge-base/documents` | Upload document (PDF, DOCX, XLSX, PPTX) |
| GET | `/knowledge-base/documents` | List documents |
| POST | `/knowledge-base/query` | Semantic search query |

---

### System / Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness probe (RunPod) |
| GET | `/metrics/last-request-seconds-ago` | Idle time (for auto-shutdown) |

---

## Database Schema

```sql
-- Auth
users (id, email, hashed_password, is_active, created_at)

-- Connectors
connectors (id, name, type, endpoint, backend_config JSON, is_active, created_at)

-- Telemetry (time-series, indexed)
telemetry_reading (id, connector_id, signal_id, display_name, value, unit, recorded_at)
  INDEX: (signal_id, recorded_at)
  INDEX: (connector_id, recorded_at)

-- Chat
chat (id, user_id, role, content, created_at)

-- Assets
assets (id, connector_id, node_id, type, display_name, metadata JSON, created_at)

-- Knowledge Base
documents (id, filename, content TEXT, embeddings BLOB, created_at)
```

---

## Background Tasks

The app starts two background tasks at startup (see `main.py` lifespan):

**Telemetry Poller** — polls all active connectors every N seconds and persists readings to `telemetry_reading`. Uses a thread pool to avoid blocking the event loop.

**Startup Backfill** — on first run, pre-populates the DB with synthetic telemetry history (1 year) so charts are immediately populated without waiting for real data.

---

## Connector Architecture

Connectors use a **dispatcher pattern** — the service layer selects the correct backend implementation at runtime:

```
POST /connectors/{id}/read
    └─ ConnectorService._get_backend(connector)
        └─ Registry lookup by connector.type
            ├─ OPCUAConnector (asyncua)
            ├─ MQTTConnector
            ├─ RESTConnector
            └─ MCPConnector
```

To add a new protocol, implement `ConnectorBackend` (abstract class in `backends/base.py`) and register it in the `_REGISTRY` dict.

---

## Testing

```bash
# Run all tests
make test

# Run with coverage
uv run pytest --cov=app tests/

# Lint
make lint
```

Tests are in `/tests/` and mirror the app structure (`tests/api/v1/auth/`, etc.).

---

## Deployment (RunPod)

1. Build and push Docker image:
   ```bash
   docker build -t your-registry/tripolar-backend:latest .
   docker push your-registry/tripolar-backend:latest
   ```

2. Create RunPod serverless endpoint:
   - Template: your pushed image
   - GPU: RTX 3090 / A6000 (24 GB VRAM recommended)
   - Ports: `8000/http`
   - Volume: `/runpod-volume` for DB persistence

3. Set environment variables in RunPod UI:
   ```
   DATABASE_URL=sqlite:////runpod-volume/tripolar.db
   SECRET_KEY=<your-secret>
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```

4. RunPod provides a public HTTPS proxy URL (`abc123.proxy.runpod.net`). Set this as `NEXT_PUBLIC_API_URL` in the frontend.

**Idle auto-shutdown:** `auto_stop.sh` polls `/metrics/last-request-seconds-ago`. If idle > 10 minutes, the pod terminates to save GPU costs.

---

## Development Commands

```bash
make dev          # Start FastAPI (port 8000)
make dev-all      # Start FastAPI + OPC UA simulator
make test         # pytest
make lint         # ruff check
```
