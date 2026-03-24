'use client'

import {
    addMemory, createConversation, deleteConversation,
    deleteMemory, getMessages, listConversations,
    listMemories, streamMessage,
} from '@/lib/services/chat.service'
import { serialiseScreenContext, type UIAction } from '@/lib/services/agent.service'
import { useScreenContext } from '@/lib/store/screen-context-store'
import { deleteDocument, listDocuments, uploadDocument } from '@/lib/services/knowledge-base.service'
import { getModelCatalog, loadModel } from '@/lib/services/llm.service'
import type { Conversation, KBDocument, LocalMessage, MemoryEntry, ModelCatalog, ToolCallEntry } from '@/lib/types/chat'
import type { LucideIcon } from 'lucide-react'
import {
    AlertCircle, ArrowUp, BookOpen, Brain, ChevronDown,
    FileText, Loader2, MessageSquare, Monitor, Paperclip, Plus,
    PlugZap, Sparkles, Trash2, Upload, Wrench, X, Zap,
} from 'lucide-react'
import { fetchIntegrations } from '@/lib/services/integrations.service'
import type { IntegrationConfig } from '@/lib/types/integrations'
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

// ─── LOGO ─────────────────────────────────────────────────────────────────────

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

// ─── INLINE MARKDOWN FORMATTER ────────────────────────────────────────────────

function inlineFormat(text: string): ReactNode {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                    return <code key={i} className="bg-zinc-200 text-zinc-800 rounded px-1 font-mono text-xs">{part.slice(1, -1)}</code>
                }
                if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                    return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
                }
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                    return <em key={i}>{part.slice(1, -1)}</em>
                }
                return <span key={i}>{part}</span>
            })}
        </>
    )
}

function renderMarkdown(text: string): ReactNode {
    const lines = text.split('\n')
    const elements: ReactNode[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        if (line.startsWith('```')) {
            const codeLines: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            elements.push(
                <pre key={i} className="bg-zinc-800 text-zinc-100 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono leading-relaxed">
                    <code>{codeLines.join('\n')}</code>
                </pre>
            )
        } else if (line.startsWith('### ')) {
            elements.push(<p key={i} className="font-semibold text-sm mt-2 mb-0.5">{inlineFormat(line.slice(4))}</p>)
        } else if (line.startsWith('## ')) {
            elements.push(<p key={i} className="font-bold text-sm mt-2 mb-0.5">{inlineFormat(line.slice(3))}</p>)
        } else if (line.startsWith('# ')) {
            elements.push(<p key={i} className="font-bold text-sm mt-2 mb-0.5">{inlineFormat(line.slice(2))}</p>)
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(
                <div key={i} className="flex gap-2 my-0.5 ml-1">
                    <span className="flex-shrink-0 text-zinc-400 mt-[6px] w-1 h-1 rounded-full bg-current" />
                    <span>{inlineFormat(line.slice(2))}</span>
                </div>
            )
        } else if (/^\d+\. /.test(line)) {
            const num = line.match(/^(\d+)\. /)?.[1]
            elements.push(
                <div key={i} className="flex gap-2 my-0.5 ml-1">
                    <span className="flex-shrink-0 text-zinc-400 min-w-[1.2rem] text-xs">{num}.</span>
                    <span>{inlineFormat(line.replace(/^\d+\. /, ''))}</span>
                </div>
            )
        } else if (line.trim() === '') {
            if (elements.length > 0) elements.push(<div key={i} className="h-1.5" />)
        } else {
            elements.push(<span key={i} className="block">{inlineFormat(line)}</span>)
        }

        i++
    }

    return <div className="space-y-0.5 text-sm leading-relaxed">{elements}</div>
}

// ─── TOOL CALL CARD ───────────────────────────────────────────────────────────

function ToolCallCard({ toolCall }: { toolCall: ToolCallEntry }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="my-1 rounded-xl border border-zinc-200 bg-zinc-50 text-xs overflow-hidden w-full">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-100 transition-colors"
            >
                <Wrench size={12} className="text-zinc-400 flex-shrink-0" />
                <span className="font-mono font-semibold text-zinc-700 flex-1 truncate">{toolCall.name}</span>
                <ChevronDown size={12} className={`text-zinc-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-zinc-200">
                    {toolCall.arguments && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mt-2 mb-1">Arguments</p>
                            <pre className="bg-zinc-800 text-zinc-100 rounded-lg p-2 overflow-x-auto text-[10px] font-mono">
                                {JSON.stringify(toolCall.arguments, null, 2)}
                            </pre>
                        </div>
                    )}
                    {toolCall.result !== undefined && (
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Result</p>
                            <pre className="bg-emerald-950 text-emerald-200 rounded-lg p-2 overflow-x-auto text-[10px] font-mono whitespace-pre-wrap">
                                {toolCall.result}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── THINKING BLOCK ───────────────────────────────────────────────────────────

function ThinkingBlock({ content, streaming = false }: { content: string; streaming?: boolean }) {
    const [expanded, setExpanded] = useState(streaming) // auto-expand while streaming
    // Collapse when streaming finishes
    useEffect(() => { if (!streaming) setExpanded(false) }, [streaming])
    return (
        <div className="my-1 rounded-xl border border-violet-200 bg-violet-50 text-xs overflow-hidden w-full">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-violet-100 transition-colors"
            >
                {streaming
                    ? <Loader2 size={12} className="text-violet-400 flex-shrink-0 animate-spin" />
                    : <Brain size={12} className="text-violet-400 flex-shrink-0" />
                }
                <span className="font-medium text-violet-600 flex-1">
                    {streaming ? 'Thinking…' : 'Thinking'}
                </span>
                <ChevronDown size={12} className={`text-violet-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div className="px-3 pb-3 border-t border-violet-200 max-h-[120px] overflow-y-auto">
                    <p className="text-[11px] text-violet-600 mt-2 whitespace-pre-wrap leading-relaxed">{content}</p>
                </div>
            )}
        </div>
    )
}

