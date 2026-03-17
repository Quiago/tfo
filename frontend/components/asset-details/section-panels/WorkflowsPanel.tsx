'use client'

import { NavTree } from '../NavTree'
import { PanelLayout } from '../PanelLayout'
import type { NavItem, SectionPanelProps } from '@/lib/types/asset-tree'
import type { Workflow as RfWorkflow } from '@/lib/types/workflow'
import { useWorkflowStore } from '@/lib/store/workflow-store'
import {
    Activity, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
    FileText, Gauge, GitBranch, Play, Sparkles, Terminal, Thermometer, Timer,
    TrendingUp, User,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

// ── Lazy-load the read-only canvas (React Flow has SSR issues) ─────────────────

const WorkflowCanvasReadOnly = dynamic(
    () => import('@/components/workflow-builder/WorkflowCanvasReadOnly').then((m) => m.WorkflowCanvasReadOnly),
    {
        ssr: false,
        loading: () => (
            <div className="h-full flex items-center justify-center" style={{ background: '#E9ECF3' }}>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-blue-500" />
            </div>
        ),
    },
)

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkflowStatus    = 'running' | 'active' | 'scheduled' | 'completed' | 'ai-optimization'
type ObservationType   = 'sensor' | 'log' | 'pattern' | 'doc'
type Significance      = 'low' | 'medium' | 'high'
type WidgetIconType    = 'temperature' | 'vibration' | 'cycle-excess' | 'corrections'
type WidgetSeverity    = 'critical' | 'warning' | 'caution' | 'info'

interface WorkflowStep { label: string; done: boolean }

interface AgentObservation {
    time: string
    type: ObservationType
    label: string
    value?: string
    significance: Significance
}

interface MetricWidget {
    id: string
    iconType: WidgetIconType
    label: string
    value: string
    unit: string
    delta?: string
    deltaLabel?: string
    severity: WidgetSeverity
}

interface OptimizationRationale {
    summary: string
    keyFindings: string[]
    metricWidgets: MetricWidget[]
    references: Array<{ label: string; type: 'doc' | 'sop' | 'spec' }>
    agentTimeline: AgentObservation[]
}

interface PanelWorkflow {
    id: string
    name: string
    status: WorkflowStatus
    description: string
    assignee: string
    lastRun: string
    nextRun?: string
    steps: WorkflowStep[]
    rfWorkflow?: RfWorkflow
    rationale?: OptimizationRationale
}

// ── React Flow mock data for the optimization workflow ─────────────────────────

const OPTIM_RF_WORKFLOW: RfWorkflow = {
    id: 'wf-optim',
    title: 'AI: Cycle Time Optimization',
    description: 'AI-recommended trajectory recalibration for Joint Axis 3.',
    authorId: 'ai-agent',
    createdAt: '2026-03-16T10:39:00Z',
    updatedAt: '2026-03-16T10:39:00Z',
    version: 1,
    isPublic: false,
    status: 'draft',
    tags: ['optimization', 'axis-3', 'ai-generated'],
    executionCount: 0,
    nodes: [
        { id: 'n1', type: 'sensor_trigger',  label: 'Vibration Alert',          position: { x: 40,   y: 80 }, config: {} },
        { id: 'n2', type: 'log_entry',       label: 'Backup Axis 3 Config',     position: { x: 400,  y: 80 }, config: {} },
        { id: 'n3', type: 'ai_suggest',      label: 'Upload New Path Profile',  position: { x: 780,  y: 80 }, config: { prompt: 'Apply optimized KRL motion path for Axis 3' } },
        { id: 'n4', type: 'checklist_gate',  label: 'Test Cycle (10 reps)',     position: { x: 1180, y: 80 }, config: { items: [{ id: 'c1', label: 'Run 10 dry-run cycles', required: true }] } },
        { id: 'n5', type: 'decision',        label: 'Vibration < threshold?',   position: { x: 1540, y: 80 }, config: { condition: 'vibration < 7.0 mm/s', trueLabel: 'Yes', falseLabel: 'No' } },
        { id: 'n6', type: 'create_ticket',   label: 'Create Work Order',        position: { x: 1900, y: 10  }, config: { service: 'servicenow', titleTemplate: 'Axis 3 optimization approved', descriptionTemplate: '', priority: 'medium' } },
        { id: 'n7', type: 'send_alert',      label: 'Alert: Abort & Review',    position: { x: 1900, y: 140 }, config: { channel: 'slack', messageTemplate: 'Axis 3 optimization validation failed — review required.' } },
    ],
    edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4' },
        { id: 'e4', source: 'n4', target: 'n5' },
        { id: 'e5', source: 'n5', target: 'n6', sourceHandle: 'true',  label: 'Yes' },
        { id: 'e6', source: 'n5', target: 'n7', sourceHandle: 'false', label: 'No'  },
    ],
}

