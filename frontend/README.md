# TFO Frontend

Next.js dashboard for TRIPOLAR Facility Operations. Voice-first, mobile-first industrial workflow platform for frontline workers.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16+ (App Router) |
| Language | TypeScript 5.9+ (strict mode) |
| Styling | Tailwind CSS v4 |
| State | Zustand 5 + Immer |
| Charts | Recharts 3 · Lightweight Charts |
| Workflow | React Flow 11 |
| 3D | React Three Fiber + Three.js |
| Icons | Lucide React |
| Validation | Zod |
| Testing | Vitest |

---

## Quick Start

### Prerequisites

- Node.js 18+

### Development

```bash
cd frontend

# Copy environment file
cp .env.example .env.local

# Install dependencies
npm install

# Start dev server
npm run dev
```

App runs at `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Feature flags
NEXT_PUBLIC_ENABLE_3D_CANVAS=true
NEXT_PUBLIC_ENABLE_REAL_TIME_STREAMING=true
NEXT_PUBLIC_MOCK_DATA_MODE=true           # Use mock data without backend
NEXT_PUBLIC_DEV_MODE=true                 # Skip RunPod wake-up in dev

# Timeline
NEXT_PUBLIC_TIMELINE_STREAMING_INTERVAL=15000   # ms between data updates
NEXT_PUBLIC_CHART_ANIMATION_ENABLED=true
```

Set `NEXT_PUBLIC_DEV_MODE=false` and `NEXT_PUBLIC_MOCK_DATA_MODE=false` for production to connect to the live backend.

---

## Project Structure

```
frontend/
├── app/                          # Next.js App Router (pages & layouts only)
│   ├── page.tsx                 # Main dashboard (auth guard + module router)
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles + Recharts overrides
│   └── playground/              # Component isolation testing
│       ├── timeline/            # → /playground/timeline
│       ├── workflow-builder/    # → /playground/workflow-builder
│       └── fithub/              # → /playground/fithub
│
├── components/                  # UI components (no business logic)
│   ├── ui/                     # Atomic design system (buttons, badges, etc.)
│   ├── auth/
│   │   └── AuthScreen.tsx      # Login form
│   ├── layout/
│   │   └── Navbar.tsx          # Top navigation bar
│   ├── timeline/
│   │   └── Timeline.tsx        # 4-channel sensor chart
│   ├── workflow-builder/       # OpsFlow node editor (desktop + mobile)
│   ├── digital-twin/           # 3D factory scene (Three.js + R3F)
│   ├── opshub/                 # Work order management
│   ├── overview/               # Facility KPIs, alerts, metrics
│   ├── asset-details/          # Equipment detail panel
│   ├── updates/                # System updates feed
│   └── shared/                 # Reusable UI (MentionInput, UserAvatar, etc.)
│
├── lib/                         # All business logic (no JSX)
│   ├── types/                  # TypeScript interfaces (source of truth)
│   │   ├── tfo.ts             # Module, metrics, alerts
│   │   ├── workflow.ts        # Node types, workflow definitions
│   │   ├── timeline.ts        # Sensor data, chart config
│   │   ├── connector.ts       # Connector metadata
│   │   ├── opshub.ts          # Work orders, assignments
│   │   └── chat.ts            # Message history
│   ├── store/                  # Zustand stores (persisted)
│   │   ├── auth-store.ts      # JWT token + email
│   │   ├── tfo-store.ts       # Active module, metrics, alerts
│   │   ├── workflow-store.ts  # Canvas state, nodes, edges
│   │   ├── timeline-store.ts  # Zoom level, visible range
│   │   ├── opshub-store.ts    # Work orders, selected task
│   │   └── screen-context-store.ts  # Screen metadata for AI context
│   ├── hooks/                  # Custom React hooks
│   │   ├── useConnectorTimeline.ts  # Fetch telemetry from API
│   │   ├── useTimeline.ts          # Zoom/pan logic
│   │   ├── useWorkflowMockData.ts  # Demo workflows
│   │   ├── useMediaQuery.ts        # Responsive breakpoints
│   │   └── useDemoMode.ts          # Dev mode toggle
│   ├── services/               # HTTP clients
│   │   ├── backend.ts         # apiFetch wrapper + ApiError
│   │   ├── auth.service.ts
│   │   ├── telemetry.service.ts
│   │   ├── connector.service.ts
│   │   ├── llm.service.ts
│   │   ├── chat.service.ts
│   │   └── knowledge-base.service.ts
│   └── validators/             # Zod schemas
│       └── workflow.validators.ts
│
└── docs/                        # Component documentation
    ├── README.md               # Documentation index
    ├── timeline.md
    ├── workflow-builder.md
    └── fithub.md
```

---

## Features

### Overview Dashboard

Facility-level monitoring at a glance:
- Real-time KPIs (uptime, efficiency, active alerts)
- Alert feed (warning / critical severity)
- Recent workflow activity
- Quick actions

### Timeline (Sensor Telemetry)

4-channel time-series visualization of industrial sensor data:
- Temperature, vibration, pressure, humidity
- 80% historical (solid) + 20% predictive (dashed)
- Zoom levels: minute → hour → day → week → year
- Pan navigation with real-time streaming
- Backed by `/api/v1/telemetry/timeline` with DB-level downsampling

See [`docs/timeline.md`](./docs/timeline.md) for full component docs.

### Workflow Builder (OpsFlow)

