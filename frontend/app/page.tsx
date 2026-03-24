'use client'

import { AuthScreen } from '@/components/auth/AuthScreen'
import { DigitalTwinNavigator } from '@/components/digital-twin/DigitalTwinNavigator'
import { MiniDigitalTwin } from '@/components/digital-twin/MiniDigitalTwin'
import { CAMERA_PRESETS } from '@/components/digital-twin/camera-presets'
import { Navbar } from '@/components/layout/Navbar'
import { OverviewExpand } from '@/components/overview/OverviewExpand'
import { RightPanel } from '@/components/overview/RightPanel'
import { UpdatesView } from '@/components/updates/UpdatesView'
import { useOpshubStore } from '@/lib/store/opshub-store'
import { useAuthStore } from '@/lib/store/auth-store'
import { useTfoStore } from '@/lib/store/tfo-store'
import type { PlatformMode } from '@/lib/content/platform-content'
import { useScreenContext } from '@/lib/store/screen-context-store'
import { useConnectorPreference } from '@/lib/hooks/useConnectorPreference'
import { usePlatformMode } from '@/lib/hooks/usePlatformMode'
import type { OverlayMode } from '@/lib/types/optimization'
import type { TfoModule } from '@/lib/types/tfo'
import { Minimize2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

/** Convert raw mesh/asset IDs like "KUKA_Robot_Arm" → "KUKA Robot Arm". */
function formatMeshName(raw: string): string {
    return raw
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
}

const TEAM_URL_PARAM = 'team' as const

const MultiLayerTimeline = dynamic(
    () => import('@/components/timeline/Timeline').then((m) => m.MultiLayerTimeline),
    { ssr: false, loading: () => <ModuleLoader label="Timeline" /> }
)

const WorkflowBuilder = dynamic(
    () => import('@/components/workflow-builder').then((m) => m.WorkflowBuilder),
    { ssr: false, loading: () => <ModuleLoader label="Workflow Builder" /> }
)

const OpshubLayout = dynamic(
    () => import('@/components/opshub').then((m) => m.OpshubLayout),
    { ssr: false, loading: () => <ModuleLoader label="OpsHub" /> }
)

const EventManagementConsole = dynamic(
    () => import('@/components/events/EventManagementConsole').then((m) => m.EventManagementConsole),
    { ssr: false, loading: () => <ModuleLoader label="Events" /> }
)

function ModuleLoader({ label }: { label: string }) {
    return (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-500" />
                <span className="text-xs text-zinc-500">Loading {label}...</span>
            </div>
        </div>
    )
}

export default function TFODashboard() {
    const { token, _hydrated } = useAuthStore()

    if (!_hydrated) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-zinc-700 border-t-cyan-500 animate-spin" />
            </div>
        )
    }

    if (!token) return <AuthScreen />

    return <Dashboard />
}

