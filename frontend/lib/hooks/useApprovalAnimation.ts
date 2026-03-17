/**
 * useApprovalAnimation — State machine for the workflow materialisation overlay.
 *
 * Phases (in order):
 *   idle → model_spinning → shooting_lines → nodes_materializing → sequential_success
 *
 * The hook schedules all phase transitions imperatively so callers only need
 * to call `trigger()` once and react to `phase` changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type AnimationPhase =
    | 'idle'
    | 'model_spinning'
    | 'shooting_lines'
    | 'nodes_materializing'
    | 'sequential_success'

/** Duration (ms) each phase stays active before advancing to the next. */
const PHASE_DURATIONS: Record<AnimationPhase, number> = {
    idle:                 0,
    model_spinning:       700,
    shooting_lines:       1400,
    nodes_materializing:  900,
    sequential_success:   1800,
}

const PHASE_SEQUENCE: AnimationPhase[] = [
    'model_spinning',
    'shooting_lines',
    'nodes_materializing',
    'sequential_success',
]

export const PHASE_STATUS_TEXT: Record<AnimationPhase, string> = {
    idle:                 '',
    model_spinning:       'Synchronising with digital twin…',
    shooting_lines:       'Extracting telemetry parameters…',
    nodes_materializing:  'Compiling setpoint configuration…',
    sequential_success:   'Work order generated successfully',
}

export function useApprovalAnimation(onComplete?: () => void) {
    const [phase, setPhase] = useState<AnimationPhase>('idle')
    const timersRef    = useRef<ReturnType<typeof setTimeout>[]>([])
    const onCompleteRef = useRef(onComplete)

    // Keep callback ref up-to-date without re-creating trigger
    useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

    const trigger = useCallback(() => {
        // Clear any previous run
        timersRef.current.forEach(clearTimeout)
        timersRef.current = []

        setPhase('model_spinning')

        let elapsed = 0
        PHASE_SEQUENCE.forEach((p, i) => {
            elapsed += PHASE_DURATIONS[PHASE_SEQUENCE[i - 1] ?? 'idle']
            const t = setTimeout(() => setPhase(p), elapsed)
            timersRef.current.push(t)
        })

        // After the last phase finishes, call onComplete
        const totalMs = PHASE_SEQUENCE.reduce(
            (acc, p) => acc + PHASE_DURATIONS[p],
            0,
        )
        const done = setTimeout(() => onCompleteRef.current?.(), totalMs)
        timersRef.current.push(done)
    }, [])

    const reset = useCallback(() => {
        timersRef.current.forEach(clearTimeout)
        timersRef.current = []
        setPhase('idle')
    }, [])

    // Cleanup on unmount
    useEffect(() => () => { timersRef.current.forEach(clearTimeout) }, [])

    return { phase, trigger, reset }
}