Visual workflow editor for industrial automation:
- **Desktop:** React Flow canvas with drag-drop node palette
- **Mobile:** Sequential card view optimized for glove-friendly touch
- **Voice Input:** Speak a workflow → AI generates nodes → user confirms
- 19 node types: triggers, conditions, inputs, actions, utilities
- Freemium gating per node (free / pro / enterprise)

See [`docs/workflow-builder.md`](./docs/workflow-builder.md) for full component docs.

### Digital Twin

3D interactive factory scene:
- Three.js + React Three Fiber scene with camera presets
- Clickable equipment hotspots with real-time metric overlays
- `MiniDigitalTwin` for embedded sidebar view
- `MachineInspector` for detailed equipment properties

See [`docs/digital-twin.md`](./docs/digital-twin.md) for full component docs.

### OpsHub (Work Orders)

Task and work order management:
- Work order list with status tracking (pending / in-progress / completed)
- Assignment and priority management
- Integration-ready with Jira, ServiceNow (via connectors)

### Fithub (Cross-Facility Learning)

GitHub-inspired knowledge sharing:
- AI-detected anomaly feed with approve/reject/investigate
- Cross-facility solution sharing (when Munich solves a problem, all plants learn)
- Workflow repository with stars and forks
- Changelog timeline of facility updates

See [`docs/fithub.md`](./docs/fithub.md) for full component docs.

---

## State Management

All state is managed with Zustand. Stores use the `persist` middleware to survive page refreshes.

```typescript
// Pattern used across all stores
export const useXStore = create<XState>()(
  persist(
    (set, get) => ({ ...initialState, ...actions }),
    { name: 'x_store', partialize: (s) => ({ /* fields to persist */ }) }
  )
)
```

| Store | Persisted | Contents |
|-------|-----------|----------|
| `auth-store` | Yes | JWT token, email |
| `tfo-store` | Yes | Active module, metrics |
| `workflow-store` | Yes | Canvas nodes, edges, mode |
| `timeline-store` | Yes | Zoom level, visible range |
| `opshub-store` | No | Work orders, selected task |
| `screen-context-store` | No | Screen bounds, AI context |

---

## HTTP Layer

All API calls go through `apiFetch()` in `lib/services/backend.ts`:

```typescript
// Auto-injects Authorization header
// Throws ApiError on non-2xx
// 401 → clears token → reloads to login
const data = await apiFetch<TelemetryPoint[]>('/telemetry/timeline?minutes=60')
```

Services are thin wrappers around `apiFetch`:

```typescript
// lib/services/telemetry.service.ts
export async function getTimeline(minutes = 60): Promise<TimelinePoint[]> {
  return apiFetch(`/telemetry/timeline?minutes=${minutes}`)
}
```

---

## Architecture Principles

**1. Headless Components** — Logic lives in hooks, components only render. A component should have no `useState` for business logic — that belongs in a hook or store.

**2. Mock Data First** — Every complex component works standalone without a backend. Use `NEXT_PUBLIC_MOCK_DATA_MODE=true` to develop UI independently.

**3. Type Safety** — TypeScript strict mode, no `any`. All shared interfaces live in `lib/types/`. Zod validates all external data.

**4. Responsive / Dual-Mode** — Desktop and mobile share the same Zustand store; only the view layer switches. Detect with `useMediaQuery('(max-width: 768px)')`.

**5. Performance** — `useMemo`/`useCallback` for chart transforms. `React.memo` for list items. Dynamic imports for heavy components (3D canvas, workflow editor).

---

## Development Scripts

```bash
npm run dev          # Next.js dev server (port 3000, Turbopack)
npm run build        # Production build
npm start            # Production server
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm test             # Vitest (run once)
npm run test:watch   # Vitest watch mode
```

---

## Adding a New Feature

Follow the Definition of Done:

1. **Types** → `lib/types/[feature].ts`
2. **Hook** → `lib/hooks/use[Feature].ts` (with mock data support)
3. **Component** → `components/[feature]/[Feature].tsx`
4. **Playground** → `app/playground/[feature]/page.tsx`
5. **Docs** → `docs/[feature].md` (Purpose, Props, Examples)
6. **Changelog** → `CHANGELOG.md` entry

---

## Documentation

- [Timeline](./docs/timeline.md) — 4-channel sensor chart
- [Workflow Builder](./docs/workflow-builder.md) — OpsFlow node editor
- [Digital Twin](./docs/digital-twin.md) — 3D factory scene
- [Fithub](./docs/fithub.md) — Cross-facility knowledge sharing
- [API Services](./docs/connectors.md) — HTTP layer and connector integration
- [All Docs Index](./docs/README.md)

---

## Deployment (Vercel)

1. Push to `main` branch — Vercel auto-deploys.
2. Set environment variable in Vercel dashboard:
   ```
   NEXT_PUBLIC_API_URL=https://abc123.proxy.runpod.net/api/v1
   NEXT_PUBLIC_DEV_MODE=false
   NEXT_PUBLIC_MOCK_DATA_MODE=false
   ```
3. CORS: make sure `ALLOWED_ORIGINS` on the backend includes your Vercel URL.

---

## Troubleshooting

**Port 3000 in use:**
```bash
npm run dev -- -p 3001
```

**Type errors:**
```bash
npm run type-check
```

**Stale build cache:**
```bash
rm -rf .next node_modules
npm install && npm run build
```

**Charts not rendering in production:** Check `NEXT_PUBLIC_CHART_ANIMATION_ENABLED` and ensure Recharts is not tree-shaken (it's a client component).