function Dashboard() {
    useConnectorPreference()
    usePlatformMode()

    const { activeModule, setActiveModule, facilityMetrics, activeAlerts, recentWorkflows, locations, activeLocationId, setActiveLocation } =
        useTfoStore()
    const setPlatformMode = useAuthStore((s) => s.setPlatformMode)

    const setPendingCreateWorkOrder = useOpshubStore(s => s.setPendingCreateWorkOrder)
    const activeLocation = locations.find((l) => l.id === activeLocationId) ?? locations[0]
    const setSelectedWorkOrderId = useOpshubStore(s => s.setSelectedWorkOrderId)
    const screenCtx = useScreenContext()

    // Wrapper: change location AND derive platformMode from the location's mode field
    const handleLocationChange = useCallback(
        (id: string) => {
            setActiveLocation(id)
            const loc = locations.find((l) => l.id === id)
            if (loc) setPlatformMode(loc.mode as PlatformMode)
        },
        [setActiveLocation, setPlatformMode, locations]
    )

    const handleModuleChange = useCallback(
        (mod: TfoModule) => {
            setActiveModule(mod)
            screenCtx.setActiveModule(mod)
            if (mod === 'opshub') setSelectedWorkOrderId(null)
        },
        [setActiveModule, setSelectedWorkOrderId, screenCtx]
    )

    const [mounted, setMounted] = useState<Set<TfoModule>>(new Set(['overview']))
    useEffect(() => {
        setMounted((prev) => {
            if (prev.has(activeModule)) return prev
            const next = new Set(prev)
            next.add(activeModule)
            return next
        })
    }, [activeModule])

    const [viewMode, setViewMode] = useState<'overview' | 'details'>('overview')
    const [selectedAsset, setSelectedAsset] = useState<string | null>(null)
    const [autoTriggerAnomaly, setAutoTriggerAnomaly] = useState(false)
    const [highlightWorkflowsInTree, setHighlightWorkflowsInTree] = useState(false)

    const isOverview = activeModule === 'overview'

    // Reset the workflow highlight when collapsing the details view
    useEffect(() => {
        if (viewMode === 'overview') setHighlightWorkflowsInTree(false)
    }, [viewMode])

    const expandAsset = useCallback(
        (meshName: string, mode: OverlayMode) => {
            setSelectedAsset(meshName)
            setViewMode('details')
            screenCtx.setSelectedTeam(meshName, formatMeshName(meshName))
            window.history.replaceState(null, '', `?${TEAM_URL_PARAM}=${encodeURIComponent(meshName)}`)

            if (mode === 'anomaly') setAutoTriggerAnomaly(true)
            if (mode === 'optimization') setHighlightWorkflowsInTree(true)
        },
        [screenCtx]
    )

    const collapseView = useCallback(() => {
        setViewMode('overview')
        setSelectedAsset(null)
        screenCtx.setSelectedTeam(null)
        window.history.replaceState(null, '', window.location.pathname)
    }, [screenCtx])

    // Restore expand state from URL on first mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const teamFromUrl = params.get(TEAM_URL_PARAM)
        if (teamFromUrl) {
            setSelectedAsset(teamFromUrl)
            setViewMode('details')
            screenCtx.setSelectedTeam(teamFromUrl, formatMeshName(teamFromUrl))
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'MESH_CLICK') expandAsset(event.data.meshName, null)
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [expandAsset])

    return (
        <div className="flex h-screen flex-col bg-slate-50 text-slate-900 overflow-hidden">
            {/* ── NAVBAR ── */}
            <Navbar
                activeModule={activeModule}
                onModuleChange={handleModuleChange}
                locations={locations}
                activeLocation={activeLocation}
                onLocationChange={handleLocationChange}
                focusedAsset={viewMode === 'details' ? selectedAsset : null}
            />

            {/* ── BODY ── */}
            <main className="relative flex-1 overflow-hidden flex overflow-x-hidden">
                <div className={`flex flex-col transition-all duration-700 ease-in-out overflow-hidden ${viewMode === 'details' ? 'w-[20%]' : 'w-0'}`} />

                {/* 3D Model Container */}
                <div
                    className={`absolute z-10 ${
                        viewMode === 'overview'
                            ? 'inset-0 bg-[var(--tp-bg-main)]'
                            : 'top-4 left-4 w-[calc(20%-1rem)] h-[35%] rounded-[var(--tp-radius-pill)] overflow-hidden border-2 border-[#98A6D4] shadow-lg bg-[var(--tp-bg-card)]'
                    }`}
                >
                    {viewMode === 'overview' ? (
                        <SuspendedDigitalTwin
                            viewMode={viewMode}
                            isolatedMeshName={null}
                            onExpandClick={expandAsset}
                            onCreateWorkOrder={(meshName, mode) => {
                                setPendingCreateWorkOrder({
                                    equipmentName: meshName,
                                    meshName,
                                    ...(mode === 'optimization'
                                        ? {
                                              title: `${meshName} — Optimization`,
                                              description: 'Implement AI-recommended trajectory optimization. Recalibrate joint axis motion path.',
                                              priority: 'medium' as const,
                                              tags: ['Optimization', 'AI-Recommended'],
                                          }
                                        : {
                                              title: `${meshName} — Anomaly Check`,
                                              description: 'Investigate vibration deviation. Check bearing assembly.',
                                              priority: 'high' as const,
                                              tags: ['Predictive', 'AI-Detected'],
                                          }),
                                    facility: 'Dubai Plant',
                                })
                                setActiveModule('opshub')
                            }}
                            onTriggerAnomaly={() => setAutoTriggerAnomaly(true)}
                            onTriggerOptimization={() => {
                                // Optimization trigger from button — no side effects needed here;
                                // the overlay drives the subsequent actions (create order / expand).
                            }}
                        />
                    ) : (
                        <MiniDigitalTwin />
                    )}
                </div>

                <OverviewExpand
                    viewMode={viewMode}
                    selectedAsset={selectedAsset}
                    autoTriggerAnomaly={autoTriggerAnomaly}
                    onAnomalyTriggered={() => setAutoTriggerAnomaly(false)}
                    onSelectAsset={(id) => {
                        setSelectedAsset(id)
                        screenCtx.setSelectedTeam(id, formatMeshName(id))
                        window.history.replaceState(null, '', `?${TEAM_URL_PARAM}=${encodeURIComponent(id)}`)
                    }}
                    setActiveModule={setActiveModule}
                    highlightWorkflowsInTree={highlightWorkflowsInTree}
                />

                {/* Overview Panels */}
                {isOverview && viewMode === 'overview' && (
                    <RightPanel onNavigate={handleModuleChange} activeAlerts={activeAlerts} />
                )}

                {/* Back Button */}
                {viewMode === 'details' && (
                    <button
                        onClick={collapseView}
                        className="absolute top-2 right-2 z-50 bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded shadow border border-zinc-600"
                    >
                        <Minimize2 size={16} />
                    </button>
                )}

                {/* ── Other Modules ── */}
                {mounted.has('timeline') && (
                    <div className={`absolute inset-0 overflow-hidden bg-[#171921] ${activeModule === 'timeline' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                        <MultiLayerTimeline />
                    </div>
                )}
                {mounted.has('workflows') && (
                    <div className={`absolute inset-0 ${activeModule === 'workflows' ? 'z-30' : 'hidden'}`}>
                        <WorkflowBuilder className="h-full" />
                    </div>
                )}
                {mounted.has('opshub') && (
                    <div className={`absolute inset-0 overflow-hidden ${activeModule === 'opshub' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                        <OpshubLayout />
                    </div>
                )}
                {mounted.has('events') && (
                    <div className={`absolute inset-0 overflow-hidden ${activeModule === 'events' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                        <EventManagementConsole />
                    </div>
                )}
                {activeModule === 'updates' && (
                    <div className="absolute inset-0 z-30 bg-white">
                        <UpdatesView />
                    </div>
                )}
            </main>
        </div>
    )
}

// ── SuspendedDigitalTwin ──────────────────────────────────────────────────────

interface SuspendedDigitalTwinProps {
    viewMode: 'overview' | 'details'
    isolatedMeshName: string | null
    onExpandClick: (name: string, mode: OverlayMode) => void
    onCreateWorkOrder: (name: string, mode: OverlayMode) => void
    onTriggerAnomaly: () => void
    onTriggerOptimization: () => void
}

function SuspendedDigitalTwin({
    viewMode,
    isolatedMeshName,
    onExpandClick,
    onCreateWorkOrder,
    onTriggerAnomaly,
    onTriggerOptimization,
}: SuspendedDigitalTwinProps) {
    const targetModel = viewMode === 'details' ? '/models/kuka.glb' : '/models/factory.glb'
    const effectiveIsolatedMesh = viewMode === 'details' ? null : isolatedMeshName

    return (
        <DigitalTwinNavigator
            modelUrl={targetModel}
            presets={CAMERA_PRESETS}
            initialPreset="overview"
            devMode={false}
            environment="warehouse"
            autoTour={false}
            showHotspots={viewMode === 'overview'}
            className="w-full h-full"
            viewMode={viewMode}
            isolatedMeshName={effectiveIsolatedMesh}
            onExpandClick={onExpandClick}
            onCreateWorkOrder={onCreateWorkOrder}
            onTriggerAnomaly={onTriggerAnomaly}
            onTriggerOptimization={onTriggerOptimization}
        />
    )
}
