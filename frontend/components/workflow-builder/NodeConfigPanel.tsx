'use client'

import { useWorkflowStore } from '@/lib/store/workflow-store'
import { NODE_REGISTRY, type WorkflowNode } from '@/lib/types/workflow'
import { Trash2, X } from 'lucide-react'
import { useMemo } from 'react'
import { NodeIcon } from './NodeIcon'

// ── Colour palette derived from NODE_REGISTRY `color` field ───────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; iconBg: string }> = {
    rose:    { bg: '#fef2f2', text: '#ef4444', iconBg: '#fee2e2' },
    amber:   { bg: '#fffbeb', text: '#f59e0b', iconBg: '#fef3c7' },
    emerald: { bg: '#ecfdf5', text: '#10b981', iconBg: '#d1fae5' },
    violet:  { bg: '#f5f3ff', text: '#7c3aed', iconBg: '#ede9fe' },
    sky:     { bg: '#f0f9ff', text: '#0ea5e9', iconBg: '#e0f2fe' },
    slate:   { bg: '#f8fafc', text: '#64748b', iconBg: '#f1f5f9' },
}

const DEFAULT_COLOR = COLOR_MAP.slate

// ── Shared input class ─────────────────────────────────────────────────────────
// Reused across text, select, textarea — keeps all fields visually consistent.
const INPUT_CLASS = [
    'w-full rounded-lg px-3 py-2 text-xs',
    'border outline-none transition-colors',
    'bg-[var(--tp-bg-surface)] text-[var(--tp-text-body)]',
    'border-[var(--tp-stroke)] placeholder-[var(--tp-text-muted)]',
    'focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30',
].join(' ')

const SELECT_CLASS = INPUT_CLASS + ' cursor-pointer'

// ── Main panel ─────────────────────────────────────────────────────────────────

