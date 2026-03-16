'use client'

import { Canvas, useThree } from '@react-three/fiber'
import { Activity, AlertTriangle, Thermometer, TrendingUp, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OptimizationInsight, OverlayMode } from '@/lib/types/optimization'
import type { CameraSystemHandle } from './CameraSystem'
import type { AlertMeshInfo, MeshClickEvent } from './FactoryModel'
import { FactoryScene } from './FactoryScene'
import { LoadingScreen } from './LoadingScreen'
import type { AnomalyAlert } from './MachineInspector'
import { MachineOverlay } from './MachineOverlay'
import type { CameraPreset } from './camera-presets'
import { getMachineInfo } from './machine-data'

// ── Static optimization insight for the demo trigger ─────────────────────────
const DEMO_OPTIMIZATION: OptimizationInsight = {
    title: 'Cycle Time Optimization Detected',
    description: 'AI analysis found a 12% reduction in joint motion path for operations #4–7. Recalibrating arm trajectory improves throughput without hardware changes.',
    potentialSavingEur: 4200,
    efficiencyGainPercent: 12,
    affectedSignals: ['Joint Axis 3', 'Path Velocity', 'Cycle Counter'],
    confidence: 91,
    estimatedHours: 2,
    timestamp: '',   // filled at trigger time
}

// ── Static anomaly for the demo trigger ──────────────────────────────────────
const DEMO_ANOMALY: AnomalyAlert = {
    type: 'Excessive Vibration Detected',
    severity: 'critical',
    message: 'Vibration amplitude exceeds safe operating threshold on joint axis 3. Immediate inspection recommended.',
    value: '13.5 mm/s RMS',
    threshold: '7.0 mm/s RMS',
    timestamp: '',   // filled at trigger time
}

// ── Shared mesh pattern used by both triggers ─────────────────────────────────
const TRIGGER_MESH_PATTERN = 'kuka-kr120-right'

interface DigitalTwinNavigatorProps {
    modelUrl: string
    presets: CameraPreset[]
    initialPreset?: string
    devMode?: boolean
    environment?: string
    autoTour?: boolean
    autoTourInterval?: number
    showHotspots?: boolean
    showNavPanel?: boolean
    className?: string
    viewMode?: 'full' | 'details' | 'overview'
    isolatedMeshName?: string | null
    onExpandClick?: (meshName: string, mode: OverlayMode) => void
    onCreateWorkOrder?: (meshName: string, mode: OverlayMode) => void
    onTriggerAnomaly?: () => void
    onTriggerOptimization?: () => void
}

interface OverlayState {
    meshName: string
    machineName: string
    screenX: number
    screenY: number
    anomaly?: AnomalyAlert | null
    optimization?: OptimizationInsight | null
}

// Helper component inside the Canvas to project 3D → 2D
function ScreenProjector({
    worldPos,
    onProject,
}: {
    worldPos: [number, number, number] | null
    onProject: (x: number, y: number) => void
}) {
    const { camera, gl } = useThree()

    useEffect(() => {
        if (!worldPos) return
        const vec = new THREE.Vector3(...worldPos)
        vec.project(camera)
        const rect = gl.domElement.getBoundingClientRect()
        const x = ((vec.x + 1) / 2) * rect.width + rect.left
        const y = ((-vec.y + 1) / 2) * rect.height + rect.top
        onProject(x, y)
    }, [worldPos, camera, gl, onProject])

    return null
}

