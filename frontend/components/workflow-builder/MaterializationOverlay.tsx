'use client'

/**
 * MaterializationOverlay — Fullscreen workflow materialisation animation.
 *
 * Visual sequence:
 *   1. model_spinning       → Robot spins. Building tension.
 *   2. shooting_lines       → Single dashed "signal" bezier from robot center
 *                             to the first/trigger node (no crossings, clean).
 *   3. nodes_materializing  → Signal fades. Nodes spring into view.
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

// ── Layout: RF → screen ────────────────────────────────────────────────────────
//
// Maps ReactFlow node positions to screen-space card centers.
// Card centers are bounded to [safeLeft, safeRight] × [safeTop, safeBot]
// so no card ever clips outside the right panel — all values are dynamic.

function computeNodeScreenPositions(
    nodes: WorkflowNode[],
    W: number,
    H: number,
): Record<string, ScreenPos> {
    if (nodes.length === 0) return {}

    const CARD_W = 130
    const CARD_H = 54
    // Tight horizontal padding so the layout uses the full panel width
    const PAD_X  = 12
    const PAD_Y  = 52

    // Card centers must stay inside this safe area to avoid clipping
    const safeLeft  = W * 0.40 + CARD_W / 2 + PAD_X
    const safeRight = W        - CARD_W / 2 - PAD_X
    const safeTop   = CARD_H / 2 + PAD_Y
    const safeBot   = H - CARD_H / 2 - PAD_Y

    const xs = nodes.map(n => n.position.x)
    const ys = nodes.map(n => n.position.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rfW = maxX - minX || 1
    const rfH = maxY - minY || 1

    const availW = safeRight - safeLeft
    const availH = safeBot   - safeTop

    // Fill available width; cap Y scaling to avoid extreme vertical spread
    const scaleX = availW / rfW
    const scaleY = Math.min(availH / rfH, scaleX * 1.2)

    // Center layout vertically
    const layoutH = rfH * scaleY
    const startY  = safeTop + (availH - layoutH) / 2

    const result: Record<string, ScreenPos> = {}
    nodes.forEach(n => {
        result[n.id] = {
            x: safeLeft + (n.position.x - minX) * scaleX,
            y: startY   + (n.position.y - minY) * scaleY,
        }
    })
    return result
}

// ── R3F: Model + single center anchor projection ───────────────────────────────
//
// Computes ONE anchor point (center of the robot's bounding box along Y)
// and projects it to screen coordinates every frame.

interface ModelWithAnchorProps {
    phase: AnimationPhase
    onAnchorReady: (pos: ScreenPos) => void
}

function ModelWithAnchor({ phase, onAnchorReady }: ModelWithAnchorProps) {
    const { scene }        = useGLTF('/models/kuka.glb')
    const { camera, size } = useThree()
    const anchorRef        = useRef<THREE.Vector3 | null>(null)
    const prevRef          = useRef<ScreenPos>({ x: -9999, y: -9999 })

    // ── Phase-dependent material ───────────────────────────────────────────────
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

    // ── Compute anchor from real bounding box after Stage settles ──────────────
    useEffect(() => {
        const t = setTimeout(() => {
            const box    = new THREE.Box3().setFromObject(scene)
            const center = box.getCenter(new THREE.Vector3())
            // Use the right-side center of the robot (facing toward the workflow panel)
            anchorRef.current = new THREE.Vector3(
                box.max.x,            // rightmost X edge of the robot
                center.y + box.getSize(new THREE.Vector3()).y * 0.2, // slightly above center
                center.z,
            )
        }, 220)
        return () => clearTimeout(t)
    }, [scene])

    // ── Project to screen, throttled by 3px delta ──────────────────────────────
    useFrame(() => {
        if (!anchorRef.current) return
        const ndc = anchorRef.current.clone().project(camera)
        const x   = ((ndc.x + 1) / 2) * size.width
        const y   = ((-ndc.y + 1) / 2) * size.height
        if (Math.abs(x - prevRef.current.x) > 3 || Math.abs(y - prevRef.current.y) > 3) {
            prevRef.current = { x, y }
            onAnchorReady({ x, y })
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

// ── Signal line — single dashed animated bezier ────────────────────────────────
//
// Looks like a data/signal transmission beam.
// Layer 1: glowing solid track (drawn with pathLength).
// Layer 2: dashed overlay animated with strokeDashoffset (flowing dashes).
// Layer 3: arrowhead springs in at the target node.

function SignalLine({ from, to }: { from: ScreenPos; to: ScreenPos }) {
    const dx    = to.x - from.x
    const adx   = Math.abs(dx)
    const path  = `M ${from.x},${from.y} C ${from.x + adx * 0.45},${from.y} ${to.x - adx * 0.20},${to.y} ${to.x},${to.y}`
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI)

    return (
        <g>
            {/* Glow track — draws in */}
            <motion.path
                d={path}
                stroke="#4f46e5"
                strokeWidth="5"
                fill="none"
                filter="url(#arrow-glow)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.18 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            {/* Dashed signal — flowing dashes, no pathLength conflict */}
            <motion.path
                d={path}
                stroke="#a5b4fc"
                strokeWidth="1.8"
                strokeDasharray="10 7"
                fill="none"
                filter="url(#arrow-glow)"
                // Offset starts large (hides dashes beyond path start) → flows to -17 (one dash-gap cycle)
                initial={{ strokeDashoffset: 800, opacity: 0 }}
                animate={{ strokeDashoffset: -17, opacity: 0.85 }}
                transition={{
                    strokeDashoffset: { duration: 1.4, ease: 'linear', repeat: Infinity, repeatType: 'loop' },
                    opacity: { duration: 0.25 },
                }}
            />
            {/* Arrowhead at target — springs in after signal arrives */}
            <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.9, scale: 1 }}
                transition={{ delay: 0.75, type: 'spring', stiffness: 400, damping: 20 }}
                style={{ originX: `${to.x}px`, originY: `${to.y}px` }}
            >
                <polygon
                    points="-10,-4.5 0,0 -10,4.5"
                    fill="#818cf8"
                    transform={`translate(${to.x}, ${to.y}) rotate(${angle})`}
                    filter="url(#arrow-glow)"
                />
            </motion.g>
        </g>
    )
}

