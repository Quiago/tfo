'use client'

import { useState } from 'react'
import { WorkflowBuilder } from '@/components/workflow-builder'
import { MOCK_WORKFLOW_VIBRATION, MOCK_WORKFLOW_RACK_INSPECTION } from '@/lib/hooks/useWorkflowMockData'
import type { Workflow } from '@/lib/types/workflow'

const PRESETS: { label: string; workflow: Workflow | undefined }[] = [
  { label: 'Blank', workflow: undefined },
  { label: 'Vibration Diagnosis', workflow: MOCK_WORKFLOW_VIBRATION },
  { label: 'Rack Inspection', workflow: MOCK_WORKFLOW_RACK_INSPECTION },
]

export default function WorkflowBuilderPlayground() {
  const [activePreset, setActivePreset] = useState(0) // Start blank

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      {/* Playground Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
          Playground
        </span>
        <span className="text-[10px] text-zinc-600">|</span>
        <span className="text-xs text-zinc-400">Workflow Builder</span>

        <div className="ml-auto flex gap-1">
          {PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => setActivePreset(i)}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                activePreset === i
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Builder */}
      <WorkflowBuilder
        key={activePreset}
        initialWorkflow={PRESETS[activePreset].workflow}
        className="flex-1"
      />
    </div>
  )
}
