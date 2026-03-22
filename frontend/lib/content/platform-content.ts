/**
 * Platform Content — single source of truth for all UI text.
 *
 * Adding a new mode or changing a label never touches component logic —
 * only this file changes. Components consume content via usePlatformContent().
 */

export type PlatformMode = 'factory' | 'datacenter'

export interface RightPanelStatusItem {
    label: string
    value: string
    status: 'online' | 'warning' | 'error'
}

export interface PlatformContent {
    /** Navbar left-section label (next to the ops icon) */
    navOpsLabel: string
    /** Tooltip descriptions for each module tab */
    moduleDescriptions: {
        overview: string
        timeline: string
        workflows: string
        opshub: string
        updates: string
    }
    /** Right panel — overview sidebar */
    rightPanel: {
        chart1Title: string
        chart2Title: string
        alertsTitle: string
        statusTitle: string
        statusItems: RightPanelStatusItem[]
    }
    /** Location dropdown section headers */
    locationGroups: {
        factory: string
        datacenter: string
    }
}

export const PLATFORM_CONTENT: Record<PlatformMode, PlatformContent> = {
    factory: {
        navOpsLabel: 'Operations',
        moduleDescriptions: {
            overview: 'Facility dashboard',
            timeline: 'Sensor time-series',
            workflows: 'Process automation',
            opshub: 'Cross-facility ops',
            updates: 'Latest automations',
        },
        rightPanel: {
            chart1Title: 'Production Efficiency (Last 7d)',
            chart2Title: 'Energy Consumption',
            alertsTitle: 'Active Alerts',
            statusTitle: 'Factory Status',
            statusItems: [
                { label: 'Robot Arms', value: '18/20 Online', status: 'online' },
                { label: 'Conveyor System', value: 'Maintenance', status: 'error' },
                { label: 'Paint Booth', value: 'Nominal', status: 'online' },
            ],
        },
        locationGroups: {
            factory: 'Factory',
            datacenter: 'Data Center',
        },
    },

    datacenter: {
        navOpsLabel: 'Infrastructure',
        moduleDescriptions: {
            overview: 'Data center overview',
            timeline: 'System telemetry',
            workflows: 'Process automation',
            opshub: 'Cross-DC ops',
            updates: 'Latest automations',
        },
        rightPanel: {
            chart1Title: 'Server Utilization (Last 7d)',
            chart2Title: 'Power Consumption',
            alertsTitle: 'Active Alerts',
            statusTitle: 'Data Center Status',
            statusItems: [
                { label: 'Server Racks', value: '128/128 Online', status: 'online' },
                { label: 'Cooling System', value: 'Nominal', status: 'online' },
                { label: 'Power Distribution', value: 'UPS Active', status: 'online' },
            ],
        },
        locationGroups: {
            factory: 'Factory',
            datacenter: 'Data Center',
        },
    },
}
