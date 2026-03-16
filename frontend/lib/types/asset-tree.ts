import type { LucideIcon } from 'lucide-react'
import type { TfoModule } from './tfo'

export type SectionId = 'home' | 'people' | 'workflows' | 'events' | 'sensors' | 'logs' | 'docs'

export interface SectionDef {
    id: SectionId
    label: string
    icon: LucideIcon
}

export interface SectionPanelProps {
    /** Passed to WorkflowsPanel to auto-select and highlight the AI optimization workflow */
    highlightOptimization?: boolean
    /** Closes the parent SectionModal — used by approve/edit actions */
    onClose?: () => void
    /** Navigates the app to a top-level module (e.g. 'workflows') and closes the modal */
    onNavigateToModule?: (module: TfoModule) => void
}

/** Generic nav item used by the shared NavTree component */
export interface NavItem {
    id: string
    label: string
    meta?: string          // secondary text (role, value, timestamp…)
    icon?: LucideIcon
    badge?: {
        text: string
        variant: 'green' | 'blue' | 'amber' | 'red' | 'zinc' | 'purple'
    }
    children?: NavItem[]
}
