# TRIPOLAR - Industrial Digital Twin Platform

> Real-time monitoring and predictive analytics for industrial systems

A headless, component-first Next.js 14+ application designed for rapid development of complex industrial visualization and control systems.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation & Development

```bash
# Install dependencies (already done)
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
tripolar/
├── app/                              # Next.js App Router
│   ├── page.tsx                     # Home page
│   ├── layout.tsx                   # Root layout
│   ├── globals.css                  # Global styles
│   ├── api/                         # API routes (future)
│   └── playground/
│       └── timeline/
│           └── page.tsx             # Timeline component testing
│
├── components/                       # Reusable UI components
│   ├── ui/                          # Atomic design system (buttons, inputs)
│   └── features/                    # Complex business logic components
│       └── Timeline.tsx             # Financial-style timeline
│
├── lib/                             # Core logic and utilities
│   ├── hooks/
│   │   ├── useTimeline.ts          # Timeline logic (zoom, pan, metrics)
│   │   └── useMockData.ts          # Mock data generation
│   ├── types/
│   │   └── timeline.ts             # TypeScript interfaces
│   ├── store/                       # Zustand stores (future)
│   └── utils/                       # Helper functions
│
├── docs/                            # Technical documentation
│   ├── timeline.md                 # Timeline component guide
│   └── [component].md              # Component-specific docs
│
├── public/                          # Static assets
├── styles/                          # Additional CSS (if needed)
├── package.json                     # Dependencies & scripts
├── tsconfig.json                    # TypeScript configuration
├── tailwind.config.ts               # Tailwind CSS configuration
├── next.config.js                   # Next.js configuration
└── CHANGELOG.md                     # Version history
```

---

## 📊 Components

### Timeline (`components/features/Timeline.tsx`)

The flagship component of TRIPOLAR. A financial-style time series visualization with:

- **Hybrid Display**: 80% historical data (solid line) + 20% predictive data (dashed line)
- **Zoom Levels**: Minute, Hour, Day, Week, Year
- **Confidence Intervals**: Visual uncertainty bands for predictions
- **Real-Time Streaming**: Mock data with auto-update capability
- **Responsive Design**: Mobile, tablet, and desktop optimized

**Test it**: http://localhost:3000/playground/timeline

---

## 🎣 Hooks

### `useTimeline(historicalData, predictions, options)`

Manages timeline visualization logic:

```typescript
const {
  zoomLevel,
  visibleRange,
  visibleHistoricalData,
  visiblePredictions,
  metrics,
  handlers: { handleZoom, handlePan, resetView },
} = useTimeline(data, predictions);
```

**Options:**
- `historicalRatio`: Display ratio (0.0-1.0), default 0.8
- `initialZoom`: Starting zoom level, default 'day'

### `useMockData(autoStream?)`

Generates realistic financial time series data:

```typescript
const {
  historicalData,
  predictions,
  isLoading,
  refetch,
  addNewDataPoint,
} = useMockData(true); // true = auto-stream every 15s
```

**Features:**
- Brownian motion with drift
- Mean reversion
- Confidence interval calculation
- Manual data injection

---

## 🎨 Styling

- **Framework**: Tailwind CSS v4
- **Theme**: Slate-based grayscale (ready for design system)
- **Responsive**: Mobile-first utility classes
- **Charts**: Custom Recharts styling in `app/globals.css`

---

## 🏗️ Architecture Principles

### 1. **Headless Component Design**
Logic and presentation are separated:
- Hooks (`useTimeline`, `useMockData`) contain logic
- Components consume hooks for UI rendering

### 2. **Type Safety**
- TypeScript strict mode enabled
- All types centralized in `/lib/types`
- No `any` types allowed

### 3. **Mock Data First**
- All components work with `useMockData()` out of the box
- No backend required for development
- Realistic data generation (Brownian motion)

### 4. **Performance**
- `useMemo` and `useCallback` for optimization
- Recharts optimized for 100K+ data points
- Lazy filtering of visible data

### 5. **Modular & Reusable**
- Hooks can be extracted and used elsewhere
- Components have clear, documented props
- No global state coupling (yet)

---

## 📝 Documentation

Every component includes:
1. **Component file** (`components/features/...`)
2. **Type definitions** (`lib/types/...`)
3. **Hooks** (`lib/hooks/...`)
4. **Playground** (`app/playground/.../`)
5. **Documentation** (`docs/[component].md`)
6. **Changelog entry** (`CHANGELOG.md`)

### View Component Docs
- **Timeline**: `/docs/timeline.md`
- **All Components**: `/docs/README.md` (TBD)

---

## 🚀 Development Workflow

### Adding a New Component

1. **Define Types** → `/lib/types/[component].ts`
   ```typescript
   export interface [Component]Props { ... }
   export interface [Component]Data { ... }
   ```

2. **Create Hooks** → `/lib/hooks/use[Component].ts`
   ```typescript
   export function use[Component](data: T, options: O) { ... }
   ```

3. **Build Component** → `/components/features/[Component].tsx`
   ```typescript
   export function [Component](props: [Component]Props) { ... }
   ```

4. **Create Playground** → `/app/playground/[component]/page.tsx`
   ```typescript
   'use client';
   export default function [Component]Playground() { ... }
   ```

5. **Write Docs** → `/docs/[component].md`
   - Purpose, props, usage examples, performance notes

6. **Update Changelog** → `CHANGELOG.md`
   - Add entry under `[Unreleased] - Added`

---

## 🧪 Testing

### Manual Testing (Playground Routes)
- Timeline: http://localhost:3000/playground/timeline
- More coming soon...

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

---

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.6+ | Framework |
| `react` | 19.2.4+ | UI library |
| `recharts` | 3.7.0+ | Data visualization |
| `tailwindcss` | 4.1.18+ | Styling |
| `zustand` | 5.0.11+ | State management (optional) |
| `lucide-react` | 0.563.0+ | Icons |
| `typescript` | 5.9.3+ | Type safety |

---

## 🔮 Roadmap

### Phase 1 (Current Sprint)
- ✅ Timeline Component
- [ ] Workflow Canvas
- [ ] 3D Digital Twin Viewer

### Phase 2
- [ ] Dashboard Integration
- [ ] Real Database Connection
- [ ] Authentication
- [ ] WebSocket Streaming

### Phase 3
- [ ] Mobile App
- [ ] Alert System
- [ ] Data Export
- [ ] Performance Optimizations

---

## 🛠️ Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Available variables:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_MOCK_DATA_MODE=true
NEXT_PUBLIC_TIMELINE_STREAMING_INTERVAL=15000
```

---

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
npm run dev -- -p 3001
```

### Type Errors
```bash
npm run type-check
```

### Build Issues
```bash
rm -rf .next node_modules
npm install
npm run build
```

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org)
- [TypeScript](https://www.typescriptlang.org)

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👨‍💼 Architecture Lead

Senior Full Stack Architect
TRIPOLAR Industries
Sprint: 5 Days Sprint

**Created**: 2024-02-06
**Last Updated**: 2024-02-06
