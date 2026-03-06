'use client'


import { DigitalTwinNavigator } from '@/components/digital-twin/DigitalTwinNavigator'
import { MiniDigitalTwin } from '@/components/digital-twin/MiniDigitalTwin'
import { CAMERA_PRESETS } from '@/components/digital-twin/camera-presets'
import { Navbar } from '@/components/layout/Navbar'
import { OverviewExpand } from '@/components/overview/OverviewExpand'
import { RightPanel } from '@/components/overview/RightPanel'
import { UpdatesView } from '@/components/updates/UpdatesView'
import { useOpshubStore } from '@/lib/store/opshub-store'
import { useTfoStore } from '@/lib/store/tfo-store'
import type { TfoModule } from '@/lib/types/tfo'
import {
    Minimize2
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

// Dynamic imports — SSR disabled for heavy components
const MultiLayerTimeline = dynamic(
    () =>
        import('@/components/timeline/Timeline').then((m) => m.MultiLayerTimeline),
    { ssr: false, loading: () => <ModuleLoader label="Timeline" /> }
)


const WorkflowBuilder = dynamic(
    () =>
        import('@/components/workflow-builder').then((m) => m.WorkflowBuilder),
    { ssr: false, loading: () => <ModuleLoader label="Workflow Builder" /> }
)

const OpshubLayout = dynamic(
    () => import('@/components/opshub').then((m) => m.OpshubLayout),
    { ssr: false, loading: () => <ModuleLoader label="OpsHub" /> }
)

// ─── MODULE REGISTRY ────────────────────────────────────────────────────────


// ─── LOADING PLACEHOLDER ────────────────────────────────────────────────────
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

// No DigitalTwinFrame component — single iframe rendered directly in main

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────

export default function TFODashboard() {
    const { activeModule, setActiveModule, facilityMetrics, activeAlerts, recentWorkflows, locations, activeLocationId, setActiveLocation } =
        useTfoStore()

    const setPendingCreateWorkOrder = useOpshubStore(s => s.setPendingCreateWorkOrder)

    const activeLocation = locations.find((l) => l.id === activeLocationId) ?? locations[0]

    const setSelectedWorkOrderId = useOpshubStore(s => s.setSelectedWorkOrderId)

    const handleModuleChange = useCallback(
        (mod: TfoModule) => {
            setActiveModule(mod)
            if (mod === 'opshub') {
                setSelectedWorkOrderId(null)
            }
        },
        [setActiveModule, setSelectedWorkOrderId]
    )

    // Track which modules have been visited (lazy mount, never unmount)
    const [mounted, setMounted] = useState<Set<TfoModule>>(new Set(['overview']))
    useEffect(() => {
        setMounted((prev) => {
            if (prev.has(activeModule)) return prev
            const next = new Set(prev)
            next.add(activeModule)
            return next
        })
    }, [activeModule])

    // View Mode State: 'overview' vs 'details'
    const [viewMode, setViewMode] = useState<'overview' | 'details'>('overview')
    const [selectedAsset, setSelectedAsset] = useState<string | null>(null)
    const [autoTriggerAnomaly, setAutoTriggerAnomaly] = useState(false)

    const isOverview = activeModule === 'overview'

    // When clicking a mesh, switch to details mode
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'MESH_CLICK') {
                const meshName = event.data.meshName
                setSelectedAsset(meshName)
                setViewMode('details')
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // Handler for DigitalTwinNavigator click (need to expose this via the iframe or component)
    // Note: Since we are using an iframe for the DT, we need to pass props via postMessage or URL params if possible,
    // OR render the DigitalTwinNavigator directly if we want tighter integration.
    // The current architecture uses an iframe pointing to generic playground.
    // To support the seamless transition requested, rendering the component directly is better,
    // BUT to minimize risk, let's keep the iframe and control it via className/layout changes.
    // WAIT: The "shrink" effect on the model requires the canvas to resize.

    // Modification: Render DigitalTwinNavigator DIRECTLY instead of iframe to allow prop passing and smoother transition.
    // We already imported it in `playground/digital-twin/page.tsx`. Let's assume we can import it here too.

    // But wait, the dynamic import in page.tsx implies module separation.
    // Let's modify the DigitalTwin wrapper to simply be the component if we can.
    // For now, I will stick to the iframe strategy but resize the iframe container. 
    // AND I need to pass the 'viewMode' and 'isolatedMeshName' to the iframe context.
    // OR simpler: Move DigitalTwinNavigator import here and drop the iframe.
    // Let's drop the iframe for better control as requested by the specific transition effect.

    return (
        <div className="flex h-screen flex-col bg-slate-50 text-slate-900 overflow-hidden">
            {/* ── NAVBAR ───────────────────────────────────────────────── */}
            <Navbar
                activeModule={activeModule}
                onModuleChange={handleModuleChange}
                locations={locations}
                activeLocation={activeLocation}
                onLocationChange={setActiveLocation}
            />

            {/* ── BODY ─────────────────────────────────────────────────── */}
            <main className="relative flex-1 overflow-hidden flex overflow-x-hidden">

                {/* ── UNIFIED CONTENT CONTAINER ── 
                    We use a flex layout. 
                    - Overview: Digital Twin takes 100% absolute, Panels overlay.
                    - Details: Standard Flex/Grid layout.
                */}

                {/* ── LEFT COLUMN (Variable Width) ── */}
                <div className={`flex flex-col transition-all duration-700 ease-in-out overflow-hidden ${viewMode === 'details' ? 'w-[20%]' : 'w-0'
                    }`}>
                    {/* Top: 3D Model Container (When in Details Mode) */}
                    {/* Actually, if we want the 3D model to shrink from Full to Top-Left, 
                         we should keep the 3D model container independent and resize it. 
                         Let's try absolute positioning transition. 
                     */}
                </div>

                {/* ── DYNAMIC LAYOUT ── */}

                {/* 3D Model Container - Transitions between Full Screen and Top-Left */}
                {/* 3D Model Container - Top Left in Details Mode */}
                <div
                    className={`absolute z-10 
                    ${viewMode === 'overview'
                            ? 'inset-0 bg-[var(--tp-bg-main)]'
                            : 'top-4 left-4 w-[calc(20%-1rem)] h-[35%] rounded-[var(--tp-radius-pill)] overflow-hidden border-2 border-[#98A6D4] shadow-lg bg-[var(--tp-bg-card)]'
                        }`}
                >
                    {viewMode === 'overview' ? (
                        <SuspendedDigitalTwin
                            viewMode={viewMode}
                            isolatedMeshName={null}
                            onExpandClick={(meshName, isAnomaly) => {
                                setSelectedAsset(meshName)
                                setViewMode('details')
                                if (isAnomaly) {
                                    setAutoTriggerAnomaly(true)
                                }
                            }}
                            onCreateWorkOrder={(meshName) => {
                                setPendingCreateWorkOrder({
                                    equipmentName: meshName,
                                    meshName,
                                    title: `${meshName} - Anomaly Check`,
                                    description: 'Investigate vibration deviation. Check bearing assembly.',
                                    priority: 'high',
                                    facility: 'Dubai Plant',
                                    tags: ['Predictive', 'AI-Detected']
                                })
                                setActiveModule('opshub')
                            }}
                            onTriggerAnomaly={() => setAutoTriggerAnomaly(true)}
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
                        // If user clicks tree, trigger isolation logic too
                    }}
                    setActiveModule={setActiveModule}
                />



                {/* ── OVERVIEW PANELS (overlay on DT, Fade out in Details Mode) ──── */}
                {
                    isOverview && viewMode === 'overview' && (
                        <RightPanel
                            onNavigate={handleModuleChange}
                            activeAlerts={activeAlerts}
                        />
                    )
                }

                {/* Back Button for Details Mode */}
                {
                    viewMode === 'details' && (
                        <button
                            onClick={() => {
                                setViewMode('overview')
                                setSelectedAsset(null)
                            }}
                            className="absolute top-2 right-2 z-50 bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded shadow border border-zinc-600"
                        >
                            <Minimize2 size={16} />
                        </button>
                    )
                }

                {/* ── OTHER MODULES (lazy mount, visibility toggle) ───── */}
                {
                    mounted.has('timeline') && (
                        <div className={`absolute inset-0 overflow-auto bg-white dark:bg-zinc-950 ${activeModule === 'timeline' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                            <MultiLayerTimeline />
                        </div>
                    )
                }
                {
                    mounted.has('workflows') && (
                        <div className={`absolute inset-0 ${activeModule === 'workflows' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                            <WorkflowBuilder className="h-full" />
                        </div>
                    )
                }
                {
                    mounted.has('opshub') && (
                        <div className={`absolute inset-0 overflow-hidden ${activeModule === 'opshub' ? 'z-30' : 'z-0 invisible pointer-events-none'}`}>
                            <OpshubLayout />
                        </div>
                    )
                }
                {
                    activeModule === 'updates' && (
                        <div className="absolute inset-0 z-30 bg-white">
                            <UpdatesView />
                        </div>
                    )
                }
            </main >

        </div >
    )
}

// Helper to load DigitalTwinNavigator
// We need to import it. Since it was in playground, let's update the imports.

function SuspendedDigitalTwin({
    viewMode,
    isolatedMeshName,
    onExpandClick,
    onCreateWorkOrder,
    onTriggerAnomaly,
}: {
    viewMode: 'overview' | 'details'
    isolatedMeshName: string | null
    onExpandClick: (name: string, isAnomaly?: boolean) => void
    onCreateWorkOrder: (name: string) => void
    onTriggerAnomaly: () => void
}) {
    // When in details/expand mode, show the Kuka robot model specifically
    const targetModel = viewMode === 'details' ? '/models/kuka.glb' : '/models/factory.glb'

    // When showing the Kuka model, we don't need isolation (it's already the isolated object)
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
        />
    )
}
