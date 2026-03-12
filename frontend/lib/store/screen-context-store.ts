'use client';

/**
 * screen-context-store.ts — Session-scoped screen state for user + AI context.
 *
 * Tracks what the user is currently looking at so the AI assistant can answer
 * questions with full situational awareness:
 *   "Which team?" / "Which time range?" / "Which module?"
 *
 * Not persisted (intentional) — context is rebuilt from live UI state each
 * session.  Use timeline-store for the persisted connector/granularity prefs.
 */

import { create } from 'zustand';
import type { TfoModule } from '@/lib/types/tfo';
import type { TimeGranularity } from '@/lib/types/timeline';

export interface DateRange {
    /** Epoch ms — start of the user-selected analysis window. */
    start: number;
    /** Epoch ms — end of the user-selected analysis window. */
    end: number;
}

export interface ScreenContextState {
    /** Which top-level module the user is viewing. */
    activeModule: TfoModule;

    /** The team / equipment asset currently in focus (from expand view). */
    selectedTeamId: string | null;
    /** Human-readable name derived from the raw mesh/asset ID. */
    selectedTeamName: string | null;

    /** OPC UA / MQTT connector the timeline is streaming from. */
    activeConnectorId: string | undefined;
    /** Time bucket granularity shown on the Timeline. */
    granularity: TimeGranularity;

    /** User-drawn date range on the Timeline charts (null = no selection). */
    dateRange: DateRange | null;

    // ── Actions ──────────────────────────────────────────────────────────────
    setActiveModule: (mod: TfoModule) => void;
    setSelectedTeam: (id: string | null, name?: string | null) => void;
    setActiveConnectorId: (id: string | undefined) => void;
    setGranularity: (g: TimeGranularity) => void;
    setDateRange: (range: DateRange | null) => void;

    /**
     * Returns a single, human-readable string summarising what the user is
     * currently looking at.  Injected into the AI system prompt on every chat
     * turn so the assistant has full situational awareness without needing to ask.
     */
    getAIContextSummary: () => string;
}

export const useScreenContext = create<ScreenContextState>((set, get) => ({
    activeModule: 'overview',
    selectedTeamId: null,
    selectedTeamName: null,
    activeConnectorId: undefined,
    granularity: 'Day',
    dateRange: null,

    setActiveModule: (mod) => set({ activeModule: mod }),

    setSelectedTeam: (id, name) =>
        set({ selectedTeamId: id, selectedTeamName: name ?? id }),

    setActiveConnectorId: (id) => set({ activeConnectorId: id }),

    setGranularity: (g) => set({ granularity: g }),

    setDateRange: (range) => set({ dateRange: range }),

    getAIContextSummary: () => {
        const s = get();
        const parts: string[] = [`Screen: ${s.activeModule}`];

        if (s.selectedTeamName) {
            parts.push(`Equipment in focus: ${s.selectedTeamName}`);
        }
        if (s.activeConnectorId) {
            parts.push(`Connector: ${s.activeConnectorId} (${s.granularity} view)`);
        }
        if (s.dateRange) {
            const fmt = (ts: number) =>
                new Date(ts).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            parts.push(
                `Selected time range: ${fmt(s.dateRange.start)} → ${fmt(s.dateRange.end)}`,
            );
        }
        return parts.join(' | ');
    },
}));
