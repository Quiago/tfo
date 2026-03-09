'use client'

import { Html } from '@react-three/drei'
import type { CameraPreset } from './camera-presets'

interface NavigationHotspotsProps {
  presets: CameraPreset[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function NavigationHotspots({
  presets,
  activeId,
  onSelect,
}: NavigationHotspotsProps) {
  const hotspots = presets.filter(
    (p): p is CameraPreset & { hotspotPosition: [number, number, number] } =>
      !!p.hotspotPosition
  )

  return (
    <>
      {hotspots.map((preset) => {
        const active = activeId === preset.id
        return (
          <group key={preset.id} position={preset.hotspotPosition}>
            <Html center distanceFactor={15} zIndexRange={[10, 0]}>
              <button
                onClick={() => onSelect(preset.id)}
                className="group relative flex items-center justify-center cursor-pointer"
              >
                {/* Pulse ring - always animating */}
                <span className="absolute w-6 h-6 rounded-full border-2 border-orange-500/50 animate-ping" />
                {/* Inner dot */}
                <span
                  className={`relative w-3 h-3 rounded-full shadow-lg ${
                    active
                      ? 'bg-orange-400 shadow-orange-500/30'
                      : 'bg-white shadow-white/20'
                  }`}
                />
                {/* Label on hover */}
                <span className="absolute left-full ml-3 px-2 py-1 rounded bg-black/80 border border-white/10 text-xs text-white font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {preset.name}
                </span>
              </button>
            </Html>
          </group>
        )
      })}
    </>
  )
}
