'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface MentionMember {
    id: string
    name: string
    initials: string
}

interface MentionInputProps {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    members: MentionMember[]
    onSubmit?: () => void
    rows?: number
}

export function MentionInput({ value, onChange, placeholder, members, onSubmit, rows = 3 }: MentionInputProps) {
    const [showDropdown, setShowDropdown] = useState(false)
    const [mentionQuery, setMentionQuery] = useState('')
    const [mentionStart, setMentionStart] = useState(-1)
    const [selectedIdx, setSelectedIdx] = useState(0)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const filtered = members.filter(m =>
        m.name.toLowerCase().includes(mentionQuery.toLowerCase())
    ).slice(0, 6)

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value
        onChange(val)

        const cursorPos = e.target.selectionStart
        const textBefore = val.slice(0, cursorPos)
        const atIdx = textBefore.lastIndexOf('@')

        if (atIdx !== -1 && (atIdx === 0 || textBefore[atIdx - 1] === ' ' || textBefore[atIdx - 1] === '\n')) {
            const query = textBefore.slice(atIdx + 1)
            if (!query.includes(' ') && query.length < 30) {
                setMentionQuery(query)
                setMentionStart(atIdx)
                setShowDropdown(true)
                setSelectedIdx(0)
                return
            }
        }
        setShowDropdown(false)
    }, [onChange])

    const insertMention = useCallback((member: MentionMember) => {
        const before = value.slice(0, mentionStart)
        const after = value.slice(mentionStart + mentionQuery.length + 1)
        onChange(`${before}@${member.name} ${after}`)
        setShowDropdown(false)
        textareaRef.current?.focus()
    }, [value, mentionStart, mentionQuery, onChange])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (showDropdown && filtered.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIdx(i => (i + 1) % filtered.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIdx(i => (i - 1 + filtered.length) % filtered.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertMention(filtered[selectedIdx])
            } else if (e.key === 'Escape') {
                setShowDropdown(false)
            }
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit?.()
        }
    }, [showDropdown, filtered, selectedIdx, insertMention, onSubmit])

    useEffect(() => {
        if (!showDropdown) setSelectedIdx(0)
    }, [showDropdown])

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={rows}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder:text-zinc-500 resize-none text-zinc-100"
            />
            {showDropdown && filtered.length > 0 && (
                <div className="absolute z-50 left-0 bottom-full mb-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                    {filtered.map((m, i) => (
                        <button
                            key={m.id}
                            onMouseDown={(e) => { e.preventDefault(); insertMention(m) }}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition ${i === selectedIdx ? 'bg-cyan-900/40 text-cyan-300' : 'text-zinc-300 hover:bg-zinc-700'}`}
                        >
                            <span className="w-6 h-6 rounded-full bg-zinc-600 flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0">
                                {m.initials}
                            </span>
                            <span className="truncate">{m.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
