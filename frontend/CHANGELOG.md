# Changelog

All notable changes to the TRIPOLAR Industrial Digital Twin platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Fithub Component (`components/fithub/`)
- New **Fithub** component: GitHub-inspired cross-facility learning and anomaly detection hub
- 3-column layout: Factory repos sidebar (left), Feed (center), Changelog (right)
- Factory system: 5 mock factories as workflow repo owners (Munich, Shanghai, Detroit, Tokyo, São Paulo)
- Workflow repos with stars, forks, language tags, and cross-facility forking
- Feed posts: AI insights, human questions, issues, PRs, announcements with upvotes/comments
- Anomaly detection cards with approve/reject/investigate actions and severity coloring
- Input bar with Ask AI, Create Ticket, Create Issue, Pull Request actions
- Zustand store (`lib/store/fithub-store.ts`) with full CRUD and computed selectors
- Types (`lib/types/fithub.ts`): Factory, WorkflowRepo, FithubPost, DetectedAnomaly, ChangelogEntry
- Mock data hook (`lib/hooks/useFithubMockData.ts`) with 12 repos, 8 posts, 4 anomalies
- Playground at `/playground/fithub`
- Documentation at `/docs/fithub.md`

#### Workflow Builder (`components/features/workflow-builder/`)
- Full-featured responsive workflow builder with dual-mode interface: React Flow canvas (desktop) + sequential card view (mobile)
- 19 industrial node types across 5 categories (triggers, conditions, inputs, actions, utility) with freemium gating via `NODE_REGISTRY`
- Voice/text input with simulated AI intent parsing and confirmation card overlay for Speech-to-Workflow flow
- Drag-and-drop `NodePalette` sidebar, `NodeConfigPanel` for per-type property editing, `WorkflowToolbar` with export JSON and simulated execution
- Zustand + immer store (`lib/store/workflow-store.ts`) managing workflow CRUD, node/edge CRUD, voice state, execution state, and mode switching
- Zod validators (`lib/validators/workflow.validators.ts`) for Workflow, WorkflowNode, WorkflowEdge, and VoiceWorkflowIntent schemas
- Mock data (`lib/hooks/useWorkflowMockData.ts`) with two sample workflows (Vibration Diagnosis, Rack Inspection) and one voice intent (HVAC Compressor)
- `useMediaQuery` hook (`lib/hooks/useMediaQuery.ts`) for responsive breakpoint detection
- Playground at `/playground/workflow-builder` with preset selector (Blank, Vibration Diagnosis, Rack Inspection)
- Documentation at `/docs/workflow-builder.md`

### Fixed

#### Timeline Component
- Fixed streaming race condition in `useMultiLayerData` hook causing chart layer desynchronization
- Fixed `sensorDataRef` not updating on granularity change, causing stale data in streaming
- Fixed Sensors chart X-axis showing different date range than Product/Energy charts
- Added explicit `domain` prop to SensorLayer XAxis to force synchronized time ranges
- FORECAST zones now render correctly on all chart layers across all views (Minute, Hour, Day, Week, Year)

---

## [0.1.0] - 2024-02-06

### Added

#### Core Infrastructure
- Initial Next.js 14+ project setup with TypeScript strict mode
- Tailwind CSS configuration with TRIPOLAR color scheme
- Project structure: `/app`, `/components`, `/lib`, `/docs`
- Type-safe architecture with centralized types in `/lib/types`

#### Timeline Component (`components/features/Timeline.tsx`)
- Financial-style time series visualization with Recharts
- Hybrid streaming display: 80% historical (solid line) + 20% predictions (dashed line)
- Confidence intervals visualization with gradient fill
- Multi-level zoom: Minute, Hour, Day, Week, Year
- Responsive design with Tailwind CSS
- Interactive pan/navigation controls
- Real-time metrics footer showing data points, date range, latest value
- Custom tooltip with formatted timestamps
- Full TypeScript support with `TimelineProps` interface

#### useTimeline Hook (`lib/hooks/useTimeline.ts`)
- Zoom level management with dynamic time window sizing
- Pan/navigation with offset tracking
- Visible data range calculation
- Metrics computation (min, max, mean, stdDev)
- Y-axis domain with automatic padding
- Handlers for zoom changes and pan operations

#### useMockData Hook (`lib/hooks/useMockData.ts`)
- Realistic data generation using Brownian motion with drift
- 90 days of historical data + 30 days of predictions
- Volatility (3%) and trend (0.1% daily) simulation
- Mean reversion to prevent unrealistic values
- Confidence interval calculation from historical volatility
- Auto-streaming mode: generates new data every 15 seconds
- Manual data point injection capability
- Configurable time series parameters

#### Type Definitions (`lib/types/timeline.ts`)
- `TimelineDataPoint`: Historical data structure
- `TimelinePredictionPoint`: Predicted data with confidence bounds
- `TimelineZoomLevel`: Enum-like type for zoom levels
- `TimelineRange`: Time range specification
- `TimelineConfig`: Configuration interface
- `TimelineState`: Complete state structure
- `TimelineMetrics`: Statistical metrics

