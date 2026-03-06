'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { ArrowLeft, BookOpen, ClipboardList, FileText, GitFork, Workflow } from 'lucide-react'
import { useState } from 'react'
import { SOPPreview } from './SOPPreview'

type PackageTab = 'summary' | 'workflow' | 'sop' | 'source'

const TABS: { id: PackageTab; label: string; icon: React.ReactNode }[] = [
    { id: 'summary', label: 'Summary', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'workflow', label: 'Workflow', icon: <Workflow className="w-4 h-4" /> },
    { id: 'sop', label: 'SOP', icon: <FileText className="w-4 h-4" /> },
    { id: 'source', label: 'Source WO', icon: <ClipboardList className="w-4 h-4" /> },
]

interface PackageDetailViewProps {
    onBack?: () => void
    onAdapt?: () => void
}

export function PackageDetailView({ onBack, onAdapt }: PackageDetailViewProps) {
    const [activeTab, setActiveTab] = useState<PackageTab>('summary')

    return (
        <div className={s.packageContainer}>
            {/* Header */}
            <div className={s.packageHeader}>
                {onBack && (
                    <button onClick={onBack} className={s.backBtn}>
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
                <GitFork className="w-4 h-4 text-[var(--tp-accent-purple)]" />
                <div className={s.packageTitleBlock}>
                    <h1 className={s.packageTitle}>Cross-Facility Package: Bearing Failure Protocol</h1>
                    <p className={s.packageMeta}>From Munich Plant — Published Feb 9, 2026</p>
                </div>
            </div>

            {/* Tabs */}
            <div className={s.packageTabs}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`${s.packageTabBtn} ${activeTab === tab.id
                            ? s.packageTabBtnActive
                            : ''
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className={s.packageContent}>
                {activeTab === 'summary' && (
                    <div className={s.packageWrapper}>
                        <div className={s.packageSummaryCard}>
                            <h3 className={s.adaptSectionTitle}>Package Summary</h3>
                            <div className="space-y-2 text-sm text-[var(--tp-text-muted)]">
                                <p className={s.packageSummaryText}>Proactive bearing replacement protocol developed by Munich Plant after Motor A7 failure. This package includes the complete workflow, SOP, and learnings from the original work order.</p>
                                <div className={s.packageMetricsGrid}>
                                    <div className={s.packageMetricItem}>
                                        <p className={s.packageMetricLabel}>Prevention Value</p>
                                        <p className={s.packageMetricValue} style={{ color: 'var(--tp-accent-green)' }}>EUR 8,500</p>
                                    </div>
                                    <div className={s.packageMetricItem}>
                                        <p className={s.packageMetricLabel}>Early Detection</p>
                                        <p className={s.packageMetricValue} style={{ color: 'var(--tp-accent-cyan)' }}>72h</p>
                                    </div>
                                    <div className={s.packageMetricItem}>
                                        <p className={s.packageMetricLabel}>Adopted By</p>
                                        <p className={s.packageMetricValue} style={{ color: 'var(--tp-accent-purple)' }}>3 facilities</p>
                                    </div>
                                    <div className={s.packageMetricItem}>
                                        <p className={s.packageMetricLabel}>Success Rate</p>
                                        <p className={s.packageMetricValue} style={{ color: 'var(--tp-accent-green)' }}>100%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {onAdapt && (
                            <button
                                onClick={onAdapt}
                                className={s.activateBtn}
                            >
                                Adapt for Your Facility
                            </button>
                        )}
                    </div>
                )}

                {activeTab === 'workflow' && (
                    <div className={`${s.packageWrapper} ${s.adaptSection}`}>
                        <h3 className={s.adaptSectionTitle} style={{ color: 'var(--tp-accent-cyan)' }}>Workflow: Bearing Failure Early Warning</h3>
                        <div className={s.packageWorkflowList}>
                            <p><span className="text-[var(--tp-text-subtle)]">TRIGGER:</span> Vibration RMS &gt; 4.0 mm/s sustained for &gt; 30min</p>
                            <p><span className="text-[var(--tp-text-subtle)]">CONDITION:</span> Equipment = Motor, bearing_age &gt; 15000h</p>
                            <p><span className="text-[var(--tp-text-subtle)]">ACTION 1:</span> Create Work Order (priority: critical, assign: shift lead)</p>
                            <p><span className="text-[var(--tp-text-subtle)]">ACTION 2:</span> Reserve spare bearing from inventory (SKF-6205)</p>
                            <p><span className="text-[var(--tp-text-subtle)]">ACTION 3:</span> Notify shift supervisor via push notification</p>
                            <p><span className="text-[var(--tp-text-subtle)]">ACTION 4:</span> Schedule 2h downtime window in production planner</p>
                            <p><span className="text-[var(--tp-text-subtle)]">ACTION 5:</span> Attach SOP-M-047 to work order</p>
                        </div>
                    </div>
                )}

                {activeTab === 'sop' && (
                    <div className={s.packageWrapper}>
                        <SOPPreview
                            title="SOP-M-047: Bearing Replacement Procedure"
                            version="v2.1"
                            description="Standard operating procedure for deep groove ball bearing replacement on conveyor drive motors."
                            totalDuration="~2 hours"
                            steps={[
                                { title: 'Lock out / Tag out motor', estimatedMinutes: 15, safetyNote: 'Confirm zero energy before proceeding' },
                                { title: 'Remove motor coupling guard', estimatedMinutes: 20 },
                                { title: 'Remove bearing end cap and extract old bearing', estimatedMinutes: 20, safetyNote: 'Use correct puller size' },
                                { title: 'Install new bearing SKF-6205', estimatedMinutes: 30, safetyNote: 'Do not exceed 110C temperature' },
                                { title: 'Reassemble and verify vibration < 2.5 mm/s', estimatedMinutes: 35 },
                            ]}
                            requiredParts={['SKF-6205 Bearing', 'SKF-CR-47697 Seal Kit', 'SKF-LGMT-2/1 Lubricant']}
                            requiredTools={['Bearing Puller BP-220', 'Induction Heater', 'Torque Wrench', 'Vibration Meter']}
                        />
                    </div>
                )}

                {activeTab === 'source' && (
                    <div className={`${s.packageWrapper} ${s.adaptSection}`}>
                        <h3 className={s.adaptSectionTitle}>Source Work Order: WO-4821</h3>
                        <div className={s.packageSourceDetail}>
                            <div className={s.packageSourceItem}>
                                <p className={s.packageSourceLabel}>Facility</p>
                                <p className={s.packageSourceValue}>Munich Plant, Germany</p>
                            </div>
                            <div className={s.packageSourceItem}>
                                <p className={s.packageSourceLabel}>Equipment</p>
                                <p className={s.packageSourceValue}>Motor A7 — Conveyor Drive Line 3</p>
                            </div>
                            <div className={s.packageSourceItem}>
                                <p className={s.packageSourceLabel}>Root Cause</p>
                                <p className={s.packageSourceValue}>Inner race bearing defect (fatigue failure at ~18,000 operating hours)</p>
                            </div>
                            <div className={s.packageSourceItem}>
                                <p className={s.packageSourceLabel}>Resolution</p>
                                <p className={s.packageSourceValue}>Proactive bearing replacement during planned downtime. Zero unplanned downtime.</p>
                            </div>
                            <div className={s.packageSourceItem}>
                                <p className={s.packageSourceLabel}>Savings Achieved</p>
                                <p className={s.packageSourceValue} style={{ color: 'var(--tp-accent-green)' }}>EUR 8,500 in avoided unplanned downtime</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
