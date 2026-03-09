import { useOpshubStore } from '@/lib/store/opshub-store'
import { MOCK_TEAM } from '@/lib/hooks/useOpshubMockData'
import { useCallback } from 'react'

const DEMO_USER_ORDER = [
    MOCK_TEAM[0], // Sarah Chen - Plant Manager
    MOCK_TEAM[1], // Omar Khalid - Reliability Engineer
    MOCK_TEAM[2], // Ahmed Nasser - Maintenance Lead
    null,         // AI Agent perspective (no user)
    MOCK_TEAM[0], // Sarah Chen again (review cycle)
    MOCK_TEAM[4], // Fahad Al-Rashid - Riyadh Plant Manager
]

export function useDemoMode() {
    const currentUser = useOpshubStore(s => s.currentUser)
    const demoUserIndex = useOpshubStore(s => s.demoUserIndex)
    const setCurrentUser = useOpshubStore(s => s.setCurrentUser)
    const setDemoUser = useOpshubStore(s => s.setDemoUser)

    const nextUser = useCallback(() => {
        const nextIndex = (demoUserIndex + 1) % DEMO_USER_ORDER.length
        setDemoUser(nextIndex)
        setCurrentUser(DEMO_USER_ORDER[nextIndex])
    }, [demoUserIndex, setDemoUser, setCurrentUser])

    const setUserByIndex = useCallback((index: number) => {
        const safeIndex = index % DEMO_USER_ORDER.length
        setDemoUser(safeIndex)
        setCurrentUser(DEMO_USER_ORDER[safeIndex])
    }, [setDemoUser, setCurrentUser])

    return {
        currentUser,
        demoUserIndex,
        nextUser,
        setUserByIndex,
        totalDemoUsers: DEMO_USER_ORDER.length,
        isAIPerspective: DEMO_USER_ORDER[demoUserIndex] === null,
    }
}
