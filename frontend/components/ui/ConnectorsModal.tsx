'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, Search, X, XCircle } from 'lucide-react'
import {
    createIntegration,
    deleteIntegration,
    fetchIntegrations,
    testIntegration,
    updateIntegration,
} from '@/lib/services/integrations.service'
import type { IntegrationConfig, IntegrationType } from '@/lib/types/integrations'

// ─── CONNECTOR CATALOG ────────────────────────────────────────────────────────

interface FieldDef {
    key: string
    label: string
    placeholder?: string
    type?: 'text' | 'password' | 'url' | 'email' | 'checkbox'
    required?: boolean
    hint?: string
}

interface ConnectorDef {
    id: string
    name: string
    category: string
    description: string
    backendType?: IntegrationType
    fields?: FieldDef[]
    comingSoon?: boolean
    bg: string
    fg: string
    letter: string
}

const CONNECTORS: ConnectorDef[] = [
    {
        id: 'teams',
        name: 'Microsoft Teams',
        category: 'Microsoft 365',
        backendType: 'teams',
        description:
            'Send alerts, incident notifications, and status updates directly to Microsoft Teams channels. Connect via an Incoming Webhook so OpsFlow can post Adaptive Card messages to your team in real time.',
        bg: '#464EB8',
        fg: '#fff',
        letter: 'T',
        fields: [
            {
                key: 'webhook_url',
                label: 'Incoming Webhook URL',
                placeholder: 'https://outlook.office.com/webhook/...',
                type: 'url',
                required: true,
                hint: 'Create an Incoming Webhook connector in your Teams channel settings.',
            },
        ],
    },
    {
        id: 'servicenow',
        name: 'ServiceNow',
        category: 'ITSM',
        backendType: 'servicenow',
        description:
            'Automatically create incidents, change requests, and problem tickets in ServiceNow when OpsFlow detects anomalies or alarm conditions. Supports severity-to-priority mapping and custom assignment groups.',
        bg: '#62D84E',
        fg: '#1b2833',
        letter: 'S',
        fields: [
            {
                key: 'instance_url',
                label: 'Instance URL',
                placeholder: 'https://your-instance.service-now.com',
                type: 'url',
                required: true,
            },
            {
                key: 'username',
                label: 'Username',
                placeholder: 'admin',
                required: true,
            },
            {
                key: 'password',
                label: 'Password',
                placeholder: '••••••••',
                type: 'password',
                required: true,
            },
            {
                key: 'default_assignment_group',
                label: 'Default Assignment Group',
                placeholder: 'IT Operations (optional)',
            },
            {
                key: 'default_caller_id',
                label: 'Default Caller ID',
                placeholder: 'system (optional)',
            },
        ],
    },
    {
        id: 'email',
        name: 'Email (SMTP)',
        category: 'Communication',
        backendType: 'email',
        description:
            'Send email alerts and reports to on-call teams, managers, or external stakeholders via any SMTP provider (Gmail, Outlook, SendGrid, Postfix, etc.). Supports TLS and custom from-addresses.',
        bg: '#4285F4',
        fg: '#fff',
        letter: 'E',
        fields: [
            {
                key: 'host',
                label: 'SMTP Host',
                placeholder: 'smtp.gmail.com:587',
                required: true,
                hint: 'Format: host:port',
            },
            {
                key: 'username',
                label: 'Username / Email',
                placeholder: 'alerts@company.com',
                type: 'email',
                required: true,
            },
            {
                key: 'password',
                label: 'Password / App Password',
                placeholder: '••••••••',
                type: 'password',
                required: true,
            },
            {
                key: 'from_addr',
                label: 'From Address',
                placeholder: 'OpsFlow Alerts <alerts@company.com> (optional)',
            },
            {
                key: 'use_tls',
                label: 'Use TLS/STARTTLS',
                type: 'checkbox',
            },
            {
                key: 'recipients',
                label: 'Default Recipients',
                placeholder: 'ops@company.com, manager@company.com',
                hint: 'Comma-separated list of email addresses.',
            },
        ],
    },
    {
        id: 'gmail',
        name: 'Gmail',
        category: 'Google',
        description:
            'Read and send Gmail messages, search through email threads, and trigger workflows based on email events. Useful for tracking support tickets, approvals, and customer communications.',
        bg: '#EA4335',
        fg: '#fff',
        letter: 'G',
        comingSoon: true,
    },
    {
        id: 'gdrive',
        name: 'Google Drive',
        category: 'Google',
        description:
            'Search through documents, read file contents, and attach reports to Drive folders. OpsFlow can find specific documents even when you don\'t remember the exact name.',
        bg: '#34A853',
        fg: '#fff',
        letter: 'D',
        comingSoon: true,
    },
    {
        id: 'outlook',
        name: 'Outlook / Exchange',
        category: 'Microsoft 365',
        description:
            'Connect Outlook or Exchange to read, search, and send emails. Trigger workflows based on calendar events or incoming mail from specific senders.',
        bg: '#0072C6',
        fg: '#fff',
        letter: 'O',
        comingSoon: true,
    },
    {
        id: 'slack',
        name: 'Slack',
        category: 'Communication',
        description:
            'Post alerts and updates to Slack channels, search message history, and interact with your team directly from OpsFlow workflows.',
        bg: '#611f69',
        fg: '#fff',
        letter: 'S',
        comingSoon: true,
    },
    {
        id: 'jira',
        name: 'Jira',
        category: 'ITSM',
        description:
            'Create and update Jira issues, search project backlogs, and link incidents to sprints. Ideal for dev/ops teams managing infrastructure work in Jira.',
        bg: '#0052CC',
        fg: '#fff',
        letter: 'J',
        comingSoon: true,
    },
]

