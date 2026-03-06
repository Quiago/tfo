'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import s from '@/styles/opshub/work-orders.module.css'
import {
    AlertTriangle,
    ExternalLink,
    Lightbulb,
    Link2,
    Rocket,
    Wrench
} from 'lucide-react'

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ChangelogPanel() {
    const { changelog } = useOpshubStore()

    const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
        release: { icon: <Rocket className="w-3 h-3" />, color: 'bg-emerald-500' },
        insight: { icon: <Lightbulb className="w-3 h-3" />, color: 'bg-amber-500' },
        integration: { icon: <Link2 className="w-3 h-3" />, color: 'bg-blue-500' },
        improvement: { icon: <Wrench className="w-3 h-3" />, color: 'bg-purple-500' },
        alert: { icon: <AlertTriangle className="w-3 h-3" />, color: 'bg-red-500' },
    }

    return (
        <div className={s.changelogContainer}>
            {/* Header */}
            <div className={s.changelogHeader}>
                <h2 className={s.changelogTitle}>
                    Latest from our changelog
                </h2>
            </div>

            {/* Timeline */}
            <div className={s.changelogTimeline}>
                <div className={s.timelineWrapper}>
                    {/* Timeline line */}
                    <div className={s.timelineLine} />

                    {/* Entries */}
                    <ul className={s.timelineList}>
                        {changelog.map((entry) => {
                            const config = typeConfig[entry.type] || typeConfig.improvement
                            // Map tailwind colors to CSS variables or keep inline for dynamic colors if necessary
                            // Using standard colors for now based on config
                            return (
                                <li key={entry.id} className={s.timelineItem}>
                                    {/* Timeline dot */}
                                    <div className={`${s.timelineDot} ${config.color}`} />

                                    {/* Content */}
                                    <div className={s.timelineContent}>
                                        <p className={s.timelineDate}>
                                            {formatDate(entry.date)}
                                        </p>
                                        <p className={s.timelineEntryTitle}>
                                            {entry.title}
                                        </p>
                                        {entry.factoryName && (
                                            <p className={s.timelineFactory}>
                                                {entry.factoryName}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>

            {/* Footer */}
            <div className={s.changelogFooter}>
                <a
                    href="#"
                    className={s.activityLogLink}
                >
                    View activity log
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        </div>
    )
}
