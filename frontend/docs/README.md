# TFO Frontend — Documentation Index

Technical documentation for every feature in the TFO frontend.

---

## Components

### [Timeline](./timeline.md) — Sensor Telemetry Chart
4-channel time-series visualization. Historical data (solid) + predictive (dashed) with confidence intervals. Zoom/pan, real-time streaming, DB-level downsampling.
- Props: `TimelineProps`
- Hooks: `useTimeline`, `useConnectorTimeline`
- Playground: `/playground/timeline`

### [Workflow Builder](./workflow-builder.md) — OpsFlow Node Editor
Dual-mode industrial workflow editor: React Flow canvas (desktop) + sequential cards (mobile). Voice-to-workflow via Whisper ASR + LLM intent parsing.
- Store: `useWorkflowStore`
- Node types: 19 across 5 categories
- Playground: `/playground/workflow-builder`

### [Digital Twin](./digital-twin.md) — 3D Factory Scene
Interactive Three.js factory with clickable equipment hotspots, real-time metric overlays, and camera presets. Embedded via `MiniDigitalTwin` or full-screen via `FactoryScene`.
- Playground: `/playground/digital-twin`

### [Fithub](./fithub.md) — Cross-Facility Learning
GitHub-inspired anomaly and knowledge feed. AI-detected anomaly cards (approve/reject/investigate), cross-facility workflow repos, changelog timeline.
- Playground: `/playground/fithub`

### [Connectors & API Services](./connectors.md) — HTTP Layer
`apiFetch` wrapper with auto-auth injection, `ApiError` typed exceptions, and per-module service files. OPC UA, MQTT, REST connector management.

---

## Architecture Patterns

### Headless Hook-Component Split
Logic lives in hooks. Components only render. This means:
- `components/[feature]/[Feature].tsx` — render only, no `useState` for business logic
- `lib/hooks/use[Feature].ts` — all state, transforms, derived values
- Same hook can power both the component and the playground

### Mock Data First
Every complex component has a `useMockData` variant. Set `NEXT_PUBLIC_MOCK_DATA_MODE=true` to develop without a running backend.

### Zustand Stores (Persisted)
Each feature domain has a Zustand store with `persist` middleware. Stores are mode-agnostic — both desktop and mobile views read from the same store.

### Type Safety Rules
- No `any` types — ever.
- All shared interfaces in `lib/types/`.
- Zod validates everything coming from outside (API responses, voice intent JSON, user input).

---

## Definition of Done

Before merging any new feature:

- [ ] Code: component + hook created
- [ ] Playground: `/app/playground/[feature]/page.tsx`
- [ ] Docs: `/docs/[feature].md` with Purpose, Props/Schema, Example
- [ ] Changelog: entry in `CHANGELOG.md`
- [ ] Type check passes: `npm run type-check`
- [ ] Lint passes: `npm run lint`

---

## Development Guide

### Adding a Component

1. Define types in `lib/types/[feature].ts`
2. Create hook in `lib/hooks/use[Feature].ts`
3. Build component in `components/[folder]/[Feature].tsx`
4. Add playground in `app/playground/[feature]/page.tsx`
5. Write docs in `docs/[feature].md`
6. Update `CHANGELOG.md`

### Adding an API Service

1. Add typed function to `lib/services/[module].service.ts`
2. Use `apiFetch<ResponseType>('/path')` — never `fetch()` directly
3. Add Zod schema for the response if it comes from outside (LLM output, user upload)

---

## Useful Commands

```bash
npm run dev           # Dev server (http://localhost:3000)
npm run type-check    # TypeScript validation
npm run lint          # ESLint
npm test              # Vitest
```

---

## Related

- [Main Frontend README](../README.md)
- [Backend README](../../backend/README.md)
- [CHANGELOG](../CHANGELOG.md)
- [CLAUDE.md](../CLAUDE.md) — coding standards & architecture guidelines
