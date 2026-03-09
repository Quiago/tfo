'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import type { InputActionType, PostType } from '@/lib/types/opshub'
import {
    AlertCircle,
    ClipboardList,
    Send,
    Sparkles,
    Workflow,
    X
} from 'lucide-react'
import { useState } from 'react'

export function OpshubInput() {
    const {
        activeInputAction,
        setActiveInputAction,
        createPost,
        factories,
        selectedFactoryId,
    } = useOpshubStore()

    const [inputValue, setInputValue] = useState('')
    const [title, setTitle] = useState('')

    const actions: { type: InputActionType; label: string; icon: React.ReactNode; postType: PostType }[] = [
        { type: 'ask_ai', label: 'Ask AI', icon: <Sparkles className="w-4 h-4" />, postType: 'question' },
        { type: 'work_order', label: 'Work Order', icon: <ClipboardList className="w-4 h-4" />, postType: 'insight' },
        { type: 'report_issue', label: 'Report Issue', icon: <AlertCircle className="w-4 h-4" />, postType: 'issue' },
        { type: 'propose_workflow', label: 'Workflow', icon: <Workflow className="w-4 h-4" />, postType: 'pull_request' },
    ]

    const activeAction = actions.find(a => a.type === activeInputAction)

    const handleSubmit = () => {
        if (!inputValue.trim()) return

        const factory = factories.find(f => f.id === selectedFactoryId) || factories[0]

        createPost({
            type: activeAction?.postType || 'question',
            authorType: 'human',
            authorId: factory?.id || 'user',
            authorName: factory?.displayName || 'You',
            title: title || inputValue.slice(0, 60) + (inputValue.length > 60 ? '...' : ''),
            content: inputValue,
            tags: [],
            status: 'open',
        })

        setInputValue('')
        setTitle('')
        setActiveInputAction(null)
    }

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Collapsed state */}
            {!activeInputAction && (
                <div className="p-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Ask AI, create a work order, or report an issue..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={() => setActiveInputAction('ask_ai')}
                            className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-zinc-500"
                        />
                    </div>

                    {/* Action buttons row */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                        {actions.map(action => (
                            <button
                                key={action.type}
                                onClick={() => setActiveInputAction(action.type)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-200 rounded-md transition"
                            >
                                {action.icon}
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Expanded state */}
            {activeInputAction && (
                <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                            {activeAction?.icon}
                            <span>
                                {activeAction?.type === 'ask_ai' && 'Ask the AI Assistant'}
                                {activeAction?.type === 'work_order' && 'Create Work Order'}
                                {activeAction?.type === 'report_issue' && 'Report an Issue'}
                                {activeAction?.type === 'propose_workflow' && 'Propose Workflow Improvement'}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setActiveInputAction(null)
                                setInputValue('')
                                setTitle('')
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-300 transition"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Title input */}
                    <input
                        type="text"
                        placeholder={
                            activeAction?.type === 'work_order'
                                ? 'Equipment or task (e.g., "Motor A7 bearing replacement")'
                                : 'Title (optional)'
                        }
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-zinc-500 mb-2"
                    />

                    {/* Content textarea */}
                    <textarea
                        placeholder={
                            activeAction?.type === 'ask_ai'
                                ? 'Ask about equipment issues, maintenance procedures, or best practices across facilities...'
                                : activeAction?.type === 'work_order'
                                    ? 'Describe the work to be done, include equipment location, priority, and any safety notes...'
                                    : activeAction?.type === 'report_issue'
                                        ? 'Describe what you observed: equipment behavior, readings, when it started...'
                                        : 'Describe your proposed workflow improvement and expected benefits...'
                        }
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-zinc-500 resize-none"
                    />

                    {/* Submit row */}
                    <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1">
                            {actions.map(action => (
                                <button
                                    key={action.type}
                                    onClick={() => setActiveInputAction(action.type)}
                                    className={`p-2 rounded-md transition ${activeInputAction === action.type
                                            ? 'bg-cyan-900/30 text-cyan-400'
                                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                        }`}
                                >
                                    {action.icon}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={!inputValue.trim()}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-md transition"
                        >
                            <Send className="w-4 h-4" />
                            {activeAction?.type === 'ask_ai' ? 'Ask' :
                                activeAction?.type === 'work_order' ? 'Create WO' : 'Submit'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