// ─── CONTEXT SUGGESTIONS ──────────────────────────────────────────────────────

interface ContextSuggestion {
    label: string
    prompt: string
    Icon: LucideIcon
}

/**
 * Derives 2-4 contextual quick-action suggestions from the live screen state.
 * Always context-aware — no hardcoded copy.
 */
function getContextSuggestions(
    activeModule: string,
    assetName: string | null,
    hasRange: boolean,
): ContextSuggestion[] {
    const out: ContextSuggestion[] = []

    if (assetName) {
        out.push({ label: `Analyze ${assetName}`, prompt: `Analyze the current status of ${assetName} and flag any anomalies.`, Icon: Sparkles })
        out.push({ label: `Recent alerts for ${assetName}`, prompt: `Are there any anomalies or out-of-range readings for ${assetName} in the last 30 minutes?`, Icon: AlertCircle })
    } else {
        out.push({ label: 'What am I looking at?', prompt: 'What am I currently looking at on the dashboard?', Icon: Monitor })
        out.push({ label: 'Asset overview', prompt: 'List all assets and their current operational status.', Icon: Sparkles })
    }
    if (hasRange) {
        out.push({ label: 'Analyze selected range', prompt: 'Analyze the time range I selected on the timeline and summarize what happened.', Icon: Wrench })
    } else {
        out.push({ label: 'Sensor statistics', prompt: 'Show me the latest sensor statistics across all assets.', Icon: Wrench })
    }
    out.push({ label: `Summarize ${activeModule}`, prompt: `Give me a summary of the ${activeModule} view and the most important things to know right now.`, Icon: BookOpen })

    return out.slice(0, 4)
}

// ─── INTEGRATION QUICK ACTIONS ────────────────────────────────────────────────

function _getIntegrationActions(intg: IntegrationConfig): { label: string; prompt: string }[] {
    switch (intg.type) {
        case 'teams':
            return [
                { label: 'Send Teams alert', prompt: `Send a Teams alert via "${intg.name}": ` },
                { label: 'Notify team on Teams', prompt: `Notify the team via "${intg.name}" Teams channel about: ` },
            ]
        case 'servicenow':
            return [
                { label: 'Create incident', prompt: `Create a ServiceNow incident via "${intg.name}" for: ` },
                { label: 'Create change request', prompt: `Create a ServiceNow change request via "${intg.name}" for: ` },
            ]
        case 'email':
            return [
                { label: 'Send email alert', prompt: `Send an email alert via "${intg.name}" about: ` },
            ]
        default:
            return []
    }
}

// ─── SIDE PANEL TAB TYPE ──────────────────────────────────────────────────────

