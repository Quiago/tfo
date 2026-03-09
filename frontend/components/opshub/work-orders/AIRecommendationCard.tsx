'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { Bot, Check, ChevronDown, ChevronUp, Edit, X } from 'lucide-react'
import { useState } from 'react'

interface AIRecommendationCardProps {
    onApprove?: () => void
    onEdit?: () => void
    onReject?: () => void
}

export function AIRecommendationCard({ onApprove, onEdit, onReject }: AIRecommendationCardProps) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className={s.aiCard}>
            {/* Header */}
            <div className={s.aiHeader}>
                <div className={s.aiTitleRow}>
                    <div className={s.aiTitleBadge}>
                        <Bot className="w-5 h-5" />
                        <span>AI RECOMMENDATION</span>
                        <span className={s.aiStatusBadge}>Pending Review</span>
                    </div>
                    <button onClick={() => setExpanded(!expanded)} className="p-1 text-[var(--tp-text-muted)] hover:text-[var(--tp-text-body)]">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                {/* Pattern detected */}
                <div className={s.aiPatternSection}>
                    <div>
                        <p className={s.aiPatternLabel}>Pattern Detected</p>
                        <p className={s.aiPatternText}>Bearing inner race degradation — vibration signature matches 3 previous failures across Munich and Shanghai</p>
                    </div>
                    <div className={s.aiMetrics}>
                        <div className={s.aiMetricItem}>
                            <span className={s.aiMetricLabel}>Confidence:</span>
                            <span className={s.aiMetricValuePurple}>87%</span>
                        </div>
                        <div className={s.aiMetricItem}>
                            <span className={s.aiMetricLabel}>Prevention Value:</span>
                            <span className={s.aiMetricValueEmerald}>EUR 8,500</span>
                        </div>
                        <div className={s.aiMetricItem}>
                            <span className={s.aiMetricLabel}>Early Detection:</span>
                            <span className={s.aiMetricValueCyan}>72h before failure</span>
                        </div>
                    </div>
                    <div>
                        <span className={s.aiPatternLabel}>Data Sources:</span>
                        <span className={`ml-1 ${s.aiMetricLabel}`}>Vibration sensor, acoustic analysis, oil analysis, temperature probe, cross-facility DB</span>
                    </div>
                    <div>
                        <span className={s.aiPatternLabel}>Applicable Facilities:</span>
                        <span className={`ml-1 ${s.aiMetricLabel}`}>Munich, Shanghai, Detroit (similar motor fleet)</span>
                    </div>
                </div>
            </div>

            {/* Expanded: Workflow + SOP preview */}
            {expanded && (
                <div className={s.aiExpandedContent}>
                    {/* Workflow Preview */}
                    <div className={s.aiWorkflowPreview}>
                        <h4 className={`${s.previewTitle} ${s.previewTitleCyan}`}>Generated Workflow</h4>
                        <div className={s.previewList}>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">TRIGGER:</span> Vibration RMS &gt; 4.0 mm/s for &gt; 30min</p>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">CONDITION:</span> Equipment type = Motor AND bearing_age &gt; 15000h</p>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">ACTION 1:</span> Create Work Order (priority: critical)</p>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">ACTION 2:</span> Reserve spare bearing from inventory</p>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">ACTION 3:</span> Notify shift supervisor + schedule downtime</p>
                            <p><span className="font-semibold text-[var(--tp-text-body)]">ACTION 4:</span> Attach SOP-M-047 to work order</p>
                        </div>
                    </div>

                    {/* SOP Preview */}
                    <div className={s.aiSopPreview}>
                        <h4 className={`${s.previewTitle} ${s.previewTitleEmerald}`}>Generated SOP: Bearing Replacement</h4>
                        <div className="flex gap-4 text-xs text-[var(--tp-text-subtle)] mb-2">
                            <span>5 steps</span>
                            <span>Est. 2h</span>
                            <span>1 spare part required</span>
                        </div>
                        <ol className={`${s.previewList} list-decimal list-inside`}>
                            <li>LOTO: Lock out / tag out motor (15min)</li>
                            <li>Remove coupling guard and end cap (20min)</li>
                            <li>Extract old bearing with puller tool (20min)</li>
                            <li>Install new SKF-6205, apply lubricant (30min)</li>
                            <li>Reassemble, verify vibration &lt; 2.5 mm/s (35min)</li>
                        </ol>
                    </div>

                    {/* AI Note */}
                    <div className={s.aiNote}>
                        <p>
                            Note: Ahmed (Terminal B, Riyadh) reported similar vibration pattern last week. His investigation confirmed bearing degradation on a matching SKF-6205 motor. Applying this protocol proactively could prevent the same failure at multiple facilities.
                        </p>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className={s.aiActions}>
                <button
                    onClick={onApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--tp-accent-green)] hover:bg-[var(--tp-accent-green-light)] rounded transition"
                >
                    <Check className="w-3.5 h-3.5" /> Approve & Publish
                </button>
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tp-text-body)] border border-[var(--tp-stroke)] hover:bg-[var(--tp-bg-hover)] rounded transition"
                >
                    <Edit className="w-3.5 h-3.5" /> Edit First
                </button>
                <button
                    onClick={onReject}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tp-accent-red)] hover:bg-[var(--tp-accent-red-light)] rounded transition"
                >
                    <X className="w-3.5 h-3.5" /> Reject
                </button>
            </div>
        </div>
    )
}
