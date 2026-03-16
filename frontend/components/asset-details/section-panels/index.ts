import type { SectionId, SectionPanelProps } from '@/lib/types/asset-tree'
import type { ComponentType } from 'react'
import { DocumentsPanel } from './DocumentsPanel'
import { EventsPanel } from './EventsPanel'
import { HomePanel } from './HomePanel'
import { LogsPanel } from './LogsPanel'
import { PeoplePanel } from './PeoplePanel'
import { SensorsPanel } from './SensorsPanel'
import { WorkflowsPanel } from './WorkflowsPanel'

export const PANEL_REGISTRY: Record<SectionId, ComponentType<SectionPanelProps>> = {
    home:      HomePanel,
    people:    PeoplePanel,
    workflows: WorkflowsPanel,
    events:    EventsPanel,
    sensors:   SensorsPanel,
    logs:      LogsPanel,
    docs:      DocumentsPanel,
}
