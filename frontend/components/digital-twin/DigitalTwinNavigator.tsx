'use client'

import { Canvas, useThree } from '@react-three/fiber'
import { Activity, AlertTriangle, Thermometer, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { CameraSystemHandle } from './CameraSystem'
import type { AlertMeshInfo, MeshClickEvent } from './FactoryModel'
import { FactoryScene } from './FactoryScene'
import { LoadingScreen } from './LoadingScreen'
import type { AnomalyAlert } from './MachineInspector'
import { MachineOverlay } from './MachineOverlay'
import type { CameraPreset } from './camera-presets'
import { getMachineInfo } from './machine-data'

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
    onExpandClick?: (meshName: string, isAnomaly?: boolean) => void
    onCreateWorkOrder?: (meshName: string) => void
    onTriggerAnomaly?: () => void
}

interface OverlayState {
    meshName: string
    machineName: string
    screenX: number
    screenY: number
    anomaly?: AnomalyAlert | null
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
}: DigitalTwinNavigatorProps) {
    const [activeId, setActiveId] = useState<string | null>(initialPreset)
    const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([0, 0, 0])
    const [meshCount, setMeshCount] = useState(0)
    const [transitionLabel, setTransitionLabel] = useState<string | null>(null)
    const [alertMeshPattern, setAlertMeshPattern] = useState<string | null>(null)
    const [alertActive, setAlertActive] = useState(false)
    const [overlay, setOverlay] = useState<OverlayState | null>(null)
    const [pendingProjection, setPendingProjection] = useState<[number, number, number] | null>(null)
    const [pendingOverlayData, setPendingOverlayData] = useState<Omit<OverlayState, 'screenX' | 'screenY'> | null>(null)
    const cameraRef = useRef<CameraSystemHandle>(null)
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

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

    // Handle the 3D→2D projection result
    const handleProjection = useCallback((x: number, y: number) => {
        if (!pendingOverlayData) return
        // Clamp to container bounds
        const rect = containerRef.current?.getBoundingClientRect()
        const cx = rect ? Math.max(rect.left + 80, Math.min(x, rect.right - 80)) : x
        const cy = rect ? Math.max(rect.top + 40, Math.min(y, rect.bottom - 100)) : y
        setOverlay({ ...pendingOverlayData, screenX: cx, screenY: cy })
        setPendingProjection(null)
        setPendingOverlayData(null)
    }, [pendingOverlayData])

    // Mesh click → show overlay buttons at click screen position
    const handleMeshClick = useCallback((event: MeshClickEvent) => {
        const machine = getMachineInfo(event.meshName)

        // Use the mouse event screen coordinates via projection
        setPendingOverlayData({
            meshName: event.meshName,
            machineName: machine.name,
            anomaly: null,
        })
        setPendingProjection(event.worldPosition)
    }, [])

    // Canvas/ground click → dismiss overlay
    const handleCanvasClick = useCallback(() => {
        setOverlay(null)
    }, [])

    // Called by FactoryModel when alert meshes are found
    const handleAlertMeshFound = useCallback((info: AlertMeshInfo) => {
        cameraRef.current?.flyToPoint(info.worldPosition, info.meshName)

        setTransitionLabel(`ALERT: ${info.meshName}`)
        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = setTimeout(() => setTransitionLabel(null), 3000)

        const machine = getMachineInfo(info.meshName)
        const anomaly: AnomalyAlert = {
            type: 'Excessive Vibration Detected',
            severity: 'critical',
            message: 'Vibration amplitude exceeds safe operating threshold on joint axis 3. Immediate inspection recommended.',
            value: '13.5 mm/s RMS',
            threshold: '7.0 mm/s RMS',
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        }

        // Show overlay with alert after fly animation settles
        setTimeout(() => {
            setPendingOverlayData({
                meshName: info.meshName,
                machineName: machine.name,
                anomaly,
            })
            setPendingProjection(info.worldPosition)
        }, 700)
    }, [])

    // TRIGGER ALERT
    const handleTriggerAlert = useCallback(() => {
        if (alertActive) {
            setAlertMeshPattern(null)
            setAlertActive(false)
            setOverlay(null)
            return
        }
        setAlertActive(true)
        setAlertMeshPattern('kuka-kr120-right')
        onTriggerAnomaly?.()
    }, [alertActive, onTriggerAnomaly])

    // Dismiss on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOverlay(null)
                setAlertMeshPattern(null)
                setAlertActive(false)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    useEffect(() => {
        return () => {
            if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
        }
    }, [])

    const activePresetName = presets.find((p) => p.id === activeId)?.name ?? null

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
                {/* Project 3D world position → 2D screen coords */}
                <ScreenProjector worldPos={pendingProjection} onProject={handleProjection} />
            </Canvas>

            {/* Transition Label */}
            {transitionLabel && (
                <div className={`${viewMode === 'details' ? 'absolute' : 'absolute'} inset-0 z-40 pointer-events-none flex items-center justify-center`}>
                    <div className="animate-fade-in-out">
                        <h2 className={`${viewMode === 'details' ? 'text-sm' : 'text-4xl'} font-bold tracking-wide drop-shadow-lg ${alertActive ? 'text-red-400/90' : 'text-white/80'}`}>
                            {transitionLabel}
                        </h2>
                    </div>
                </div>
            )}

            {/* ── OVERLAY BUTTONS at click position ── */}
            {/* REMOVED: Old positioning logic */}

            {/* ── OVERLAY CLICK BACKDROP ── */}
            {overlay && viewMode !== 'details' && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setOverlay(null)}
                />
            )}

            {/* ── OVERLAY BUTTONS (Bottom Center) ── */}
            {overlay && viewMode !== 'details' && (
                <div
                    className="fixed z-50 flex flex-col items-center animate-slide-up"
                    style={{
                        left: '50%',
                        bottom: '32px',
                        transform: 'translateX(-50%)',
                    }}
                >
                    <MachineOverlay
                        title={overlay.machineName}
                        meshName={overlay.meshName}
                        anomaly={overlay.anomaly}
                        onClose={() => setOverlay(null)}
                        onCreateWorkOrder={(name) => {
                            onCreateWorkOrder?.(name)
                            setOverlay(null)
                        }}
                        onExpand={(name, isAnomaly) => {
                            setOverlay(null)
                            onExpandClick?.(name, isAnomaly)
                        }}
                    />
                </div>
            )}

            {/* ── OVERLAYS (Pencil Design) ── */}
            {viewMode !== 'details' && (
                <>
                    {/* Label (Top-Left, Transparent) */}
                    <div className="absolute top-6 left-8 z-40 pointer-events-none">
                        <span className="text-[#222939] font-bold text-2xl tracking-tight drop-shadow-sm select-none">Nexus Floor Control</span>
                    </div>

                    {/* Map Toggle Buttons (Top-Right, next to Right Panel) */}
                    <div
                        className="absolute top-6 z-40 flex items-center gap-3 pointer-events-auto"
                        style={{ right: 'calc(clamp(320px, 25%, 400px) + 20px)' }}
                    >
                        <button
                            title="Heat Map"
                            className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10"
                        >
                            <Thermometer size={24} />
                        </button>
                        <button
                            title="Energy Map"
                            className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10"
                        >
                            <Zap size={24} />
                        </button>
                        <button
                            title="Health Map"
                            className="w-[56px] h-[56px] flex items-center justify-center bg-[#252B38]/90 backdrop-blur-md rounded-[18px] text-white/90 hover:bg-[#343b4d] hover:text-white hover:scale-105 transition-all shadow-lg border border-white/10"
                        >
                            <Activity size={24} />
                        </button>
                    </div>
                </>
            )}

            {/* Trigger Alert Button (Moved to bottom) */}
            {viewMode !== 'details' && (
                <button
                    onClick={handleTriggerAlert}
                    className={`absolute top-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-6 py-3 rounded-full border font-bold text-sm tracking-wide transition-all duration-300 shadow-xl ${alertActive
                        ? 'bg-red-500/90 border-red-400 text-white animate-pulse shadow-red-500/40'
                        : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-300 hover:bg-red-500/80 hover:border-red-500 hover:text-white backdrop-blur-md'
                        }`}
                >
                    <AlertTriangle size={18} className={alertActive ? 'text-white' : ''} />
                    {alertActive ? 'DISMISS CRITICAL ALERT' : 'TRIGGER ANOMALY'}
                </button>
            )}

            {/* Info Bar — REMOVED */}
            {/* 
            {viewMode !== 'details' && (
                <InfoBar
                    activePresetName={activePresetName}
                    cameraPosition={cameraPosition}
                    meshCount={meshCount}
                />
            )}
            */}

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
