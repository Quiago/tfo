'use client'

import { UserAvatar } from './UserAvatar'

interface AvatarStackProps {
    members: { initials: string; color: string }[]
    max?: number
}

export function AvatarStack({ members, max = 4 }: AvatarStackProps) {
    const visible = members.slice(0, max)
    const overflow = members.length - max

    return (
        <div className="avatar-stack-container">
            {visible.map((m, i) => (
                <div key={i} className="avatar-stack">
                    <UserAvatar initials={m.initials} color={m.color} size="sm" />
                </div>
            ))}
            {overflow > 0 && (
                <div className="avatar-stack-overflow">
                    +{overflow}
                </div>
            )}
        </div>
    )
}
