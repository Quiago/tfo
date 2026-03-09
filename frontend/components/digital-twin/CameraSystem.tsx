'use client'

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import type CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
import type { CameraPreset } from './camera-presets'

export interface CameraSystemHandle {
  /** Fly to a predefined preset (buttons/hotspots) */
  flyToPreset: (preset: CameraPreset) => void
  /** Fly to any arbitrary world point (mesh click / canvas click) */
  flyToPoint: (target: [number, number, number], label?: string) => void
  getCurrentPosition: () => [number, number, number]
  getCurrentTarget: () => [number, number, number]
}

interface CameraSystemProps {
  presets: CameraPreset[]
  activeId: string | null
  onActiveChange: (id: string | null) => void
  onCameraMove: (position: [number, number, number]) => void
  devMode?: boolean
  autoTour?: boolean
  autoTourInterval?: number
  initialPreset?: string
}

export const CameraSystem = forwardRef<CameraSystemHandle, CameraSystemProps>(
  function CameraSystem(
    {
      presets,
      activeId,
      onActiveChange,
      onCameraMove,
      devMode = false,
      autoTour = false,
      autoTourInterval = 5000,
      initialPreset,
    },
    ref
  ) {
    const controlsRef = useRef<CameraControlsImpl>(null)
    const { camera } = useThree()
    const autoTourRef = useRef(autoTour)
    const autoTourTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const currentIndexRef = useRef(0)
    const initializedRef = useRef(false)

    autoTourRef.current = autoTour

    const flyToPreset = useCallback(
      (preset: CameraPreset) => {
        const controls = controlsRef.current
        if (!controls) return
        controls.smoothTime = 0.5
        controls.setLookAt(
          preset.position[0],
          preset.position[1],
          preset.position[2],
          preset.target[0],
          preset.target[1],
          preset.target[2],
          true
        )
        onActiveChange(preset.id)
        const idx = presets.findIndex((p) => p.id === preset.id)
        if (idx >= 0) currentIndexRef.current = idx
      },
      [presets, onActiveChange]
    )

    const flyToPoint = useCallback(
      (target: [number, number, number], label?: string) => {
        const controls = controlsRef.current
        if (!controls) return

        // Compute camera position: keep current viewing angle but reposition
        // at a comfortable distance from the target point
        const camPos = camera.position.clone()
        const targetVec = new THREE.Vector3(...target)
        const direction = camPos.clone().sub(targetVec).normalize()

        // If camera is too far or direction is degenerate, use a default offset
        const currentDist = camPos.distanceTo(targetVec)
        const flyDist = Math.min(Math.max(currentDist * 0.3, 5), 15)

        // Ensure we're looking slightly from above (min Y offset)
        if (direction.y < 0.15) direction.y = 0.3
        direction.normalize()

        const newCamPos = targetVec.clone().add(direction.multiplyScalar(flyDist))
        // Ensure camera doesn't go below target
        newCamPos.y = Math.max(newCamPos.y, target[1] + 2)

        controls.smoothTime = 0.5
        controls.setLookAt(
          newCamPos.x, newCamPos.y, newCamPos.z,
          target[0], target[1], target[2],
          true
        )
        onActiveChange(null)
      },
      [camera, onActiveChange]
    )

    const getCurrentPosition = useCallback((): [number, number, number] => {
      return camera.position.toArray() as [number, number, number]
    }, [camera])

    const getCurrentTarget = useCallback((): [number, number, number] => {
      const target = new THREE.Vector3()
      controlsRef.current?.getTarget(target)
      return target.toArray() as [number, number, number]
    }, [])

    useImperativeHandle(ref, () => ({
      flyToPreset,
      flyToPoint,
      getCurrentPosition,
      getCurrentTarget,
    }))

    // Set initial position
    useEffect(() => {
      if (initializedRef.current) return
      const controls = controlsRef.current
      if (!controls) return
      initializedRef.current = true

      const preset = presets.find((p) => p.id === initialPreset) ?? presets[0]
      if (preset) {
        controls.setLookAt(
          preset.position[0],
          preset.position[1],
          preset.position[2],
          preset.target[0],
          preset.target[1],
          preset.target[2],
          false
        )
        onActiveChange(preset.id)
      }
    }, [presets, initialPreset, onActiveChange])

    // Report camera position each frame
    useFrame(() => {
      const pos = camera.position.toArray().map((v) => +v.toFixed(2)) as [number, number, number]
      onCameraMove(pos)
    })

    // Keyboard controls
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

        const key = e.key

        // Number keys 1-9 jump to preset by index
        if (key >= '1' && key <= '9') {
          const idx = parseInt(key) - 1
          if (idx < presets.length) {
            flyToPreset(presets[idx])
          }
          return
        }

        switch (key) {
          case 'ArrowRight': {
            const next = (currentIndexRef.current + 1) % presets.length
            flyToPreset(presets[next])
            break
          }
          case 'ArrowLeft': {
            const prev = (currentIndexRef.current - 1 + presets.length) % presets.length
            flyToPreset(presets[prev])
            break
          }
          case ' ':
            e.preventDefault()
            autoTourRef.current = !autoTourRef.current
            break
          case 'r':
          case 'R':
            flyToPreset(presets[0])
            break
        }
      }

      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [presets, flyToPreset])

    // Auto-tour
    useEffect(() => {
      if (autoTourTimerRef.current) {
        clearInterval(autoTourTimerRef.current)
        autoTourTimerRef.current = null
      }

      if (autoTour) {
        autoTourTimerRef.current = setInterval(() => {
          if (!autoTourRef.current) return
          const next = (currentIndexRef.current + 1) % presets.length
          flyToPreset(presets[next])
        }, autoTourInterval)
      }

      return () => {
        if (autoTourTimerRef.current) clearInterval(autoTourTimerRef.current)
      }
    }, [autoTour, autoTourInterval, presets, flyToPreset])

    // Dev mode: double-click to capture coordinates
    useEffect(() => {
      if (!devMode) return
      const handler = () => {
        const pos = camera.position.toArray().map((v) => +v.toFixed(2))
        const target = new THREE.Vector3()
        controlsRef.current?.getTarget(target)
        const tgt = target.toArray().map((v) => +v.toFixed(2))
        console.log(`// 📍 Camera Preset Captured:`)
        console.log(`{`)
        console.log(`  id: 'new-preset',`)
        console.log(`  name: 'New Zone',`)
        console.log(`  description: '',`)
        console.log(`  icon: '📍',`)
        console.log(`  position: [${pos}],`)
        console.log(`  target: [${tgt}],`)
        console.log(`},`)
      }
      window.addEventListener('dblclick', handler)
      return () => window.removeEventListener('dblclick', handler)
    }, [devMode, camera])

    return (
      <CameraControls
        ref={controlsRef}
        makeDefault
        smoothTime={0.8}
        draggingSmoothTime={0.2}
        minDistance={1}
        maxDistance={200}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI * 0.48}
      />
    )
  }
)