type SideTab = 'conversations' | 'docs' | 'memory' | 'actions'

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function AiChatBubble() {
    const [open, setOpen] = useState(false)
    const [sideOpen, setSideOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<SideTab>('conversations')

    // Conversations
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConvId, setActiveConvId] = useState<string | null>(null)
    const [messages, setMessages] = useState<LocalMessage[]>([])
    const [loadingConvs, setLoadingConvs] = useState(false)

    // Streaming
    const [streaming, setStreaming] = useState(false)
    const abortRef = useRef<AbortController | null>(null)
    const streamingIdRef = useRef('')

    // Input
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Model catalog
    const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
    const [modelDropdown, setModelDropdown] = useState(false)
    const [loadingModel, setLoadingModel] = useState(false)
    const [currentModelId, setCurrentModelId] = useState<string | null>(null)

    // Documents
    const [documents, setDocuments] = useState<KBDocument[]>([])
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [uploadingDoc, setUploadingDoc] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Memory
    const [memories, setMemories] = useState<MemoryEntry[]>([])
    const [loadingMem, setLoadingMem] = useState(false)
    const [newMemory, setNewMemory] = useState('')

    // Integrations (for Actions tab)
    const [integrations, setIntegrations] = useState<IntegrationConfig[]>([])
    const [loadingIntegrations, setLoadingIntegrations] = useState(false)

    // Error
    const [error, setError] = useState<string | null>(null)
    const [noModelLoaded, setNoModelLoaded] = useState(false)
    const pendingRetryRef = useRef<string | null>(null)

    // Screen context (always active — unified mode)
    const screenCtx = useScreenContext()

    // ── Auto-scroll ────────────────────────────────────────────────────────
    const scrollToBottom = useCallback(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, [])

    useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

    // ── Load catalog on open ───────────────────────────────────────────────
    useEffect(() => {
        if (!open) return
        getModelCatalog()
            .then(cat => {
                setCatalog(cat)
                setCurrentModelId(prev => prev ?? cat.current_model ?? cat.default_model)
            })
            .catch(err => console.error('[Chat] catalog load failed:', err))
    }, [open])

    // ── Load conversations on open ─────────────────────────────────────────
    const loadConvMessages = useCallback(async (convId: string) => {
        try {
            const msgs = await getMessages(convId)
            setMessages(msgs.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                tool_calls: m.tool_calls ?? undefined,
                created_at: m.created_at,
            })))
        } catch (e) {
            console.error('[Chat] load messages failed:', e)
        }
    }, [])

    useEffect(() => {
        if (!open) return
        setLoadingConvs(true)
        listConversations()
            .then(convs => setConversations(convs))
            .catch(err => console.error('[Chat] list conversations failed:', err))
            .finally(() => setLoadingConvs(false))
    }, [open])

    // ── Load docs / memory when sidebar tab opens ──────────────────────────
    useEffect(() => {
        if (!sideOpen) return
        if (activeTab === 'docs') {
            setLoadingDocs(true)
            listDocuments().then(setDocuments).catch(console.error).finally(() => setLoadingDocs(false))
        }
        if (activeTab === 'memory') {
            setLoadingMem(true)
            listMemories().then(setMemories).catch(console.error).finally(() => setLoadingMem(false))
        }
        if (activeTab === 'actions') {
            setLoadingIntegrations(true)
            fetchIntegrations()
                .then(data => setIntegrations(data.items))
                .catch(console.error)
                .finally(() => setLoadingIntegrations(false))
        }
    }, [sideOpen, activeTab])

    // ── Escape to close ────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false) }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [open])

    // ── Close model dropdown on outside click ──────────────────────────────
    useEffect(() => {
        if (!modelDropdown) return
        const h = () => setModelDropdown(false)
        window.addEventListener('click', h)
        return () => window.removeEventListener('click', h)
    }, [modelDropdown])

    // ── Model-not-ready handler (defined before handleSend to avoid circular dep) ──
    /** Cleans up the failed bubble, restores input, queues auto-retry. */
    const handleModelNotReady = useCallback((content: string) => {
        setMessages(prev => prev.filter(m => m.id !== streamingIdRef.current))
        setInput(content)
        pendingRetryRef.current = content
        setNoModelLoaded(true)
    }, [])

    // ── Send message ───────────────────────────────────────────────────────
    const handleSend = useCallback(async (text?: string) => {
        const content = (text ?? input).trim()
        if (!content || streaming) return
        setInput('')
        setError(null)
        setNoModelLoaded(false)

        // Ensure we have an active conversation
        let convId = activeConvId
        if (!convId) {
            try {
                const modelId = currentModelId ?? catalog?.default_model ?? ''
                const conv = await createConversation({ model_id: modelId })
                setConversations(prev => [conv, ...prev])
                setActiveConvId(conv.id)
                convId = conv.id
            } catch (e) {
                setError('Failed to create conversation')
                return
            }
        }

        // Add user message
        const userMsg: LocalMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, userMsg])

        // Add streaming placeholder
        const streamId = `streaming-${Date.now()}`
        streamingIdRef.current = streamId
        setMessages(prev => [...prev, {
            id: streamId,
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString(),
            streaming: true,
        }])
        setStreaming(true)

        const abort = new AbortController()
        abortRef.current = abort

        try {
            // ── Unified chat stream (screen context always included) ───────────
            let finalMessageId: string | null = null

            for await (const event of streamMessage(convId, content, { screen_context: serialiseScreenContext(screenCtx) }, abort.signal)) {
                if (abort.signal.aborted) break

                switch (event.type) {
                    case 'token':
                        setMessages(prev => prev.map(m =>
                            m.id === streamingIdRef.current
                                ? { ...m, content: m.content + (event.content ?? '') }
                                : m
                        ))
                        break

                    case 'thinking_delta':
                        // Real-time thinking progress — append to live thinking content
                        setMessages(prev => prev.map(m =>
                            m.id === streamingIdRef.current
                                ? { ...m, thinking: (m.thinking ?? '') + (event.content ?? '') }
                                : m
                        ))
                        break

                    case 'thinking':
                        // Complete thinking block arrived — replace with finalized content
                        setMessages(prev => prev.map(m =>
                            m.id === streamingIdRef.current
                                ? { ...m, thinking: event.content ?? '' }
                                : m
                        ))
                        break

                    case 'tool_call':
                        setMessages(prev => prev.map(m => {
                            if (m.id !== streamingIdRef.current) return m
                            const entry: ToolCallEntry = {
                                name: event.name ?? 'unknown',
                                arguments: event.arguments,
                            }
                            return { ...m, tool_calls: [...(m.tool_calls ?? []), entry] }
                        }))
                        break

                    case 'tool_result':
                        setMessages(prev => prev.map(m => {
                            if (m.id !== streamingIdRef.current) return m
                            const calls = [...(m.tool_calls ?? [])]
                            const idx = calls.findLastIndex(tc => tc.result === undefined)
                            if (idx >= 0) {
                                calls[idx] = { ...calls[idx], result: event.result_preview ?? '' }
                            }
                            return { ...m, tool_calls: calls }
                        }))
                        break

                    case 'ui_action': {
                        // Execute side-effects immediately
                        const action = event.ui_action
                        if (action?.type === 'highlight_range') {
                            const { start, end } = action.payload as { start: number; end: number }
                            if (start && end) screenCtx.setDateRange({ start, end })
                        }
                        // Accumulate for display cards on the message
                        setMessages(prev => prev.map(m =>
                            m.id === streamingIdRef.current
                                ? { ...m, agent_ui_actions: [...(m.agent_ui_actions ?? []), action!] }
                                : m
                        ))
                        break
                    }

                    case 'done':
                        finalMessageId = event.message_id ?? null
                        // Merge any ui_actions from the done event too
                        if (event.ui_actions?.length) {
                            setMessages(prev => prev.map(m =>
                                m.id === streamingIdRef.current
                                    ? { ...m, agent_ui_actions: event.ui_actions }
                                    : m
                            ))
                        }
                        break

                    case 'error': {
                        const errMsg = event.error ?? 'Stream error'
                        if (errMsg.toLowerCase().includes('no model loaded')) {
                            handleModelNotReady(content)
                        } else {
                            setError(errMsg)
                        }
                        break
                    }
                }
            }

            // Finalize: replace streaming id with real message_id
            setMessages(prev => prev.map(m =>
                m.id === streamingIdRef.current
                    ? { ...m, id: finalMessageId ?? m.id, streaming: false }
                    : m
            ))
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                // Finalize partial content on abort
                setMessages(prev => prev.map(m =>
                    m.id === streamingIdRef.current ? { ...m, streaming: false } : m
                ))
                return
            }
            const msg = e instanceof Error ? e.message : 'Failed to send message'
            setError(msg)
            setMessages(prev => prev.filter(m => m.id !== streamingIdRef.current))
        } finally {
            setStreaming(false)
            abortRef.current = null
        }
    }, [input, streaming, activeConvId, currentModelId, catalog?.default_model, screenCtx, handleModelNotReady])

    // ── Auto-retry: poll catalog until model ready, then resend ───────────────
    useEffect(() => {
        if (!noModelLoaded) return
        const interval = setInterval(async () => {
            try {
                const cat = await getModelCatalog()
                const ready = cat.models.some(m => m.is_loaded)
                if (ready) {
                    setCatalog(cat)
                    setCurrentModelId(cat.current_model ?? cat.default_model)
                    setNoModelLoaded(false)
                    const pending = pendingRetryRef.current
                    if (pending) {
                        pendingRetryRef.current = null
                        // Let state settle before firing
                        setTimeout(() => void handleSend(pending), 100)
                    }
                }
            } catch { /* ignore poll errors */ }
        }, 3_000)
        return () => clearInterval(interval)
    }, [noModelLoaded, handleSend])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSend()
        }
    }, [handleSend])

    // ── Conversation management ────────────────────────────────────────────
    function handleNewConversation() {
        // Don't create a DB record yet — lazy creation happens on first send
        setActiveConvId(null)
        setMessages([])
        setError(null)
        setNoModelLoaded(false)
    }

    async function handleDeleteConversation(id: string) {
        try {
            await deleteConversation(id)
            setConversations(prev => prev.filter(c => c.id !== id))
            if (activeConvId === id) {
                setActiveConvId(null)
                setMessages([])
            }
        } catch (e) {
            console.error('[Chat] delete conversation failed:', e)
        }
    }

    async function handleSelectConversation(conv: Conversation) {
        if (conv.id === activeConvId) return
        setActiveConvId(conv.id)
        setMessages([])
        await loadConvMessages(conv.id)
    }

    // ── Model switching ────────────────────────────────────────────────────
    async function handleLoadModel(modelId: string) {
        if (loadingModel) return
        // Skip only if already loaded AND currently selected (not just selected)
        const alreadyLoaded = catalog?.models.find(m => m.id === modelId)?.is_loaded
        if (alreadyLoaded && modelId === currentModelId) return
        setLoadingModel(true)
        setModelDropdown(false)
        try {
            await loadModel(modelId)
            setCurrentModelId(modelId)
            setNoModelLoaded(false)
            const cat = await getModelCatalog()
            setCatalog(cat)
        } catch (e) {
            console.error('[Chat] load model failed:', e)
        } finally {
            setLoadingModel(false)
        }
    }

    // ── Document management ────────────────────────────────────────────────
    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const title = file.name.replace(/\.[^.]+$/, '')
        setUploadingDoc(true)
        try {
            const doc = await uploadDocument(file, title)
            setDocuments(prev => [doc, ...prev])
            // Open sidebar on the docs tab so user sees the upload
            setSideOpen(true)
            setActiveTab('docs')
        } catch (err) {
            console.error('[Chat] upload failed:', err)
        } finally {
            setUploadingDoc(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function handleDeleteDocument(id: string) {
        try {
            await deleteDocument(id)
            setDocuments(prev => prev.filter(d => d.id !== id))
        } catch (e) {
            console.error('[Chat] delete document failed:', e)
        }
    }

    // ── Memory management ──────────────────────────────────────────────────
    async function handleAddMemory() {
        if (!newMemory.trim()) return
        try {
            const m = await addMemory(newMemory.trim())
            setMemories(prev => [m, ...prev])
            setNewMemory('')
        } catch (e) {
            console.error('[Chat] add memory failed:', e)
        }
    }

    async function handleDeleteMemory(id: number) {
        try {
            await deleteMemory(id)
            setMemories(prev => prev.filter(m => m.id !== id))
        } catch (e) {
            console.error('[Chat] delete memory failed:', e)
        }
    }

    // ── Derived ────────────────────────────────────────────────────────────
    const activeConv = conversations.find(c => c.id === activeConvId)
    const currentModel = catalog?.models.find(m => m.id === currentModelId)

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            {/* ── Chat Panel ──────────────────────────────────────────────── */}
            {open && (
                <div className={`fixed bottom-[88px] right-6 z-[99] flex h-[560px] bg-[#FDFEFE] border border-[#98A6D4] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 ${sideOpen ? 'w-[640px]' : 'w-[420px]'}`}>

                    {/* ── Sidebar ─────────────────────────────────────────── */}
                    {sideOpen && (
                        <div className="w-[216px] flex-shrink-0 border-r border-[rgba(152,166,212,0.2)] flex flex-col">
                            {/* Tab bar */}
                            <div className="flex border-b border-[rgba(152,166,212,0.2)] flex-shrink-0">
                                {([
                                    ['conversations', MessageSquare, 'Conversations'],
                                    ['docs', FileText, 'Documents'],
                                    ['memory', Brain, 'Memory'],
                                    ['actions', Zap, 'Actions'],
                                ] as [SideTab, ComponentType<{ size?: number | string }>, string][]).map(([tab, Icon, label]) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        title={label}
                                        className={`flex-1 py-3 flex items-center justify-center transition-colors ${activeTab === tab
                                            ? 'text-[#3A3A3A] border-b-2 border-[#3A3A3A]'
                                            : 'text-[#98A6D4] hover:text-[#3A3A3A]'
                                            }`}
                                    >
                                        <Icon size={15} />
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="flex-1 overflow-y-auto p-2.5 space-y-1">

                                {/* Conversations */}
                                {activeTab === 'conversations' && (
                                    <>
                                        <button
                                            onClick={handleNewConversation}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[#F2F5FF] text-[#3A3A3A] hover:bg-[#E8EDFF] transition-colors mb-2"
                                        >
                                            <Plus size={12} /> New conversation
                                        </button>
                                        {loadingConvs && (
                                            <div className="flex justify-center py-4">
                                                <Loader2 size={14} className="animate-spin text-zinc-400" />
                                            </div>
                                        )}
                                        {conversations.length === 0 && !loadingConvs && (
                                            <p className="text-xs text-zinc-400 text-center py-4">No previous chats</p>
                                        )}
                                        {conversations.map(conv => (
                                            <div
                                                key={conv.id}
                                                onClick={() => handleSelectConversation(conv)}
                                                className={`group flex items-start gap-1 rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${conv.id === activeConvId ? 'bg-[#F2F5FF]' : 'hover:bg-[#F7F9FF]'}`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-[#3A3A3A] truncate leading-tight font-medium">
                                                        {conv.title ?? 'Untitled chat'}
                                                    </p>
                                                    <p className="text-[10px] text-zinc-400 mt-0.5">
                                                        {new Date(conv.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDeleteConversation(conv.id) }}
                                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all flex-shrink-0 p-0.5 mt-0.5"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Documents */}
                                {activeTab === 'docs' && (
                                    <>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingDoc}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[#F2F5FF] text-[#3A3A3A] hover:bg-[#E8EDFF] transition-colors disabled:opacity-50 mb-2"
                                        >
                                            {uploadingDoc
                                                ? <Loader2 size={12} className="animate-spin" />
                                                : <Upload size={12} />
                                            }
                                            Upload document
                                        </button>
                                        {loadingDocs && (
                                            <div className="flex justify-center py-4">
                                                <Loader2 size={14} className="animate-spin text-zinc-400" />
                                            </div>
                                        )}
                                        {documents.length === 0 && !loadingDocs && (
                                            <p className="text-xs text-zinc-400 text-center py-4">No documents yet</p>
                                        )}
                                        {documents.map(doc => (
                                            <div key={doc.id} className="group flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-[#F7F9FF] transition-colors">
                                                <BookOpen size={12} className="text-zinc-400 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-[#3A3A3A] truncate">{doc.title}</p>
                                                    <p className="text-[10px] text-zinc-400">{doc.chunk_count} chunks</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteDocument(doc.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all flex-shrink-0 p-0.5"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Memory */}
                                {activeTab === 'memory' && (
                                    <>
                                        <div className="flex gap-1.5 mb-2">
                                            <input
                                                value={newMemory}
                                                onChange={e => setNewMemory(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') void handleAddMemory() }}
                                                placeholder="Add memory..."
                                                className="flex-1 text-xs border border-[#98A6D4] rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-400 bg-white min-w-0"
                                            />
                                            <button
                                                onClick={() => void handleAddMemory()}
                                                disabled={!newMemory.trim()}
                                                className="p-1.5 rounded-xl bg-[#3A3A3A] text-white disabled:opacity-40 flex-shrink-0"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                        {loadingMem && (
                                            <div className="flex justify-center py-4">
                                                <Loader2 size={14} className="animate-spin text-zinc-400" />
                                            </div>
                                        )}
                                        {memories.length === 0 && !loadingMem && (
                                            <p className="text-xs text-zinc-400 text-center py-4">No memories yet</p>
                                        )}
                                        {memories.map(mem => (
                                            <div key={mem.id} className="group flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-[#F7F9FF] transition-colors">
                                                <p className="flex-1 text-xs text-[#3A3A3A] leading-relaxed">{mem.content}</p>
                                                <button
                                                    onClick={() => void handleDeleteMemory(mem.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all flex-shrink-0 p-0.5"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {/* Actions */}
                                {activeTab === 'actions' && (
                                    <>
                                        {/* Screen-context quick actions */}
                                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-1 mb-1.5 mt-0.5">
                                            Quick actions
                                        </p>
                                        {getContextSuggestions(
                                            screenCtx.activeModule ?? '',
                                            screenCtx.selectedTeamName ?? null,
                                            !!screenCtx.dateRange,
                                        ).map(({ label, prompt, Icon }) => (
                                            <button
                                                key={label}
                                                onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                                                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-[#F2F5FF] transition-colors text-left group"
                                            >
                                                <Icon size={12} className="text-[#98A6D4] flex-shrink-0" />
                                                <span className="text-xs text-[#3A3A3A] leading-tight">{label}</span>
                                            </button>
                                        ))}

                                        {/* Integration actions */}
                                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-1 mt-3 mb-1.5">
                                            Integrations
                                        </p>
                                        {loadingIntegrations && (
                                            <div className="flex justify-center py-3">
                                                <Loader2 size={13} className="animate-spin text-zinc-400" />
                                            </div>
                                        )}
                                        {!loadingIntegrations && integrations.filter(i => i.is_active).length === 0 && (
                                            <p className="text-xs text-zinc-400 text-center py-3">No active integrations</p>
                                        )}
                                        {integrations.filter(i => i.is_active).map(intg => {
                                            const actions = _getIntegrationActions(intg)
                                            return actions.map(({ label, prompt }) => (
                                                <button
                                                    key={`${intg.id}-${label}`}
                                                    onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                                                    className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-[#F2F5FF] transition-colors text-left"
                                                >
                                                    <PlugZap size={12} className="text-violet-400 flex-shrink-0" />
                                                    <div className="min-w-0">
                                                        <span className="text-xs text-[#3A3A3A] leading-tight block truncate">{label}</span>
                                                        <span className="text-[10px] text-zinc-400 truncate block">{intg.name}</span>
                                                    </div>
                                                </button>
                                            ))
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Main Chat ────────────────────────────────────────── */}
                    <div className="flex flex-col flex-1 min-w-0">

                        {/* Header */}
                        <div className="h-[52px] flex items-center gap-2 px-3 border-b border-[rgba(152,166,212,0.2)] bg-gradient-to-r from-[#FDFEFE] to-[#F2F5FF] flex-shrink-0">
                            {/* Sidebar toggle */}
                            <button
                                onClick={() => { setSideOpen(v => !v); setActiveTab('conversations') }}
                                title="Conversations, Documents & Memory"
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors flex-shrink-0 text-xs font-medium ${sideOpen ? 'bg-[#E8EDFF] text-[#3A3A3A]' : 'text-[#98A6D4] hover:bg-[#F2F5FF] hover:text-[#3A3A3A]'}`}
                            >
                                <MessageSquare size={13} />
                                <span className="hidden sm:inline">Chats</span>
                            </button>

                            {/* New chat */}
                            <button
                                onClick={() => { setActiveConvId(null); setMessages([]); setError(null) }}
                                title="New conversation"
                                className="w-6 h-6 flex items-center justify-center text-[#98A6D4] hover:text-[#3A3A3A] hover:bg-[#F2F5FF] rounded-lg transition-colors flex-shrink-0"
                            >
                                <Plus size={14} />
                            </button>

                            {/* Title */}
                            <span className="text-sm font-bold text-[#3A3A3A] flex-1 truncate min-w-0">
                                {activeConv?.title ?? 'New conversation'}
                            </span>

                            {/* Close */}
                            <button
                                onClick={() => setOpen(false)}
                                title="Close"
                                className="w-6 h-6 flex items-center justify-center text-[#98A6D4] hover:text-[#3A3A3A] transition-colors flex-shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FDFEFE] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-thumb]:rounded-full"
                        >
                            {messages.length === 0 && !streaming && (
                                <div className="flex flex-col justify-center h-full gap-4 px-4 py-6">
                                    {/* Header */}
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        <div className="h-9 w-9 rounded-full flex items-center justify-center bg-cyan-500/10">
                                            <Sparkles size={18} className="text-cyan-500" />
                                        </div>
                                        <p className="text-sm font-semibold text-[#3A3A3A]">How can I help you today?</p>
                                    </div>

                                    {/* Suggestion pills — derived from screen context */}
                                    <div className="flex flex-col gap-1.5">
                                        {getContextSuggestions(
                                            screenCtx.activeModule,
                                            screenCtx.selectedTeamName,
                                            !!(screenCtx.dateRange),
                                        ).map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => void handleSend(s.prompt)}
                                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F7F9FF] border border-[rgba(152,166,212,0.2)] text-[#3A3A3A] text-xs hover:bg-[#EEF1FF] hover:border-[#98A6D4] transition-colors text-left group"
                                            >
                                                <s.Icon size={13} className="text-[#98A6D4] group-hover:text-[#3A3A3A] flex-shrink-0 transition-colors" />
                                                <span className="flex-1 leading-tight">{s.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map(msg => (
                                <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                                            <Sparkles size={13} className="text-white" />
                                        </div>
                                    )}

                                    <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end max-w-[80%]' : 'items-start max-w-[85%]'}`}>
                                        {/* Agent plan steps */}
                                        {msg.agent_plan && msg.agent_plan.length > 0 && (
                                            <div className="my-1 rounded-xl border border-violet-100 bg-violet-50/60 text-xs overflow-hidden w-full">
                                                <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-100">
                                                    <Sparkles size={11} className="text-violet-500 flex-shrink-0" />
                                                    <span className="font-semibold text-violet-600">Plan</span>
                                                </div>
                                                <ol className="px-3 py-2 space-y-1 list-decimal list-inside">
                                                    {msg.agent_plan.map((step, i) => (
                                                        <li key={i} className="text-[11px] text-violet-700 leading-snug">{step}</li>
                                                    ))}
                                                </ol>
                                            </div>
                                        )}

                                        {/* Thinking block — shows live during streaming, collapses on done */}
                                        {msg.thinking && <ThinkingBlock content={msg.thinking} streaming={!!msg.streaming} />}

                                        {/* Tool calls */}
                                        {msg.tool_calls?.map((tc, i) => (
                                            <ToolCallCard key={i} toolCall={tc} />
                                        ))}

                                        {/* Agent UI actions — clickable suggestion cards */}
                                        {msg.agent_ui_actions && msg.agent_ui_actions.length > 0 && (
                                            <div className="flex flex-col gap-1 w-full">
                                                {msg.agent_ui_actions.map((action, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            if (action.type === 'highlight_range') {
                                                                const { start, end } = action.payload as { start: number; end: number }
                                                                if (start && end) screenCtx.setDateRange({ start, end })
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 text-xs hover:bg-sky-100 transition-colors text-left w-full"
                                                    >
                                                        <Sparkles size={11} className="flex-shrink-0 text-sky-500" />
                                                        <span className="font-medium capitalize">{action.type.replace(/_/g, ' ')}</span>
                                                        {action.type === 'highlight_range' && (
                                                            <span className="text-sky-500 text-[10px] ml-auto">Click to apply</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Content bubble */}
                                        {(msg.content || msg.streaming) && (
                                            <div className={`px-3 py-2.5 rounded-2xl ${msg.role === 'user'
                                                ? 'bg-[#3A3A3A] text-white rounded-tr-sm'
                                                : 'bg-[#F2F5FF] text-[#3A3A3A] rounded-tl-sm'
                                                }`}>
                                                {msg.role === 'assistant' ? (
                                                    msg.streaming && !msg.content && !msg.thinking ? (
                                                        <span className="flex gap-1 items-center h-4">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                                                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                                                        </span>
                                                    ) : renderMarkdown(msg.content)
                                                ) : (
                                                    <span className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-[10px] font-bold text-zinc-600">ME</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* No model loaded banner — auto-retries every 3s */}
                        {noModelLoaded && (
                            <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                                <Loader2 size={13} className="animate-spin flex-shrink-0" />
                                <span className="flex-1">
                                    Model warming up
                                    {pendingRetryRef.current ? ' — will resend your message automatically.' : '.'}
                                </span>
                                <button onClick={() => { setNoModelLoaded(false); pendingRetryRef.current = null }} className="flex-shrink-0 hover:text-amber-900">
                                    <X size={12} />
                                </button>
                            </div>
                        )}

                        {/* Generic error banner */}
                        {error && (
                            <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                                <AlertCircle size={13} className="flex-shrink-0" />
                                <span className="flex-1">{error}</span>
                                <button onClick={() => setError(null)} className="flex-shrink-0 hover:text-red-800">
                                    <X size={12} />
                                </button>
                            </div>
                        )}

                        {/* Always-mounted hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            accept=".pdf,.txt,.md,.rst,.csv,.tsv,.json,.yaml,.yml,.xml,.docx,.pptx,.xlsx,.xls,.html,.htm,.rtf,.epub,.log"
                            onChange={handleFileUpload}
                        />

                        {/* Input */}
                        <div className="p-3 border-t border-[rgba(152,166,212,0.1)] bg-[#FDFEFE] flex-shrink-0">
                            <div className={`flex flex-col bg-[#F2F5FF] border rounded-[16px] px-3 pt-2 pb-1.5 transition-colors ${streaming ? 'border-[#98A6D4]' : 'border-[#98A6D4] focus-within:border-blue-400 focus-within:bg-white'}`}>

                                {/* Context chip — Notion-style: shows where the user is */}
                                {screenCtx.activeModule && (
                                    <div className="flex items-center gap-1 mb-1.5 -mx-0.5">
                                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[rgba(152,166,212,0.25)] text-[10px] text-zinc-500 max-w-full overflow-hidden">
                                            <Monitor size={9} className="text-[#98A6D4] flex-shrink-0" />
                                            <span className="truncate">{screenCtx.getAIContextSummary()}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Textarea */}
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={streaming ? 'Thinking...' : 'Ask anything — AI sees your screen...'}
                                    disabled={streaming}
                                    rows={1}
                                    className="bg-transparent border-none outline-none text-sm text-[#3A3A3A] placeholder:text-zinc-400 resize-none min-h-[24px] max-h-[80px] py-0.5 disabled:opacity-50 w-full"
                                />

                                {/* Bottom toolbar: attach · model selector · send */}
                                <div className="flex items-center justify-between mt-1.5">
                                    {/* Left: attach + integrations */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingDoc}
                                            title="Upload document to knowledge base"
                                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-[#3A3A3A] transition-colors flex-shrink-0 disabled:opacity-40"
                                        >
                                            {uploadingDoc
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <Paperclip size={13} />
                                            }
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (sideOpen && activeTab === 'actions') {
                                                    setSideOpen(false)
                                                } else {
                                                    setSideOpen(true)
                                                    setActiveTab('actions')
                                                }
                                            }}
                                            title={sideOpen && activeTab === 'actions' ? 'Close Actions panel' : 'Actions & Integrations'}
                                            className={`w-6 h-6 flex items-center justify-center transition-colors flex-shrink-0 rounded ${sideOpen && activeTab === 'actions' ? 'text-violet-500 bg-violet-50' : 'text-zinc-400 hover:text-violet-500'}`}
                                        >
                                            <PlugZap size={13} />
                                        </button>
                                    </div>

                                    {/* Right: model selector + send */}
                                    <div className="flex items-center gap-1.5">
                                        {/* Model picker — Notion "Auto" style */}
                                        <div className="relative" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => setModelDropdown(v => !v)}
                                                disabled={loadingModel || !catalog}
                                                title="Switch model"
                                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-500 hover:bg-white hover:text-[#3A3A3A] transition-colors disabled:opacity-40 max-w-[110px]"
                                            >
                                                {loadingModel
                                                    ? <Loader2 size={9} className="animate-spin flex-shrink-0" />
                                                    : null
                                                }
                                                <span className="truncate">{currentModel?.display_name ?? currentModelId ?? 'Auto'}</span>
                                                <ChevronDown size={9} className="flex-shrink-0 text-zinc-400" />
                                            </button>
                                            {modelDropdown && catalog && (
                                                <div className="absolute bottom-full right-0 mb-1 w-64 bg-white border border-[#98A6D4] rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                                                    {catalog.models.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => void handleLoadModel(m.id)}
                                                            className={`w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[#F2F5FF] transition-colors ${m.id === currentModelId ? 'bg-[#F2F5FF]' : ''}`}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-semibold text-[#3A3A3A] truncate">{m.display_name}</p>
                                                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                                                    {m.memory_required_gb.toFixed(1)} GB · {m.context_length.toLocaleString()} ctx
                                                                </p>
                                                            </div>
                                                            {m.is_loaded && (
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" title="Loaded" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Send / Stop */}
                                        {streaming ? (
                                            <button
                                                onClick={() => abortRef.current?.abort()}
                                                title="Stop generation"
                                                className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-red-600 transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => void handleSend()}
                                                disabled={!input.trim()}
                                                className="w-7 h-7 rounded-full bg-[#3A3A3A] text-white flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <ArrowUp size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {uploadingDoc && (
                                <p className="text-[10px] text-zinc-400 mt-1.5 ml-2">Uploading document...</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Floating Button ──────────────────────────────────────────── */}
            <button
                onClick={() => {
                    if (open) {
                        setOpen(false)
                    } else {
                        // Always open with a fresh conversation ready
                        setActiveConvId(null)
                        setMessages([])
                        setError(null)
                        setNoModelLoaded(false)
                        setSideOpen(true)
                        setActiveTab('conversations')
                        setOpen(true)
                    }
                }}
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
