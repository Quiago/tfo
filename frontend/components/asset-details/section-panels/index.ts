import type { PanelSectionId, SectionPanelProps } from '@/lib/types/asset-tree'
import type { ComponentType } from 'react'
import { DocumentsPanel } from './DocumentsPanel'
import { EventsPanel } from './EventsPanel'
import { HomePanel } from './HomePanel'
import { LogsPanel } from './LogsPanel'
import { PeoplePanel } from './PeoplePanel'
import { SensorsPanel } from './SensorsPanel'
import { WorkflowsPanel } from './WorkflowsPanel'

// 'home' is intentionally excluded — it renders the native
// RichMachineSummary + MultiLayerTimeline view, not a panel component.
export const PANEL_REGISTRY: Record<PanelSectionId, ComponentType<SectionPanelProps>> = {
    machine_health: HomePanel,   // "Health" tab → asset health details
    people:         PeoplePanel,
    workflows:      WorkflowsPanel,
    events:         EventsPanel,
    sensors:        SensorsPanel,
    logs:           LogsPanel,
    docs:           DocumentsPanel,
}
