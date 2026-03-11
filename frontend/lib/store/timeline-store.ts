'use client';

/**
 * Persisted timeline preferences.
 *
 * Stored in localStorage under "tfo-timeline" so the user's connector
 * selection and granularity survive page reloads and tab switches.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeGranularity } from '@/lib/types/timeline';

interface TimelineStoreState {
    /** The connector the user last connected to (e.g. "ua-1"). */
    activeConnectorId: string | undefined;
    /** Last selected time granularity. */
    granularity: TimeGranularity;
    setActiveConnectorId: (id: string | undefined) => void;
    setGranularity: (g: TimeGranularity) => void;
}

export const useTimelineStore = create<TimelineStoreState>()(
    persist(
        (set) => ({
            activeConnectorId: undefined,
            granularity: 'Day',
            setActiveConnectorId: (id) => set({ activeConnectorId: id }),
            setGranularity: (g) => set({ granularity: g }),
        }),
        { name: 'tfo-timeline' },
    ),
);
