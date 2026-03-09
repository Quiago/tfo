'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import type { OpshubPost } from '@/lib/types/opshub'
import {
    AlertCircle,
    AlertTriangle,
    ArrowUp,
    Bot,
    HelpCircle,
    Lightbulb,
    Megaphone,
    MessageSquare,
    Workflow
} from 'lucide-react'

function timeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

interface FeedPostProps {
    post: OpshubPost
}

export function FeedPost({ post }: FeedPostProps) {
    const { upvotePost } = useOpshubStore()

    const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
        insight: {
            icon: <Lightbulb className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'Insight'
        },
        question: {
            icon: <HelpCircle className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'Question'
        },
        issue: {
            icon: <AlertCircle className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'Issue'
        },
        pull_request: {
            icon: <Workflow className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'Workflow'
        },
        announcement: {
            icon: <Megaphone className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'News'
        },
        anomaly_alert: {
            icon: <AlertTriangle className="w-3.5 h-3.5" />,
            color: 'text-orange-400',
            label: 'Alert'
        },
        discussion: {
            icon: <MessageSquare className="w-3.5 h-3.5" />,
            color: 'text-zinc-500',
            label: 'Discussion'
        },
        workflow_execution: {
            icon: <Workflow className="w-3.5 h-3.5" />,
            color: 'text-cyan-500',
            label: 'Execution'
        },
    }

    const config = typeConfig[post.type] || typeConfig.insight

    // Generate initials from author name
    const initials = post.authorName
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    return (
        <div className="group border-b border-zinc-800/50 py-4 first:pt-0 last:border-0 hover:bg-zinc-900/30 transition-colors -mx-2 px-2 rounded-md">
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-zinc-950 ${post.authorType === 'ai_agent'
                        ? 'bg-purple-900/20 text-purple-400'
                        : 'bg-zinc-800 text-zinc-400'
                        }`}>
                        {post.authorType === 'ai_agent' ? <Bot className="w-4 h-4" /> : initials}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Header: Title + Meta */}
                    <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-200 hover:text-cyan-400 transition-colors cursor-pointer">
                                {post.title}
                            </span>
                            {/* Type Badge - subtle */}
                            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-800/50 bg-zinc-900/50 ${config.color.replace('text-', 'text-opacity-80 text-')}`}>
                                {config.icon}
                                <span>{config.label}</span>
                            </span>
                        </div>
                        <span className="text-[10px] text-zinc-600 whitespace-nowrap">
                            {timeAgo(post.createdAt)}
                        </span>
                    </div>

                    {/* Meta line */}
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                        <span>{post.authorName}</span>
                    </div>

                    {/* Text Body */}
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-3">
                        {post.content.replace(/\*\*/g, '').replace(/\n\n/g, '\n')}
                    </p>

                    {/* Status / Tags Footer */}
                    <div className="flex items-center gap-3 mt-3">
                        {/* Tags */}
                        {post.tags.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                {post.tags.slice(0, 3).map(tag => (
                                    <span
                                        key={tag}
                                        className="text-[10px] text-cyan-400/80 hover:text-cyan-300 hover:underline cursor-pointer"
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-4 ml-auto">
                            {/* Upvote */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    upvotePost(post.id)
                                }}
                                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors group/btn"
                            >
                                <ArrowUp className="w-3.5 h-3.5 group-hover/btn:text-cyan-400" />
                                <span>{post.upvotes > 0 ? post.upvotes : ''}</span>
                            </button>

                            {/* Comments count */}
                            <button
                                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{post.comments > 0 ? post.comments : ''}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
