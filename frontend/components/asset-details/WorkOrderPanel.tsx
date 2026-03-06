'use client'

import { Circle, Plus } from 'lucide-react'

const RECENT_ORDERS = [
    { id: 'WO-2026-884', title: 'Vibration Analysis & Calibration', status: 'in_progress' as const },
    { id: 'WO-2026-881', title: 'firmware_v4.2 Update', status: 'completed' as const },
    { id: 'WO-2026-879', title: 'Annual Lubrication', status: 'pending' as const },
]

const STATUS_COLOR = {
    in_progress: 'text-amber-400',
    completed: 'text-emerald-400',
    pending: 'text-zinc-500',
}

export function WorkOrderPanel() {
    return (
        <div className="h-full bg-zinc-900 flex flex-col p-3">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Work Orders</h3>

            <ul className="flex-1 space-y-2">
                {RECENT_ORDERS.map((wo) => (
                    <li key={wo.id} className="flex items-start gap-2 text-xs">
                        <Circle size={6} className={`mt-1.5 flex-shrink-0 fill-current ${STATUS_COLOR[wo.status]}`} />
                        <span className="text-zinc-300">
                            <span className="text-zinc-500 font-mono">{wo.id}</span>{' '}
                            {wo.title}
                        </span>
                    </li>
                ))}
            </ul>

            <button className="mt-3 mx-auto flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors">
                <Plus size={13} />
                Create Work Order
            </button>
        </div>
    )
}
