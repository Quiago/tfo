'use client'

/**
 * ProjectionProbe — R3F inner component (must be rendered inside a <Canvas>).
 *
 * Projects a world-space point onto the canvas's 2D pixel plane every frame
 * using `Vector3.project(camera)` and calls `onProject` with the canvas-local
 * (x, y) coordinates. Parent is responsible for adding the canvas rect offset
 * to convert to screen/SVG coordinates.
 *
 * Updates are throttled: `onProject` only fires when the projected position
 * changes by more than 3px to prevent unnecessary re-renders upstream.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

interface ProjectionProbeProps {
    /** World-space anchor point (defaults to robot's approximate top center). */
    worldPosition?: [number, number, number]
    onProject: (canvasX: number, canvasY: number) => void
}

const DEFAULT_WORLD_POS: [number, number, number] = [0, 2.5, 0]

export function ProjectionProbe({
    worldPosition = DEFAULT_WORLD_POS,
    onProject,
}: ProjectionProbeProps) {
    const { camera, size } = useThree()

    // Stable vector — mutated in place each frame (no allocations in hot path)
    const worldVec = useRef(new THREE.Vector3(...worldPosition))
    const lastX    = useRef(-9999)
    const lastY    = useRef(-9999)

    useFrame(() => {
        // project() mutates the vector → clone first to preserve the original
        const ndc = worldVec.current.clone().project(camera)

        // NDC (-1..1) → canvas pixels
        const x = Math.round(((ndc.x + 1) / 2) * size.width)
        const y = Math.round(((-ndc.y + 1) / 2) * size.height)

        if (Math.abs(x - lastX.current) > 3 || Math.abs(y - lastY.current) > 3) {
            lastX.current = x
            lastY.current = y
            onProject(x, y)
        }
    })

    return null // purely computational — no mesh
}