// ── Rationale mock data ────────────────────────────────────────────────────────

const OPTIM_RATIONALE: OptimizationRationale = {
    summary:
        'Continuous analysis of Axis 3 telemetry over the past 72 hours revealed a systematic cycle-time inefficiency caused by a suboptimal motion path profile. The current trajectory introduces unnecessary deceleration phases during the pick-and-place arc, recoverable through KRL path recalibration without hardware intervention.',
    keyFindings: [
        'Axis 3 average cycle time 14% above KR120 fleet median for this cell type',
        'Vibration at 13.5 mm/s indicates mechanical resonance with the current acceleration ramp',
        'Motion path analysis shows 3 redundant velocity corrections per cycle',
        'Gearbox G3 running +4 °C above fleet average — consistent with excess mechanical work',
    ],
    metricWidgets: [
        { id: 'w1', iconType: 'temperature',   label: 'Gearbox G3',        value: '82',   unit: '°C',     delta: '+4°C',  deltaLabel: 'vs fleet avg', severity: 'critical' },
        { id: 'w2', iconType: 'vibration',     label: 'Axis 3 Vibration',  value: '13.5', unit: 'mm/s',   delta: 'RMS',                               severity: 'warning' },
        { id: 'w3', iconType: 'cycle-excess',  label: 'Cycle Time',        value: '14',   unit: '%',      delta: 'above fleet median',                severity: 'caution' },
        { id: 'w4', iconType: 'corrections',   label: 'Path Corrections',  value: '3',    unit: '/cycle', delta: 'redundant',                         severity: 'info' },
    ],
    references: [
        { label: 'KR120 Motion Path Optimization Guide (v2.3)',   type: 'doc' },
        { label: 'SOP-R-012: Vibration Baseline Protocol',         type: 'sop' },
        { label: 'KUKA KRL Reference v4.2 — Trajectory Commands', type: 'spec' },
    ],
    agentTimeline: [
        { time: '10:34', type: 'sensor',  label: 'Axis 3 vibration spike detected',         value: '13.5 mm/s RMS',       significance: 'high' },
        { time: '10:35', type: 'pattern', label: 'Pattern match: motion-path resonance',     value: '94% confidence',      significance: 'high' },
        { time: '10:36', type: 'log',     label: 'Cross-referenced cycle logs #1201–#1204',  value: '4 cycles analysed',   significance: 'medium' },
        { time: '10:37', type: 'sensor',  label: 'Gearbox G3 temperature correlation',       value: '82 °C (+4 vs fleet)', significance: 'medium' },
        { time: '10:38', type: 'doc',     label: 'Retrieved KRL trajectory spec + SOP-R-012',                              significance: 'low' },
        { time: '10:39', type: 'pattern', label: 'Recalibration model computed',             value: '12% cycle gain',      significance: 'high' },
    ],
}

// ── Panel workflows ────────────────────────────────────────────────────────────

const WORKFLOWS: PanelWorkflow[] = [
    {
        id: 'wf-optim',
        name: 'AI: Cycle Time Optimization',
        status: 'ai-optimization',
        description: 'AI-recommended trajectory recalibration for Joint Axis 3 to reduce cycle time by 12%. Generated from telemetry analysis on 2026-03-16.',
        assignee: 'Omar Khalid',
        lastRun: 'Not yet run',
        nextRun: 'Pending approval',
        steps: [],
        rfWorkflow: OPTIM_RF_WORKFLOW,
        rationale: OPTIM_RATIONALE,
    },
    {
        id: 'wf-1',
        name: 'Vibration Calibration',
        status: 'active',
        description: 'Routine vibration baseline check on all joints. SOP-R-012.',
        assignee: 'Ahmed Nasser',
        lastRun: '2026-03-15 09:12',
        nextRun: '2026-03-22 09:00',
        steps: [
            { label: 'Attach accelerometers to joints 1–6', done: true },
            { label: 'Run idle diagnostic (5 min)', done: true },
            { label: 'Record RMS values per axis', done: false },
            { label: 'Compare vs baseline ±10%', done: false },
        ],
    },
    {
        id: 'wf-2',
        name: 'Lubrication Routine',
        status: 'scheduled',
        description: 'Quarterly lubrication of gear units and bearings. SOP-M-004.',
        assignee: 'Ahmed Nasser',
        lastRun: '2026-01-10 07:30',
        nextRun: '2026-04-10 07:30',
        steps: [
            { label: 'Lock out / tag out (LOTO)', done: false },
            { label: 'Clean grease fittings', done: false },
            { label: 'Apply Klüber Isoflex NBU 15', done: false },
            { label: 'Remove LOTO, test rotation', done: false },
        ],
    },
    {
        id: 'wf-3',
        name: 'Firmware Update v4.2',
        status: 'completed',
        description: 'KRC4 controller firmware upgrade. Includes safety stack patch.',
        assignee: 'Lisa Park',
        lastRun: '2026-03-01 22:00',
        steps: [
            { label: 'Download firmware to USB', done: true },
            { label: 'Apply via KRC4 system menu', done: true },
            { label: 'Validate robot startup', done: true },
            { label: 'Log completion in CMMS', done: true },
        ],
    },
]

