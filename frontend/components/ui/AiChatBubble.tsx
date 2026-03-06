'use client'

import { MOCK_TEAM } from '@/lib/hooks/useOpshubMockData'
import { useOpshubStore } from '@/lib/store/opshub-store'
import s from '@/styles/ai-chat/chat.module.css'
import { ArrowUp, Minus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
}

const SUGGESTIONS = [
    'Summarize recent alerts',
    'Generate a report based on timeline data and the associated Munich incident context. Assign a specific task to the Maintenance Engineer (Ahmed Nasser).',
    'Show energy report',
]

// Helper to format text with emojis
const formatMessageText = (text: string) => {
    // Replace specific keywords/tags with emojis
    let formatted = text
        .replace(/\[FIX\]/g, '🛠️')
        .replace(/\[CHECK\]/g, '✅')
        .replace(/\[ALERT\]/g, '⚠️')
        .replace(/\[INFO\]/g, 'ℹ️')
        .replace(/\[MAINTENANCE\]/g, '🔧')
        .replace(/\[CHECKIN\]/g, '📍')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Simple bold support

    // specific phrases replacement if needed
    if (formatted.includes('Repair Task')) {
        formatted = formatted.replace('Repair Task', '🛠️ Repair Task')
    }

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />
}

function OpsFlowLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <path
                d="M119.067 0.309507C116.599 2.45389 105.069 13.2608 91.584 25.114C80.0792 35.2278 68.5201 41.4059 59.7182 41.1567C55.8333 41.0516 52.0286 40.2239 48.433 38.7785C48.289 38.7183 48.1484 38.6593 48.0044 38.5991C47.0467 38.1846 46.0749 37.7264 45.0818 37.2222C44.9425 37.1478 44.8079 37.0781 44.6685 37.0026C39.6264 34.3894 33.8167 30.7336 28.0271 25.3136C22.9661 20.5808 17.8543 15.6945 13.2514 11.44C7.4075 6.04007 2.64404 1.71588 0.929479 0.150098C0.67442 -0.0896099 0.365043 -0.0140369 0.180833 0.179619C-0.0140032 0.369732 -0.0883954 0.673205 0.146589 0.932988C1.71237 2.64401 6.03656 7.40629 11.4365 13.2502C15.6957 17.8531 20.582 22.9649 25.31 28.0259C30.7312 33.8202 34.3859 39.6299 37.0038 44.6721C37.0782 44.8067 37.149 44.9413 37.2187 45.0806C37.7229 46.0725 38.1811 47.0455 38.6003 48.0079C38.6605 48.152 38.7195 48.2866 38.7798 48.4318C40.2263 52.0274 41.054 55.8321 41.1579 59.7217C41.4024 68.5236 35.229 80.078 25.1152 91.5828C13.2562 105.068 2.45511 116.597 0.306004 119.071C-0.142711 119.585 0.579956 120.318 1.07945 119.859C4.14133 117.057 16.8423 105.362 28.3271 94.6306C55.2122 69.5061 74.6415 78.9739 80.5339 81.3214C81.0274 81.5186 81.5151 81.0309 81.3179 80.5374C78.9704 74.645 69.5037 55.211 94.6318 28.3306C105.358 16.8458 117.052 4.14484 119.855 1.07705C120.314 0.578736 119.581 -0.139207 119.068 0.309507L119.067 0.309507ZM66.6379 51.6897L51.6886 66.639C51.6118 66.7158 51.4878 66.6378 51.5221 66.5351C51.5681 60.603 51.443 56.6834 51.443 51.5693C51.4146 51.489 51.4878 51.4158 51.5681 51.4441C56.9849 51.6897 61.5075 51.6897 66.5328 51.5244C66.6355 51.4902 66.7134 51.6141 66.6367 51.6897L66.6379 51.6897Z"
                fill="black"
            />
            <circle cx="20.6181" cy="62.1763" r="6" transform="rotate(-45 20.6181 62.1763)" fill="black" />
            <circle cx="60.8681" cy="21.9258" r="6" transform="rotate(-45 60.8681 21.9258)" fill="black" />
        </svg>
    )
}

