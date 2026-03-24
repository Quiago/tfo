'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type {
    IntegrationConfig,
    IntegrationCreate,
    IntegrationType,
} from '@/lib/types/integrations'
import { createIntegration, updateIntegration } from '@/lib/services/integrations.service'

interface Props {
    existing?: IntegrationConfig | null
    onSaved: (cfg: IntegrationConfig) => void
    onCancel: () => void
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500 transition-colors placeholder:text-zinc-600'
const labelCls = 'block text-[11px] text-zinc-400 mb-1'

function TeamsFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
    return (
        <div>
            <label className={labelCls}>Webhook URL *</label>
            <input
                value={String(config.webhook_url ?? '')}
                onChange={e => onChange({ ...config, webhook_url: e.target.value })}
                placeholder="https://outlook.office.com/webhook/..."
                className={inputCls}
            />
        </div>
    )
}

function ServiceNowFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
    return (
        <div className="space-y-2">
            <div>
                <label className={labelCls}>Instance URL *</label>
                <input
                    value={String(config.instance_url ?? '')}
                    onChange={e => onChange({ ...config, instance_url: e.target.value })}
                    placeholder="https://dev12345.service-now.com"
                    className={inputCls}
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelCls}>Username *</label>
                    <input
                        value={String(config.username ?? '')}
                        onChange={e => onChange({ ...config, username: e.target.value })}
                        placeholder="admin"
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Password *</label>
                    <input
                        type="password"
                        value={String(config.password ?? '')}
                        onChange={e => onChange({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className={inputCls}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelCls}>Default Assignment Group</label>
                    <input
                        value={String(config.default_assignment_group ?? '')}
                        onChange={e => onChange({ ...config, default_assignment_group: e.target.value })}
                        placeholder="NOC"
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Default Caller ID</label>
                    <input
                        value={String(config.default_caller_id ?? '')}
                        onChange={e => onChange({ ...config, default_caller_id: e.target.value })}
                        placeholder="admin"
                        className={inputCls}
                    />
                </div>
            </div>
        </div>
    )
}

function EmailFields({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
    const recipients = (config.recipients as string[] | undefined) ?? []
    const recipientsStr = recipients.join(', ')

    return (
        <div className="space-y-2">
            <div>
                <label className={labelCls}>SMTP Host:Port *</label>
                <input
                    value={String(config.host ?? '')}
                    onChange={e => onChange({ ...config, host: e.target.value })}
                    placeholder="smtp.office365.com:587"
                    className={inputCls}
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelCls}>Username *</label>
                    <input
                        value={String(config.username ?? '')}
                        onChange={e => onChange({ ...config, username: e.target.value })}
                        placeholder="alerts@company.com"
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Password *</label>
                    <input
                        type="password"
                        value={String(config.password ?? '')}
                        onChange={e => onChange({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className={inputCls}
                    />
                </div>
            </div>
            <div>
                <label className={labelCls}>From Address</label>
                <input
                    value={String(config.from_addr ?? '')}
                    onChange={e => onChange({ ...config, from_addr: e.target.value })}
                    placeholder="alerts@company.com (defaults to username)"
                    className={inputCls}
                />
            </div>
            <div>
                <label className={labelCls}>Default Recipients (comma-separated)</label>
                <input
                    value={recipientsStr}
                    onChange={e => onChange({
                        ...config,
                        recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="noc@company.com, ops@company.com"
                    className={inputCls}
                />
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="use_tls"
                    checked={config.use_tls !== false}
                    onChange={e => onChange({ ...config, use_tls: e.target.checked })}
                    className="accent-violet-500"
                />
                <label htmlFor="use_tls" className="text-xs text-zinc-400">Use STARTTLS</label>
            </div>
        </div>
    )
}

export function IntegrationForm({ existing, onSaved, onCancel }: Props) {
    const [name, setName]       = useState(existing?.name ?? '')
    const [type, setType]       = useState<IntegrationType>(existing?.type ?? 'teams')
    const [config, setConfig]   = useState<Record<string, unknown>>({})
    const [isActive, setIsActive] = useState(existing?.is_active ?? true)
    const [saving, setSaving]   = useState(false)
    const [error, setError]     = useState<string | null>(null)

    const isEdit = !!existing

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) { setError('Name is required'); return }
        setSaving(true)
        setError(null)
        try {
            let saved: IntegrationConfig
            if (isEdit) {
                saved = await updateIntegration(existing!.id, { name, config, is_active: isActive })
            } else {
                const payload: IntegrationCreate = { name, type, config, is_active: isActive }
                saved = await createIntegration(payload)
            }
            onSaved(saved)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-semibold text-white">
                        {isEdit ? 'Edit Integration' : 'New Integration'}
                    </h3>
                    <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className={labelCls}>Name *</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="My Teams Webhook"
                            className={inputCls}
                            autoFocus
                        />
                    </div>

                    {!isEdit && (
                        <div>
                            <label className={labelCls}>Type</label>
                            <select
                                value={type}
                                onChange={e => { setType(e.target.value as IntegrationType); setConfig({}) }}
                                className={`${inputCls} appearance-none`}
                            >
                                <option value="teams">Microsoft Teams</option>
                                <option value="servicenow">ServiceNow</option>
                                <option value="email">Email (SMTP)</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className={labelCls}>Connection Settings</label>
                        {type === 'teams'       && <TeamsFields      config={config} onChange={setConfig} />}
                        {type === 'servicenow'  && <ServiceNowFields config={config} onChange={setConfig} />}
                        {type === 'email'       && <EmailFields      config={config} onChange={setConfig} />}
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={isActive}
                            onChange={e => setIsActive(e.target.checked)}
                            className="accent-violet-500"
                        />
                        <label htmlFor="is_active" className="text-xs text-zinc-400">Active</label>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                        >
                            {saving ? 'Saving…' : (isEdit ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
