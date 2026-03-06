'use client'

import { MOCK_VOICE_INTENT, MOCK_VOICE_INTENT_BEARING } from '@/lib/hooks/useWorkflowMockData'
import { useWorkflowStore } from '@/lib/store/workflow-store'
import { Loader2, MessageSquare, Mic, MicOff, Send, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface VoiceInputProps {
    className?: string
}

export function VoiceInput({ className = '' }: VoiceInputProps) {
    const {
        isVoiceRecording,
        voiceTranscript,
        setVoiceRecording,
        setVoiceTranscript,
        setConfirmationCard,
    } = useWorkflowStore()

    const [isProcessing, setIsProcessing] = useState(false)
    const [showTextInput, setShowTextInput] = useState(false)
    const [textInput, setTextInput] = useState('')
    const textInputRef = useRef<HTMLInputElement>(null)

    // Focus text input when opened
    useEffect(() => {
        if (showTextInput && textInputRef.current) {
            textInputRef.current.focus()
        }
    }, [showTextInput])

    // Simulate voice recording (in production: Web Speech API / Whisper)
    const handleMicPress = useCallback(() => {
        if (isVoiceRecording) {
            // Stop recording
            setVoiceRecording(false)
            setIsProcessing(true)

            // Simulate AI processing delay
            setTimeout(() => {
                setIsProcessing(false)

                // DEMO LOGIC: Check for bearing intent keys
                // In a real app we'd analyze specific keywords from the audio stream
                const transcript = 'Create a workflow to replace the bearing assembly on the KUKA robot. Check for shaft damage and ensure LOTO procedures.'
                const useBearingIntent = true

                setVoiceTranscript(transcript)

                // Simulate AI intent parsing result
                setConfirmationCard({
                    workflowIntent: useBearingIntent ? MOCK_VOICE_INTENT_BEARING : MOCK_VOICE_INTENT,
                    status: 'pending',
                })
            }, 1500)
        } else {
            // Start recording
            setVoiceRecording(true)
            setVoiceTranscript('')
        }
    }, [isVoiceRecording, setVoiceRecording, setVoiceTranscript, setConfirmationCard])

    // Handle text submission
    const handleTextSubmit = useCallback(() => {
        if (!textInput.trim()) return
        setIsProcessing(true)
        setVoiceTranscript(textInput)

        const isBearing = textInput.toLowerCase().includes('bearing')

        setTimeout(() => {
            setIsProcessing(false)
            setConfirmationCard({
                workflowIntent: isBearing ? MOCK_VOICE_INTENT_BEARING : MOCK_VOICE_INTENT,
                status: 'pending',
            })
            setTextInput('')
            setShowTextInput(false)
        }, 1500)
    }, [textInput, setVoiceTranscript, setConfirmationCard])

    return (
        <div className={`flex flex-col items-center gap-2 ${className}`}>
            {/* Transcript preview */}
            {voiceTranscript && !isProcessing && (
                <div className="max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 backdrop-blur-sm">
                    <p className="text-xs text-zinc-400">{voiceTranscript}</p>
                </div>
            )}

            {/* Processing indicator */}
            {isProcessing && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 backdrop-blur-sm">
                    <Loader2 size={14} className="animate-spin text-amber-400" />
                    <p className="text-xs text-zinc-400">Understanding your request...</p>
                </div>
            )}

            {/* Text input bar */}
            {showTextInput && (
                <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2 backdrop-blur-sm">
                    <input
                        ref={textInputRef}
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                        placeholder="Describe your workflow..."
                        className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
                    />
                    <button
                        onClick={handleTextSubmit}
                        disabled={!textInput.trim() || isProcessing}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white transition-colors hover:bg-amber-500 disabled:opacity-40"
                    >
                        <Send size={12} />
                    </button>
                    <button
                        onClick={() => setShowTextInput(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Control buttons */}
            <div className="flex items-center gap-3">
                {/* Text input toggle */}
                <button
                    onClick={() => setShowTextInput(!showTextInput)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80 text-zinc-400 backdrop-blur-sm transition-all hover:border-zinc-600 hover:text-zinc-200"
                    title="Type instead"
                >
                    <MessageSquare size={16} />
                </button>

                {/* Microphone button */}
                <button
                    onClick={handleMicPress}
                    disabled={isProcessing}
                    className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-all ${isVoiceRecording
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                        : 'border-2 border-zinc-600 bg-zinc-800/80 text-zinc-300 backdrop-blur-sm hover:border-amber-500 hover:text-amber-400'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                    title={isVoiceRecording ? 'Stop recording' : 'Start recording'}
                >
                    {isVoiceRecording ? (
                        <>
                            <MicOff size={20} />
                            {/* Recording pulse animation */}
                            <span className="absolute inset-0 animate-ping rounded-full bg-rose-600/30" />
                        </>
                    ) : (
                        <Mic size={20} />
                    )}
                </button>
            </div>
        </div>
    )
}
