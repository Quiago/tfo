'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import type { FeedFilter } from '@/lib/types/opshub'
import {
    AlertCircle,
    AlertTriangle,
    Filter,
    GitPullRequest,
    HelpCircle,
    Lightbulb,
    Megaphone,
    MessageSquare,
    Workflow
} from 'lucide-react'
import { AnomalyCard } from './AnomalyCard'
import { FeedPost } from './FeedPost'
import { OpshubInput } from './OpshubInput'

export function OpshubFeed() {
    const {
        feedFilter,
        setFeedFilter,
        getFilteredFeed,
        getPendingAnomalies,
        showOnlyAnomalies,
        toggleAnomaliesOnly,
    } = useOpshubStore()

    const filteredFeed = getFilteredFeed()
    const pendingAnomalies = getPendingAnomalies()

    const filterOptions: { value: FeedFilter; label: string; icon: React.ReactNode }[] = [
        { value: 'all', label: 'All', icon: null },
        { value: 'insight', label: 'Insights', icon: <Lightbulb className="w-3.5 h-3.5" /> },
        { value: 'discussion', label: 'Discussions', icon: <MessageSquare className="w-3.5 h-3.5" /> },
        { value: 'workflow_execution', label: 'Executions', icon: <Workflow className="w-3.5 h-3.5" /> },
        { value: 'question', label: 'Questions', icon: <HelpCircle className="w-3.5 h-3.5" /> },
        { value: 'issue', label: 'Issues', icon: <AlertCircle className="w-3.5 h-3.5" /> },
        { value: 'pull_request', label: 'Proposals', icon: <GitPullRequest className="w-3.5 h-3.5" /> },
        { value: 'announcement', label: 'News', icon: <Megaphone className="w-3.5 h-3.5" /> },
    ]

    return (
        <div className="w-full">
            {/* Input Box */}
            <OpshubInput />

            {/* Pending Anomalies Section */}
            {pendingAnomalies.length > 0 && (
                <div className="mt-6 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <h2 className="text-sm font-semibold text-zinc-300">
                            Pending Anomalies ({pendingAnomalies.length})
                        </h2>
                        <button
                            onClick={toggleAnomaliesOnly}
                            className={`ml-auto text-xs px-2 py-1 rounded transition ${showOnlyAnomalies
                                ? 'bg-amber-900/30 text-amber-400'
                                : 'text-zinc-500 hover:bg-zinc-800'
                                }`}
                        >
                            {showOnlyAnomalies ? 'Show all' : 'Focus'}
                        </button>
                    </div>
                    <div className="space-y-2">
                        {pendingAnomalies.slice(0, 3).map(anomaly => (
                            <AnomalyCard key={anomaly.id} anomaly={anomaly} />
                        ))}
                    </div>
                </div>
            )}

            {/* Feed Section */}
            <div className="mt-6">
                {/* Filter Bar */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
                    <span className="text-sm font-medium text-zinc-300">
                        Feed
                    </span>
                    <div className="flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5 text-zinc-500 mr-1" />
                        {filterOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => setFeedFilter(option.value)}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition ${feedFilter === option.value
                                    ? 'bg-cyan-900/40 text-cyan-400 font-medium'
                                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                                    }`}
                            >
                                {option.icon}
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Posts */}
                {filteredFeed.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-zinc-500">
                            No posts match your filters
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredFeed.map(post => (
                            <FeedPost key={post.id} post={post} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
