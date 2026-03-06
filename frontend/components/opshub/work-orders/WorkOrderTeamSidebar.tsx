'use client'

import { UserAvatar } from '@/components/shared/UserAvatar'
import { TeamMember } from '@/lib/types/opshub'
import s from '@/styles/opshub/work-orders.module.css'
import { DollarSign, Plus, Tag } from 'lucide-react'

interface WorkOrderTeamSidebarProps {
    team: TeamMember[]
    riskAmount?: number
    tags: string[]
    aiStatus?: string
}

const roleColor: Record<string, string> = {
    'Lead Technician': 'text-cyan-400',
    'Reliability Engineer': 'text-purple-400',
    'Shift Supervisor': 'text-amber-400',
    'Maintenance Tech': 'text-emerald-400',
    'AI Agent': 'text-violet-400',
}

export function WorkOrderTeamSidebar({ team, riskAmount, tags, aiStatus }: WorkOrderTeamSidebarProps) {
    return (
        <div className={s.teamSidebarContainer}>
            {/* Team Section */}
            <div>
                <div className={s.teamSidebarHeader}>
                    <h3 className={s.teamSidebarTitle}>Team</h3>
                    <button className={s.teamAssignBtn}>
                        <Plus className="w-3 h-3" /> Assign
                    </button>
                </div>
                <div className={s.teamList}>
                    {team.map(member => (
                        <div key={member.id} className={s.teamMemberItem}>
                            <UserAvatar
                                initials={member.avatarInitials}
                                color={member.avatarColor}
                                size="md"
                                status={member.status}
                                isAI={member.isAI}
                            />
                            <div className={s.teamMemberInfo}>
                                <p className={s.teamMemberName}>
                                    {member.name}
                                </p>
                                <p className={s.teamMemberRole}>
                                    {member.role}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Agent */}
            {aiStatus && (
                <div className={s.aiAgentBox}>
                    <div className={s.aiAgentHeader}>
                        <span className="text-sm">🤖</span>
                        <span className={s.aiAgentTitle}>AI Agent</span>
                    </div>
                    <p className={s.aiAgentStatus}>{aiStatus}</p>
                </div>
            )}

            {/* Risk */}
            {riskAmount !== undefined && riskAmount > 0 && (
                <div>
                    <h3 className={`${s.teamSidebarTitle} mb-2`}>Cost at Risk</h3>
                    <div className={s.riskBox}>
                        <DollarSign className="w-4 h-4 text-[var(--tp-accent-red)]" />
                        <span className={s.riskValue}>EUR {riskAmount.toLocaleString()}</span>
                    </div>
                </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
                <div>
                    <h3 className={`${s.teamSidebarTitle} mb-2`}>Tags</h3>
                    <div className={s.tagsList}>
                        {tags.map(tag => (
                            <span key={tag} className={s.sidebarTag}>
                                <Tag className="w-2.5 h-2.5" />{tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
