'use client'

import { useMemo } from 'react'
import type { CameraPreset } from './camera-presets'

interface NavigationPanelProps {
  presets: CameraPreset[]
  activeId: string | null
  onSelect: (id: string) => void
}

type Category = NonNullable<CameraPreset['category']>

const CATEGORY_ORDER: Category[] = ['overview', 'equipment', 'infrastructure', 'monitoring']

const CATEGORY_LABELS: Record<Category, string> = {
  overview: 'Overview',
  equipment: 'Equipment',
  infrastructure: 'Infrastructure',
  monitoring: 'Monitoring',
}

export function NavigationPanel({ presets, activeId, onSelect }: NavigationPanelProps) {
  const grouped = useMemo(() => {
    const map = new Map<Category, CameraPreset[]>()
    for (const preset of presets) {
      const cat = preset.category ?? 'overview'
      const list = map.get(cat)
      if (list) {
        list.push(preset)
      } else {
        map.set(cat, [preset])
      }
    }
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, items: map.get(cat)! }))
  }, [presets])

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1.5">
      {grouped.map(({ category, items }, groupIdx) => (
        <div key={category}>
          <div
            className={`text-[10px] text-zinc-600 uppercase tracking-wider ml-3 mb-1 ${
              groupIdx === 0 ? '' : 'mt-3'
            }`}
          >
            {CATEGORY_LABELS[category]}
          </div>
          {items.map((preset) => {
            const isActive = preset.id === activeId
            return (
              <button
                key={preset.id}
                onClick={() => onSelect(preset.id)}
                className={`group flex items-center w-12 hover:w-56 h-12 overflow-hidden rounded-xl border transition-all duration-300 mb-1.5 ${
                  isActive
                    ? 'border-orange-500 bg-orange-500/10 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]'
                    : 'border-white/5 bg-black/70 text-zinc-400 hover:border-white/10 hover:text-zinc-200'
                }`}
              >
                <div className="min-w-12 h-12 flex items-center justify-center text-lg">
                  {preset.icon}
                </div>
                <span className="text-xs font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {preset.name}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
