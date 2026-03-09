'use client'

import { useWorkflowStore } from '@/lib/store/workflow-store'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import s from '@/styles/workflow/workflow.module.css'
import * as LucideIcons from 'lucide-react'
import { Trash2, X } from 'lucide-react'
import { useMemo } from 'react'

function getIcon(name: string, size = 16) {
    const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name]
    return Icon ? <Icon size={size} /> : null
}

export function NodeConfigPanel() {
    const { workflow, selectedNodeId, selectNode, updateNode, removeNode } = useWorkflowStore()

    const node = useMemo(
        () => workflow?.nodes.find(n => n.id === selectedNodeId) ?? null,
        [workflow?.nodes, selectedNodeId]
    )

    if (!node) return null

    const meta = NODE_REGISTRY[node.type]

    const handleLabelChange = (label: string) => {
        updateNode(node.id, { label })
    }

    const handleDelete = () => {
        removeNode(node.id)
    }

    const handleClose = () => {
        selectNode(null)
    }

    // Render config fields based on node type
    const renderConfigFields = () => {
        const config = node.config as Record<string, unknown>

        switch (node.type) {
            case 'voice_trigger':
                return (
                    <ConfigField label="Keywords">
                        <input
                            type="text"
                            defaultValue={(config.keywords as string[] | undefined)?.join(', ') ?? ''}
                            onChange={(e) => updateNode(node.id, {
                                config: { ...config, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) }
                            })}
                            placeholder="vibration, gravel, noise"
                            className={s.textInput}
                        />
                    </ConfigField>
                )

            case 'decision':
                return (
                    <>
                        <ConfigField label="Condition">
                            <input
                                type="text"
                                defaultValue={(config.condition as string) ?? ''}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, condition: e.target.value }
                                })}
                                placeholder="temperature > 85"
                                className={s.textInput}
                            />
                        </ConfigField>
                        <div className="flex gap-2">
                            <ConfigField label="True Label" className="flex-1">
                                <input
                                    type="text"
                                    defaultValue={(config.trueLabel as string) ?? 'Yes'}
                                    onChange={(e) => updateNode(node.id, {
                                        config: { ...config, trueLabel: e.target.value }
                                    })}
                                    className={s.textInput}
                                />
                            </ConfigField>
                            <ConfigField label="False Label" className="flex-1">
                                <input
                                    type="text"
                                    defaultValue={(config.falseLabel as string) ?? 'No'}
                                    onChange={(e) => updateNode(node.id, {
                                        config: { ...config, falseLabel: e.target.value }
                                    })}
                                    className={s.textInput}
                                />
                            </ConfigField>
                        </div>
                    </>
                )

            case 'send_alert':
                return (
                    <>
                        <ConfigField label="Channel">
                            <select
                                defaultValue={(config.channel as string) ?? 'slack'}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, channel: e.target.value }
                                })}
                                className={s.selectInput}
                            >
                                <option value="slack">Slack</option>
                                <option value="email">Email</option>
                                <option value="telegram">Telegram</option>
                                <option value="push">Push Notification</option>
                            </select>
                        </ConfigField>
                        <ConfigField label="Recipient">
                            <input
                                type="text"
                                defaultValue={(config.recipient as string) ?? ''}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, recipient: e.target.value }
                                })}
                                placeholder="#channel or email@example.com"
                                className={s.textInput}
                            />
                        </ConfigField>
                        <ConfigField label="Message Template">
                            <textarea
                                defaultValue={(config.messageTemplate as string) ?? ''}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, messageTemplate: e.target.value }
                                })}
                                placeholder="Alert: {{description}}"
                                rows={3}
                                className={s.textArea}
                            />
                        </ConfigField>
                    </>
                )

            case 'create_ticket':
                return (
                    <>
                        <ConfigField label="Service">
                            <select
                                defaultValue={(config.service as string) ?? 'jira'}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, service: e.target.value }
                                })}
                                className={s.selectInput}
                            >
                                <option value="jira">Jira Cloud</option>
                                <option value="servicenow">ServiceNow</option>
                                <option value="email_fallback">Email (Fallback)</option>
                            </select>
                        </ConfigField>
                        <ConfigField label="Title Template">
                            <input
                                type="text"
                                defaultValue={(config.titleTemplate as string) ?? ''}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, titleTemplate: e.target.value }
                                })}
                                placeholder="{{issue_type}} — {{asset.model}}"
                                className={s.textInput}
                            />
                        </ConfigField>
                        <ConfigField label="Priority">
                            <select
                                defaultValue={(config.priority as string) ?? 'medium'}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, priority: e.target.value }
                                })}
                                className={s.selectInput}
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                            </select>
                        </ConfigField>
                    </>
                )

            case 'generate_report':
                return (
                    <>
                        <ConfigField label="Format">
                            <select
                                defaultValue={(config.format as string) ?? 'pdf'}
                                onChange={(e) => updateNode(node.id, {
                                    config: { ...config, format: e.target.value }
                                })}
                                className={s.selectInput}
                            >
                                <option value="pdf">PDF</option>
                                <option value="xlsx">Excel (.xlsx)</option>
                            </select>
                        </ConfigField>
                        <ConfigField label="Include Photos">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    defaultChecked={(config.includePhotos as boolean) ?? false}
                                    onChange={(e) => updateNode(node.id, {
                                        config: { ...config, includePhotos: e.target.checked }
                                    })}
                                    className="rounded border-zinc-600"
                                />
                                <span className="text-xs text-zinc-300">Attach captured photos</span>
                            </label>
                        </ConfigField>
                    </>
                )

            default:
                // Generic JSON view for unconfigured types
                return (
                    <ConfigField label="Configuration (JSON)">
                        <textarea
                            defaultValue={JSON.stringify(config, null, 2)}
                            rows={4}
                            readOnly
                            className={s.textArea}
                        />
                    </ConfigField>
                )
        }
    }

    return (
        <div className={s.configPanel}>
            {/* Panel Header */}
            <div className={s.panelHeader}>
                <span className={s.panelIcon}>
                    {getIcon(meta.icon, 16)}
                </span>
                <div className={s.panelTitleGroup}>
                    <p className={s.panelTitle}>
                        {meta.label}
                    </p>
                    <p className={s.panelSubtitle}>{node.id}</p>
                </div>
                <button
                    onClick={handleClose}
                    className={s.closeButton}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Config Form */}
            <div className={s.configContent}>
                {/* Node Label */}
                <ConfigField label="Label">
                    <input
                        type="text"
                        value={node.label}
                        onChange={(e) => handleLabelChange(e.target.value)}
                        className={s.textInput}
                    />
                </ConfigField>

                <div className={s.divider} />

                {/* Type-specific config */}
                {renderConfigFields()}
            </div>

            {/* Delete button */}
            <div className={s.panelFooter}>
                <button
                    onClick={handleDelete}
                    className={s.deleteButton}
                >
                    <Trash2 size={12} />
                    Delete Node
                </button>
            </div>
        </div>
    )
}

// ─── Reusable Config Field Wrapper ───────────────────────────────
function ConfigField({ label, children, className = '' }: {
    label: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`${s.configField} ${className}`}>
            <label className={s.fieldLabel}>
                {label}
            </label>
            {children}
        </div>
    )
}