export function DigitalTwinNavigator({
    modelUrl,
    presets,
    initialPreset = 'overview',
    devMode = false,
    environment = 'warehouse',
    autoTour = false,
    autoTourInterval = 5000,
    showHotspots = true,
    className = 'w-full h-screen',
    viewMode = 'full',
    isolatedMeshName = null,
    onExpandClick,
    onCreateWorkOrder,
    onTriggerAnomaly,
    onTriggerOptimization,
}: DigitalTwinNavigatorProps) {
    const [activeId, setActiveId] = useState<string | null>(initialPreset)
    const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([0, 0, 0])
    const [meshCount, setMeshCount] = useState(0)
    const [transitionLabel, setTransitionLabel] = useState<string | null>(null)
    const [alertMeshPattern, setAlertMeshPattern] = useState<string | null>(null)
    // Unified mode: null = idle, 'anomaly' = red flash, 'optimization' = green flash
    const [alertMode, setAlertMode] = useState<'anomaly' | 'optimization' | null>(null)
    const alertModeRef = useRef<'anomaly' | 'optimization' | null>(null)
    const [overlay, setOverlay] = useState<OverlayState | null>(null)
    const [pendingProjection, setPendingProjection] = useState<[number, number, number] | null>(null)
    const [pendingOverlayData, setPendingOverlayData] = useState<Omit<OverlayState, 'screenX' | 'screenY'> | null>(null)
    const cameraRef = useRef<CameraSystemHandle>(null)
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Keep ref in sync for use inside async callbacks
    const syncMode = useCallback((mode: 'anomaly' | 'optimization' | null) => {
        alertModeRef.current = mode
        setAlertMode(mode)
    }, [])

    const handleActiveChange = useCallback(
        (id: string | null) => {
            setActiveId(id)
            if (id) {
                const preset = presets.find((p) => p.id === id)
                if (preset) {
                    setTransitionLabel(preset.name)
                    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
                    transitionTimeoutRef.current = setTimeout(() => setTransitionLabel(null), 2200)
                }
            }
        },
        [presets]
    )

    const handleCameraMove = useCallback((position: [number, number, number]) => {
        setCameraPosition(position)
    }, [])

    const handleMeshCount = useCallback((count: number) => {
        setMeshCount(count)
    }, [])

    const handleProjection = useCallback((x: number, y: number) => {
        if (!pendingOverlayData) return
        const rect = containerRef.current?.getBoundingClientRect()
        const cx = rect ? Math.max(rect.left + 80, Math.min(x, rect.right - 80)) : x
        const cy = rect ? Math.max(rect.top + 40, Math.min(y, rect.bottom - 100)) : y
        setOverlay({ ...pendingOverlayData, screenX: cx, screenY: cy })
        setPendingProjection(null)
        setPendingOverlayData(null)
    }, [pendingOverlayData])

    const handleMeshClick = useCallback((event: MeshClickEvent) => {
        const machine = getMachineInfo(event.meshName)
        setPendingOverlayData({
            meshName: event.meshName,
            machineName: machine.name,
            anomaly: null,
            optimization: null,
        })
        setPendingProjection(event.worldPosition)
    }, [])

    const handleCanvasClick = useCallback(() => {
        setOverlay(null)
    }, [])

    // Called by FactoryModel when the flash meshes are found — populate overlay
    // based on the current mode (anomaly or optimization)
    const handleAlertMeshFound = useCallback((info: AlertMeshInfo) => {
        cameraRef.current?.flyToPoint(info.worldPosition, info.meshName)

        const isOptim = alertModeRef.current === 'optimization'
        setTransitionLabel(isOptim ? `OPTIMIZATION: ${info.meshName}` : `ALERT: ${info.meshName}`)
        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = setTimeout(() => setTransitionLabel(null), 3000)

        const machine = getMachineInfo(info.meshName)
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)

        setTimeout(() => {
            if (alertModeRef.current === 'optimization') {
                setPendingOverlayData({
                    meshName: info.meshName,
                    machineName: machine.name,
                    optimization: { ...DEMO_OPTIMIZATION, timestamp: ts },
                    anomaly: null,
                })
            } else {
                setPendingOverlayData({
                    meshName: info.meshName,
                    machineName: machine.name,
                    anomaly: { ...DEMO_ANOMALY, timestamp: ts },
                    optimization: null,
                })
            }
            setPendingProjection(info.worldPosition)
        }, 700)
    }, [])

    // ── TRIGGER ANOMALY ───────────────────────────────────────────────────────
    const handleTriggerAlert = useCallback(() => {
        if (alertMode === 'anomaly') {
            setAlertMeshPattern(null)
            syncMode(null)
            setOverlay(null)
            return
        }
        syncMode('anomaly')
        setAlertMeshPattern(TRIGGER_MESH_PATTERN)
        onTriggerAnomaly?.()
    }, [alertMode, syncMode, onTriggerAnomaly])

    // ── TRIGGER OPTIMIZATION ─────────────────────────────────────────────────
    const handleTriggerOptimization = useCallback(() => {
        if (alertMode === 'optimization') {
            setAlertMeshPattern(null)
            syncMode(null)
            setOverlay(null)
            return
        }
        syncMode('optimization')
        setAlertMeshPattern(TRIGGER_MESH_PATTERN)
        onTriggerOptimization?.()
    }, [alertMode, syncMode, onTriggerOptimization])

    // Dismiss on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOverlay(null)
                setAlertMeshPattern(null)
                syncMode(null)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [syncMode])

    useEffect(() => {
        return () => {
            if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
        }
    }, [])

    // Convert overlay position from fixed viewport to relative-to-container
    const containerRect = containerRef.current?.getBoundingClientRect()
    const overlayLeft = overlay && containerRect ? overlay.screenX - containerRect.left : 0
    const overlayTop = overlay && containerRect ? overlay.screenY - containerRect.top : 0

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Loading Screen */}
            <LoadingScreen />

            {/* 3D Canvas */}
            <Canvas
                shadows
                dpr={[1, 2]}
                gl={{
                    antialias: true,
                    toneMapping: 3,
                    toneMappingExposure: 1.2,
                }}
                camera={{ fov: 50, near: 0.1, far: 500 }}
                className="!absolute inset-0"
            >
                <FactoryScene
                    modelUrl={modelUrl}
                    presets={presets}
                    activeId={activeId}
                    onActiveChange={handleActiveChange}
                    onCameraMove={handleCameraMove}
                    onMeshCount={handleMeshCount}
                    onMeshClick={handleMeshClick}
                    onCanvasClick={handleCanvasClick}
                    alertMeshPattern={alertMeshPattern}
                    alertMode={alertMode ?? 'anomaly'}
                    onAlertMeshFound={handleAlertMeshFound}
                    devMode={devMode}
                    environment={environment}
                    autoTour={autoTour}
                    autoTourInterval={autoTourInterval}
                    initialPreset={initialPreset}
                    showHotspots={showHotspots}
                    cameraRef={cameraRef}
                    isolatedMeshName={isolatedMeshName}
                />
                <ScreenProjector worldPos={pendingProjection} onProject={handleProjection} />
            </Canvas>

            {/* Transition Label */}
            {transitionLabel && (
                <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
                    <div className="animate-fade-in-out">
                        <h2 className={`${viewMode === 'details' ? 'text-sm' : 'text-4xl'} font-bold tracking-wide drop-shadow-lg ${alertMode === 'optimization' ? 'text-green-400/90' : alertMode === 'anomaly' ? 'text-red-400/90' : 'text-white/80'}`}>
                            {transitionLabel}
                        </h2>
                    </div>
                </div>
            )}

            {/* Overlay Backdrop */}
            {overlay && viewMode !== 'details' && (
                <div className="fixed inset-0 z-40" onClick={() => setOverlay(null)} />
            )}

            {/* Overlay (Bottom Center) */}
            {overlay && viewMode !== 'details' && (
                <div
                    className="fixed z-50 flex flex-col items-center animate-slide-up"
                    style={{ left: '50%', bottom: '32px', transform: 'translateX(-50%)' }}
                >
                    <MachineOverlay
                        title={overlay.machineName}
                        meshName={overlay.meshName}
                        anomaly={overlay.anomaly}
                        optimization={overlay.optimization}
                        onClose={() => setOverlay(null)}
                        onCreateWorkOrder={(name) => {
                            const mode: OverlayMode = overlay.anomaly ? 'anomaly' : overlay.optimization ? 'optimization' : null
                            onCreateWorkOrder?.(name, mode)
                            setOverlay(null)
                        }}
                        onExpand={(name, mode) => {
                            setOverlay(null)
                            onExpandClick?.(name, mode)
                        }}
                    />
                </div>
            )}

            {/* ── Canvas Overlays ── */}
            {viewMode !== 'details' && (
                <>
                    {/* Label (Top-Left) */}
                    <div className="absolute top-6 left-8 z-40 pointer-events-none">
                        <span className="text-[#222939] font-bold text-2xl tracking-tight drop-shadow-sm select-none">
                            Nexus Floor Control
                        </span>
                    </div>

                    {/* Map Toggle Buttons (Top-Right) */}
                    <div
                        className="absolute top-6 z-40 flex items-center gap-3 pointer-events-auto"
                        style={{ right: 'calc(clamp(320px, 25%, 400px) + 20px)' }}
                    >
                        <button title="Heat Map" className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10">
                            <Thermometer size={24} />
                        </button>
                        <button title="Energy Map" className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10">
                            <Zap size={24} />
                        </button>
                        <button title="Health Map" className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10">
                            <Activity size={24} />
                        </button>
                    </div>
                </>
            )}

            {/* ── Trigger Buttons (Top Center) ── */}
            {viewMode !== 'details' && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3">
                    {/* Anomaly Button */}
                    <button
                        onClick={handleTriggerAlert}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full border font-bold text-sm tracking-wide transition-all duration-300 shadow-xl ${
                            alertMode === 'anomaly'
                                ? 'bg-red-500/90 border-red-400 text-white animate-pulse shadow-red-500/40'
                                : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-300 hover:bg-red-500/80 hover:border-red-500 hover:text-white backdrop-blur-md'
                        }`}
                    >
                        <AlertTriangle size={16} />
                        {alertMode === 'anomaly' ? 'DISMISS ALERT' : 'TRIGGER ANOMALY'}
                    </button>

                    {/* Optimization Button */}
                    <button
                        onClick={handleTriggerOptimization}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full border font-bold text-sm tracking-wide transition-all duration-300 shadow-xl ${
                            alertMode === 'optimization'
                                ? 'bg-green-500/90 border-green-400 text-white animate-pulse shadow-green-500/40'
                                : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-300 hover:bg-green-500/80 hover:border-green-500 hover:text-white backdrop-blur-md'
                        }`}
                    >
                        <TrendingUp size={16} />
                        {alertMode === 'optimization' ? 'DISMISS OPTIMIZATION' : 'TRIGGER OPTIMIZATION'}
                    </button>
                </div>
            )}

            {/* Dev Mode Indicator */}
            {devMode && (
                <div className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <span className="text-xs font-mono text-yellow-400">
                        DEV MODE — Double-click to capture coordinates
                    </span>
                </div>
            )}

            {/* Keyframes */}
            <style jsx global>{`
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(10px); }
                    15% { opacity: 1; transform: translateY(0); }
                    70% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                }
                .animate-fade-in-out {
                    animation: fadeInOut 2.2s ease-out forwards;
                }
                @keyframes overlayIn {
                    from { opacity: 0; transform: translate(-50%, -100%) scale(0.9); }
                    to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
                }
                .animate-overlay-in {
                    animation: overlayIn 0.2s ease-out;
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
            `}</style>
        </div>
    )
}
