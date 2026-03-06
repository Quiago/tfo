'use client'

import s from '@/styles/overview-expanded/expanded.module.css'
import type { LucideIcon } from 'lucide-react'
import {
    Activity,
    BookOpen,
    ChevronDown,
    ChevronRight,
    FileText,
    Home,
    Radio,
    ScrollText,
    Users,
    Workflow,
} from 'lucide-react'
import { useState } from 'react'

interface SectionNode {
    id: string
    label: string
    icon: LucideIcon
    children: { id: string; label: string }[]
}

const SECTIONS: SectionNode[] = [
    {
        id: 'home',
        label: 'Home',
        icon: Home,
        children: [
            { id: 'h_1', label: 'Overview' },
            { id: 'h_2', label: 'Quick Actions' },
            { id: 'h_3', label: 'Recent Activity' },
        ],
    },
    {
        id: 'people',
        label: 'People',
        icon: Users,
        children: [
            { id: 'p_1', label: 'Carlos M. — Shift Lead' },
            { id: 'p_2', label: 'Ana R. — Maintenance Tech' },
            { id: 'p_3', label: 'David L. — Operator' },
        ],
    },
    {
        id: 'workflows',
        label: 'Workflows',
        icon: Workflow,
        children: [
            { id: 'wf_1', label: 'Vibration Calibration' },
            { id: 'wf_2', label: 'Lubrication Routine' },
            { id: 'wf_3', label: 'Firmware Update v4.2' },
        ],
    },
    {
        id: 'events',
        label: 'Events',
        icon: Activity,
        children: [
            { id: 'ev_1', label: 'Alert: Axis 3 vibration spike' },
            { id: 'ev_2', label: 'Maintenance completed' },
            { id: 'ev_3', label: 'Shift handover logged' },
        ],
    },
    {
        id: 'sensors',
        label: 'Sensors',
        icon: Radio,
        children: [
            { id: 'sn_1', label: 'Vibration — 2.7 mm/s' },
            { id: 'sn_2', label: 'Temperature — 29.3 °C' },
            { id: 'sn_3', label: 'Pressure — 6.8 bar' },
        ],
    },
    {
        id: 'logs',
        label: 'Logs',
        icon: ScrollText,
        children: [
            { id: 'lg_1', label: '10:42 — Motor start cycle #1204' },
            { id: 'lg_2', label: '10:38 — Param change: speed +5%' },
            { id: 'lg_3', label: '10:15 — Self-check passed' },
        ],
    },
    {
        id: 'docs',
        label: 'Documentation',
        icon: BookOpen,
        children: [
            { id: 'dc_1', label: 'KR120 Operation Manual' },
            { id: 'dc_2', label: 'Electrical Schematics v2.1' },
            { id: 'dc_3', label: 'Safety Procedures (LOTO)' },
        ],
    },
]

export function AssetTree({
    selectedAssetId,
    onSelect,
}: {
    selectedAssetId?: string
    onSelect: (id: string) => void
}) {
    return (
        <div className="h-full flex flex-col bg-transparent">
            <div className={s.treeHeader}>
                Explorer
            </div>
            <div className="flex-1 overflow-auto py-2 space-y-0.5">
                {SECTIONS.map((section) => (
                    <SectionRow
                        key={section.id}
                        section={section}
                        selectedId={selectedAssetId}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    )
}

function SectionRow({
    section,
    selectedId,
    onSelect,
}: {
    section: SectionNode
    selectedId?: string
    onSelect: (id: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const Icon = section.icon

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                className={s.treeItem}
                style={{ width: 'calc(100% - 8px)' }}
            >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Icon size={14} style={{ opacity: 0.7 }} />
                <span>{section.label}</span>
                <span className="ml-auto text-[10px] opacity-60">{section.children.length}</span>
            </button>

            {expanded && (
                <div className="ml-3 border-l border-zinc-300 dark:border-zinc-700 pl-1 my-1">
                    {section.children.map((item) => {
                        const isSelected = selectedId === item.id
                        return (
                            <button
                                key={item.id}
                                onClick={() => onSelect(item.id)}
                                className={`${isSelected ? s.treeSubItemActive : s.treeSubItem}`}
                                style={{ width: 'calc(100% - 8px)' }}
                            >
                                <FileText size={11} className="flex-shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
