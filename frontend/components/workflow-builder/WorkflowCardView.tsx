'use client'

import { useMemo, useRef, useEffect } from 'react'
import { useWorkflowStore } from '@/lib/store/workflow-store'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import type { Workflow } from '@/lib/types/workflow'
import * as LucideIcons from 'lucide-react'
import { ArrowDown, Shield, Trash2 } from 'lucide-react'

interface WorkflowCardViewProps {
  workflow: Workflow
}

function getIcon(name: string, size = 16) {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name]
  return Icon ? <Icon size={size} /> : null
}

export function WorkflowCardView({ workflow }: WorkflowCardViewProps) {
  const { selectNode, selectedNodeId, removeNode, isStreaming } = useWorkflowStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new cards appear during streaming
  useEffect(() => {
    if (scrollContainerRef.current && workflow.nodes.length > 0) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [workflow.nodes.length])

  // Build an ordered list of steps by following edges from trigger
  const orderedSteps = useMemo(() => {
    if (workflow.nodes.length === 0) return []

    // Find trigger node (first node without incoming edges)
    const targetIds = new Set(workflow.edges.map(e => e.target))
    const triggerNode = workflow.nodes.find(n => !targetIds.has(n.id))
    if (!triggerNode) return workflow.nodes

    // BFS traversal
    const visited = new Set<string>()
    const ordered: typeof workflow.nodes = []
    const queue = [triggerNode.id]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const node = workflow.nodes.find(n => n.id === current)
      if (node) ordered.push(node)

      // Find outgoing edges
      workflow.edges
        .filter(e => e.source === current)
        .forEach(e => queue.push(e.target))
    }

    // Add any unconnected nodes at the end
    workflow.nodes.forEach(n => {
      if (!visited.has(n.id)) ordered.push(n)
    })

    return ordered
  }, [workflow.nodes, workflow.edges])

  if (orderedSteps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
          <LucideIcons.Mic size={28} className="text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-400">No steps yet</p>
        <p className="max-w-[240px] text-xs text-zinc-600">
          Tap the microphone below and describe what you want to automate. Or switch to Canvas mode to drag and drop nodes.
        </p>
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="flex h-full flex-col overflow-y-auto p-4 pb-24">
      {/* Safety Warning */}
      {workflow.safetyCheck && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <Shield size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-xs font-medium text-amber-300">Safety Requirements</p>
            {workflow.safetyCheck.requiresLoto && (
              <p className="mt-1 text-[11px] text-amber-400/70">LOTO Required</p>
            )}
            {workflow.safetyCheck.ppeRequired.length > 0 && (
              <p className="text-[11px] text-amber-400/70">
                PPE: {workflow.safetyCheck.ppeRequired.join(', ')}
              </p>
            )}
            {workflow.safetyCheck.safetyWarning && (
              <p className="mt-1 text-[11px] text-amber-400/60">{workflow.safetyCheck.safetyWarning}</p>
            )}
          </div>
        </div>
      )}

      {/* Target Asset */}
      {workflow.targetAsset && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
          <LucideIcons.Cpu size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-400">
            {workflow.targetAsset.brand} {workflow.targetAsset.model}
          </span>
          <span className="text-[10px] text-zinc-600">({workflow.targetAsset.type})</span>
        </div>
      )}

      {/* Step Cards */}
      {orderedSteps.map((node, index) => {
        const meta = NODE_REGISTRY[node.type]
        const isSelected = selectedNodeId === node.id
        const isDecision = node.type === 'decision'

        // Find outgoing edges for decision labels
        const outEdges = workflow.edges.filter(e => e.source === node.id)

        return (
          <div key={node.id}>
            {/* Step Card */}
            <button
              onClick={() => selectNode(isSelected ? null : node.id)}
              className={`group relative w-full rounded-xl border-2 p-3 text-left transition-all ${
                isSelected
                  ? `border-${meta.color}-500/40 bg-${meta.color}-500/5`
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              {/* Step Number */}
              <div className="absolute -left-px -top-px flex h-5 w-5 items-center justify-center rounded-br-lg rounded-tl-xl bg-zinc-800 text-[9px] font-bold text-zinc-500">
                {index + 1}
              </div>

              <div className="flex items-start gap-3 pl-4">
                {/* Icon */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-${meta.color}-500/10 text-${meta.color}-400`}>
                  {getIcon(meta.icon, 18)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-zinc-200">
                    {node.label}
                  </p>

                  {/* Decision branches */}
                  {isDecision && outEdges.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {outEdges.map(e => (
                        <span
                          key={e.id}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                            e.sourceHandle === 'true'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {e.label || (e.sourceHandle === 'true' ? 'Yes' : 'No')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delete (on select) */}
                {isSelected && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </button>

            {/* Connector Arrow */}
            {index < orderedSteps.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown size={14} className="text-zinc-700" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
