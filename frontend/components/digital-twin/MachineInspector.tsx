'use client'

import { useCallback } from 'react'
import { Activity, GitBranch, FileText, BookOpen, X, AlertTriangle } from 'lucide-react'
import type { MachineInfo } from './machine-data'

export interface AnomalyAlert {
  type: string
  severity: 'warning' | 'critical'
  message: string
  value: string
  threshold: string
  timestamp: string
}

interface MachineInspectorProps {
  machine: MachineInfo
  meshName: string
  anomaly?: AnomalyAlert | null
  onClose: () => void
  onAction: (action: 'monitoring' | 'workflows' | 'logs' | 'manual') => void
}

const STATUS_COLORS: Record<MachineInfo['health']['status'], string> = {
  operational: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  offline: 'bg-zinc-500',
}

const STATUS_TEXT: Record<MachineInfo['health']['status'], string> = {
  operational: 'Operational',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
}

export function MachineInspector({ machine, meshName, anomaly, onClose, onAction }: MachineInspectorProps) {
  const handleAction = useCallback(
    (action: 'monitoring' | 'workflows' | 'logs' | 'manual') => {
      onAction(action)
    },
    [onAction]
  )

  const displayHealth = anomaly
    ? { status: 'critical' as const, score: Math.max(machine.health.score - 35, 12) }
    : machine.health

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-80 max-h-[85vh] overflow-y-auto">
      <div className={`bg-zinc-900/95 backdrop-blur-md border rounded-2xl shadow-2xl shadow-black/50 ${
        anomaly ? 'border-red-500/50 shadow-red-900/20' : 'border-white/10'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-white/5">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white truncate">{machine.name}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">{machine.description}</p>
            <p className="text-[10px] font-mono text-zinc-600 mt-1">MESH: {meshName}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Anomaly Alert Banner */}
        {anomaly && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 animate-pulse-slow">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                {anomaly.severity === 'critical' ? 'Critical Alert' : 'Warning'}
              </span>
            </div>
            <p className="text-sm text-red-300 font-medium">{anomaly.type}</p>
            <p className="text-xs text-red-400/80 mt-1">{anomaly.message}</p>
            <div className="flex justify-between mt-2 text-[10px] font-mono">
              <span className="text-red-400">Detected: {anomaly.value}</span>
              <span className="text-red-500/60">Threshold: {anomaly.threshold}</span>
            </div>
            <div className="text-[10px] font-mono text-zinc-600 mt-1">{anomaly.timestamp}</div>
          </div>
        )}

        {/* Health Status */}
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Health Status</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[displayHealth.status]}`} />
              <span className={`text-xs font-medium ${anomaly ? 'text-red-400' : 'text-white'}`}>
                {STATUS_TEXT[displayHealth.status]}
              </span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                displayHealth.score >= 80
                  ? 'bg-emerald-500'
                  : displayHealth.score >= 50
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${displayHealth.score}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] font-mono text-zinc-500">
              Score: {displayHealth.score}%
            </span>
            <span className="text-[10px] font-mono text-zinc-600">
              Next service: {machine.health.nextService}
            </span>
          </div>
        </div>

        {/* Energy Consumption — only on normal inspection, not alerts */}
        {!anomaly && (
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Energy Consumption</span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-orange-400 font-mono">
                  {machine.energy.currentKw}
                </div>
                <div className="text-[10px] text-zinc-500">Current kW</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white font-mono">
                  {machine.energy.dailyKwh}
                </div>
                <div className="text-[10px] text-zinc-500">Daily kWh</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-zinc-300 font-mono">
                  {machine.energy.avgKw}
                </div>
                <div className="text-[10px] text-zinc-500">Avg kW</div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  {machine.energy.efficiency}%
                </div>
                <div className="text-[10px] text-zinc-500">Efficiency</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleAction('monitoring')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors text-xs font-medium"
          >
            <Activity size={14} />
            Monitoring
          </button>
          <button
            onClick={() => handleAction('workflows')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-medium"
          >
            <GitBranch size={14} />
            Workflows
          </button>
          <button
            onClick={() => handleAction('logs')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 hover:bg-zinc-500/20 transition-colors text-xs font-medium"
          >
            <FileText size={14} />
            Logs
          </button>
          <button
            onClick={() => handleAction('manual')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-500/10 border border-zinc-500/20 text-zinc-400 hover:bg-zinc-500/20 transition-colors text-xs font-medium"
          >
            <BookOpen size={14} />
            Manual
          </button>
        </div>
      </div>
    </div>
  )
}
