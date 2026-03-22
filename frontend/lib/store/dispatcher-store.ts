import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AlarmEvent, DispatchRule } from '@/lib/types/dispatcher'

interface DispatcherState {
    events: AlarmEvent[]
    rules: DispatchRule[]
    selectedRuleId: string | null
    isRuleBuilderOpen: boolean
    // Set by operations
    setEvents: (events: AlarmEvent[]) => void
    prependEvent: (event: AlarmEvent) => void
    setRules: (rules: DispatchRule[]) => void
    addRule: (rule: DispatchRule) => void
    updateRule: (rule: DispatchRule) => void
    removeRule: (ruleId: string) => void
    setSelectedRuleId: (id: string | null) => void
    setRuleBuilderOpen: (open: boolean) => void
}

export const useDispatcherStore = create<DispatcherState>()(
    immer((set) => ({
        events: [],
        rules: [],
        selectedRuleId: null,
        isRuleBuilderOpen: false,

        setEvents: (events) => set((s) => { s.events = events }),

        prependEvent: (event) => set((s) => {
            // Keep at most 200 events in memory
            s.events = [event, ...s.events].slice(0, 200)
        }),

        setRules: (rules) => set((s) => { s.rules = rules }),

        addRule: (rule) => set((s) => { s.rules.push(rule) }),

        updateRule: (rule) => set((s) => {
            const idx = s.rules.findIndex((r) => r.id === rule.id)
            if (idx !== -1) s.rules[idx] = rule
        }),

        removeRule: (ruleId) => set((s) => {
            s.rules = s.rules.filter((r) => r.id !== ruleId)
        }),

        setSelectedRuleId: (id) => set((s) => { s.selectedRuleId = id }),

        setRuleBuilderOpen: (open) => set((s) => { s.isRuleBuilderOpen = open }),
    }))
)
