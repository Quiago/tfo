'use client'

/**
 * MaterializationOverlay — Fullscreen workflow materialisation animation.
 *
 * Visual sequence:
 *   1. model_spinning       → Robot spins. Building tension.
 *   2. shooting_lines       → Arrows animate from real robot-part positions
 *                             (projected from the 3D bounding box) to each
 *                             node's pre-computed screen position.
 *   3. nodes_materializing  → Robot arrows fade out. Nodes spring in.
 *                             Edge arrows draw along workflow connections.
 *   4. sequential_success   → Green cascade through nodes + robot.
 *
 * Coordinate contract:
 *   The overlay is `position:fixed inset:0` — screen coords = SVG coords.
 *   Canvas occupies LEFT 40% starting at screen (0, 0).
 *   Projected points from useThree's `size` are canvas-local → already screen coords.
 *   Node positions are computed from window dimensions (pure, no DOM queries).
 */

import { Stage, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'

import { PHASE_STATUS_TEXT, useApprovalAnimation } from '@/lib/hooks/useApprovalAnimation'
import type { AnimationPhase } from '@/lib/hooks/useApprovalAnimation'
import type { Workflow as RfWorkflow, WorkflowNode } from '@/lib/types/workflow'
import { NODE_REGISTRY } from '@/lib/types/workflow'
import { NodeIcon } from './NodeIcon'

// ── Animation timing ───────────────────────────────────────────────────────────

const LINE_DURATION    = 0.55   // s — each robot→node arrow draw time
const LINE_STAGGER     = 0.14   // s — stagger between robot arrows
const NODE_STAGGER     = 0.09   // s — stagger between node spring animations
const EDGE_START_DELAY = 0.55   // s — wait after first node before edges draw
const EDGE_DURATION    = 0.32   // s — each inter-node edge arrow draw time
const EDGE_STAGGER     = 0.11   // s — stagger between edge arrows

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScreenPos { x: number; y: number }

// ── Node colour palette ────────────────────────────────────────────────────────

const NODE_COLOUR: Record<string, { bg: string }> = {
    rose:    { bg: '#ef4444' },
    amber:   { bg: '#f59e0b' },
    emerald: { bg: '#10b981' },
    violet:  { bg: '#7c3aed' },
    sky:     { bg: '#0ea5e9' },
    slate:   { bg: '#64748b' },
}

// ── Layout: RF → screen (pure, uses window dimensions) ────────────────────────

function computeNodeScreenPositions(
    nodes: WorkflowNode[],
    W: number,
    H: number,
): Record<string, ScreenPos> {
    if (nodes.length === 0) return {}

    const CANVAS_W    = W * 0.40
    const PANEL_LEFT  = CANVAS_W + 20
    const PANEL_RIGHT = W - 50
    const NODE_HALF_W = 65           // half of 130px card
    const CENTER_Y    = H * 0.48

    const xs   = nodes.map((n) => n.position.x)
    const ys   = nodes.map((n) => n.position.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rfW  = maxX - minX || 1
    const rfH  = maxY - minY || 1

    const availW = PANEL_RIGHT - PANEL_LEFT - NODE_HALF_W * 2
    const scaleX = Math.max(availW / rfW, 0.1)
    // Amplify small Y differences so branching is visible
    const rawScaleY = (H * 0.65) / rfH
    const scaleY    = Math.min(rawScaleY, 4)
    const midRfY    = (minY + maxY) / 2

    const result: Record<string, ScreenPos> = {}
    nodes.forEach((n) => {
        result[n.id] = {
            x: PANEL_LEFT + NODE_HALF_W + (n.position.x - minX) * scaleX,
            y: CENTER_Y + (n.position.y - midRfY) * scaleY,
        }
    })
    return result
}

// ── R3F: Model + real anchor projection ───────────────────────────────────────
//
// Distributes N anchor points along the robot's actual world-space bounding
// box (Y axis = base to top), then projects them to screen coords every frame.
// This guarantees lines start FROM visible parts of the 3D model.

interface AnchorProbeProps {
    n: number                                  // number of anchor points
    phase: AnimationPhase
    onAnchorsReady: (positions: ScreenPos[]) => void
}

function ModelWithAnchors({ n, phase, onAnchorsReady }: AnchorProbeProps) {
    const { scene }          = useGLTF('/models/kuka.glb')
    const { camera, size }   = useThree()
    const anchorsRef         = useRef<THREE.Vector3[]>([])
    const prevScreenRef      = useRef<ScreenPos[]>([])

    // ── Apply material colours based on phase ──────────────────────────────────
    useEffect(() => {
        const success = phase === 'sequential_success'
        scene.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return
            const mesh   = child as THREE.Mesh
            const isBase = /base|cable|mount|black/.test(mesh.name.toLowerCase())
            mesh.material = new THREE.MeshStandardMaterial({
                color:             success ? (isBase ? '#0d2818' : '#16a34a') : (isBase ? '#1a1a1a' : '#ff5e00'),
                roughness:         0.5,
                metalness:         0.2,
                emissive:          success ? new THREE.Color('#16a34a') : new THREE.Color(0),
                emissiveIntensity: success ? 0.35 : 0,
            })
        })
    }, [scene, phase])

    // ── Compute anchor points from bounding box (after Stage settles ~200ms) ──
    useEffect(() => {
        const t = setTimeout(() => {
            const box    = new THREE.Box3().setFromObject(scene)
            const center = box.getCenter(new THREE.Vector3())
            const sizeVec = box.getSize(new THREE.Vector3())

            // Distribute N points from base to tip along Y; slight X/Z variation
            // so lines come from visually distinct parts of the robot arm.
            anchorsRef.current = Array.from({ length: n }, (_, i) => {
                const t  = i / Math.max(n - 1, 1)
                const xOff = (i % 2 === 0 ? 0.15 : -0.15) * sizeVec.x
                return new THREE.Vector3(
                    center.x + xOff,
                    box.min.y + t * sizeVec.y,
                    center.z,
                )
            }).reverse() // top → bottom order so first line = end-effector
        }, 220) // wait for Stage to apply centering transform

        return () => clearTimeout(t)
    }, [scene, n])

    // ── Project anchors to screen every frame, throttled by 4px delta ─────────
    useFrame(() => {
        if (anchorsRef.current.length === 0) return

        const next: ScreenPos[] = anchorsRef.current.map((anchor) => {
            const ndc = anchor.clone().project(camera)
            return {
                x: ((ndc.x + 1) / 2) * size.width,
                y: ((-ndc.y + 1) / 2) * size.height,
            }
        })

        // Only update if any point moved >4px (avoid flooding state updates)
        const changed = next.some((p, i) => {
            const prev = prevScreenRef.current[i]
            return !prev || Math.abs(p.x - prev.x) > 4 || Math.abs(p.y - prev.y) > 4
        })

        if (changed) {
            prevScreenRef.current = next
            onAnchorsReady(next)
        }
    })

    return <primitive object={scene} />
}