export function AiChatBubble() {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [typing, setTyping] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Store access for demo actions
    const selectedWorkOrderId = useOpshubStore(s => s.selectedWorkOrderId)
    const workOrders = useOpshubStore(s => s.workOrders)
    const addTask = useOpshubStore(s => s.addTask)
    const updateTask = useOpshubStore(s => s.updateTask)
    const currentUser = useOpshubStore(s => s.currentUser)

    const scrollToBottom = useCallback(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, typing, scrollToBottom])

    const handleSend = useCallback((text?: string) => {
        const content = (text ?? input).trim()
        if (!content) return

        const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content }
        setMessages((prev) => [...prev, userMsg])
        setInput('')
        setTyping(true)

        // DEMO LOGIC: Intercept specific prompt
        const isDemoPrompt = content.includes('Munich incident') && content.includes('Maintenance Engineer')

        setTimeout(() => {
            let aiResponse = `I'll help you with that. Analyzing "${content}"...`

            if (isDemoPrompt) {
                // Find target Work Order (Selected OR Latest)
                const targetWo = selectedWorkOrderId
                    ? workOrders.find(w => w.id === selectedWorkOrderId)
                    : workOrders[workOrders.length - 1]

                if (targetWo) {
                    // Update task logic
                    const reliabTask = targetWo.tasks.find(t =>
                        t.assignee.id === currentUser?.id && t.status !== 'completed'
                    )

                    if (reliabTask) {
                        updateTask(targetWo.id, reliabTask.id, {
                            status: 'in-progress',
                            updates: [
                                ...(reliabTask.updates || []),
                                {
                                    id: `u-${Date.now()}`,
                                    author: {
                                        id: 'ai-agent',
                                        name: 'OpsFlow AI',
                                        role: 'System',
                                        avatarInitials: 'AI',
                                        avatarColor: 'bg-cyan-500',
                                        status: 'available',
                                        facility: 'Global'
                                    },
                                    content: 'AI Analysis run: Cross-facility correlation confirmed (87% with Munich). Recommended immediate bearing replacement.',
                                    createdAt: new Date().toISOString(),
                                    attachments: []
                                }
                            ]
                        })
                    }

                    // Create task logic
                    const maintenanceEng = MOCK_TEAM.find(m => m.role.includes('Maintenance')) || MOCK_TEAM[2]

                    if (maintenanceEng) {
                        addTask(targetWo.id, {
                            type: 'execution',
                            title: 'Replace Bearing Assembly (AI Generated)',
                            description: 'Based on the cross-facility analysis of the Munich incident, the bearing assembly shows 87% similarity in vibration patterns pre-failure. Immediate replacement recommended to prevent seizure.',
                            assignee: maintenanceEng,
                            assignedBy: currentUser || MOCK_TEAM[0],
                            priority: 'high'
                        })

                        aiResponse = `Analysis complete. I've detected a high correlation (87%) with the Munich incident. \n\nI have automatically created a **Repair Task** for **${maintenanceEng.name}** to replace the bearing assembly immediately.`
                    } else {
                        aiResponse = "I could not find a Maintenance Engineer to assign the task to."
                    }
                } else {
                    aiResponse = "Please open a Work Order first to assign tasks."
                }
            } else if (content.includes('Summarize')) {
                aiResponse = "Recent alerts show a spike in vibration on Motor A7 and minor temperature fluctuations in the Cooling System. Overall facility health is 92%."
            }

            const aiMsg: Message = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                content: aiResponse,
            }
            setMessages((prev) => [...prev, aiMsg])
            setTyping(false)
        }, 1500)
    }, [input, addTask, updateTask, selectedWorkOrderId, workOrders, currentUser])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && open) setOpen(false)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open])

    const isEmpty = messages.length === 0

    return (
        <>
            {/* Chat Popup */}
            {open && (
                <div className={s.chatContainer}>
                    {/* Header */}
                    <div className={s.header}>
                        <div className={s.titleGroup}>
                            <span className={s.titleText}>OpsFlow AI</span>
                            <span className={s.autoBadge}>Auto</span>
                        </div>
                        <div className={s.headerControls}>
                            <button
                                onClick={() => setOpen(false)}
                                className={s.controlBtn}
                            >
                                <Minus size={16} />
                            </button>
                            <button
                                onClick={() => { setOpen(false); setMessages([]) }}
                                className={s.controlBtn}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className={s.messagesArea}>
                        {isEmpty && !typing && (
                            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-70">
                                <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                                    <Sparkles size={24} className="text-cyan-500" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-[#3A3A3A]">OpsFlow AI Assistant</p>
                                    <p className="text-xs text-[#6B7280] mt-1">Ask me anything about your facility</p>
                                </div>
                                <div className="w-full space-y-1.5 mt-2">
                                    {SUGGESTIONS.map((sug) => (
                                        <button
                                            key={sug}
                                            onClick={() => handleSend(sug)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#6B7280] hover:text-[#3A3A3A] hover:bg-[#F2F5FF] transition-colors"
                                        >
                                            {sug}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <div key={msg.id} className={`${s.messageRow} ${msg.role === 'user' ? s.user : ''}`}>
                                {msg.role === 'assistant' && (
                                    <div className={`${s.avatar} ${s.aiAvatar}`}>
                                        <Sparkles size={14} />
                                    </div>
                                )}
                                <div className={`${s.bubble} ${msg.role === 'user' ? s.userBubble : s.aiBubble}`}>
                                    <div className={s.formattedText}>
                                        {msg.role === 'assistant' ? formatMessageText(msg.content) : msg.content}
                                    </div>
                                </div>
                                {msg.role === 'user' && (
                                    <div className={`${s.avatar} ${s.userAvatar}`}>
                                        <span className="text-[10px] font-bold">ME</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {typing && (
                            <div className={s.messageRow}>
                                <div className={`${s.avatar} ${s.aiAvatar}`}>
                                    <Sparkles size={14} />
                                </div>
                                <div className={`${s.bubble} ${s.aiBubble} flex items-center gap-1`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className={s.inputContainer}>
                        <div className={s.inputWrapper}>
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask OpsFlow AI..."
                                rows={1}
                                className={s.textInput}
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim()}
                                className={s.sendBtn}
                            >
                                <ArrowUp size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Button (Kept as is, but ensuring styles don't conflict) */}
            <button
                onClick={() => setOpen(!open)}
                className={`fixed bottom-6 right-6 z-[100] h-[60px] w-[60px] rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_4px_20px_rgba(145,153,200,0.3)] border-2 ${open
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-400 rotate-90 hover:bg-zinc-700 hover:text-white'
                    : 'bg-[#FDFEFE] border-[#9199C8] text-[#9199C8] hover:scale-110 hover:shadow-[0_6px_28px_rgba(145,153,200,0.45)]'
                    }`}
            >
                {open ? <X size={24} /> : <OpsFlowLogo className="w-8 h-8" />}
            </button>
        </>
    )
}
