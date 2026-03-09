'use client'

interface UserAvatarProps {
    initials: string
    color: string
    size?: 'sm' | 'md' | 'lg'
    status?: 'available' | 'busy' | 'in-field' | 'offline'
    isAI?: boolean
}

const sizeMap = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
}

const statusColorMap = {
    available: 'bg-emerald-500',
    busy: 'bg-red-500',
    'in-field': 'bg-amber-500',
    offline: 'bg-zinc-500',
}

const statusDotSize = {
    sm: 'w-1.5 h-1.5 -bottom-0 -right-0',
    md: 'w-2 h-2 -bottom-0.5 -right-0.5',
    lg: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
}

export function UserAvatar({ initials, color, size = 'md', status, isAI }: UserAvatarProps) {
    return (
        <div className={`relative inline-flex items-center justify-center rounded-full font-semibold text-white flex-shrink-0 ${sizeMap[size]} ${isAI ? 'bg-gradient-to-br from-violet-500 to-purple-600' : ''}`}
            style={isAI ? undefined : { backgroundColor: color }}
        >
            {isAI ? (
                <span className={size === 'sm' ? 'text-[9px]' : size === 'md' ? 'text-[11px]' : 'text-sm'}>
                    🤖
                </span>
            ) : (
                initials
            )}
            {status && (
                <span className={`absolute border border-zinc-900 rounded-full ${statusColorMap[status]} ${statusDotSize[size]}`} />
            )}
        </div>
    )
}
