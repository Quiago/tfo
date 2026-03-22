'use client'

/**
 * Syncs `platformMode` between the backend and the auth store.
 *
 * On mount (after auth hydration): fetches /auth/me and seeds the store
 * with the server-side platform_mode (source of truth for cross-machine sync).
 *
 * On every platformMode change: PATCHes /auth/me/preferences so the choice
 * persists server-side and survives across machines / incognito sessions.
 */
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store/auth-store'
import { getMe, updatePreferences } from '@/lib/services/auth.service'
import type { PlatformMode } from '@/lib/content/platform-content'

export function usePlatformMode() {
    const token = useAuthStore((s) => s.token)
    const { platformMode, setPlatformMode } = useAuthStore()

    // Track whether we've seeded the store from the backend this session.
    const seeded = useRef(false)
    // Track the last value we pushed to the backend to avoid redundant PATCHes.
    const lastSynced = useRef<PlatformMode | undefined>(undefined)

    // Seed from backend once on login / page load
    useEffect(() => {
        if (!token || seeded.current) return
        seeded.current = true

        getMe()
            .then((user) => {
                const serverValue = (user.platform_mode ?? 'factory') as PlatformMode
                setPlatformMode(serverValue)
                lastSynced.current = serverValue
            })
            .catch(() => {
                // Network error — leave the local store value as-is
            })
    }, [token, setPlatformMode])

    // Persist changes back to the server whenever the mode changes
    useEffect(() => {
        if (!token || !seeded.current) return
        if (platformMode === lastSynced.current) return

        lastSynced.current = platformMode
        updatePreferences({ platform_mode: platformMode }).catch(() => {
            // Fire-and-forget — store already has the value locally
        })
    }, [token, platformMode])
}