// ── Compact node card ──────────────────────────────────────────────────────────

function OverlayNodeCard({ node, isSuccess }: { node: WorkflowNode; isSuccess: boolean }) {
    const meta   = NODE_REGISTRY[node.type]
    const colour = (meta && NODE_COLOUR[meta.color]) ?? { bg: '#64748b' }

    return (
        <div style={{
            width: 130, borderRadius: 14,
            padding: '8px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
            background:  isSuccess ? '#022c22' : '#0f172a',
            border:      `1.5px solid ${isSuccess ? '#22c55e' : '#1e293b'}`,
            boxShadow:   isSuccess ? '0 0 22px #22c55e55' : '0 4px 20px rgba(0,0,0,0.55)',
            transition:  'all 0.4s ease',
        }}>
            <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: isSuccess ? '#16a34a' : colour.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.4s ease',
            }}>
                <NodeIcon name={meta?.icon ?? 'Circle'} size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isSuccess ? '#4ade80' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {node.label}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isSuccess ? '#86efac' : '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {meta?.label ?? node.type}
                </div>
            </div>
        </div>
    )
}

// ── Reusable animated arrow (line + arrowhead that follows the drawn tip) ──────

interface AnimatedArrowProps {
    from: ScreenPos
    to:   ScreenPos
    stroke: string
    markerId: string
    delay: number
    duration: number
    initialOpacity?: number
    finalOpacity?: number
}

