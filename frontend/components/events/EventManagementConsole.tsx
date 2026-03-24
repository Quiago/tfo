'use client'

/**
 * EventManagementConsole — top-level module shell for datacenter event management.
 *
 * Phase 0: Dispatcher (rule engine + live event feed)
 * Phase 2: Alarm Management Console sub-tab (alarm ACK, suppression, escalation)
 *
 * Sub-tabs follow the same AWS-style grouping pattern:
 *   Events → [ Dispatcher | Alarms (Phase 2) | ... ]
 *
 * Gate: this component is only mounted when platformMode === 'datacenter'.
 * The Navbar already hides the module button in factory mode, but we
 * add a null-guard here as a safety net.
 */

import { useState } from 'react'
import { useAuthStore } from '@/lib/store/auth-store'
import { DispatcherConsole } from '@/components/dispatcher/DispatcherConsole'
import { Zap } from 'lucide-react'

type EventsTab = 'dispatcher'
// Future tabs: 'alarms' | 'suppressions' | 'escalations'

const TABS: { id: EventsTab; label: string }[] = [
    { id: 'dispatcher', label: 'Event Dispatcher' },
]

export function EventManagementConsole() {
    const platformMode = useAuthStore(s => s.platformMode)
    const [activeTab, setActiveTab] = useState<EventsTab>('dispatcher')

    if (platformMode !== 'datacenter') return null

    return (
        <div className="flex flex-col h-full w-full bg-zinc-950 text-white">
            {/* ── Module Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-900/60 border border-violet-700/50">
                    <Zap size={14} className="text-violet-400" />
                </div>
                <div>
                    <h1 className="text-sm font-semibold text-white leading-none">Event Management</h1>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Datacenter event routing & alarm dispatch</p>
                </div>

                {/* Sub-tabs */}
                <div className="ml-6 flex items-center gap-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-violet-900/40 text-violet-300'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === 'dispatcher' && <DispatcherConsole />}
            </div>
        </div>
    )
}
