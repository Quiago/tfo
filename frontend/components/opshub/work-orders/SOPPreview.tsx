'use client'

import s from '@/styles/opshub/work-orders.module.css'
import { AlertTriangle, Clock, FileText, Wrench } from 'lucide-react'

// TODO: import from opshub types when available
interface SOPStep {
    title: string
    estimatedMinutes: number
    safetyNote?: string
}

interface SOPPreviewProps {
    title: string
    version: string
    description: string
    steps: SOPStep[]
    requiredParts?: string[]
    requiredTools?: string[]
    totalDuration?: string
}

export function SOPPreview({ title, version, description, steps, requiredParts, requiredTools, totalDuration }: SOPPreviewProps) {
    return (
        <div className={s.sopContainer}>
            {/* Header */}
            <div className={s.sopHeader}>
                <div className={s.sopTitleRow}>
                    <FileText className="w-4 h-4 text-[var(--tp-accent-cyan)]" />
                    <h3 className={s.sopTitle}>{title}</h3>
                    <span className={s.sopVersionBadge}>{version}</span>
                </div>
                <p className={s.sopDescription}>{description}</p>
                {totalDuration && (
                    <div className={s.sopDuration}>
                        <Clock className="w-3 h-3" />
                        Estimated duration: {totalDuration}
                    </div>
                )}
            </div>

            {/* Steps */}
            <div className={s.sopSteps}>
                {steps.map((step, i) => (
                    <div key={i} className={s.sopStepItem}>
                        <div className={s.sopStepNumber}>
                            <span className={s.sopStepNumberText}>{i + 1}</span>
                        </div>
                        <div className={s.sopStepContent}>
                            <div className={s.sopStepTitleRow}>
                                <span className={s.sopStepTitle}>{step.title}</span>
                                <span className={s.sopStepDuration}>{step.estimatedMinutes}min</span>
                            </div>
                            {step.safetyNote && (
                                <div className={s.sopSafetyNote}>
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    {step.safetyNote}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Required Parts/Tools */}
            {(requiredParts?.length || requiredTools?.length) && (
                <div className={s.sopFooter}>
                    {requiredParts && requiredParts.length > 0 && (
                        <div className={s.sopRequirementsColumn}>
                            <h4>
                                <Wrench className="w-3 h-3" /> Parts
                            </h4>
                            <ul className={s.sopRequirementsList}>
                                {requiredParts.map(p => <li key={p}>{p}</li>)}
                            </ul>
                        </div>
                    )}
                    {requiredTools && requiredTools.length > 0 && (
                        <div className={s.sopRequirementsColumn}>
                            <h4>Tools</h4>
                            <ul className={s.sopRequirementsList}>
                                {requiredTools.map(t => <li key={t}>{t}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
