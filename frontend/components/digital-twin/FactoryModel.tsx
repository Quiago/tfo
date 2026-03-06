'use client'

import { useGLTF } from '@react-three/drei'
import { ThreeEvent, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export interface MeshClickEvent {
    meshName: string
    worldPosition: [number, number, number]
}

/** Info about an alerting mesh — returned so parent can fly to it */
export interface AlertMeshInfo {
    meshName: string
    worldPosition: [number, number, number]
}

interface FactoryModelProps {
    url: string
    onMeshCount?: (count: number) => void
    onMeshClick?: (event: MeshClickEvent) => void
    /** Mesh name pattern to flash red. null = no alert */
    alertMeshPattern?: string | null
    /** Called once when alert meshes are found, with position info for fly-to */
    onAlertMeshFound?: (info: AlertMeshInfo) => void
    /** Mesh name to isolate. If set, all other meshes are hidden. */
    isolatedMeshName?: string | null
}

const HIGHLIGHT_EMISSIVE = new THREE.Color(0x442200)
const ALERT_RED = new THREE.Color(0xff0000)
const ALERT_DARK = new THREE.Color(0x330000)

/**
 * Checks if a mesh name belongs to a KUKA robot arm.
 * Based on GLB analysis: 86 robot meshes out of 451 total share these name patterns.
 * Excludes KRC4 controller cabinets (they are NOT robot arms).
 */
function isKukaRobotMesh(name: string): boolean {
    // Explicit robot model identifiers
    if (name.includes('KR300') || name.includes('KR120') || name.includes('KR210')) return true
    // Robot base/box parts
    if (name.includes('K_U2D_Box__KR')) return true
    // Robot axis components (a2, a3 body segments)
    if (name.includes('_U2E_rf__ez__a2') || name.includes('_U2E_rf__ez__a3')) return true
    // Robot arm segments
    if (name.includes('_U2E_rf__Arm_U2E')) return true
    // Robot wrist/link parts
    if (name.includes('__Link__Arm__')) return true
    return false
}

/** Maps any KUKA robot mesh name to a friendly display name */
function getKukaRobotName(meshName: string): string {
    if (meshName.includes('KR300')) return 'KUKA KR300'
    if (meshName.includes('KR210')) return 'KUKA KR210'
    if (meshName.includes('KR120') || meshName.includes('K_U2D_Box__KR')) return 'KUKA KR120'
    // Shared arm/axis parts — classify by context clues or default
    return 'KUKA Robot Arm'
}

/** Exact mesh names (from GLB) for each alertable robot */
const ALERT_TARGETS: Record<string, string[]> = {
    'kuka-kr120-right': [
        // These are the actual names from the loaded GLB (no .008 suffix)
        'K_U2D_Box__KR120R2500pro_U2E_3ds__K_U2D_Box__KR180R2500extra_U2E_rf____15____',
        'K_U2D_Box__KR120R2500pro_U2E_3ds__K_U2D_Box__KR180R2500extra_U2E_rf____16____',
    ],
}

export function FactoryModel({
    url,
    onMeshCount,
    onMeshClick,
    alertMeshPattern,
    onAlertMeshFound,
    isolatedMeshName,
}: FactoryModelProps) {
    const { scene } = useGLTF(url)
    const meshCountRef = useRef(0)
    const [hoveredMesh, setHoveredMesh] = useState<THREE.Mesh | null>(null)
    const originalMaterialsRef = useRef<WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>>(
        new WeakMap()
    )

    // Alert flash state
    const alertMeshesRef = useRef<THREE.Mesh[]>([])
    const alertOriginalMatsRef = useRef<WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>>(
        new WeakMap()
    )
    const alertClonedMatsRef = useRef<WeakMap<THREE.Mesh, THREE.MeshStandardMaterial>>(
        new WeakMap()
    )
    const prevAlertPatternRef = useRef<string | null>(null)

    // Store original materials for isolation restore
    const isolationOriginalMatsRef = useRef<WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>>(
        new WeakMap()
    )

    // ISOLATION LOGIC — ghost-fade non-matching meshes instead of hiding
    useEffect(() => {
        scene.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return
            const mesh = child as THREE.Mesh

            if (isolatedMeshName) {
                const shouldShow = mesh.name.toLowerCase().includes(isolatedMeshName.toLowerCase()) ||
                    (mesh.parent && mesh.parent.name.toLowerCase().includes(isolatedMeshName.toLowerCase()))

                if (shouldShow) {
                    // Restore original material if we ghosted it before
                    const orig = isolationOriginalMatsRef.current.get(mesh)
                    if (orig) {
                        mesh.material = orig
                        isolationOriginalMatsRef.current.delete(mesh)
                    }
                    mesh.visible = true
                } else {
                    // Ghost: save original, apply transparent clone
                    if (!isolationOriginalMatsRef.current.has(mesh)) {
                        isolationOriginalMatsRef.current.set(mesh, mesh.material)
                    }
                    const sourceMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
                    if (sourceMat && 'clone' in sourceMat) {
                        const ghost = (sourceMat as THREE.MeshStandardMaterial).clone()
                        ghost.transparent = true
                        ghost.opacity = 0.04
                        ghost.depthWrite = false
                        mesh.material = ghost
                    }
                    mesh.visible = true
                }
            } else {
                // Restore all originals
                const orig = isolationOriginalMatsRef.current.get(mesh)
                if (orig) {
                    mesh.material = orig
                    isolationOriginalMatsRef.current.delete(mesh)
                }
                mesh.visible = true
            }
        })
    }, [isolatedMeshName, scene])


    useEffect(() => {
        let count = 0
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
                count++
            }
        })
        meshCountRef.current = count
        onMeshCount?.(count)
    }, [scene, onMeshCount])

    // Scan for alert meshes when pattern changes
    useEffect(() => {
        // Restore previous alert meshes
        if (prevAlertPatternRef.current !== null) {
            for (const mesh of alertMeshesRef.current) {
                const orig = alertOriginalMatsRef.current.get(mesh)
                if (orig) mesh.material = orig
            }
            alertMeshesRef.current = []
            alertOriginalMatsRef.current = new WeakMap()
            alertClonedMatsRef.current = new WeakMap()
        }

        prevAlertPatternRef.current = alertMeshPattern ?? null

        if (!alertMeshPattern) return

        // alertMeshPattern is a key into ALERT_TARGETS — a list of exact mesh names
        // that together form ONE robot arm (identified via Blender).
        const targetNames = ALERT_TARGETS[alertMeshPattern]
        if (!targetNames) return

        const nameSet = new Set(targetNames)
        const meshesToFlash: THREE.Mesh[] = []

        // DEBUG: Log all mesh names that contain robot-related keywords
        const robotMeshes: string[] = []
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const lowerName = child.name.toLowerCase()
                if (lowerName.includes('kr') || lowerName.includes('kuka') || lowerName.includes('robot') || lowerName.includes('u2d')) {
                    robotMeshes.push(child.name)
                }
                if (nameSet.has(child.name)) {
                    meshesToFlash.push(child as THREE.Mesh)
                }
            }
        })

        console.log('[Alert] Robot-related mesh names found:', robotMeshes)
        console.log('[Alert] Target names we are looking for:', targetNames)
        console.log('[Alert] Meshes matched:', meshesToFlash.length)

        if (meshesToFlash.length === 0) {
            console.log('[Alert] NO MESHES MATCHED! Check if names are correct.')
            return
        }

        // Clone materials for flashing
        for (const mesh of meshesToFlash) {
            alertOriginalMatsRef.current.set(mesh, mesh.material)
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
            const clone = (mat as THREE.MeshStandardMaterial).clone?.()
            if (clone) {
                clone.emissive = ALERT_RED.clone()
                clone.emissiveIntensity = 0
                alertClonedMatsRef.current.set(mesh, clone)
                mesh.material = clone
            }
        }

        alertMeshesRef.current = meshesToFlash

        // Get bounding box center of all affected meshes for fly-to
        const box = new THREE.Box3()
        for (const mesh of meshesToFlash) {
            box.expandByObject(mesh)
        }
        const center = box.getCenter(new THREE.Vector3())

        onAlertMeshFound?.({
            meshName: 'KUKA KR120',
            worldPosition: center.toArray() as [number, number, number],
        })
    }, [alertMeshPattern, scene, onAlertMeshFound])

    // Animate the flash — police siren strobe
    useFrame(({ clock }) => {
        if (alertMeshesRef.current.length === 0) return
        const t = clock.getElapsedTime()
        // Fast strobe: sin wave at ~3Hz, clamped to sharp on/off
        const pulse = Math.sin(t * 6 * Math.PI) > 0 ? 1 : 0
        const intensity = pulse * 2.5

        for (const mesh of alertMeshesRef.current) {
            const mat = alertClonedMatsRef.current.get(mesh)
            if (mat) {
                mat.emissive = pulse > 0.5 ? ALERT_RED : ALERT_DARK
                mat.emissiveIntensity = intensity
            }
        }
    })

    const handlePointerOver = useCallback(
        (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            const mesh = e.object as THREE.Mesh
            if (!mesh.isMesh) return

            // Only KUKA robot meshes are interactive
            if (!isKukaRobotMesh(mesh.name)) return

            // Don't override alert flash materials
            if (alertMeshesRef.current.includes(mesh)) return

            document.body.style.cursor = 'pointer'

            if (!originalMaterialsRef.current.has(mesh)) {
                originalMaterialsRef.current.set(mesh, mesh.material)
            }

            const original = mesh.material
            const mat = Array.isArray(original) ? original[0] : original
            if (mat && 'color' in mat) {
                const highlighted = (mat as THREE.MeshStandardMaterial).clone()
                highlighted.emissive = HIGHLIGHT_EMISSIVE
                highlighted.emissiveIntensity = 0.4
                mesh.material = highlighted
            }

            setHoveredMesh(mesh)
        },
        []
    )

    const handlePointerOut = useCallback(
        (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            const mesh = e.object as THREE.Mesh
            if (!mesh.isMesh) return

            // Only KUKA robot meshes are interactive
            if (!isKukaRobotMesh(mesh.name)) return

            if (alertMeshesRef.current.includes(mesh)) return

            document.body.style.cursor = 'auto'

            const original = originalMaterialsRef.current.get(mesh)
            if (original) {
                mesh.material = original
            }

            setHoveredMesh((prev) => (prev === mesh ? null : prev))
        },
        []
    )

    const handleClick = useCallback(
        (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            const mesh = e.object as THREE.Mesh
            if (!mesh.isMesh || !onMeshClick) return

            // Only KUKA robot meshes are clickable
            if (!isKukaRobotMesh(mesh.name)) return

            // Use the friendly KUKA robot name instead of raw mesh name
            const name = getKukaRobotName(mesh.name)

            onMeshClick({
                meshName: name,
                worldPosition: e.point.toArray() as [number, number, number],
            })
        },
        [onMeshClick]
    )

    return (
        <primitive
            object={scene}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
        />
    )
}
