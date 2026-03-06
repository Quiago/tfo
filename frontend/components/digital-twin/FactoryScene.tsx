'use client'

import { Environment } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useRef } from 'react'
import { CameraSystem, type CameraSystemHandle } from './CameraSystem'
import { FactoryModel, type AlertMeshInfo, type MeshClickEvent } from './FactoryModel'
import { NavigationHotspots } from './NavigationHotspots'
import type { CameraPreset } from './camera-presets'

interface FactorySceneProps {
    modelUrl: string
    presets: CameraPreset[]
    activeId: string | null
    onActiveChange: (id: string | null) => void
    onCameraMove: (position: [number, number, number]) => void
    onMeshCount: (count: number) => void
    onMeshClick?: (event: MeshClickEvent) => void
    onCanvasClick?: (point: [number, number, number]) => void
    alertMeshPattern?: string | null
    onAlertMeshFound?: (info: AlertMeshInfo) => void
    devMode?: boolean
    environment?: string
    autoTour?: boolean
    autoTourInterval?: number
    initialPreset?: string
    showHotspots?: boolean
    cameraRef?: React.RefObject<CameraSystemHandle | null>
    isolatedMeshName?: string | null
}

export function FactoryScene({
    modelUrl,
    presets,
    activeId,
    onActiveChange,
    onCameraMove,
    onMeshCount,
    onMeshClick,
    onCanvasClick,
    alertMeshPattern,
    onAlertMeshFound,
    devMode = false,
    environment = 'warehouse',
    autoTour = false,
    autoTourInterval = 5000,
    initialPreset,
    showHotspots = true,
    cameraRef,
    isolatedMeshName,
}: FactorySceneProps) {
    const internalCameraRef = useRef<CameraSystemHandle>(null)
    const activeCameraRef = cameraRef ?? internalCameraRef

    const handleHotspotSelect = useCallback(
        (id: string) => {
            const preset = presets.find((p) => p.id === id)
            if (preset) {
                activeCameraRef.current?.flyToPreset(preset)
            }
        },
        [presets, activeCameraRef]
    )

    const handleGroundClick = useCallback(
        (e: ThreeEvent<MouseEvent>) => {
            if (!onCanvasClick) return
            onCanvasClick(e.point.toArray() as [number, number, number])
        },
        [onCanvasClick]
    )

    return (
        <>
            {/* Lighting */}
            <Environment
                preset="city"
                background={false}
                environmentIntensity={0.8}
            />
            <directionalLight
                position={[10, 20, 10]}
                intensity={0.5}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-far={100}
                shadow-camera-near={0.1}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
            />
            <ambientLight intensity={0.15} />

            {/* Invisible ground plane — catches clicks that miss the model */}
            <mesh
                rotation-x={-Math.PI / 2}
                position={[0, -0.01, 0]}
                onClick={handleGroundClick}
                visible={false}
            >
                <planeGeometry args={[500, 500]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {/* Camera */}
            <CameraSystem
                ref={activeCameraRef}
                presets={presets}
                activeId={activeId}
                onActiveChange={onActiveChange}
                onCameraMove={onCameraMove}
                devMode={devMode}
                autoTour={autoTour}
                autoTourInterval={autoTourInterval}
                initialPreset={initialPreset}
            />

            {/* Model */}
            <Suspense fallback={null}>
                <group position={[-3, 0, 3]}>
                    <FactoryModel
                        url={modelUrl}
                        onMeshCount={onMeshCount}
                        onMeshClick={onMeshClick}
                        alertMeshPattern={alertMeshPattern}
                        onAlertMeshFound={onAlertMeshFound}
                        isolatedMeshName={isolatedMeshName}
                    />
                </group>
            </Suspense>

            {/* Hotspots */}
            {showHotspots && (
                <NavigationHotspots
                    presets={presets}
                    activeId={activeId}
                    onSelect={handleHotspotSelect}
                />
            )}
        </>
    )
}
