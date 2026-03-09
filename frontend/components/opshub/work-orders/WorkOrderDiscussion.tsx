'use client'

import { MentionInput } from '@/components/shared/MentionInput'
import { UserAvatar } from '@/components/shared/UserAvatar'
import s from '@/styles/opshub/work-orders.module.css'
import { Send } from 'lucide-react'
import { useState } from 'react'

// TODO: import from opshub types when available
interface DiscussionComment {
    id: string
    authorName: string
    authorInitials: string
    authorColor: string
    isAI?: boolean
    content: string
    createdAt: string
}

const MOCK_COMMENTS: DiscussionComment[] = [
    {
        id: 'c1', authorName: 'Klaus Muller', authorInitials: 'KM', authorColor: '#3b82f6',
        content: 'Vibration readings confirmed at 4.2 mm/s. Acoustic analysis shows classic inner race defect pattern at 1.2kHz.',
        createdAt: '2026-02-09T14:45:00Z',
    },
    {
        id: 'c2', authorName: 'AI Agent', authorInitials: 'AI', authorColor: '#7c3aed', isAI: true,
        content: 'Based on the vibration signature, I recommend prioritizing this replacement. Pattern matches 3 previous failures at Munich and Shanghai. Estimated bearing RUL: 68-76 hours. @Anna Schmidt should review the oil analysis results for confirmation.',
        createdAt: '2026-02-09T14:50:00Z',
    },
    {
        id: 'c3', authorName: 'Anna Schmidt', authorInitials: 'AS', authorColor: '#8b5cf6',
        content: 'Oil sample collected. Sending to lab. Should have results in 4 hours. @Klaus Muller can you also check the temperature probe on that motor? Last reading seemed high.',
        createdAt: '2026-02-09T15:10:00Z',
    },
    {
        id: 'c4', authorName: 'Hans Weber', authorInitials: 'HW', authorColor: '#f59e0b',
        content: 'I have approved the downtime window for Thursday 06:00-08:00. Production planning is updated. Spare part SKF-6205 confirmed in stock (Bay 3, Shelf C).',
        createdAt: '2026-02-09T15:30:00Z',
    },
]

const TEAM_MEMBERS = [
    { id: 'u1', name: 'Klaus Muller', initials: 'KM' },
    { id: 'u2', name: 'Anna Schmidt', initials: 'AS' },
    { id: 'u3', name: 'Hans Weber', initials: 'HW' },
    { id: 'u4', name: 'AI Agent', initials: 'AI' },
]

function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

function highlightMentions(text: string): React.ReactNode {
    const parts = text.split(/(@\w[\w\s]*\w)/g)
    return parts.map((part, i) =>
        part.startsWith('@') ? (
            <span key={i} className="text-cyan-400 font-medium">{part}</span>
        ) : (
            <span key={i}>{part}</span>
        )
    )
}

export function WorkOrderDiscussion() {
    const [comments, setComments] = useState(MOCK_COMMENTS)
    const [newComment, setNewComment] = useState('')

    const handleSubmit = () => {
        if (!newComment.trim()) return
        const comment: DiscussionComment = {
            id: `c-${Date.now()}`,
            authorName: 'You',
            authorInitials: 'YO',
            authorColor: '#06b6d4',
            content: newComment,
            createdAt: new Date().toISOString(),
        }
        setComments(prev => [...prev, comment])
        setNewComment('')
    }

    return (
        <div className={s.tabContainer}>
            {/* Comments */}
            <div className={s.tabSection}>
                <div className={s.sectionTitle}>Conversation</div>
                <div className="space-y-4">
                    {comments.map(comment => (
                        <div key={comment.id} className="flex gap-3">
                            <UserAvatar
                                initials={comment.authorInitials}
                                color={comment.authorColor}
                                size="md"
                                isAI={comment.isAI}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-zinc-200">{comment.authorName}</span>
                                    {comment.isAI && (
                                        <span className="px-1.5 py-0.5 text-[10px] bg-violet-900/40 text-violet-400 rounded font-medium">AI</span>
                                    )}
                                    <span className="text-xs text-zinc-600">{timeAgo(comment.createdAt)}</span>
                                </div>
                                <div className={`${s.messageBubble} ${comment.isAI ? s.messageBubbleAI : s.messageBubbleUser}`}>
                                    {highlightMentions(comment.content)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Input */}
            <div className={s.tabSection}>
                <div className={s.inputContainer}>
                    <MentionInput
                        value={newComment}
                        onChange={setNewComment}
                        placeholder="Add a comment... (@ to mention, Ctrl+Enter to submit)"
                        members={TEAM_MEMBERS}
                        onSubmit={handleSubmit}
                    />
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={handleSubmit}
                            disabled={!newComment.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--tp-accent-blue)] hover:bg-[var(--tp-accent-blue-light)] disabled:opacity-50 disabled:cursor-not-allowed rounded transition"
                        >
                            <Send className="w-3 h-3" /> Comment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
