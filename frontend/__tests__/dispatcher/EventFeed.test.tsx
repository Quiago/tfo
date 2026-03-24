/**
 * Tests for EventFeed component.
 *
 * What we verify:
 * - Shows "Not authenticated" when no token
 * - Shows "No events yet" when events list is empty and token exists
 * - Renders event rows when events are present
 * - Applies correct severity badge classes
 * - Renders correct status badge for each status value
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventFeed } from '@/components/dispatcher/EventFeed'
import type { AlarmEvent } from '@/lib/types/dispatcher'

// ── Mock SSE service — no real network calls ──────────────────────────────────

vi.mock('@/lib/services/dispatcher.service', () => ({
    openEventStream: vi.fn().mockImplementation(async function* () {
        // yields nothing — connection stays open but silent in tests
    }),
}))

// ── Mock auth store ───────────────────────────────────────────────────────────

let mockToken: string | null = 'fake-token'

vi.mock('@/lib/store/auth-store', () => ({
    useAuthStore: (selector: (s: object) => unknown) =>
        selector({ token: mockToken }),
}))

// ── Mock dispatcher store ─────────────────────────────────────────────────────

let mockEvents: AlarmEvent[] = []

vi.mock('@/lib/store/dispatcher-store', () => ({
    useDispatcherStore: (selector: (s: object) => unknown) =>
        selector({
            events: mockEvents,
            prependEvent: vi.fn(),
        }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AlarmEvent> = {}): AlarmEvent {
    return {
        id: 'evt-1',
        severity: 'warning',
        category: 'power',
        title: 'UPS Battery Low',
        status: 'completed',
        source_connector_id: 'ups-connector',
        asset_id: null,
        raw_payload: {},
        enriched: {},
        received_at: '2026-01-01T12:00:00Z',
        platform_mode: 'datacenter',
        ...overrides,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EventFeed', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockToken = 'fake-token'
        mockEvents = []
    })

    describe('unauthenticated state', () => {
        it('shows Not authenticated when token is null', () => {
            mockToken = null
            render(<EventFeed />)
            expect(screen.getByText('Not authenticated')).toBeInTheDocument()
        })
    })

    describe('empty state', () => {
        it('shows No events yet when events list is empty', () => {
            render(<EventFeed />)
            expect(screen.getByText('No events yet')).toBeInTheDocument()
        })

        it('shows usage hint', () => {
            render(<EventFeed />)
            expect(screen.getByText(/use the simulator or POST/i)).toBeInTheDocument()
        })
    })

    describe('with events', () => {
        it('renders event title', () => {
            mockEvents = [makeEvent({ title: 'PDU Overload — Row 4' })]
            render(<EventFeed />)
            expect(screen.getByText('PDU Overload — Row 4')).toBeInTheDocument()
        })

        it('renders severity badge', () => {
            mockEvents = [makeEvent({ severity: 'critical' })]
            render(<EventFeed />)
            expect(screen.getByText('critical')).toBeInTheDocument()
        })

        it('renders status badge', () => {
            mockEvents = [makeEvent({ status: 'completed' })]
            render(<EventFeed />)
            expect(screen.getByText('completed')).toBeInTheDocument()
        })

        it('renders no_match status', () => {
            mockEvents = [makeEvent({ status: 'no_match' })]
            render(<EventFeed />)
            expect(screen.getByText('no_match')).toBeInTheDocument()
        })

        it('renders multiple events', () => {
            mockEvents = [
                makeEvent({ id: 'e1', title: 'Event Alpha' }),
                makeEvent({ id: 'e2', title: 'Event Beta' }),
                makeEvent({ id: 'e3', title: 'Event Gamma' }),
            ]
            render(<EventFeed />)
            expect(screen.getByText('Event Alpha')).toBeInTheDocument()
            expect(screen.getByText('Event Beta')).toBeInTheDocument()
            expect(screen.getByText('Event Gamma')).toBeInTheDocument()
        })

        it('renders source connector id', () => {
            mockEvents = [makeEvent({ source_connector_id: 'crac-sensor' })]
            render(<EventFeed />)
            expect(screen.getByText(/crac-sensor/)).toBeInTheDocument()
        })

        it('shows manual when source_connector_id is null', () => {
            mockEvents = [makeEvent({ source_connector_id: null })]
            render(<EventFeed />)
            expect(screen.getByText(/manual/)).toBeInTheDocument()
        })
    })

    describe('severity badge styles', () => {
        it('emergency event has animate-pulse class on badge', () => {
            mockEvents = [makeEvent({ severity: 'emergency' })]
            render(<EventFeed />)
            const badge = screen.getByText('emergency')
            expect(badge.className).toContain('animate-pulse')
        })

        it('info event does not have animate-pulse', () => {
            mockEvents = [makeEvent({ severity: 'info' })]
            render(<EventFeed />)
            const badge = screen.getByText('info')
            expect(badge.className).not.toContain('animate-pulse')
        })
    })
})