function AnimatedArrow({
    from, to, stroke, markerId,
    delay, duration,
    initialOpacity = 0.9, finalOpacity = 0.65,
}: AnimatedArrowProps) {
    // Angle for the arrowhead polygon (pointing from→to)
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI)

    return (
        <g>
            {/* Line — pathLength draws from robot toward node */}
            <motion.path
                d={`M ${from.x},${from.y} L ${to.x},${to.y}`}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                filter="url(#arrow-glow)"
                initial={{ pathLength: 0, opacity: initialOpacity }}
                animate={{ pathLength: 1, opacity: finalOpacity }}
                transition={{
                    pathLength: { delay, duration, ease: 'easeOut' },
                    opacity:    { delay, duration: 0.08 },
                }}
            />
            {/* Arrowhead — springs in just as the line reaches the target */}
            <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: finalOpacity + 0.1, scale: 1 }}
                transition={{ delay: delay + duration - 0.06, duration: 0.2, type: 'spring', stiffness: 500 }}
                style={{ originX: `${to.x}px`, originY: `${to.y}px` }}
            >
                <polygon
                    id={markerId}
                    points="-10,-4.5 0,0 -10,4.5"
                    fill={stroke}
                    transform={`translate(${to.x}, ${to.y}) rotate(${angle})`}
                    filter="url(#arrow-glow)"
                />
            </motion.g>
        </g>
    )
}

// ── Main overlay ───────────────────────────────────────────────────────────────

