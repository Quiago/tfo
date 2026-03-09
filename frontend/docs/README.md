# TRIPOLAR Documentation Index

Complete technical documentation for the TRIPOLAR Industrial Digital Twin Platform.

## Components

### [Timeline](./timeline.md) ✅
**Status**: Stable | **Version**: 0.1.0

Financial-style time series visualization with historical data, predictions, and confidence intervals.

- **Props**: `TimelineProps` interface
- **Hooks**: `useTimeline`, `useMockData`
- **Features**: Zoom levels, pan navigation, real-time streaming
- **Performance**: Tested with 100K+ data points
- **Playground**: `/app/playground/timeline`

**Key Metrics**:
- Data Points Supported: Up to 138K (1 year at 15-min intervals)
- Render Time: 150-450ms depending on data volume
- FPS: 45-60

---

## Hooks

### Data Management
- **`useMockData(autoStream?)`**: Realistic data generation with Brownian motion
  - Generates 90 days historical + 30 days predictions
  - Auto-streaming mode with 15-second intervals
  - Confidence interval calculation

- **`useTimeline(data, predictions, options?)`**: Timeline logic management
  - Zoom level handling (minute, hour, day, week, year)
  - Pan/navigation with offset tracking
  - Visible data range calculation
  - Metrics computation (min, max, mean, stdDev)

---

## Types & Interfaces

### Core Types (`lib/types/timeline.ts`)
- `TimelineZoomLevel`: Zoom level enum type
- `TimelineDataPoint`: Historical data structure
- `TimelinePredictionPoint`: Prediction with confidence bounds
- `TimelineRange`: Time range specification
- `TimelineConfig`: Configuration interface
- `TimelineState`: Complete state structure
- `TimelineMetrics`: Statistical metrics

### Usage
```typescript
import type { TimelineDataPoint, TimelineZoomLevel } from '@/lib/types';
```

---

## Configuration

### Constants (`lib/utils/constants.ts`)
Centralized single source of truth for:
- Zoom window sizes
- Color scheme
- Default dimensions
- API endpoints
- Feature flags

