'use client'

/**
 * AlarmSimulator — DEMO MODE ONLY
 *
 * Visible only when NEXT_PUBLIC_DEMO_MODE=true.
 * Lets the user fire synthetic alarm events without needing real hardware.
 * Used during Khazna demo to show the dispatcher in action from the browser.
 */
import { useState, useCallback } from 'react'
import { FlaskConical, Loader2, CheckCircle2 } from 'lucide-react'
import { ingestEvent } from '@/lib/services/dispatcher.service'
import { useDispatcherStore } from '@/lib/store/dispatcher-store'
import type { SimulatedEventTemplate } from '@/lib/types/dispatcher'

const TEMPLATES: SimulatedEventTemplate[] = [
    {
        label: 'CRAC Unit Failure',
        severity: 'critical',
        category: 'cooling',
        title: 'CRAC-03 cooling unit failure — Room B',
        raw_payload: { asset: 'CRAC-03', room: 'B', temp_delta: 4.2, tags: ['crac', 'cooling'] },
    },
    {
        label: 'UPS Battery Low',
        severity: 'warning',
        category: 'power',
        title: 'UPS-3 battery SoH below 80%',
        raw_payload: { asset: 'UPS-3', soh: 76, last_test: '2026-03-20', tags: ['ups', 'battery'] },
    },
    {
        label: 'PDU Overload',
        severity: 'critical',
        category: 'power',
        title: 'PDU-A breaker trip — Row 4',
        raw_payload: { asset: 'PDU-A', row: 4, current_amps: 62, capacity_amps: 60, tags: ['pdu', 'power'] },
    },
    {
        label: 'High Temp Alert',
        severity: 'emergency',
        category: 'env',
        title: 'Rack temperature exceeds 35°C — DC-2 Hall',
        raw_payload: { asset: 'RACK-R14', hall: 'DC-2', temp_c: 37.1, threshold_c: 35, tags: ['temp', 'env'] },
    },
    {
        label: 'Network Anomaly',
        severity: 'warning',
        category: 'network',
        title: 'Top-of-rack switch packet loss > 0.5%',
        raw_payload: { asset: 'TOR-SW-07', packet_loss_pct: 0.7, tags: ['network', 'switch'] },
    },
]

export function AlarmSimulator() {
    const prependEvent = useDispatcherStore((s) => s.prependEvent)
    const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
    const [lastFiredIdx, setLastFiredIdx] = useState<number | null>(null)

    const fire = useCallback(async (template: SimulatedEventTemplate, idx: number) => {
        setLoadingIdx(idx)
        setLastFiredIdx(null)
        try {
            // Consume the SSE stream and capture the final event
            let finalEventId: string | null = null
            for await (const evt of ingestEvent({
                severity:    template.severity,
                category:    template.category,
                title:       template.title,
                raw_payload: template.raw_payload,
            })) {
                if (evt.type === 'event_received') finalEventId = evt.event_id
                if (evt.type === 'done') {
                    // The live feed SSE will pick it up automatically;
                    // we just mark success here.
                    setLastFiredIdx(idx)
                }
            }
            if (finalEventId) setLastFiredIdx(idx)
        } catch {
            // Non-fatal: show error inline if needed in future
        } finally {
            setLoadingIdx(null)
        }
    }, [prependEvent])

    return (
        <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
                <FlaskConical size={13} className="text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Demo Simulator</span>
                <span className="text-[10px] text-zinc-600 ml-auto">DEMO MODE</span>
            </div>

            <div className="space-y-1.5">
                {TEMPLATES.map((tpl, idx) => {
                    const isLoading = loadingIdx === idx
                    const wasFired  = lastFiredIdx === idx && loadingIdx === null
                    return (
                        <button
                            key={tpl.label}
                            onClick={() => fire(tpl, idx)}
                            disabled={loadingIdx !== null}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-left transition-colors disabled:opacity-60 group"
                        >
                            <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
                                tpl.severity === 'emergency' ? 'bg-red-500' :
                                tpl.severity === 'critical'  ? 'bg-red-400' :
                                tpl.severity === 'warning'   ? 'bg-amber-400' :
                                'bg-zinc-500'
                            }`} />
                            <span className="flex-1 text-xs text-zinc-300 group-hover:text-white transition-colors truncate">
                                {tpl.label}
                            </span>
                            {isLoading  && <Loader2 size={12} className="animate-spin text-zinc-400 flex-shrink-0" />}
                            {wasFired   && <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
