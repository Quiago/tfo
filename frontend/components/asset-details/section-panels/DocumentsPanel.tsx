'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { BookOpen, Calendar, FileText, Hash, Shield, Wrench } from 'lucide-react'
import { useState } from 'react'

type DocType = 'manual' | 'schematic' | 'procedure' | 'certificate'

interface Document {
    id: string
    name: string
    category: string
    type: DocType
    pages: number
    version: string
    lastUpdated: string
    description: string
    fileSize: string
}

const DOCUMENTS: Document[] = [
    { id: 'doc-1', name: 'KR120 Operation Manual', category: 'Manuals', type: 'manual', pages: 284, version: 'v3.1', lastUpdated: '2025-11-20', description: 'Complete operation guide for KUKA KR120R2500pro. Includes startup procedures, programming basics, and maintenance intervals.', fileSize: '18.4 MB' },
    { id: 'doc-2', name: 'KRC4 Programming Guide', category: 'Manuals', type: 'manual', pages: 512, version: 'v2.8', lastUpdated: '2025-08-15', description: 'KRL programming language reference for the KRC4 controller. Full command reference, program flow, and interrupt handling.', fileSize: '32.1 MB' },
    { id: 'doc-3', name: 'Electrical Schematics v2.1', category: 'Schematics', type: 'schematic', pages: 48, version: 'v2.1', lastUpdated: '2026-01-05', description: 'Full electrical wiring diagrams for the KR120 installation in Bay 3. Includes cabinet layout and PLC I/O mapping.', fileSize: '6.7 MB' },
    { id: 'doc-4', name: 'Pneumatic Circuit Diagram', category: 'Schematics', type: 'schematic', pages: 12, version: 'v1.3', lastUpdated: '2025-06-30', description: 'Pneumatic schematic for the gripper end-of-arm tooling. Includes valve positions and pressure settings.', fileSize: '2.1 MB' },
    { id: 'doc-5', name: 'Safety Procedures (LOTO) SOP-S-001', category: 'Procedures', type: 'procedure', pages: 24, version: 'v4.0', lastUpdated: '2026-02-28', description: 'Lock-out / tag-out procedure for the KR120 cell. Mandatory for all maintenance activities. Reviewed by Safety Officer.', fileSize: '3.2 MB' },
    { id: 'doc-6', name: 'CE Declaration of Conformity', category: 'Certificates', type: 'certificate', pages: 6, version: 'v1.0', lastUpdated: '2024-09-01', description: 'EU Declaration of Conformity for KUKA KR120R2500pro (Machinery Directive 2006/42/EC). Valid until 2029.', fileSize: '0.8 MB' },
]

const TYPE_ICONS: Record<DocType, typeof FileText> = {
    manual: BookOpen,
    schematic: Wrench,
    procedure: Shield,
    certificate: Hash,
}

function buildNavItems(): NavItem[] {
    const categories = [...new Set(DOCUMENTS.map((d) => d.category))]
    return categories.map((cat) => ({
        id: `cat_${cat}`,
        label: cat,
        meta: `${DOCUMENTS.filter((d) => d.category === cat).length}`,
        children: DOCUMENTS
            .filter((d) => d.category === cat)
            .map((d) => ({
                id: d.id,
                label: d.name,
                badge: { text: d.version, variant: 'zinc' as const },
            })),
    }))
}

const NAV_ITEMS = buildNavItems()

export function DocumentsPanel() {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = selectedId ? DOCUMENTS.find((d) => d.id === selectedId) ?? null : null

    return (
        <PanelLayout
            leftNav={<NavTree items={NAV_ITEMS} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />}
            detail={selected ? <DocumentDetail doc={selected} /> : <DocumentsOverview />}
        />
    )
}

function DocumentsOverview() {
    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Documentation</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · {DOCUMENTS.length} documents</p>
            </div>
            <div className="space-y-2">
                {DOCUMENTS.map((d) => {
                    const Icon = TYPE_ICONS[d.type]
                    return (
                        <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--tp-bg-pill)' }}>
                                <Icon size={14} style={{ color: 'var(--tp-accent-blue)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--tp-text-heading)' }}>{d.name}</p>
                                <p className="text-[10px]" style={{ color: 'var(--tp-text-muted)' }}>{d.pages} pages · {d.fileSize} · {d.version}</p>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function DocumentDetail({ doc }: { doc: Document }) {
    const Icon = TYPE_ICONS[doc.type]
    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--tp-bg-pill)' }}>
                    <Icon size={20} style={{ color: 'var(--tp-accent-blue)' }} />
                </div>
                <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>{doc.name}</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--tp-text-muted)' }}>{doc.category} · {doc.version}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {[
                    { icon: FileText, label: 'Pages', value: `${doc.pages}` },
                    { icon: Calendar, label: 'Updated', value: doc.lastUpdated },
                    { icon: Hash, label: 'File Size', value: doc.fileSize },
                ].map(({ icon: I, label, value }) => (
                    <div key={label} className="rounded-lg p-3" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                            <I size={11} style={{ color: 'var(--tp-text-muted)' }} />
                            <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: 'var(--tp-text-muted)' }}>{label}</p>
                        </div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--tp-text-heading)' }}>{value}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{doc.description}</p>
            </div>

            <button className="w-full py-2.5 text-xs font-bold rounded-lg transition-colors" style={{ background: 'var(--tp-accent-blue)', color: '#fff' }}>
                Open Document
            </button>
        </div>
    )
}
