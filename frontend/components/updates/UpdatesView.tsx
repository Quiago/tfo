'use client'

import s from '@/styles/updates/updates.module.css'
import {
    Activity,
    Box,
    Clock,
    LayoutGrid,
    ShieldCheck,
    Star,
    Zap
} from 'lucide-react'
import { useState } from 'react'

const CATEGORIES = [
    { id: 'all', label: 'All Updates', icon: LayoutGrid },
    { id: 'maintenance', label: 'Maintenance', icon: Activity },
    { id: 'energy', label: 'Energy', icon: Zap },
    { id: 'safety', label: 'Safety', icon: ShieldCheck },
    { id: 'logistics', label: 'Logistics', icon: Box },
]

import { useTfoStore } from '@/lib/store/tfo-store'

export function UpdatesView() {
    const [selectedCategory, setSelectedCategory] = useState('all')
    const { systemUpdates, activeLocationId } = useTfoStore()

    // Filter updates:
    // 1. Must NOT match current active location (show only remote updates)
    // 2. OR if it has no sourceFactoryId (legacy/system updates), keep it
    const availableUpdates = systemUpdates.filter(u =>
        !u.sourceFactoryId || u.sourceFactoryId !== activeLocationId
    ).sort((a, b) => Number(b.id) - Number(a.id)) // Ensure newest (timestamp IDs) appear first

    const filteredUpdates = selectedCategory === 'all'
        ? availableUpdates
        : availableUpdates.filter(u => u.category === selectedCategory)

    return (
        <div className={s.updatesContainer}>
            <div className={s.layoutFrame}>
                {/* Left Sidebar */}
                <aside className={s.sidebar}>
                    <div className={s.sidebarSection}>
                        <h3 className={s.sidebarTitle}>Categories</h3>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`${s.navButton} ${selectedCategory === cat.id ? s.navButtonActive : ''}`}
                                onClick={() => setSelectedCategory(cat.id)}
                            >
                                <cat.icon className={s.iconSm} />
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className={s.sidebarSection}>
                        <h3 className={s.sidebarTitle}>Filters</h3>
                        <button className={s.navButton}>
                            <Clock className={s.iconSm} />
                            Recent
                        </button>
                        <button className={s.navButton}>
                            <Star className={`${s.iconSm} ${s.starIcon}`} />
                            Top Rated
                        </button>
                    </div>
                </aside>

                {/* Right Main Content */}
                <main className={s.mainContent}>
                    {/* System Info Panel */}
                    <div className={s.systemInfoPanel}>
                        <div className={s.systemInfoLeft}>
                            <h1 className={s.systemTitle}>Cross-Facility Intelligence™</h1>
                            <div className={s.systemMeta}>
                                <span>Last Update: January 28, 2025, 03:15 AM</span>
                                <span>Next Scheduled Update: February 17, 2025, 02:00 AM</span>
                                <span>System Version: Tripolar OS 4.2.1</span>
                            </div>
                        </div>
                        <div className={s.systemInfoRight}>
                            <div className={s.updateSummary}>
                                <div className={s.summaryItem}>
                                    <span className={s.warningIcon}>⚠️</span>
                                    <span>3 Critical Updates Available</span>
                                </div>
                                <div className={s.summaryItem}>
                                    <span className={s.infoIcon}>📦</span>
                                    <span>5 Recommended Updates Available</span>
                                </div>
                                <div className={s.summaryItem}>
                                    <span className={s.checkIcon}>✓</span>
                                    <span>All systems current as of 14 days ago</span>
                                </div>
                            </div>
                            <button className={s.updateAllBtn}>Update All</button>
                        </div>
                    </div>

                    <h2 className={s.sectionHeader}>
                        <LayoutGrid className={s.iconSm} />
                        Available Updates
                        <span className="ml-4 text-xs font-normal text-zinc-500">
                            (Current Location: {activeLocationId})
                        </span>
                    </h2>

                    <div className={s.updateList}>
                        {filteredUpdates.map((update) => (
                            <div key={update.id} className={s.updateCard}>
                                {/* Content */}
                                <div className={s.cardBody}>
                                    <div className={s.cardHeader}>
                                        <div>
                                            <div className={s.cardTitleRow}>
                                                <span className={update.type === 'CRITICAL' ? s.dotCritical : s.dotFirmware}>●</span>
                                                <span className={s.updateType}>{update.type} - </span>
                                                <h4 className={s.cardTitle}>{update.title}</h4>
                                                {/* Debug Info */}
                                                {update.sourceFactoryId && (
                                                    <span className="ml-2 text-[10px] text-zinc-400 border border-zinc-700 px-1 rounded">
                                                        Src: {update.sourceFactoryId}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={s.cardSubtext}>
                                                Affects: {update.author}
                                            </div>
                                            <div className={s.cardMetaRow}>
                                                <span>Release Date: {update.date}</span>
                                                <span>Size: {update.size}</span>
                                            </div>
                                            <div className={s.cardMetaRow}>
                                                <span>Estimated Downtime: {update.downtime}</span>
                                            </div>
                                        </div>
                                        <button className={s.detailsLink}>
                                            <Box className={s.iconXs} /> Details
                                        </button>
                                    </div>

                                    <p className={s.cardDesc}>{update.description}</p>

                                    <div className={s.cardFooter}>
                                        <div className={s.actionButtons}>
                                            <button className={s.scheduleBtn}>
                                                <Clock className={s.iconSm} />
                                                Schedule Update
                                            </button>
                                            <button className={s.installButton}>
                                                Update Now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    )
}
