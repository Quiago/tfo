'use client'

/**
 * Syncs `activeConnectorId` between the backend and the timeline store.
 *
 * On mount (after auth hydration): fetches /auth/me and seeds the store
 * with the server-side preferred_connector_id (only if the store is empty).
 *
 * On every connector change: PATCHes /auth/me/preferences so the choice
 * persists server-side and survives across machines / incognito sessions.
 */
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store/auth-store'
import { useTimelineStore } from '@/lib/store/timeline-store'
import { getMe, updatePreferences } from '@/lib/services/auth.service'

export function useConnectorPreference() {
    const token = useAuthStore((s) => s.token)
    const { activeConnectorId, setActiveConnectorId } = useTimelineStore()

    // Track whether we've seeded the store from the backend this session.
    const seeded = useRef(false)
    // Track the last value we pushed to the backend to avoid redundant PATCHes.
    const lastSynced = useRef<string | undefined | null>(undefined)

    // Seed from backend once on login / page load
    useEffect(() => {
        if (!token || seeded.current) return
        seeded.current = true

        getMe()
            .then((user) => {
                const serverValue = user.preferred_connector_id ?? undefined
                // Always honour the server value — it's the source of truth
                setActiveConnectorId(serverValue)
                lastSynced.current = serverValue
            })
            .catch(() => {
                // Network error — leave the local store value as-is
            })
    }, [token, setActiveConnectorId])

    // Persist changes back to the server whenever the connector changes
    useEffect(() => {
        if (!token || !seeded.current) return
        if (activeConnectorId === lastSynced.current) return

        lastSynced.current = activeConnectorId
        updatePreferences(activeConnectorId ?? null).catch(() => {
            // Fire-and-forget — store already has the value locally
        })
    }, [token, activeConnectorId])
}
