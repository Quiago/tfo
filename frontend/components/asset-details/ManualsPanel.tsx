'use client'

import { Circle, ExternalLink } from 'lucide-react'

const RECENT_DOCS = [
    { title: 'KUKA KR120 Operation Manual', critical: true },
    { title: 'Electrical Schematics v2.1', critical: false },
    { title: 'Safety Procedures (LOTO)', critical: true },
]

export function ManualsPanel() {
    return (
        <div className="h-full bg-zinc-900 flex flex-col p-3">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Manuals & Docs</h3>

            <ul className="flex-1 space-y-2">
                {RECENT_DOCS.map((doc) => (
                    <li key={doc.title} className="flex items-start gap-2 text-xs">
                        <Circle size={6} className={`mt-1.5 flex-shrink-0 fill-current ${doc.critical ? 'text-blue-400' : 'text-zinc-500'}`} />
                        <span className="text-zinc-300">{doc.title}</span>
                    </li>
                ))}
            </ul>

            <button className="mt-3 mx-auto flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors">
                <ExternalLink size={13} />
                View the Docs
            </button>
        </div>
    )
}
