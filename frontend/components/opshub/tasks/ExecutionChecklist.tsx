'use client'

import { AlertTriangle, Camera, ChevronLeft, ChevronRight, CheckCircle, FileText, X } from 'lucide-react'
import { useState } from 'react'
import { ChecklistStep } from './ChecklistStep'

interface Step {
    id: string
    title: string
    instructions: string
    cautionNote?: string
    status: 'pending' | 'completed'
    completedAt?: string
    note?: string
}

interface ExecutionChecklistProps {
    title: string
    steps: Step[]
    onClose: () => void
    onComplete?: () => void
}

const MOCK_STEPS: Step[] = [
    { id: 's1', title: 'Lock out / Tag out Motor A7', instructions: 'Follow LOTO procedure. Verify zero energy state. Attach personal lock and danger tag. Verify motor cannot be started.', cautionNote: 'CRITICAL: Confirm zero energy before proceeding', status: 'completed', completedAt: '2026-02-10T06:15:00Z' },
    { id: 's2', title: 'Remove motor coupling guard', instructions: 'Remove 4x M8 bolts securing the coupling guard. Store bolts in magnetic tray. Inspect guard for damage.', status: 'completed', completedAt: '2026-02-10T06:25:00Z' },
    { id: 's3', title: 'Remove bearing end cap and extract old bearing', instructions: 'Use bearing puller tool (Tool #BP-220). Apply even pressure. Do NOT use hammer. Inspect shaft for scoring.', cautionNote: 'Use correct puller size to avoid shaft damage', status: 'pending' },
    { id: 's4', title: 'Install new bearing SKF-6205', instructions: 'Heat bearing to 80C in induction heater. Slide onto shaft. Ensure proper seating. Apply LGMT-2 lubricant per spec.', cautionNote: 'Do not exceed 110C bearing temperature', status: 'pending' },
    { id: 's5', title: 'Reassemble and verify', instructions: 'Reinstall end cap, coupling guard. Remove LOTO. Start motor. Verify vibration RMS < 2.5 mm/s. Record readings.', status: 'pending' },
]

export function ExecutionChecklist({ title = 'SOP-M-047: Bearing Replacement', steps: initialSteps, onClose, onComplete }: ExecutionChecklistProps) {
    const [steps, setSteps] = useState(initialSteps || MOCK_STEPS)
    const [currentIdx, setCurrentIdx] = useState(() => {
        const firstPending = steps.findIndex(s => s.status === 'pending')
        return firstPending >= 0 ? firstPending : 0
    })
    const [note, setNote] = useState('')
    const [isCompleted, setIsCompleted] = useState(false)

    const completedCount = steps.filter(s => s.status === 'completed').length
    const progress = (completedCount / steps.length) * 100
    const current = steps[currentIdx]
    const allDone = completedCount === steps.length

    const handleCompleteStep = () => {
        setSteps(prev => prev.map((s, i) =>
            i === currentIdx
                ? { ...s, status: 'completed' as const, completedAt: new Date().toISOString(), note: note || undefined }
                : s
        ))
        setNote('')

        if (currentIdx < steps.length - 1) {
            setCurrentIdx(currentIdx + 1)
        } else {
            setIsCompleted(true)
        }
    }

    if (isCompleted || allDone) {
        return (
            <div className="fixed inset-0 z-50 bg-zinc-950/95 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-emerald-900/40 flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-100">All Steps Completed</h2>
                    <p className="text-zinc-400">
                        {completedCount}/{steps.length} steps completed successfully
                    </p>
                    <button
                        onClick={() => { onComplete?.(); onClose() }}
                        className="px-6 py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition"
                    >
                        Close Checklist
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
                </div>
                <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Progress bar */}
            <div className="px-4 py-2 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-zinc-400 font-medium">{completedCount}/{steps.length}</span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Step list sidebar */}
                <div className="w-72 flex-shrink-0 border-r border-zinc-800 overflow-y-auto p-3 space-y-1.5">
                    {steps.map((step, i) => (
                        <ChecklistStep
                            key={step.id}
                            stepNumber={i + 1}
                            title={step.title}
                            status={step.status}
                            completedAt={step.completedAt}
                            isActive={i === currentIdx}
                            onClick={() => setCurrentIdx(i)}
                        />
                    ))}
                </div>

                {/* Current step detail */}
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="max-w-xl w-full space-y-6">
                        {/* Step number */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center text-white font-bold">
                                {currentIdx + 1}
                            </div>
                            <h3 className="text-xl font-bold text-zinc-100">{current.title}</h3>
                        </div>

                        {/* Instructions */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                            <p className="text-sm text-zinc-300 leading-relaxed">{current.instructions}</p>
                        </div>

                        {/* Caution note */}
                        {current.cautionNote && (
                            <div className="flex items-start gap-3 p-3 bg-amber-950/30 border border-amber-900/40 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-300">{current.cautionNote}</p>
                            </div>
                        )}

                        {/* Add note */}
                        <div>
                            <label className="text-xs font-medium text-zinc-400 mb-1 block">Add Note (optional)</label>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="Observations, measurements, findings..."
                                rows={2}
                                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 text-zinc-100 placeholder:text-zinc-600 resize-none"
                            />
                        </div>

                        {/* Attach photo */}
                        <button className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 border border-zinc-700 hover:border-zinc-600 hover:text-zinc-300 rounded-lg transition">
                            <Camera className="w-4 h-4" /> Attach Photo
                        </button>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                            <button
                                onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                                disabled={currentIdx === 0}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                            >
                                <ChevronLeft className="w-4 h-4" /> Previous
                            </button>

                            {current.status === 'pending' ? (
                                <button
                                    onClick={handleCompleteStep}
                                    className="flex items-center gap-2 px-8 py-3 text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition active:scale-95"
                                >
                                    <CheckCircle className="w-5 h-5" /> Complete Step
                                </button>
                            ) : (
                                <button
                                    onClick={() => setCurrentIdx(Math.min(steps.length - 1, currentIdx + 1))}
                                    className="flex items-center gap-1 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition"
                                >
                                    Next <ChevronRight className="w-4 h-4" />
                                </button>
                            )}

                            <button
                                onClick={() => setCurrentIdx(Math.min(steps.length - 1, currentIdx + 1))}
                                disabled={currentIdx === steps.length - 1}
                                className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                            >
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
