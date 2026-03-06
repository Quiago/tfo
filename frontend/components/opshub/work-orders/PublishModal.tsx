'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { Check, Globe, X } from 'lucide-react'
import { useState } from 'react'

interface Facility {
    id: string
    name: string
    location: string
    aiRecommended?: boolean
}

interface PublishModalProps {
    facilities: Facility[]
    onConfirm: (selectedIds: string[]) => void
    onCancel: () => void
}

const DEFAULT_FACILITIES: Facility[] = [
    { id: 'factory-munich', name: 'Munich Plant', location: 'Germany', aiRecommended: true },
    { id: 'factory-shanghai', name: 'Shanghai Facility', location: 'China', aiRecommended: true },
    { id: 'factory-detroit', name: 'Detroit Assembly', location: 'USA', aiRecommended: true },
    { id: 'factory-tokyo', name: 'Tokyo Innovation Lab', location: 'Japan' },
    { id: 'factory-saopaulo', name: 'Sao Paulo Hub', location: 'Brazil' },
    { id: 'factory-riyadh', name: 'Riyadh Terminal B', location: 'Saudi Arabia', aiRecommended: true },
]

export function PublishModal({ facilities = DEFAULT_FACILITIES, onConfirm, onCancel }: PublishModalProps) {
    const [selected, setSelected] = useState<Set<string>>(() => {
        const initial = new Set<string>()
        facilities.forEach(f => { if (f.aiRecommended) initial.add(f.id) })
        return initial
    })

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className={s.modalOverlay}>
            <div className={s.modalContent}>
                {/* Header */}
                <div className={s.modalHeader}>
                    <div className={s.modalTitleWrapper}>
                        <Globe className="w-5 h-5 text-[var(--tp-accent-cyan)]" />
                        <h2 className={s.modalTitle}>Publish to Facilities</h2>
                    </div>
                    <button onClick={onCancel} className={s.modalCloseBtn}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Facility list */}
                <div className={s.modalBody}>
                    {facilities.map(f => (
                        <button
                            key={f.id}
                            onClick={() => toggle(f.id)}
                            className={`${s.facilityItem} ${selected.has(f.id)
                                ? s.facilityItemSelected
                                : s.facilityItemUnselected
                                }`}
                        >
                            <div className={`${s.facilityCheckbox} ${selected.has(f.id) ? s.facilityCheckboxSelected : s.facilityCheckboxUnselected
                                }`}>
                                {selected.has(f.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className={s.facilityInfo}>
                                <span className={s.facilityName}>{f.name}</span>
                                <span className={s.facilityLocation}>{f.location}</span>
                            </div>
                            {f.aiRecommended && (
                                <span className={s.facilityBadge}>AI pick</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div className={s.modalFooter}>
                    <button onClick={onCancel} className={s.modalCancelBtn}>
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(Array.from(selected))}
                        disabled={selected.size === 0}
                        className={s.modalConfirmBtn}
                    >
                        Publish to {selected.size} {selected.size === 1 ? 'Facility' : 'Facilities'}
                    </button>
                </div>
            </div>
        </div>
    )
}
