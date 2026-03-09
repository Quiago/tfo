'use client'

import { useWorkflowStore } from '@/lib/store/workflow-store'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import * as LucideIcons from 'lucide-react'
import { Check, X, ArrowDown, Shield, BrainCircuit } from 'lucide-react'

function getIcon(name: string, size = 16) {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name]
  return Icon ? <Icon size={size} /> : null
}

export function ConfirmationCardOverlay() {
  const { confirmationCard, confirmWorkflowIntent, setConfirmationCard } = useWorkflowStore()

  if (!confirmationCard) return null

  const intent = confirmationCard.workflowIntent

  const handleConfirm = () => {
    confirmWorkflowIntent()
  }

  const handleReject = () => {
    setConfirmationCard(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-800/50 px-4 py-3">
          <BrainCircuit size={18} className="text-amber-400" />
          <div>
            <p className="text-sm font-medium text-zinc-100">Workflow Generated</p>
            <p className="text-[10px] text-zinc-500">Review and confirm to create</p>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* Title & Description */}
          <h3 className="text-base font-semibold text-zinc-100">{intent.title}</h3>
          <p className="mt-1 text-xs text-zinc-400">{intent.description}</p>

          {/* Target Asset */}
          {intent.targetAsset && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/30 px-3 py-2">
              <LucideIcons.Cpu size={14} className="text-zinc-500" />
              <span className="text-xs text-zinc-300">
                {intent.targetAsset.brand} {intent.targetAsset.model}
              </span>
            </div>
          )}

          {/* Safety */}
          {intent.safetyCheck && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <Shield size={14} className="mt-0.5 text-amber-400" />
              <div className="text-[11px] text-amber-300/80">
                {intent.safetyCheck.requiresLoto && <p>LOTO Required</p>}
                {intent.safetyCheck.ppeRequired.length > 0 && (
                  <p>PPE: {intent.safetyCheck.ppeRequired.join(', ')}</p>
                )}
              </div>
            </div>
          )}

          {/* Trigger */}
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Trigger
            </p>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-rose-500/15 text-rose-400">
                {getIcon(NODE_REGISTRY[intent.trigger.type]?.icon ?? 'Zap', 14)}
              </span>
              <div>
                <p className="text-xs text-zinc-200">
                  {NODE_REGISTRY[intent.trigger.type]?.label ?? intent.trigger.type}
                </p>
                {intent.trigger.keywords && (
                  <p className="text-[10px] text-zinc-500">
                    Keywords: {intent.trigger.keywords.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Then do
            </p>
            <div className="mt-2 space-y-1">
              {intent.steps.map((step, i) => {
                const meta = NODE_REGISTRY[step.type]
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/30 px-3 py-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded bg-${meta?.color ?? 'zinc'}-500/15 text-${meta?.color ?? 'zinc'}-400`}>
                        {getIcon(meta?.icon ?? 'Circle', 14)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-200">{step.label}</p>
                        <p className="text-[10px] text-zinc-500">{meta?.label}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-600">#{i + 1}</span>
                    </div>
                    {/* Connector between steps */}
                    {i < intent.steps.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <ArrowDown size={10} className="text-zinc-700" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 border-t border-zinc-800 bg-zinc-800/30 p-4">
          <button
            onClick={handleReject}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            <X size={16} />
            Discard
          </button>
          <button
            onClick={handleConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
          >
            <Check size={16} />
            Activate
          </button>
        </div>
      </div>
    </div>
  )
}