### Environment Variables (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_MOCK_DATA_MODE=true
NEXT_PUBLIC_TIMELINE_STREAMING_INTERVAL=15000
NEXT_PUBLIC_ENABLE_3D_CANVAS=true
```

---

## Architecture Patterns

### 1. Headless Component Design
- **Logic Layer**: Custom hooks (`useTimeline`, `useMockData`)
- **Presentation Layer**: React components (`Timeline`)
- **Types Layer**: Centralized in `/lib/types`

### 2. Mock Data First
- All components work standalone with `useMockData()`
- Realistic data generation using Brownian motion
- No backend required for development

### 3. Type Safety
- TypeScript strict mode enabled
- No `any` types allowed
- Discriminating unions for state

### 4. Performance Optimization
- `useMemo` and `useCallback` for expensive operations
- Data filtering for visible range only
- Recharts optimization for large datasets

---

## Development Workflow

### Adding a New Component

1. **Define Types**
   ```
   lib/types/[component].ts
   ```
   - Interfaces for props
   - Data structures
   - Enums for type safety

2. **Create Hooks**
   ```
   lib/hooks/use[Component].ts
   ```
   - Business logic
   - Data transformations
   - State management

3. **Build Component**
   ```
   components/features/[Component].tsx
   ```
   - UI rendering
   - Event handling
   - Responsive design

4. **Create Playground**
   ```
   app/playground/[component]/page.tsx
   ```
   - Interactive testing
   - Example usage
   - Control panels

5. **Write Documentation**
   ```
   docs/[component].md
   ```
   - Purpose and features
   - Props and interfaces
   - Usage examples
   - Performance notes

6. **Update Changelog**
   ```
   CHANGELOG.md
   ```
   - Add entry under `[Unreleased] - Added`

---

## Project Structure Reference

```
tripolar/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Home page
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles
│   └── playground/              # Component testing routes
│       └── timeline/
│           └── page.tsx         # Timeline playground
│
├── components/                   # Reusable UI components
│   ├── features/                # Complex components
│   │   ├── Timeline.tsx
│   │   └── index.ts            # Central exports
│   └── ui/                      # Atomic design system (future)
│
├── lib/                         # Core business logic
│   ├── hooks/                   # Custom React hooks
│   │   ├── useTimeline.ts
│   │   ├── useMockData.ts
│   │   └── index.ts
│   ├── types/                   # TypeScript interfaces
│   │   ├── timeline.ts
│   │   └── index.ts
│   └── utils/                   # Helper functions
│       └── constants.ts
│
├── docs/                        # Technical documentation
│   ├── README.md               # This file
│   └── timeline.md             # Component documentation
│
├── public/                      # Static assets
├── styles/                      # Additional CSS
├── CHANGELOG.md                # Version history
├── README.md                   # Project overview
└── package.json               # Dependencies
```

---

## Performance Guidelines

### Data Size Recommendations

| Use Case | Data Points | Interval | Render Time |
|----------|------------|----------|------------|
| Real-time monitoring | 2,688 | 15 min | 150ms |
| Daily analysis | 11,520 | 5 min | 250ms |
| Historical analysis | 138,240 | 5 min | 450ms |

### Optimization Tips

1. **Use visible data filtering** - Only render data within `visibleRange`
2. **Memoize calculations** - Use `useMemo` for expensive operations
3. **Lazy load** - Load data in chunks, not all at once
4. **Compress data** - Aggregate old data into hourly/daily points
5. **Disable animations** - Set `ENABLE_ANIMATIONS=false` for large datasets

---

## Testing Strategy

### Manual Testing
- **Playground Routes**: `/app/playground/[component]`
- **Visual Testing**: Screenshots for layout verification
- **Performance Testing**: Monitor render times and FPS

### Automated Testing (Planned)
- Unit tests for hooks
- Integration tests for components
- E2E tests for workflows

---

## Debugging Tips

### TypeScript Errors
```bash
npm run type-check
```

### Build Issues
```bash
rm -rf .next node_modules
npm install
npm run build
```

### Port Already in Use
```bash
npm run dev -- -p 3001
```

### Debug Mode
```bash
DEBUG=* npm run dev
```

---

## Browser Compatibility

### Supported
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Not Supported
- IE 11 (No ES2020 support)
- Mobile browsers < 2021

---

## Related Documents

- **[Main README](../README.md)**: Project overview and quick start
- **[CHANGELOG](../CHANGELOG.md)**: Version history and releases
- **[CLAUDE.md](../CLAUDE.md)**: Project context and guidelines
- **[.env.example](../.env.example)**: Environment configuration template

---

## Contributing

### Code Standards
1. **TypeScript**: Use strict mode, no `any` types
2. **Components**: Headless design with separated logic
3. **Documentation**: Update docs and changelog with changes
4. **Testing**: Add playground routes for visual testing

### Pull Request Checklist
- [ ] Types defined in `/lib/types`
- [ ] Component/hook created in appropriate folder
- [ ] Playground route added for testing
- [ ] Documentation updated
- [ ] Changelog entry added
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`

---

## FAQ

### Q: How do I add a new zoom level?
A: Edit `ZOOM_WINDOWS` in `lib/utils/constants.ts` and update `TimelineZoomLevel` type in `lib/types/timeline.ts`.

### Q: How do I customize colors?
A: Update `COLORS` in `lib/utils/constants.ts` or modify Recharts styles in `app/globals.css`.

### Q: Can I use real data instead of mock?
A: Yes, replace `useMockData()` with your own hook that fetches data from an API.

### Q: How do I improve performance with large datasets?
A: See "Performance Guidelines" section above for optimization tips.

---

## Support & Resources

- **TypeScript**: https://www.typescriptlang.org
- **Next.js**: https://nextjs.org/docs
- **React**: https://react.dev
- **Recharts**: https://recharts.org
- **Tailwind CSS**: https://tailwindcss.com

---

**Last Updated**: 2024-02-06
**Status**: Stable
**Version**: 0.1.0
