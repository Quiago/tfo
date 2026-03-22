/**
 * Tests for RuleBuilder component.
 *
 * What we verify:
 * - Renders empty form for new rule creation
 * - Renders pre-filled form when editingRule is provided
 * - Shows validation error when name is missing
 * - Shows validation error when no actions are added
 * - Calls onClose when Cancel is clicked
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RuleBuilder } from '@/components/dispatcher/RuleBuilder'
import type { DispatchRule } from '@/lib/types/dispatcher'

// ── Mock the dispatcher service so tests don't make real HTTP calls ───────────

vi.mock('@/lib/services/dispatcher.service', () => ({
    createRule: vi.fn().mockResolvedValue({
        id: 'new-rule-id',
        name: 'My Rule',
        description: '',
        conditions: { operator: 'AND', items: [] },
        actions: [{ type: 'log_only', config: {} }],
        enabled: true,
        priority: 100,
        suppression_window_secs: 0,
        platform_mode: 'datacenter',
        created_by: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    }),
    updateRule: vi.fn(),
}))

// ── Mock the dispatcher store ─────────────────────────────────────────────────

const mockAddRule = vi.fn()
const mockUpdateRule = vi.fn()

vi.mock('@/lib/store/dispatcher-store', () => ({
    useDispatcherStore: (selector: (s: object) => unknown) =>
        selector({ addRule: mockAddRule, updateRule: mockUpdateRule }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderBuilder(props: Partial<Parameters<typeof RuleBuilder>[0]> = {}) {
    const onClose = props.onClose ?? vi.fn()
    return {
        onClose,
        ...render(<RuleBuilder onClose={onClose} {...props} />),
    }
}

const MOCK_RULE: DispatchRule = {
    id: 'rule-1',
    name: 'Existing Rule',
    description: 'An existing rule',
    conditions: { operator: 'AND', items: [] },
    actions: [{ type: 'log_only', config: {} }],
    enabled: true,
    priority: 50,
    suppression_window_secs: 30,
    platform_mode: 'datacenter',
    created_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
}


// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RuleBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('empty form (new rule)', () => {
        it('renders the correct heading', () => {
            renderBuilder()
            expect(screen.getByText('New Dispatch Rule')).toBeInTheDocument()
        })

        it('renders name input empty', () => {
            renderBuilder()
            const input = screen.getByPlaceholderText(/e\.g\. Critical UPS Alert/)
            expect(input).toHaveValue('')
        })

        it('renders Create Rule button', () => {
            renderBuilder()
            expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument()
        })
    })

    describe('edit form (existing rule)', () => {
        it('renders Edit Rule heading', () => {
            renderBuilder({ editingRule: MOCK_RULE })
            expect(screen.getByText('Edit Rule')).toBeInTheDocument()
        })

        it('pre-fills the rule name', () => {
            renderBuilder({ editingRule: MOCK_RULE })
            const input = screen.getByDisplayValue('Existing Rule')
            expect(input).toBeInTheDocument()
        })

        it('renders Update button instead of Create', () => {
            renderBuilder({ editingRule: MOCK_RULE })
            expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
        })

        it('pre-fills priority', () => {
            renderBuilder({ editingRule: MOCK_RULE })
            expect(screen.getByDisplayValue('50')).toBeInTheDocument()
        })
    })

    describe('validation', () => {
        it('shows error when name is empty on submit', async () => {
            renderBuilder()
            fireEvent.click(screen.getByRole('button', { name: /create rule/i }))
            await waitFor(() => {
                expect(screen.getByText('Name is required')).toBeInTheDocument()
            })
        })

        it('shows error when no actions are added', async () => {
            renderBuilder()
            const nameInput = screen.getByPlaceholderText(/e\.g\. Critical UPS Alert/)
            fireEvent.change(nameInput, { target: { value: 'My Rule' } })
            fireEvent.click(screen.getByRole('button', { name: /create rule/i }))
            await waitFor(() => {
                expect(screen.getByText('Add at least one action')).toBeInTheDocument()
            })
        })
    })

    describe('cancel button', () => {
        it('calls onClose when Cancel is clicked', () => {
            const { onClose } = renderBuilder()
            fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
            expect(onClose).toHaveBeenCalledOnce()
        })
    })

    describe('successful creation', () => {
        it('calls createRule and onClose when form is valid', async () => {
            const { createRule } = await import('@/lib/services/dispatcher.service')
            const { onClose } = renderBuilder()

            // Fill name
            const nameInput = screen.getByPlaceholderText(/e\.g\. Critical UPS Alert/)
            fireEvent.change(nameInput, { target: { value: 'Valid Rule' } })

            // Add an action via the "Add action" button
            fireEvent.click(screen.getByRole('button', { name: /add action/i }))

            // Submit
            fireEvent.click(screen.getByRole('button', { name: /create rule/i }))

            await waitFor(() => {
                expect(createRule).toHaveBeenCalledOnce()
                expect(onClose).toHaveBeenCalledOnce()
            })
        })
    })
})
