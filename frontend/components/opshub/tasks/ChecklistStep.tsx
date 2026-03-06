'use client'

import { Check, Circle } from 'lucide-react'

interface ChecklistStepProps {
    stepNumber: number
    title: string
    status: 'pending' | 'completed'
    completedAt?: string
    isActive?: boolean
    onClick?: () => void
}

export function ChecklistStep({ stepNumber, title, status, completedAt, isActive, onClick }: ChecklistStepProps) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-3 w-full p-3 rounded-lg text-left transition ${
                isActive
                    ? 'bg-cyan-950/30 border border-cyan-800'
                    : status === 'completed'
                        ? 'bg-zinc-900/50 border border-zinc-800 opacity-60'
                        : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700'
            }`}
        >
            {/* Step indicator */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                status === 'completed'
                    ? 'bg-emerald-600 text-white'
                    : isActive
                        ? 'bg-cyan-600 text-white'
                        : 'bg-zinc-800 text-zinc-500'
            }`}>
                {status === 'completed' ? (
                    <Check className="w-4 h-4" />
                ) : (
                    <span className="text-xs font-bold">{stepNumber}</span>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                    {title}
                </p>
                {completedAt && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                        Completed {new Date(completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>
        </button>
    )
}
