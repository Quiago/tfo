# Digital Twin

## Purpose

3D interactive factory scene that maps physical industrial equipment to a navigable virtual environment. Workers and engineers can click on a machine in the 3D view to see real-time telemetry, maintenance history, and suggested actions — without needing to walk to the equipment.

---

## Architecture

```
FactoryScene (R3F Canvas root)
├── DigitalTwinNavigator      Camera controls, orbit, presets
├── MachineGroup[]            Equipment meshes + hotspot triggers
│   └── Hotspot               Floating indicator (pulsing when alert)
└── MachineInspector          Overlay panel (slides in on click)

MiniDigitalTwin               Compact embedded version (used in sidebars)
```

---

## Files

```
components/digital-twin/
  FactoryScene.tsx             R3F scene root, Canvas setup
  DigitalTwinNavigator.tsx     Camera orbit controls + preset buttons
  MachineInspector.tsx         Right-panel overlay (properties, metrics)
  MiniDigitalTwin.tsx          Compact embedded 3D view
  camera-presets.ts            Camera position/target presets per asset
  machine-data.ts              Static asset inventory + machine metadata
```

---

## Components

### FactoryScene

The main R3F Canvas. Handles lighting, background, and renders all machine groups.

```tsx
import { FactoryScene } from '@/components/digital-twin/FactoryScene'

<FactoryScene
  activeAssetId={selectedAssetId}       // Highlights selected machine
  onAssetSelect={(id) => setSelected(id)}
/>
```

### MiniDigitalTwin

Compact 3D view for sidebars or panels. Same scene, smaller canvas, no inspector panel.

```tsx
import { MiniDigitalTwin } from '@/components/digital-twin/MiniDigitalTwin'

<MiniDigitalTwin
  assetId="pump-01"
  height={200}
  interactive={false}    // Read-only (no click-to-inspect)
/>
```

### MachineInspector

Side panel that renders when a machine is selected. Shows:
- Asset name, type, location
- Real-time metric cards (pulled from `telemetry-store` or mock)
- Last maintenance date
- Active alerts

```tsx
<MachineInspector
  assetId="pump-01"
  onClose={() => setSelected(null)}
/>
```

---

## Camera Presets (`camera-presets.ts`)

```typescript
export interface CameraPreset {
  label: string
  position: [number, number, number]   // x, y, z
  target: [number, number, number]     // look-at point
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  overview: { label: 'Overview', position: [0, 20, 30], target: [0, 0, 0] },
  'pump-01': { label: 'Pump 1', position: [5, 3, 8], target: [5, 0, 0] },
  // ... more per asset
}
```

---

## Machine Data (`machine-data.ts`)

Static registry of equipment. In production this will come from the Assets API.

```typescript
export interface MachineData {
  id: string
  displayName: string
  type: 'pump' | 'compressor' | 'conveyor' | 'hvac' | 'server_rack' | 'motor'
  location: string
  position: [number, number, number]   // 3D position in scene
  signals: string[]                    // Linked telemetry signal IDs
  metadata: Record<string, string>     // Manufacturer, model, serial, etc.
}
```

---

## Performance Notes

- The R3F Canvas is dynamically imported with `next/dynamic` and `{ ssr: false }` to avoid hydration errors and skip server-side Three.js rendering.
- Disable the 3D canvas entirely in low-end environments: `NEXT_PUBLIC_ENABLE_3D_CANVAS=false`
- Machine meshes are low-poly procedural geometries (no external `.glb` files required).
- Wrap in `<Suspense fallback={<LoadingSpinner />}>` — Three.js textures load async.

---

## Integration with Telemetry

The Inspector reads from `timeline-store` or calls `telemetry.service.ts` directly for real-time values:

```typescript
// Inside MachineInspector
const latestValues = await getLatestReadings({ connector_id: asset.connectorId })
```

In mock mode (`NEXT_PUBLIC_MOCK_DATA_MODE=true`) it reads from `machine-data.ts` static values.

---

## Playground

Visit `/playground/digital-twin` to test the scene with mock machines and all camera presets.