// ── Config maps ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string; bg: string }> = {
    'ai-optimization': { label: 'AI Optimiz.', color: '#16a34a', bg: '#f0fdf4' },
    running:           { label: 'Running',      color: '#7c3aed', bg: '#f5f3ff' },
    active:            { label: 'Active',        color: '#2563eb', bg: '#eff6ff' },
    scheduled:         { label: 'Scheduled',     color: '#d97706', bg: '#fffbeb' },
    completed:         { label: 'Completed',     color: '#6b7280', bg: '#f9fafb' },
}

const STATUS_BADGE_VARIANT: Record<WorkflowStatus, NonNullable<NavItem['badge']>['variant']> = {
    'ai-optimization': 'green',
    running:           'purple',
    active:            'blue',
    scheduled:         'amber',
    completed:         'zinc',
}

const OBS_CONFIG: Record<ObservationType, { color: string; bg: string; icon: typeof Activity }> = {
    sensor:  { color: '#dc2626', bg: '#fef2f2', icon: Gauge },
    log:     { color: '#2563eb', bg: '#eff6ff', icon: Terminal },
    pattern: { color: '#7c3aed', bg: '#f5f3ff', icon: TrendingUp },
    doc:     { color: '#6b7280', bg: '#f9fafb', icon: BookOpen },
}

const SIGNIFICANCE_COLOR: Record<Significance, string> = {
    high:   '#dc2626',
    medium: '#d97706',
    low:    '#6b7280',
}