#### Playground (`app/playground/timeline/page.tsx`)
- Interactive testing environment for Timeline component
- Auto-stream toggle for real-time simulation
- Manual data refresh and point injection
- Data summary statistics display
- Feature showcase with detailed descriptions
- Responsive control panel with Tailwind CSS
- Usage guide footer

#### Documentation
- **`/docs/timeline.md`**: Complete component documentation
  - Component props and interfaces
  - Usage examples
  - Hook documentation
  - Data generation algorithm explanation
  - Performance metrics and optimization strategies
  - Troubleshooting guide
  - Future enhancement roadmap
- **`/CHANGELOG.md`**: Version history (this file)

#### Styling
- Global CSS setup with Recharts customization
- Utility-first Tailwind configuration
- Dark theme foundations with slate color palette
- Custom gradient for prediction confidence intervals

### Technical Details

#### Architecture Decisions
- **Headless Component Design**: Separation of logic (hooks) from presentation (component)
- **Mock Data First**: Complete data generation without backend dependency
- **Modular Hooks**: Reusable `useTimeline` and `useMockData` for flexible integration
- **Type Safety**: Full TypeScript with no `any` types
- **Performance**: Memoization, data filtering, Recharts optimization

#### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design: Mobile, Tablet, Desktop

#### Dependencies Installed
- `next@latest`
- `react@latest`
- `react-dom@latest`
- `recharts@latest`
- `zustand@latest` (prepared for state management)
- `lucide-react@latest` (icons)
- `tailwindcss@latest`
- `typescript@latest`
- `@types/react`, `@types/node`

---

## [0.2.0] - 2026-02-06

### Added

#### Timeline Component — Major UI Enhancements (`components/features/Timeline.tsx`)
- **Vibration Line**: Orange `#f97316` line always visible in sensor chart, with warning (8 mm/s) and critical (15 mm/s) dashed `ReferenceLine`s when expanded
- **Video Frame Strip**: Horizontal film-strip below sensor chart — colored rectangles per camera frame, motion indicators (green dots), anomaly borders (red), zone labels on hover, `CAM` icon label on left
- **Forecast Zone**: Indigo `ReferenceArea` overlay on all four layer charts marking the prediction zone (last 20% of timestamps, after `Date.now()`)
- **AI vs Human Icons**: `Bot`/`User` icons from lucide-react in ActionTooltip next to each event title; AI/Human counts in Actions LayerHeader stats
- **Live Indicator**: Pulsing red dot + `LIVE` text in header when `isStreaming === true`; enhanced green dot pulse on the title
- **Vibration in SensorTooltip**: Color-coded vibration readout (orange/amber/red) with mm/s units
- **Video Zone in SensorTooltip**: Camera icon + zone name + motion badge when `videoFrame` exists
- **Vibration in LayerHeader Stats**: Orange mono font `Vib X.X mm/s` in sensor layer header
- **Updated Footer Legend**: Added vibration (orange line) and forecast zone visual key

#### Data Hook — Streaming & Causal Consistency (`lib/hooks/useMultiLayerData.ts`)
- `vibration` field: random walk with mean reversion, gradual degradation segments, bearing wear spikes, post-maintenance recovery
- `videoFrame` field: hex-color thumbnails, motion detection flags, rotating camera zones
- `isAI` field on `ActionEvent`: AI Agent and automated alerts tagged `true`, human/manual events `false`
- `isStreaming` return value: `true` while streaming interval is active
- Real streaming: appends one data point every 2 seconds with causally-consistent cross-layer generation
- Causally-driven action events: vibration thresholds, temperature alerts, correlated anomalies, efficiency drops all trigger appropriate events

### Changed
- Sensor layer description updated to include Vibration and Camera
- All layer components now accept `nowTimestamp` and `lastTimestamp` props for forecast zone rendering
- Recharts imports expanded with `ReferenceArea` and `ReferenceLine`
- Lucide imports expanded with `Camera`, `Bot`, `User`

## [Unreleased]

### Planned Features

#### Components
- [ ] WorkflowCanvas: Node-based workflow builder
- [ ] DigitalTwin3D: 3D visualization with Three.js
- [ ] Dashboard: Multi-metric overview
- [ ] AlertPanel: Real-time notification system
- [ ] DataExplorer: Raw data inspection tool

#### Timeline Enhancements
- [ ] Export to PNG/SVG
- [ ] Drag-to-select date range
- [ ] Crosshair cursor for precision
- [ ] Multiple metric overlay
- [ ] Custom color theming
- [ ] Real database integration
- [ ] Performance profiling utilities

#### Infrastructure
- [ ] Error boundaries for complex components
- [ ] Global error handling
- [ ] Logging and telemetry
- [ ] Unit and integration tests
- [ ] CI/CD pipeline

---

## Guidelines

When adding new entries, follow this format:

```markdown
### [Added|Changed|Deprecated|Removed|Fixed|Security]
- Brief description of the change
- Related component or file path if applicable
```

### Categories
- **Added**: New features or components
- **Changed**: Modifications to existing functionality
- **Deprecated**: Features marked for removal
- **Removed**: Deleted features
- **Fixed**: Bug fixes
- **Security**: Security-related changes

---

**Project Start Date**: 2024-02-06
**Sprint Duration**: 5 days
**Team**: Senior Full Stack Architect
