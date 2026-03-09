'use client'

import {
    Box,
    Calendar,
    CheckCircle,
    Cog,
    MapPin,
    Search
} from 'lucide-react'

interface WorkOrderOverviewProps {
    workOrder: {
        status: string
        priority: string
        createdAt: string
        resolvedAt?: string
        equipmentName: string
        equipmentId: string
        location: string
        factoryName: string
        rootCause?: string
        spareParts?: { name: string; partNumber: string; quantity: number; inStock: boolean }[]
        costSummary?: { labor: number; parts: number; downtime: number; total: number }
    }
}

const statusBadge: Record<string, string> = {
    open: 'bg-emerald-900/40 text-emerald-400',
    'in-progress': 'bg-cyan-900/40 text-cyan-400',
    resolved: 'bg-purple-900/40 text-purple-400',
    closed: 'bg-zinc-700 text-zinc-400',
}

const priorityBadge: Record<string, string> = {
    critical: 'bg-red-900/40 text-red-400',
    high: 'bg-orange-900/40 text-orange-400',
    medium: 'bg-amber-900/40 text-amber-400',
    low: 'bg-blue-900/40 text-blue-400',
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
}

import s from '@/styles/opshub/work-orders.module.css'

// ... existing imports

export function WorkOrderOverview({ workOrder }: WorkOrderOverviewProps) {
    return (
        <div className={s.overviewContainer}>
            {/* Dates & Meta */}
            <div className={s.metaRow}>
                <div className={s.metaItem}>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Created <strong className={s.metaValue}>{formatDate(workOrder.createdAt)}</strong></span>
                </div>
                {workOrder.resolvedAt && (
                    <div className={`${s.metaItem} text-emerald-600`}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Resolved <strong>{formatDate(workOrder.resolvedAt)}</strong></span>
                    </div>
                )}
            </div>

            {/* Equipment Info */}
            <div>
                <h3 className={s.sectionTitle}>Equipment Context</h3>
                <div className={s.infoCard}>
                    <div className={s.infoGrid}>
                        <div className={s.infoItem}>
                            <Cog className="w-4 h-4 text-zinc-400 mt-0.5" />
                            <div>
                                <p className={s.infoLabel}>Asset Name</p>
                                <p className={s.infoValue}>{workOrder.equipmentName}</p>
                            </div>
                        </div>
                        <div className={s.infoItem}>
                            <Box className="w-4 h-4 text-zinc-400 mt-0.5" />
                            <div>
                                <p className={s.infoLabel}>Asset ID</p>
                                <p className={`${s.infoValue} font-mono text-xs`}>{workOrder.equipmentId}</p>
                            </div>
                        </div>
                        <div className={s.infoItem}>
                            <MapPin className="w-4 h-4 text-zinc-400 mt-0.5" />
                            <div>
                                <p className={s.infoLabel}>Location</p>
                                <p className={s.infoValue}>{workOrder.location}</p>
                            </div>
                        </div>
                        <div className={s.infoItem}>
                            <MapPin className="w-4 h-4 text-zinc-400 mt-0.5" />
                            <div>
                                <p className={s.infoLabel}>Facility</p>
                                <p className={s.infoValue}>{workOrder.factoryName}</p>
                            </div>
                        </div>
                    </div>
                    <button className={s.locateBtn}>
                        <Box className="w-3.5 h-3.5" /> Locate in Digital Twin
                    </button>
                </div>
            </div>

            {/* Root Cause */}
            {workOrder.rootCause && (
                <div>
                    <h3 className={s.sectionTitle}>Root Cause Analysis</h3>
                    <div className={s.infoCard}>
                        <div className="flex gap-3">
                            <Search className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-zinc-700 leading-relaxed">{workOrder.rootCause}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Spare Parts */}
            {workOrder.spareParts && workOrder.spareParts.length > 0 && (
                <div>
                    <h3 className={s.sectionTitle}>Required Parts</h3>
                    <div className={s.tableContainer}>
                        <table className={s.table}>
                            <thead className={s.tableHeader}>
                                <tr>
                                    <th>Part Name</th>
                                    <th>Part #</th>
                                    <th className="text-right">Qty</th>
                                    <th>Availability</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workOrder.spareParts.map(part => (
                                    <tr key={part.partNumber} className={s.tableRow}>
                                        <td className={s.tableCell}>{part.name}</td>
                                        <td className={`${s.tableCell} font-mono text-xs text-zinc-500`}>{part.partNumber}</td>
                                        <td className={`${s.tableCell} text-right`}>{part.quantity}</td>
                                        <td className={s.tableCell}>
                                            <span className={`text-xs ${part.inStock ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}`}>
                                                {part.inStock ? 'In Stock' : 'On Order'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