const WIDGET_SEVERITY_CONFIG: Record<WidgetSeverity, { color: string; bg: string; border: string }> = {
    critical: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    warning:  { color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
    caution:  { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    info:     { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
}

const WIDGET_ICON: Record<WidgetIconType, typeof Activity> = {
    temperature:    Thermometer,
    vibration:      Activity,
    'cycle-excess': Timer,
    corrections:    GitBranch,
}

// ── Nav builder ────────────────────────────────────────────────────────────────

function buildNavItems(
    statuses: Record<string, WorkflowStatus>,
    highlightOptimization: boolean,
): NavItem[] {
    return WORKFLOWS.map((wf) => {
        const status = statuses[wf.id] ?? wf.status
        const isNew = wf.id === 'wf-optim' && highlightOptimization && status === 'ai-optimization'
        return {
            id: wf.id,
            label: wf.name,
            badge: {
                text: isNew ? 'NEW' : STATUS_CONFIG[status].label,
                variant: isNew ? 'green' : STATUS_BADGE_VARIANT[status],
            },
        }
    })
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WorkflowsPanel({
    highlightOptimization = false,
    onClose,
    onNavigateToModule,
}: SectionPanelProps) {
    const [statuses, setStatuses] = useState<Record<string, WorkflowStatus>>(
        () => Object.fromEntries(WORKFLOWS.map((w) => [w.id, w.status])),
    )
    const [selectedId, setSelectedId] = useState<string | null>(
        highlightOptimization ? 'wf-optim' : null,
    )

    useEffect(() => {
        if (highlightOptimization) setSelectedId('wf-optim')
    }, [highlightOptimization])

    const handleApprove = useCallback(() => {
        setStatuses((prev) => ({ ...prev, 'wf-optim': 'running' }))
        onClose?.()
    }, [onClose])

    const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)

    const handleEditInBuilder = useCallback((rfWorkflow?: RfWorkflow) => {
        if (rfWorkflow) loadWorkflow(rfWorkflow)
        onClose?.()
        onNavigateToModule?.('workflows')
    }, [loadWorkflow, onClose, onNavigateToModule])

    const navItems = buildNavItems(statuses, highlightOptimization)
    const selectedWorkflow = selectedId ? WORKFLOWS.find((w) => w.id === selectedId) : null
    const selectedWithStatus = selectedWorkflow
        ? { ...selectedWorkflow, status: statuses[selectedWorkflow.id] ?? selectedWorkflow.status }
        : null

    return (
        <PanelLayout
            leftNav={
                <NavTree
                    items={navItems}
                    selectedId={selectedId}
                    onSelect={(item) => setSelectedId(item.id)}
                />
            }
            detail={
                selectedWithStatus
                    ? <WorkflowDetail
                        workflow={selectedWithStatus}
                        isOptimization={selectedWithStatus.id === 'wf-optim'}
                        onApprove={handleApprove}
                        onEditInBuilder={() => handleEditInBuilder(selectedWithStatus.rfWorkflow)}
                      />
                    : <WorkflowsOverview statuses={statuses} />
            }
        />
    )
}

// ── Overview ───────────────────────────────────────────────────────────────────

function WorkflowsOverview({ statuses }: { statuses: Record<string, WorkflowStatus> }) {
    const counts = Object.values(statuses).reduce<Record<string, number>>((acc, s) => {
        acc[s] = (acc[s] ?? 0) + 1
        return acc
    }, {})

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-base font-bold mb-1" style={{ color: 'var(--tp-text-heading)' }}>Workflows</h3>
                <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>KUKA KR120 · All procedures</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {(['running', 'active', 'scheduled', 'completed', 'ai-optimization'] as WorkflowStatus[]).map((status) => {
                    const cfg = STATUS_CONFIG[status]
                    const count = counts[status] ?? 0
                    if (count === 0) return null
                    return (
                        <div key={status} className="rounded-xl p-4" style={{ background: cfg.bg, border: `1px solid ${cfg.color}22` }}>
                            <p className="text-xl font-bold" style={{ color: cfg.color }}>{count}</p>
                            <p className="text-[10px] font-medium mt-0.5" style={{ color: cfg.color }}>{cfg.label}</p>
                        </div>
                    )
                })}
            </div>
            <p className="text-xs" style={{ color: 'var(--tp-text-muted)' }}>Select a workflow to view its details.</p>
        </div>
    )
}

// ── Detail ─────────────────────────────────────────────────────────────────────

interface WorkflowDetailProps {
    workflow: PanelWorkflow & { status: WorkflowStatus }
    isOptimization: boolean
    onApprove: () => void
    onEditInBuilder: () => void
}

function WorkflowDetail({ workflow, isOptimization, onApprove, onEditInBuilder }: WorkflowDetailProps) {
    const cfg = STATUS_CONFIG[workflow.status]
    const isApproved = workflow.status === 'running'

    return (
        <div className="space-y-5">


            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold" style={{ color: 'var(--tp-text-heading)' }}>{workflow.name}</h3>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--tp-text-muted)' }}>{workflow.description}</p>
                </div>
                {!isOptimization && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44` }}>
                        {cfg.label}
                    </span>
                )}
            </div>

            {/* Meta (non-optimization only) */}
            {!isOptimization && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Assignee', value: workflow.assignee,  icon: User },
                        { label: 'Last Run',  value: workflow.lastRun,   icon: Play },
                        ...(workflow.nextRun ? [{ label: 'Next Run', value: workflow.nextRun, icon: Clock }] : []),
                    ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="rounded-lg p-3" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <Icon size={11} style={{ color: 'var(--tp-text-muted)' }} />
                                <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: 'var(--tp-text-muted)' }}>{label}</span>
                            </div>
                            <p className="text-xs font-semibold truncate" style={{ color: 'var(--tp-text-heading)' }}>{value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Why section (optimization only) */}
            {isOptimization && workflow.rationale && (
                <WhySection rationale={workflow.rationale} />
            )}

            {/* Workflow canvas */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--tp-stroke)' }}>
                <div className="px-4 py-3" style={{ background: 'var(--tp-bg-card)', borderBottom: '1px solid var(--tp-stroke)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                        Workflow
                    </p>
                </div>
                <div className="h-72">
                    {workflow.rfWorkflow ? (
                        <WorkflowCanvasReadOnly workflow={workflow.rfWorkflow} />
                    ) : (
                        <StepsAsFallback steps={workflow.steps} />
                    )}
                </div>
            </div>

            {/* CTAs (optimization only) */}
            {isOptimization && !isApproved && (
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onApprove}
                        className="flex-1 py-2.5 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                        Approve &amp; Create Work Order
                    </button>
                    <button
                        onClick={onEditInBuilder}
                        className="px-5 py-2.5 text-xs font-semibold rounded-lg border transition-colors hover:bg-zinc-50"
                        style={{ border: '1px solid var(--tp-stroke)', color: 'var(--tp-text-body)' }}
                    >
                        Edit First
                    </button>
                </div>
            )}

            {isOptimization && isApproved && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                    <CheckCircle2 size={14} className="text-green-600" />
                    <p className="text-xs font-semibold text-green-700">Workflow approved and running</p>
                </div>
            )}
        </div>
    )
}

// ── Steps fallback (non-RF workflows) ─────────────────────────────────────────

function StepsAsFallback({ steps }: { steps: WorkflowStep[] }) {
    return (
        <div className="h-full p-4 overflow-y-auto space-y-2.5" style={{ background: 'var(--tp-bg-surface)' }}>
            {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                    {step.done
                        ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                        : <Circle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--tp-text-muted)' }} />}
                    <span className={`text-xs leading-relaxed ${step.done ? 'line-through opacity-50' : ''}`} style={{ color: 'var(--tp-text-body)' }}>
                        {step.label}
                    </span>
                </div>
            ))}
        </div>
    )
}

// ── Mini Metric Widget ─────────────────────────────────────────────────────────

function ArcGauge({ value, color }: { value: number; color: string }) {
    const r = 14
    const c = 2 * Math.PI * r
    const offset = c - (value / 100) * c
    return (
        <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r={r} stroke="#E5E7EB" strokeWidth="4" fill="none" />
            <circle cx="18" cy="18" r={r} stroke={color} strokeWidth="4" fill="none"
                strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
    )
}

function MiniMetricWidget({ widget }: { widget: MetricWidget }) {
    const cfg  = WIDGET_SEVERITY_CONFIG[widget.severity]
    const Icon = WIDGET_ICON[widget.iconType]

    return (
        <div
            className="flex-1 min-w-0 rounded-xl p-3 flex flex-col gap-1.5"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
            {/* Icon or arc gauge */}
            <div className="flex items-center justify-between">
                {widget.iconType === 'cycle-excess' ? (
                    <div className="relative flex items-center justify-center">
                        <ArcGauge value={Number(widget.value)} color={cfg.color} />
                        <span className="absolute text-[8px] font-bold" style={{ color: cfg.color }}>
                            {widget.value}%
                        </span>
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}18` }}>
                        <Icon size={16} style={{ color: cfg.color }} />
                    </div>
                )}
            </div>

            {/* Value */}
            <div className="leading-none">
                {widget.iconType !== 'cycle-excess' && (
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-base font-bold" style={{ color: cfg.color }}>{widget.value}</span>
                        <span className="text-[10px] font-semibold" style={{ color: cfg.color }}>{widget.unit}</span>
                    </div>
                )}
                {widget.delta && (
                    <span className="text-[9px] font-medium" style={{ color: cfg.color }}>
                        {widget.delta} {widget.deltaLabel}
                    </span>
                )}
            </div>

            {/* Label */}
            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                {widget.label}
            </span>
        </div>
    )
}

