'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { ArrowLeft, Bot, RefreshCw, Zap } from 'lucide-react'
import { useState } from 'react'

interface AdaptWorkOrderProps {
    facilityName?: string
    onBack?: () => void
    onActivate?: () => void
}

interface ThresholdAdjustment {
    parameter: string
    originalValue: string
    suggestedValue: string
    unit: string
    aiSuggestion: string
}

interface PartMapping {
    original: string
    mapped: string
    available: boolean
}

const MOCK_THRESHOLDS: ThresholdAdjustment[] = [
    { parameter: 'Vibration RMS Trigger', originalValue: '4.0', suggestedValue: '3.8', unit: 'mm/s', aiSuggestion: 'Lower threshold recommended — desert conditions cause faster bearing wear' },
    { parameter: 'Bearing Age Threshold', originalValue: '15000', suggestedValue: '12000', unit: 'hours', aiSuggestion: 'Reduced due to higher ambient temperatures at Riyadh facility' },
    { parameter: 'Downtime Window', originalValue: '2', suggestedValue: '3', unit: 'hours', aiSuggestion: 'Longer window recommended — parts may need additional cleaning due to sand exposure' },
]

const MOCK_PARTS: PartMapping[] = [
    { original: 'SKF-6205 Deep Groove Bearing', mapped: 'SKF-6205-2RSH (sealed variant)', available: true },
    { original: 'SKF-CR-47697 Seal Kit', mapped: 'SKF-CR-47697 Seal Kit', available: true },
    { original: 'SKF-LGMT-2/1 Lubricant', mapped: 'SKF-LGHP-2/1 (high-temp variant)', available: false },
]

export function AdaptWorkOrder({ facilityName = 'Riyadh Terminal B', onBack, onActivate }: AdaptWorkOrderProps) {
    const [thresholds, setThresholds] = useState(MOCK_THRESHOLDS)

    const handleThresholdChange = (idx: number, value: string) => {
        setThresholds(prev => prev.map((t, i) => i === idx ? { ...t, suggestedValue: value } : t))
    }

    return (
        <div className={s.adaptContainer}>
            {/* Header */}
            <div className={s.adaptHeader}>
                {onBack && (
                    <button onClick={onBack} className={s.backBtn}>
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
                <RefreshCw className="w-4 h-4 text-[var(--tp-accent-cyan)]" />
                <h1 className={s.adaptTitle}>Adapt for {facilityName}</h1>
            </div>

            {/* Content */}
            <div className={s.adaptContent}>
                <div className={s.adaptWrapper}>
                    {/* Workflow Adjustments */}
                    <div className={s.adaptSection}>
                        <h3 className={s.adaptSectionTitle}>
                            <Zap className="w-4 h-4 text-[var(--tp-accent-cyan)]" />
                            Workflow Threshold Adjustments
                        </h3>
                        <div className={s.adaptFormList}>
                            {thresholds.map((t, i) => (
                                <div key={t.parameter} className={s.thresholdItem}>
                                    <div className={s.thresholdHeader}>
                                        <span className={s.thresholdLabel}>{t.parameter}</span>
                                        <span className={s.thresholdOriginal}>
                                            Original: {t.originalValue} {t.unit}
                                        </span>
                                    </div>
                                    <div className={s.thresholdInputWrapper}>
                                        <input
                                            type="text"
                                            value={t.suggestedValue}
                                            onChange={e => handleThresholdChange(i, e.target.value)}
                                            className={s.thresholdInput}
                                        />
                                        <span className={s.thresholdUnit}>{t.unit}</span>
                                    </div>
                                    <div className={s.aiSuggestion}>
                                        <Bot className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                        <span>{t.aiSuggestion}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SOP Part Mapping */}
                    <div className={s.adaptSection}>
                        <h3 className={s.adaptSectionTitle}>SOP Parts Mapping</h3>
                        <div className={s.partMappingList}>
                            {MOCK_PARTS.map(p => (
                                <div key={p.original} className={s.partMappingItem}>
                                    <div className="min-w-0">
                                        <p className={s.partOriginal}>{p.original}</p>
                                        <p className={s.partMapped}>{p.mapped}</p>
                                    </div>
                                    <span className={`${s.partAvailability} ${p.available ? s.partAvailable : s.partUnavailable}`}>
                                        {p.available ? 'Available' : 'Order Required'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Currency Conversion */}
                    <div className={s.adaptSection}>
                        <h3 className={s.adaptSectionTitle}>Cost Conversion</h3>
                        <div className={s.costConversionRow}>
                            <div>
                                <p className={s.costLabel}>Original (EUR)</p>
                                <p className={s.costValueEUR}>EUR 1,930</p>
                            </div>
                            <span className="text-zinc-600">=</span>
                            <div>
                                <p className={s.costLabel}>Local (SAR)</p>
                                <p className={s.costValueLocal}>SAR 7,720</p>
                            </div>
                        </div>
                    </div>

                    {/* Activate */}
                    <button
                        onClick={onActivate}
                        className={s.activateBtn}
                    >
                        Activate for {facilityName}
                    </button>
                </div>
            </div>
        </div>
    )
}