// ─── LOGO AVATAR ──────────────────────────────────────────────────────────────

function ConnectorLogo({ def, size = 40 }: { def: ConnectorDef; size?: number }) {
    return (
        <div
            style={{ width: size, height: size, background: def.bg, color: def.fg, borderRadius: 10 }}
            className="flex-shrink-0 flex items-center justify-center font-bold text-sm select-none"
        >
            {def.letter}
        </div>
    )
}

// ─── CONNECT FORM ─────────────────────────────────────────────────────────────

function ConnectForm({
    def,
    existing,
    onSaved,
    onCancel,
}: {
    def: ConnectorDef
    existing?: IntegrationConfig
    onSaved: (updated: IntegrationConfig) => void
    onCancel: () => void
}) {
    const [name, setName] = useState(existing?.name ?? `${def.name} default`)
    const [fields, setFields] = useState<Record<string, string | boolean>>(() => {
        const init: Record<string, string | boolean> = {}
        def.fields?.forEach(f => {
            init[f.key] = f.type === 'checkbox' ? false : ''
        })
        return init
    })
    const [saving, setSaving] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const handleChange = (key: string, val: string | boolean) =>
        setFields(prev => ({ ...prev, [key]: val }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!def.backendType) return
        setSaving(true)
        setErr(null)

        // Convert recipients string → array for email type
        const config: Record<string, unknown> = { ...fields }
        if (def.backendType === 'email' && typeof config.recipients === 'string') {
            config.recipients = (config.recipients as string)
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
        }

        try {
            let saved: IntegrationConfig
            if (existing) {
                saved = await updateIntegration(existing.id, { name, config, is_active: true })
            } else {
                saved = await createIntegration({ name, type: def.backendType, config, is_active: true })
            }
            onSaved(saved)
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600">Name</label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                    required
                />
            </div>

            {def.fields?.map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-zinc-600">{f.label}</label>
                    {f.type === 'checkbox' ? (
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-700">
                            <input
                                type="checkbox"
                                checked={!!fields[f.key]}
                                onChange={e => handleChange(f.key, e.target.checked)}
                                className="rounded"
                            />
                            Enable
                        </label>
                    ) : (
                        <input
                            type={f.type ?? 'text'}
                            value={fields[f.key] as string}
                            onChange={e => handleChange(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            required={f.required}
                            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                        />
                    )}
                    {f.hint && <p className="text-[10px] text-zinc-400">{f.hint}</p>}
                </div>
            ))}

            {err && <p className="text-xs text-red-500">{err}</p>}

            <div className="flex gap-2 pt-1">
                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                    {saving && <Loader2 size={12} className="animate-spin" />}
                    {existing ? 'Save changes' : 'Connect'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    )
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function DetailPanel({
    def,
    saved,
    onRefresh,
}: {
    def: ConnectorDef
    saved: IntegrationConfig | undefined
    onRefresh: (updated?: IntegrationConfig) => void
}) {
    const [mode, setMode] = useState<'view' | 'connect' | 'edit'>('view')
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
    const [disconnecting, setDisconnecting] = useState(false)

    // Reset form mode when connector changes
    useEffect(() => { setMode('view'); setTestResult(null) }, [def.id])

    const handleTest = async () => {
        if (!saved) return
        setTesting(true)
        setTestResult(null)
        try {
            const r = await testIntegration(saved.id)
            setTestResult({ ok: r.success, msg: r.message })
        } catch (e) {
            setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Test failed' })
        } finally {
            setTesting(false)
        }
    }

    const handleDisconnect = async () => {
        if (!saved) return
        setDisconnecting(true)
        try {
            await deleteIntegration(saved.id)
            onRefresh(undefined)
        } catch {
            setDisconnecting(false)
        }
    }

    if (def.comingSoon) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 text-center">
                <div
                    style={{ width: 64, height: 64, background: def.bg, color: def.fg, borderRadius: 14 }}
                    className="flex items-center justify-center text-2xl font-bold"
                >
                    {def.letter}
                </div>
                <div>
                    <p className="font-medium text-zinc-800">{def.name}</p>
                    <p className="text-sm text-zinc-400 mt-1">Coming soon</p>
                </div>
                <p className="text-sm text-zinc-500 max-w-xs">{def.description}</p>
            </div>
        )
    }

    // ── Not connected ──────────────────────────────────────────────────────────
    if (!saved && mode !== 'connect') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-12 text-center">
                <div
                    style={{ width: 64, height: 64, background: def.bg, color: def.fg, borderRadius: 14 }}
                    className="flex items-center justify-center text-2xl font-bold"
                >
                    {def.letter}
                </div>
                <div>
                    <p className="text-zinc-500 text-sm">You are not connected to {def.name} yet.</p>
                </div>
                <button
                    onClick={() => setMode('connect')}
                    className="px-5 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                    Connect
                </button>
            </div>
        )
    }

    // ── Connect form ───────────────────────────────────────────────────────────
    if (!saved && mode === 'connect') {
        return (
            <div className="flex-1 overflow-y-auto p-8">
                <div className="flex items-center gap-3 mb-5">
                    <ConnectorLogo def={def} size={36} />
                    <div>
                        <h3 className="font-semibold text-zinc-900">{def.name}</h3>
                        <p className="text-xs text-zinc-400">{def.category}</p>
                    </div>
                </div>
                <ConnectForm
                    def={def}
                    onSaved={updated => { setMode('view'); onRefresh(updated) }}
                    onCancel={() => setMode('view')}
                />
            </div>
        )
    }

    // ── Edit form ──────────────────────────────────────────────────────────────
    if (saved && mode === 'edit') {
        return (
            <div className="flex-1 overflow-y-auto p-8">
                <div className="flex items-center gap-3 mb-5">
                    <ConnectorLogo def={def} size={36} />
                    <div>
                        <h3 className="font-semibold text-zinc-900">{def.name}</h3>
                        <p className="text-xs text-zinc-400">{def.category}</p>
                    </div>
                </div>
                <ConnectForm
                    def={def}
                    existing={saved}
                    onSaved={updated => { setMode('view'); onRefresh(updated) }}
                    onCancel={() => setMode('view')}
                />
            </div>
        )
    }

    // ── Connected detail ───────────────────────────────────────────────────────
    return (
        <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                    <ConnectorLogo def={def} size={36} />
                    <div>
                        <h3 className="font-semibold text-zinc-900">{saved!.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            <span className="text-xs text-zinc-400">Connected</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                    >
                        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : null}
                        Disconnect
                    </button>
                    <button
                        onClick={() => setMode('edit')}
                        className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                        View details
                    </button>
                </div>
            </div>

            <div className="px-6 py-5">
                <p className="text-sm text-zinc-600 leading-relaxed mb-5">{def.description}</p>

                {/* Test connection */}
                <div className="border border-zinc-100 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-zinc-800">Connection test</p>
                            {saved!.last_tested_at && (
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    Last tested: {new Date(saved!.last_tested_at).toLocaleString()}
                                    {' · '}
                                    <span className={saved!.last_test_status === 'ok' ? 'text-emerald-500' : 'text-red-400'}>
                                        {saved!.last_test_status === 'ok' ? 'Passed' : 'Failed'}
                                    </span>
                                </p>
                            )}
                        </div>
                        <button
                            onClick={handleTest}
                            disabled={testing}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                        >
                            {testing && <Loader2 size={12} className="animate-spin" />}
                            Test connection
                        </button>
                    </div>
                    {testResult && (
                        <div className={`flex items-start gap-2 mt-3 text-sm ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                            {testResult.ok
                                ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                                : <XCircle size={14} className="mt-0.5 flex-shrink-0" />}
                            <span>{testResult.msg}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

export function ConnectorsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<string>(CONNECTORS[0].id)
    const [savedMap, setSavedMap] = useState<Record<string, IntegrationConfig>>({})
    const [loading, setLoading] = useState(false)
    const overlayRef = useRef<HTMLDivElement>(null)

    // Load saved integrations when modal opens
    useEffect(() => {
        if (!open) return
        setLoading(true)
        fetchIntegrations()
            .then(data => {
                const map: Record<string, IntegrationConfig> = {}
                data.items.forEach(item => {
                    const def = CONNECTORS.find(c => c.backendType === item.type)
                    if (def) map[def.id] = item
                })
                setSavedMap(map)
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [open])

    const handleRefresh = useCallback((connectorId: string, updated?: IntegrationConfig) => {
        setSavedMap(prev => {
            if (!updated) {
                const next = { ...prev }
                delete next[connectorId]
                return next
            }
            return { ...prev, [connectorId]: updated }
        })
    }, [])

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose()
    }

    // Close on Escape
    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open, onClose])

    if (!open) return null

    const filtered = search.trim()
        ? CONNECTORS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        : CONNECTORS

    const connected = filtered.filter(c => !!savedMap[c.id])
    const notConnected = filtered.filter(c => !savedMap[c.id])
    const selectedDef = CONNECTORS.find(c => c.id === selected) ?? CONNECTORS[0]

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
            <div className="bg-[#FAFAF9] rounded-2xl shadow-2xl flex overflow-hidden"
                style={{ width: 820, height: 560, maxWidth: '95vw', maxHeight: '90vh' }}>

                {/* ── Left nav ── */}
                <div className="w-40 flex-shrink-0 bg-[#F5F5F4] border-r border-zinc-200 flex flex-col py-4">
                    <div className="flex items-center gap-2 px-4 mb-5">
                        <button
                            onClick={onClose}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <span className="text-sm font-semibold text-zinc-800">Customize</span>
                    </div>
                    <nav className="flex flex-col gap-0.5 px-2">
                        <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-200 transition-colors text-left">
                            <span className="text-zinc-400">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                                </svg>
                            </span>
                            Skills
                        </button>
                        <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-white shadow-sm text-zinc-800 text-left">
                            <span className="text-zinc-600">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                            </span>
                            Connectors
                        </button>
                    </nav>
                </div>

                {/* ── Connector list ── */}
                <div className="w-60 flex-shrink-0 border-r border-zinc-200 flex flex-col">
                    <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-zinc-100">
                        <h2 className="text-sm font-semibold text-zinc-900">Connectors</h2>
                        <div className="flex items-center gap-1">
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-700">
                                <Search size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="px-3 py-2 border-b border-zinc-100">
                        <div className="flex items-center gap-2 bg-zinc-100 rounded-lg px-2.5 py-1.5">
                            <Search size={11} className="text-zinc-400 flex-shrink-0" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search connectors…"
                                className="flex-1 bg-transparent text-xs outline-none text-zinc-700 placeholder:text-zinc-400"
                            />
                            {search && (
                                <button onClick={() => setSearch('')}>
                                    <X size={10} className="text-zinc-400 hover:text-zinc-600" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                        {loading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 size={16} className="animate-spin text-zinc-400" />
                            </div>
                        ) : (
                            <>
                                {connected.length > 0 && (
                                    <>
                                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-4 pb-1 pt-1">
                                            Connected
                                        </p>
                                        {connected.map(c => (
                                            <ConnectorItem
                                                key={c.id}
                                                def={c}
                                                active={selected === c.id}
                                                connected
                                                onClick={() => setSelected(c.id)}
                                            />
                                        ))}
                                        <div className="border-t border-zinc-100 my-2" />
                                    </>
                                )}
                                {notConnected.length > 0 && (
                                    <>
                                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-4 pb-1 pt-1">
                                            Not connected
                                        </p>
                                        {notConnected.map(c => (
                                            <ConnectorItem
                                                key={c.id}
                                                def={c}
                                                active={selected === c.id}
                                                connected={false}
                                                onClick={() => setSelected(c.id)}
                                            />
                                        ))}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* ── Detail panel ── */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors z-10"
                    >
                        <X size={14} />
                    </button>

                    <DetailPanel
                        key={selectedDef.id}
                        def={selectedDef}
                        saved={savedMap[selectedDef.id]}
                        onRefresh={updated => handleRefresh(selectedDef.id, updated)}
                    />
                </div>
            </div>
        </div>
    )
}

// ─── CONNECTOR LIST ITEM ──────────────────────────────────────────────────────

function ConnectorItem({
    def,
    active,
    connected,
    onClick,
}: {
    def: ConnectorDef
    active: boolean
    connected: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                active ? 'bg-white shadow-sm' : 'hover:bg-zinc-50'
            }`}
        >
            <ConnectorLogo def={def} size={28} />
            <span className={`flex-1 text-sm truncate ${active ? 'font-medium text-zinc-900' : 'text-zinc-700'}`}>
                {def.name}
            </span>
            {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
            {def.comingSoon && (
                <span className="text-[9px] text-zinc-400 bg-zinc-100 rounded px-1 flex-shrink-0">soon</span>
            )}
        </button>
    )
}