export function MaterializationOverlay({
    workflow,
    onComplete,
}: {
    workflow: RfWorkflow
    onComplete: () => void
}) {
    const { phase, trigger, reset } = useApprovalAnimation(onComplete)

    useEffect(() => {
        trigger()
        return reset
    }, [trigger, reset])

    // ── Pre-compute node positions at mount (pure, no DOM measurement) ──────────
    const nodePositions = useMemo<Record<string, ScreenPos>>(
        () => typeof window !== 'undefined'
            ? computeNodeScreenPositions(workflow.nodes, window.innerWidth, window.innerHeight)
            : {},
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],   // stable for the duration of the overlay
    )

    // ── Anchor positions updated by the R3F canvas ──────────────────────────────
    const [anchors, setAnchors] = useState<ScreenPos[]>([])
    const handleAnchorsReady = useCallback((pos: ScreenPos[]) => setAnchors(pos), [])

    // ── Robot → node arrows (computed once when shooting_lines starts) ──────────
    const [robotArrows, setRobotArrows] = useState<Array<{ nodeId: string; from: ScreenPos; to: ScreenPos }>>([])
    const anchorsRef = useRef<ScreenPos[]>([])
    anchorsRef.current = anchors

    useEffect(() => {
        if (phase !== 'shooting_lines') return
        // Small delay so anchors have had at least one frame to project
        const t = setTimeout(() => {
            const snapshotAnchors = anchorsRef.current
            if (snapshotAnchors.length === 0) return
            setRobotArrows(
                workflow.nodes.map((n, i) => ({
                    nodeId: n.id,
                    from:   snapshotAnchors[i % snapshotAnchors.length],
                    to:     nodePositions[n.id] ?? { x: 0, y: 0 },
                })),
            )
        }, 80)
        return () => clearTimeout(t)
    }, [phase, workflow.nodes, nodePositions])

    // ── Inter-node edge arrows ──────────────────────────────────────────────────
    const edgeArrows = useMemo(
        () => workflow.edges.map((e) => ({
            id:   e.id,
            from: nodePositions[e.source] ?? { x: 0, y: 0 },
            to:   nodePositions[e.target] ?? { x: 0, y: 0 },
        })),
        [workflow.edges, nodePositions],
    )

    // ── Green cascade ───────────────────────────────────────────────────────────
    const [successSet, setSuccessSet] = useState<Set<string>>(new Set())
    useEffect(() => {
        if (phase !== 'sequential_success') return
        const timers: ReturnType<typeof setTimeout>[] = []
        workflow.nodes.forEach((node, i) => {
            timers.push(setTimeout(
                () => setSuccessSet((prev) => new Set([...prev, node.id])),
                i * 220,
            ))
        })
        return () => timers.forEach(clearTimeout)
    }, [phase, workflow.nodes])

    // ── Phase flags ─────────────────────────────────────────────────────────────
    const showRobotArrows = phase === 'shooting_lines'
    const showNodes       = phase === 'nodes_materializing' || phase === 'sequential_success'
    const showEdgeArrows  = phase === 'nodes_materializing' || phase === 'sequential_success'
    const isSuccess       = phase === 'sequential_success'
    const spinSpeed       = phase === 'model_spinning' ? 3.5 : 0.8
    const robotColour     = isSuccess ? '#22c55e' : '#6366f1'
    const edgeColour      = isSuccess ? '#22c55e' : '#475569'

    const W = typeof window !== 'undefined' ? window.innerWidth : 1400

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(2,6,23,0.97)', display: 'flex', overflow: 'hidden' }}>

            {/* ── Left 40%: R3F canvas ── */}
            <div style={{ width: '40%', height: '100%', position: 'relative', flexShrink: 0 }}>
                <Canvas shadows dpr={[1, 2]} camera={{ fov: 50, position: [0, 2, 8] }}>
                    <Suspense fallback={null}>
                        <Stage environment="city" intensity={0.6}>
                            <ModelWithAnchors
                                n={workflow.nodes.length}
                                phase={phase}
                                onAnchorsReady={handleAnchorsReady}
                            />
                        </Stage>
                    </Suspense>
                    <OrbitControls autoRotate autoRotateSpeed={spinSpeed} makeDefault enableZoom={false} />
                </Canvas>

                {/* Pulse ring during line emission */}
                {phase === 'shooting_lines' && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <motion.div
                            style={{ position: 'absolute', borderRadius: '50%', border: '1px solid rgba(99,102,241,0.35)' }}
                            initial={{ width: 60, height: 60, opacity: 0.9 }}
                            animate={{ width: 380, height: 380, opacity: 0 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                        />
                    </div>
                )}

                {/* Status text */}
                <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={phase}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.25 }}
                            style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.025em', color: isSuccess ? '#4ade80' : '#818cf8', margin: 0 }}
                        >
                            {PHASE_STATUS_TEXT[phase]}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Right 60%: Node cards ── */}
            <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.12,
                    backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }} />

                {workflow.nodes.map((node, i) => {
                    const pos = nodePositions[node.id]
                    if (!pos) return null
                    // Convert screen x → panel-local x (panel starts at W*0.40)
                    const localX = pos.x - W * 0.40

                    return (
                        <motion.div
                            key={node.id}
                            style={{ position: 'absolute', left: localX, top: pos.y, transform: 'translate(-50%, -50%)' }}
                            initial={{ opacity: 0, scale: 0, filter: 'blur(6px)' }}
                            animate={showNodes
                                ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                                : { opacity: 0, scale: 0, filter: 'blur(6px)' }
                            }
                            transition={{ delay: showNodes ? i * NODE_STAGGER : 0, type: 'spring', stiffness: 360, damping: 24 }}
                        >
                            <OverlayNodeCard node={node} isSuccess={successSet.has(node.id)} />
                        </motion.div>
                    )
                })}
            </div>

            {/* ── SVG: full-screen arrow layer ── */}
            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}
            >
                <defs>
                    <filter id="arrow-glow" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Phase 1: Robot → node arrows */}
                {showRobotArrows && robotArrows.map((arrow, i) => (
                    <AnimatedArrow
                        key={`robot-${arrow.nodeId}`}
                        from={arrow.from}
                        to={arrow.to}
                        stroke={robotColour}
                        markerId={`arrow-r-${i}`}
                        delay={i * LINE_STAGGER}
                        duration={LINE_DURATION}
                    />
                ))}

                {/* Phase 2: Inter-node edge arrows */}
                {showEdgeArrows && edgeArrows.map((edge, i) => (
                    <AnimatedArrow
                        key={`edge-${edge.id}`}
                        from={edge.from}
                        to={edge.to}
                        stroke={edgeColour}
                        markerId={`arrow-e-${i}`}
                        delay={EDGE_START_DELAY + i * EDGE_STAGGER}
                        duration={EDGE_DURATION}
                        initialOpacity={0.7}
                        finalOpacity={isSuccess ? 0.7 : 0.45}
                    />
                ))}
            </svg>
        </div>
    )
}
