'use client'

import { OrbitControls, Stage, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import * as THREE from 'three'

export function MiniDigitalTwin({ modelUrl = '/models/kuka.glb' }: { modelUrl?: string }) {
    return (
        <div className="h-full w-full bg-zinc-900/50">
            <Canvas shadows dpr={[1, 2]} camera={{ fov: 50 }}>
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.6}>
                        <Model url={modelUrl} />
                    </Stage>
                </Suspense>
                <OrbitControls autoRotate autoRotateSpeed={0.5} makeDefault />
            </Canvas>
        </div>
    )
}

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url)

    // Apply corporate styling to the raw GLB
    // KUKA Orange: #FF5E00
    // KUKA Black/Base: #1A1A1A
    useEffect(() => {
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh
                const name = mesh.name.toLowerCase()

                // Clone material to avoid shared state issues if we were reusing
                // But for mini-twin, we want to enforce specific styles

                // Identify parts based on naming conventions (common in Kuka glbs)
                // If it's the base or cables, make it dark
                if (name.includes('base') || name.includes('cable') || name.includes('mount') || name.includes('black')) {
                    mesh.material = new THREE.MeshStandardMaterial({
                        color: '#1a1a1a',
                        roughness: 0.7,
                        metalness: 0.5,
                    })
                }
                // Main arm segments - KUKA Orange
                else {
                    mesh.material = new THREE.MeshStandardMaterial({
                        color: '#ff5e00', // KUKA Safety Orange
                        roughness: 0.5,
                        metalness: 0.1,
                    })
                }

                mesh.castShadow = true
                mesh.receiveShadow = true
            }
        })
    }, [scene])

    return <primitive object={scene} />
}