// ── Accordion (generic collapsible row) ───────────────────────────────────────

function Accordion({
    label, badge, open, onToggle, children,
}: {
    label: string
    badge?: string
    open: boolean
    onToggle: () => void
    children: React.ReactNode
}) {
    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--tp-stroke)' }}>
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:opacity-80"
                style={{ background: 'var(--tp-bg-card)' }}
            >
                <div className="flex items-center gap-2">
                    {open
                        ? <ChevronDown size={13} style={{ color: 'var(--tp-text-muted)' }} />
                        : <ChevronRight size={13} style={{ color: 'var(--tp-text-muted)' }} />}
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                        {label}
                    </span>
                </div>
                {badge && (
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--tp-bg-pill)', color: 'var(--tp-text-muted)' }}>
                        {badge}
                    </span>
                )}
            </button>
            {open && (
                <div className="px-4 py-3" style={{ background: 'var(--tp-bg-surface)', borderTop: '1px solid var(--tp-stroke)' }}>
                    {children}
                </div>
            )}
        </div>
    )
}

// ── Agent Evidence Trail (collapsible) ─────────────────────────────────────────

function AgentTrail({ timeline }: { timeline: AgentObservation[] }) {
    const [open, setOpen] = useState(false)
    const highCount = timeline.filter(o => o.significance === 'high').length

    const badge = (
        <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fef2f2', color: '#dc2626' }}>
                {highCount} high
            </span>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--tp-bg-pill)', color: 'var(--tp-text-muted)' }}>
                {timeline.length} signals
            </span>
        </div>
    )

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--tp-stroke)' }}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:opacity-80"
                style={{ background: 'var(--tp-bg-card)' }}
            >
                <div className="flex items-center gap-2">
                    {open ? <ChevronDown size={13} style={{ color: 'var(--tp-text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--tp-text-muted)' }} />}
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                        Agent evidence trail
                    </span>
                </div>
                {badge}
            </button>

            {open && (
                <div className="px-4 py-3" style={{ background: 'var(--tp-bg-surface)', borderTop: '1px solid var(--tp-stroke)' }}>
                    {timeline.map((obs, i) => {
                        const obsCfg = OBS_CONFIG[obs.type]
                        const ObsIcon = obsCfg.icon
                        const isLast = i === timeline.length - 1
                        return (
                            <div key={i} className="flex gap-2.5">
                                <div className="flex flex-col items-center flex-shrink-0">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center z-10" style={{ background: obsCfg.bg, border: `1.5px solid ${obsCfg.color}` }}>
                                        <ObsIcon size={10} style={{ color: obsCfg.color }} />
                                    </div>
                                    {!isLast && <div className="w-px flex-1 mt-1" style={{ background: 'var(--tp-stroke)', minHeight: '14px' }} />}
                                </div>
                                <div className="pb-2.5 flex-1 min-w-0">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <span className="text-[9px] font-mono font-semibold" style={{ color: 'var(--tp-text-muted)' }}>{obs.time}</span>
                                        <span className="text-[9px] font-medium" style={{ color: obsCfg.color }}>{obs.type}</span>
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block" style={{ background: SIGNIFICANCE_COLOR[obs.significance] }} />
                                    </div>
                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--tp-text-body)' }}>{obs.label}</p>
                                    {obs.value && (
                                        <span className="inline-block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: obsCfg.bg, color: obsCfg.color }}>
                                            {obs.value}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Why section ────────────────────────────────────────────────────────────────

function WhySection({ rationale }: { rationale: OptimizationRationale }) {
    const [diagOpen, setDiagOpen] = useState(false)

    return (
        <div className="space-y-2.5">
            {/* Section label — full width */}
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--tp-text-muted)' }}>
                Why this optimization
            </p>

            {/* 2-column layout: 80% left / 20% right */}
            <div className="flex gap-3 items-start">

                {/* ── Left column (80%) ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">

                    {/* Widgets — each takes equal share of the left column */}
                    <div className="flex gap-2">
                        {rationale.metricWidgets.map((w) => (
                            <MiniMetricWidget key={w.id} widget={w} />
                        ))}
                    </div>

                    {/* Accordion: full technical diagnosis */}
                    <Accordion
                        label="View full technical diagnosis"
                        badge={`${rationale.keyFindings.length} findings`}
                        open={diagOpen}
                        onToggle={() => setDiagOpen((v) => !v)}
                    >
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{rationale.summary}</p>
                        <ul className="space-y-1.5 mt-2">
                            {rationale.keyFindings.map((finding, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />
                                    <span className="text-[11px] leading-relaxed" style={{ color: 'var(--tp-text-body)' }}>{finding}</span>
                                </li>
                            ))}
                        </ul>
                    </Accordion>

                    {/* Agent evidence trail */}
                    <AgentTrail timeline={rationale.agentTimeline} />
                </div>

                {/* ── Right sidebar (20%) — references, always visible ── */}
                <div className="w-[22%] flex-shrink-0 rounded-xl p-3 self-stretch" style={{ background: 'var(--tp-bg-card)', border: '1px solid var(--tp-stroke)' }}>
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--tp-text-muted)' }}>
                        References
                    </p>
                    <div className="space-y-2.5">
                        {rationale.references.map((ref, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <FileText size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--tp-text-muted)' }} />
                                <div className="min-w-0">
                                    <p className="text-[10px] leading-tight" style={{ color: 'var(--tp-text-body)' }}>{ref.label}</p>
                                    <span className="inline-block mt-1 text-[8px] font-semibold px-1.5 py-0.5 rounded uppercase" style={{ background: 'var(--tp-bg-pill)', color: 'var(--tp-text-muted)' }}>
                                        {ref.type}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
