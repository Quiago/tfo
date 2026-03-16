'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem } from '@/lib/types/asset-tree'
import { Mail, MapPin, Phone, User } from 'lucide-react'
import { useState } from 'react'

// ── Mock data ─────────────────────────────────────────────────────────────────

interface Person {
    id: string
    name: string
    role: string
    dept: string
    email: string
    phone: string
    facility: string
    status: 'available' | 'in-field' | 'off-shift'
    avatarColor: string
    avatarInitials: string
    skills: string[]
}

const PEOPLE: Person[] = [
    { id: 'sarah-chen',    name: 'Sarah Chen',      role: 'Plant Manager',          dept: 'Management',    email: 'sarah@tripolar.io',   phone: '+49 89 1234 5001', facility: 'Munich Plant', status: 'available', avatarColor: '#3B82F6', avatarInitials: 'SC', skills: ['Operations', 'Safety', 'ISO 9001'] },
    { id: 'omar-khalid',   name: 'Omar Khalid',     role: 'Reliability Engineer',   dept: 'Maintenance',   email: 'omar@tripolar.io',    phone: '+49 89 1234 5002', facility: 'Munich Plant', status: 'available', avatarColor: '#10B981', avatarInitials: 'OK', skills: ['Vibration Analysis', 'FMEA', 'PdM'] },
    { id: 'ahmed-nasser',  name: 'Ahmed Nasser',    role: 'Maintenance Lead',        dept: 'Maintenance',   email: 'ahmed@tripolar.io',   phone: '+49 89 1234 5003', facility: 'Munich Plant', status: 'in-field', avatarColor: '#EF4444', avatarInitials: 'AN', skills: ['LOTO', 'Hydraulics', 'PLC'] },
    { id: 'lisa-park',     name: 'Lisa Park',       role: 'Reliability Engineer',   dept: 'Maintenance',   email: 'lisa@tripolar.io',    phone: '+49 89 1234 5004', facility: 'Munich Plant', status: 'in-field', avatarColor: '#EC4899', avatarInitials: 'LP', skills: ['Thermography', 'Oil Analysis', 'CBM'] },
    { id: 'carlos-mendez', name: 'Carlos Méndez',   role: 'Shift Lead',             dept: 'Production',    email: 'carlos@tripolar.io',  phone: '+49 89 1234 5005', facility: 'Munich Plant', status: 'available', avatarColor: '#F59E0B', avatarInitials: 'CM', skills: ['Line Management', 'OEE', 'Lean'] },
    { id: 'ana-reyes',     name: 'Ana Reyes',       role: 'Quality Inspector',      dept: 'Quality',       email: 'ana@tripolar.io',     phone: '+49 89 1234 5006', facility: 'Munich Plant', status: 'available', avatarColor: '#8B5CF6', avatarInitials: 'AR', skills: ['SPC', 'Gauge R&R', 'PPAP'] },
    { id: 'david-lee',     name: 'David Lee',       role: 'Operator',               dept: 'Production',    email: 'david@tripolar.io',   phone: '+49 89 1234 5007', facility: 'Munich Plant', status: 'off-shift', avatarColor: '#6366F1', avatarInitials: 'DL', skills: ['KUKA Operation', 'SOP R-012'] },
]

const STATUS_LABEL: Record<Person['status'], string> = {
    available: 'Available',
    'in-field': 'In Field',
    'off-shift': 'Off Shift',
}

const STATUS_COLOR: Record<Person['status'], string> = {
    available: 'green',
    'in-field': 'amber',
    'off-shift': 'zinc',
}

// Build nav tree: Department → Role → Person
function buildNavItems(): NavItem[] {
    const depts = [...new Set(PEOPLE.map((p) => p.dept))]
    return depts.map((dept) => {
        const deptPeople = PEOPLE.filter((p) => p.dept === dept)
        const roles = [...new Set(deptPeople.map((p) => p.role))]
        return {
            id: `dept_${dept}`,
            label: dept,
            meta: `${deptPeople.length}`,
            children: roles.map((role) => {
                const rolePeople = deptPeople.filter((p) => p.role === role)
                return {
                    id: `role_${dept}_${role}`,
                    label: role,
                    meta: `${rolePeople.length}`,
                    children: rolePeople.map((p) => ({
                        id: p.id,
                        label: p.name,
                        badge: { text: STATUS_LABEL[p.status], variant: STATUS_COLOR[p.status] as NonNullable<NavItem['badge']>['variant'] },
                    })),
                }
            }),
        }
    })
}

const NAV_ITEMS = buildNavItems()

// ── Component ─────────────────────────────────────────────────────────────────

export function PeoplePanel() {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const selectedPerson = selectedId ? PEOPLE.find((p) => p.id === selectedId) ?? null : null

    return (
        <PanelLayout
            leftNav={
                <NavTree
                    items={NAV_ITEMS}
                    selectedId={selectedId}
                    onSelect={(item) => setSelectedId(item.id)}
                />
            }
            detail={selectedPerson ? <PersonDetail person={selectedPerson} /> : <PeopleOverview />}
        />
    )
}

function PeopleOverview() {
    const byStatus = {
        available: PEOPLE.filter((p) => p.status === 'available').length,
        'in-field': PEOPLE.filter((p) => p.status === 'in-field').length,
        'off-shift': PEOPLE.filter((p) => p.status === 'off-shift').length,
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Team Overview</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>Munich Plant · KUKA KR120 Production Line</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {([['Available', byStatus.available, '#10b981'], ['In Field', byStatus['in-field'], '#f59e0b'], ['Off Shift', byStatus['off-shift'], '#6b7280']] as const).map(([label, val, color]) => (
                    <div key={label} className="rounded-xl p-4 text-center" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <p className="text-2xl font-bold" style={{ color }}>{val}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--tp-text-muted)' }}>{label}</p>
                    </div>
                ))}
            </div>

            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>All Members</p>
                {PEOPLE.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: p.avatarColor }}>
                            {p.avatarInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: 'var(--tp-text-heading)' }}>{p.name}</p>
                            <p className="text-[10px] truncate" style={{ color: 'var(--tp-text-muted)' }}>{p.role}</p>
                        </div>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${p.status === 'available' ? 'bg-green-100 text-green-700' : p.status === 'in-field' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-600'}`}>
                            {STATUS_LABEL[p.status]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function PersonDetail({ person }: { person: Person }) {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0" style={{ background: person.avatarColor }}>
                    {person.avatarInitials}
                </div>
                <div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--tp-text-heading)' }}>{person.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>{person.role} · {person.dept}</p>
                    <span className={`inline-block mt-1 text-[9px] font-semibold px-2 py-0.5 rounded-full ${person.status === 'available' ? 'bg-green-100 text-green-700' : person.status === 'in-field' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-600'}`}>
                        {STATUS_LABEL[person.status]}
                    </span>
                </div>
            </div>

            {/* Contact */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--tp-text-muted)' }}>Contact</p>
                {[
                    { icon: Mail, label: person.email },
                    { icon: Phone, label: person.phone },
                    { icon: MapPin, label: person.facility },
                ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2">
                        <Icon size={12} style={{ color: 'var(--tp-text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--tp-text-body)' }}>{label}</span>
                    </div>
                ))}
            </div>

            {/* Skills */}
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tp-text-muted)' }}>Skills</p>
                <div className="flex flex-wrap gap-2">
                    {person.skills.map((s) => (
                        <span key={s} className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'var(--tp-bg-pill)', color: 'var(--tp-accent-blue)', border: '1px solid var(--tp-stroke)' }}>
                            {s}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}