// ── Edge arrow — bezier inter-node connection ─────────────────────────────────

interface EdgeArrowProps {
    from:     ScreenPos
    to:       ScreenPos
    stroke:   string
    delay:    number
    duration: number
    finalOpacity?: number
}

function EdgeArrow({ from, to, stroke, delay, duration, finalOpacity = 0.55 }: EdgeArrowProps) {
    const dx    = to.x - from.x
    const adx   = Math.abs(dx)
    const path  = `M ${from.x},${from.y} C ${from.x + adx * 0.45},${from.y} ${to.x - adx * 0.20},${to.y} ${to.x},${to.y}`
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI)

    return (
        <g>
            <motion.path
                d={path}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                filter="url(#arrow-glow)"
                initial={{ pathLength: 0, opacity: 0.7 }}
                animate={{ pathLength: 1, opacity: finalOpacity }}
                transition={{
                    pathLength: { delay, duration, ease: 'easeOut' },
                    opacity:    { delay, duration: 0.08 },
                }}
            />
            <motion.g
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: finalOpacity + 0.1, scale: 1 }}
                transition={{ delay: delay + duration - 0.05, type: 'spring', stiffness: 500 }}
                style={{ originX: `${to.x}px`, originY: `${to.y}px` }}
            >
                <polygon
                    points="-8,-3.5 0,0 -8,3.5"
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

    // ── Pre-compute node positions (pure, window-dimension based) ────────────────
    const nodePositions = useMemo<Record<string, ScreenPos>>(
        () => typeof window !== 'undefined'
            ? computeNodeScreenPositions(workflow.nodes, window.innerWidth, window.innerHeight)
            : {},
        // stable for the duration of the overlay
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    )

    // ── Single anchor from the robot, updated each frame ────────────────────────
    const [anchor, setAnchor] = useState<ScreenPos | null>(null)
    const handleAnchorReady = useCallback((pos: ScreenPos) => setAnchor(pos), [])

    // ── First (trigger) node — signal target ─────────────────────────────────────
    const firstNode = useMemo(
        () => workflow.nodes.find(n => NODE_REGISTRY[n.type]?.category === 'trigger')
            ?? workflow.nodes[0],
        [workflow.nodes],
    )
    const signalTarget = firstNode ? nodePositions[firstNode.id] : null

    // Snapshot anchor when shooting_lines begins (stable, no drift during animation)
    const [signalFrom, setSignalFrom] = useState<ScreenPos | null>(null)
    const anchorRef = useRef<ScreenPos | null>(null)
    anchorRef.current = anchor

    useEffect(() => {
        if (phase !== 'shooting_lines') return
        const t = setTimeout(() => {
            if (anchorRef.current) setSignalFrom(anchorRef.current)
        }, 80)
        return () => clearTimeout(t)
    }, [phase])

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
                () => setSuccessSet(prev => new Set([...prev, node.id])),
                i * 220,
            ))
        })
        return () => timers.forEach(clearTimeout)
    }, [phase, workflow.nodes])

    // ── Phase flags ─────────────────────────────────────────────────────────────
    const showSignal     = phase === 'shooting_lines'
    const showNodes      = phase === 'nodes_materializing' || phase === 'sequential_success'
    const showEdgeArrows = phase === 'nodes_materializing' || phase === 'sequential_success'
    const isSuccess      = phase === 'sequential_success'
    const spinSpeed      = phase === 'model_spinning' ? 3.5 : 0.8
    const edgeColour     = isSuccess ? '#22c55e' : '#475569'

    const PANEL_LEFT_PX = typeof window !== 'undefined' ? window.innerWidth * 0.40 : 0

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(2,6,23,0.97)', display: 'flex', overflow: 'hidden' }}>

            {/* ── Left 40%: R3F canvas ── */}
            <div style={{ width: '40%', height: '100%', position: 'relative', flexShrink: 0 }}>
                {/* Slightly wider FOV + further camera → model appears smaller */}
                <Canvas shadows dpr={[1, 2]} camera={{ fov: 55, position: [0, 1.5, 11] }}>
                    <Suspense fallback={null}>
                        <Stage environment="city" intensity={0.6}>
                            <ModelWithAnchor
                                phase={phase}
                                onAnchorReady={handleAnchorReady}
                            />
                        </Stage>
                    </Suspense>
                    <OrbitControls autoRotate autoRotateSpeed={spinSpeed} makeDefault enableZoom={false} />
                </Canvas>

                {/* Pulse ring during signal emission */}
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
                {/* Dot grid */}
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.12,
                    backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }} />

                {workflow.nodes.map((node, i) => {
                    const pos = nodePositions[node.id]
                    if (!pos) return null
                    const localX = pos.x - PANEL_LEFT_PX

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
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}>
                <defs>
                    <filter id="arrow-glow" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Phase 1: Single dashed signal line robot → first node */}
                {showSignal && signalFrom && signalTarget && (
                    <SignalLine from={signalFrom} to={signalTarget} />
                )}

                {/* Phase 2: Inter-node edge arrows */}
                {showEdgeArrows && edgeArrows.map((edge, i) => (
                    <EdgeArrow
                        key={`edge-${edge.id}`}
                        from={edge.from}
                        to={edge.to}
                        stroke={edgeColour}
                        delay={EDGE_START_DELAY + i * EDGE_STAGGER}
                        duration={EDGE_DURATION}
                        finalOpacity={isSuccess ? 0.7 : 0.45}
                    />
                ))}
            </svg>
        </div>
    )
}