export function NodeConfigPanel() {
    const { workflow, selectedNodeId, selectNode, updateNode, removeNode } = useWorkflowStore()

    const node = useMemo(
        () => workflow?.nodes.find(n => n.id === selectedNodeId) ?? null,
        [workflow?.nodes, selectedNodeId],
    )

    if (!node) return null

    const meta    = NODE_REGISTRY[node.type]
    const palette = (meta && COLOR_MAP[meta.color]) ?? DEFAULT_COLOR

    return (
        <div
            className="flex flex-col flex-shrink-0 h-full overflow-hidden"
            style={{
                width: 300,
                background: 'var(--tp-bg-card)',
                borderLeft: '1px solid var(--tp-stroke)',
            }}
        >
            {/* ── Header ── */}
            <div
                className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--tp-stroke)' }}
            >
                {/* Coloured icon badge */}
                <div
                    className="flex-shrink-0 flex items-center justify-center rounded-xl"
                    style={{
                        width: 36, height: 36,
                        background: palette.iconBg,
                        color: palette.text,
                    }}
                >
                    <NodeIcon name={meta?.icon ?? 'Circle'} size={18} />
                </div>

                {/* Title + category */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--tp-text-heading)' }}>
                        {meta?.label ?? node.type}
                    </p>
                    <span
                        className="inline-block mt-0.5 text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: palette.bg, color: palette.text }}
                    >
                        {meta?.category ?? 'node'}
                    </span>
                </div>

                {/* Close */}
                <button
                    onClick={() => selectNode(null)}
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-[var(--tp-bg-surface)]"
                    style={{ color: 'var(--tp-text-muted)' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* ── Form ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Label */}
                <Field label="Label">
                    <input
                        type="text"
                        value={node.label}
                        onChange={e => updateNode(node.id, { label: e.target.value })}
                        className={INPUT_CLASS}
                    />
                </Field>

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--tp-stroke)' }} />

                {/* Type-specific fields */}
                <ConfigFields node={node} updateNode={updateNode} />
            </div>

            {/* ── Footer ── */}
            <div
                className="flex-shrink-0 px-4 py-3"
                style={{ borderTop: '1px solid var(--tp-stroke)' }}
            >
                <button
                    onClick={() => removeNode(node.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={{
                        background: '#fef2f2',
                        color: '#ef4444',
                        border: '1px solid #fca5a5',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                >
                    <Trash2 size={13} />
                    Delete node
                </button>
            </div>
        </div>
    )
}

// ── Field label wrapper ────────────────────────────────────────────────────────

function Field({ label, children, className = '' }: {
    label: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`space-y-1.5 ${className}`}>
            <label className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                {label}
            </label>
            {children}
        </div>
    )
}

// ── Type-specific config fields ────────────────────────────────────────────────

type UpdateFn = (nodeId: string, updates: Partial<Pick<WorkflowNode, 'label' | 'config' | 'position'>>) => void

function ConfigFields({ node, updateNode }: { node: WorkflowNode; updateNode: UpdateFn }) {
    const config = node.config as Record<string, unknown>
    const patch  = (partial: Record<string, unknown>) => updateNode(node.id, { config: { ...config, ...partial } })

    switch (node.type) {
        case 'voice_trigger':
            return (
                <Field label="Keywords">
                    <input
                        type="text"
                        defaultValue={(config.keywords as string[] | undefined)?.join(', ') ?? ''}
                        onChange={e => patch({ keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
                        placeholder="vibration, gravel, noise"
                        className={INPUT_CLASS}
                    />
                    <p className="text-[10px]" style={{ color: 'var(--tp-text-muted)' }}>Separate keywords with commas</p>
                </Field>
            )

        case 'decision':
            return (
                <>
                    <Field label="Condition">
                        <input
                            type="text"
                            defaultValue={(config.condition as string) ?? ''}
                            onChange={e => patch({ condition: e.target.value })}
                            placeholder="temperature > 85"
                            className={INPUT_CLASS}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="True label">
                            <input
                                type="text"
                                defaultValue={(config.trueLabel as string) ?? 'Yes'}
                                onChange={e => patch({ trueLabel: e.target.value })}
                                className={INPUT_CLASS}
                            />
                        </Field>
                        <Field label="False label">
                            <input
                                type="text"
                                defaultValue={(config.falseLabel as string) ?? 'No'}
                                onChange={e => patch({ falseLabel: e.target.value })}
                                className={INPUT_CLASS}
                            />
                        </Field>
                    </div>
                </>
            )

        case 'send_alert':
            return (
                <>
                    <Field label="Channel">
                        <select
                            defaultValue={(config.channel as string) ?? 'slack'}
                            onChange={e => patch({ channel: e.target.value })}
                            className={SELECT_CLASS}
                        >
                            <option value="slack">WhatsApp</option>
                            <option value="slack">Slack</option>
                            <option value="email">Email</option>
                            <option value="telegram">Telegram</option>
                            <option value="push">Push Notification</option>
                        </select>
                    </Field>
                    <Field label="Recipient">
                        <input
                            type="text"
                            defaultValue={(config.recipient as string) ?? ''}
                            onChange={e => patch({ recipient: e.target.value })}
                            placeholder="#channel or email@example.com"
                            className={INPUT_CLASS}
                        />
                    </Field>
                    <Field label="Message template">
                        <textarea
                            defaultValue={(config.messageTemplate as string) ?? ''}
                            onChange={e => patch({ messageTemplate: e.target.value })}
                            placeholder="Alert: {{description}}"
                            rows={3}
                            className={INPUT_CLASS + ' resize-none leading-relaxed'}
                        />
                    </Field>
                </>
            )

        case 'create_ticket':
            return (
                <>
                    <Field label="Service">
                        <select
                            defaultValue={(config.service as string) ?? 'jira'}
                            onChange={e => patch({ service: e.target.value })}
                            className={SELECT_CLASS}
                        >
                            <option value="jira">Jira Cloud</option>
                            <option value="servicenow">ServiceNow</option>
                            <option value="email_fallback">Email (Fallback)</option>
                        </select>
                    </Field>
                    <Field label="Title template">
                        <input
                            type="text"
                            defaultValue={(config.titleTemplate as string) ?? ''}
                            onChange={e => patch({ titleTemplate: e.target.value })}
                            placeholder="{{issue_type}} — {{asset.model}}"
                            className={INPUT_CLASS}
                        />
                    </Field>
                    <Field label="Priority">
                        <select
                            defaultValue={(config.priority as string) ?? 'medium'}
                            onChange={e => patch({ priority: e.target.value })}
                            className={SELECT_CLASS}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </Field>
                </>
            )

        case 'generate_report':
            return (
                <>
                    <Field label="Format">
                        <select
                            defaultValue={(config.format as string) ?? 'pdf'}
                            onChange={e => patch({ format: e.target.value })}
                            className={SELECT_CLASS}
                        >
                            <option value="pdf">PDF</option>
                            <option value="xlsx">Excel (.xlsx)</option>
                        </select>
                    </Field>
                    <Field label="Options">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                defaultChecked={(config.includePhotos as boolean) ?? false}
                                onChange={e => patch({ includePhotos: e.target.checked })}
                                className="w-3.5 h-3.5 rounded accent-blue-500"
                            />
                            <span className="text-xs" style={{ color: 'var(--tp-text-body)' }}>Attach captured photos</span>
                        </label>
                    </Field>
                </>
            )

        case 'ai_suggest':
            return (
                <Field label="Prompt">
                    <textarea
                        defaultValue={(config.prompt as string) ?? ''}
                        onChange={e => patch({ prompt: e.target.value })}
                        placeholder="Diagnose the likely root cause based on sensor readings…"
                        rows={4}
                        className={INPUT_CLASS + ' resize-none leading-relaxed'}
                    />
                </Field>
            )

        default:
            // Generic read-only JSON for unconfigured types
            return (
                <Field label="Configuration">
                    <textarea
                        value={JSON.stringify(config, null, 2)}
                        rows={5}
                        readOnly
                        className={INPUT_CLASS + ' resize-none font-mono text-[10px] opacity-70'}
                    />
                </Field>
            )
    }
}
