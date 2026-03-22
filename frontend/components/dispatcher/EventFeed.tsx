'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Zap, WifiOff } from 'lucide-react'
import { openEventStream } from '@/lib/services/dispatcher.service'
import { useDispatcherStore } from '@/lib/store/dispatcher-store'
import { useAuthStore } from '@/lib/store/auth-store'
import type { AlarmEvent, AlarmSeverity } from '@/lib/types/dispatcher'

const SEVERITY_STYLES: Record<AlarmSeverity, string> = {
    info:      'bg-zinc-700 text-zinc-300',
    warning:   'bg-amber-900/60 text-amber-300 border border-amber-800',
    critical:  'bg-red-900/60 text-red-300 border border-red-800',
    emergency: 'bg-red-600 text-white animate-pulse',
}

const CATEGORY_ICON: Record<string, string> = {
    power:    '⚡',
    cooling:  '❄️',
    network:  '🌐',
    security: '🔒',
    env:      '🌡️',
    general:  '📋',
}

function EventRow({ event }: { event: AlarmEvent }) {
    const severityClass = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info
    const icon = CATEGORY_ICON[event.category] ?? '📋'
    const time = new Date(event.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return (
        <div className={`flex items-start gap-3 px-3 py-2.5 border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors`}>
            <span className="text-base leading-none mt-0.5 flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate font-medium">{event.title}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                    {event.source_connector_id ?? 'manual'} · {time}
                </p>
            </div>
            <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${severityClass}`}>
                {event.severity}
            </span>
            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                event.status === 'completed'   ? 'bg-emerald-900/60 text-emerald-400' :
                event.status === 'failed'      ? 'bg-red-900/60 text-red-400' :
                event.status === 'no_match'    ? 'bg-zinc-700 text-zinc-400' :
                event.status === 'suppressed'  ? 'bg-zinc-700 text-zinc-500' :
                'bg-zinc-800 text-zinc-400'
            }`}>
                {event.status}
            </span>
        </div>
    )
}

export function EventFeed() {
    const token = useAuthStore((s) => s.token)
    const events = useDispatcherStore((s) => s.events)
    const prependEvent = useDispatcherStore((s) => s.prependEvent)
    const abortRef = useRef<AbortController | null>(null)
    const connectedRef = useRef(false)

    const connect = useCallback(async () => {
        if (!token || connectedRef.current) return
        connectedRef.current = true
        abortRef.current = new AbortController()

        try {
            for await (const evt of openEventStream('/dispatcher/stream', abortRef.current.signal)) {
                if (evt.type === 'new_event') {
                    prependEvent(evt.event)
                }
            }
        } catch {
            // Ignore AbortError on cleanup; real errors let the component show disconnected state
        } finally {
            connectedRef.current = false
        }
    }, [token, prependEvent])

    useEffect(() => {
        connect()
        return () => {
            abortRef.current?.abort()
            connectedRef.current = false
        }
    }, [connect])

    if (!token) {
        return (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-500">
                <WifiOff size={20} />
                <p className="text-xs">Not authenticated</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                <Zap size={13} className="text-violet-400" />
                <span className="text-xs font-medium text-zinc-300">Live Events</span>
                {connectedRef.current && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        live
                    </span>
                )}
            </div>

            {/* Event list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-1.5 text-zinc-600">
                        <Zap size={18} />
                        <p className="text-xs">No events yet</p>
                        <p className="text-[11px]">Use the simulator or POST to /dispatcher/events</p>
                    </div>
                ) : (
                    events.map((evt) => <EventRow key={evt.id} event={evt} />)
                )}
            </div>
        </div>
    )
}
