import type { ActiveAlert, FacilityMetric, RecentWorkflow, SystemUpdate, TfoModule } from '@/lib/types/tfo'
import { create } from 'zustand'

export interface FacilityLocation {
    id: string
    name: string
    region: string
    type: string
}

const LOCATIONS: FacilityLocation[] = [
    { id: 'muc-01', name: 'Munich Paint Shop', region: 'EU-Central', type: 'Automotive' },
    { id: 'det-01', name: 'Detroit Assembly', region: 'US-East', type: 'Automotive' },
    { id: 'shz-01', name: 'Shenzhen Electronics', region: 'AP-East', type: 'Manufacturing' },
    { id: 'cdmx-01', name: 'CDMX Stamping Plant', region: 'LATAM', type: 'Automotive' },
    { id: 'ryd-01', name: 'Riyadh Cooling Systems', region: 'ME-Central', type: 'HVAC/Datacenter' },
    { id: 'tky-01', name: 'Tokyo Innovation Lab', region: 'AP-East', type: 'R&D' },
    { id: 'gru-01', name: 'São Paulo Hub', region: 'LATAM-South', type: 'Manufacturing' },
]

// Per-location mock data
const FACILITY_DATA: Record<string, {
    metrics: FacilityMetric[]
    alerts: ActiveAlert[]
    workflows: RecentWorkflow[]
}> = {
    'muc-01': {
        metrics: [
            { label: 'OEE', value: '87.3', unit: '%', status: 'normal' },
            { label: 'Cycle Time', value: '42.1', unit: 's', status: 'normal' },
            { label: 'Robots Online', value: '18/20', status: 'warning' },
            { label: 'Paint Temp', value: '23.4', unit: 'C', status: 'normal' },
            { label: 'Booth Humidity', value: '55', unit: '%', status: 'normal' },
            { label: 'Uptime', value: '99.2', unit: '%', status: 'normal' },
        ],
        alerts: [
            { id: 'a1', zone: 'Cell B', sensor: 'Vibration', severity: 'critical', message: 'KUKA KR300-2 joint axis 3 — 8.7 mm/s RMS', timeAgo: '45s ago' },
            { id: 'a2', zone: 'Oven Zone', sensor: 'Temperature', severity: 'warning', message: 'Curing oven north section rising (192C / limit 195C)', timeAgo: '3m ago' },
            { id: 'a3', zone: 'Cell A', sensor: 'Flow Rate', severity: 'warning', message: 'Paint flow rate deviation on KR120 sealer nozzle', timeAgo: '8m ago' },
        ],
        workflows: [
            { id: 'w1', name: 'Robot Calibration — KR300', status: 'running', timeAgo: '2m ago' },
            { id: 'w2', name: 'Nozzle Purge Cycle', status: 'completed', timeAgo: '12m ago' },
            { id: 'w3', name: 'Vibration Diagnosis', status: 'completed', timeAgo: '25m ago' },
            { id: 'w4', name: 'Paint Batch Change', status: 'failed', timeAgo: '40m ago' },
        ],
    },
    'det-01': {
        metrics: [
            { label: 'OEE', value: '82.1', unit: '%', status: 'warning' },
            { label: 'Cycle Time', value: '38.7', unit: 's', status: 'normal' },
            { label: 'Robots Online', value: '24/24', status: 'normal' },
            { label: 'Line Temp', value: '21.8', unit: 'C', status: 'normal' },
            { label: 'Air Quality', value: '96', unit: 'AQI', status: 'normal' },
            { label: 'Uptime', value: '97.8', unit: '%', status: 'warning' },
        ],
        alerts: [
            { id: 'a1', zone: 'Weld Station 4', sensor: 'Current', severity: 'warning', message: 'Spot welder current drift +3.2% from baseline', timeAgo: '5m ago' },
        ],
        workflows: [
            { id: 'w1', name: 'Shift Handover Report', status: 'running', timeAgo: '1m ago' },
            { id: 'w2', name: 'Torque Validation — Line B', status: 'completed', timeAgo: '18m ago' },
        ],
    },
    'shz-01': {
        metrics: [
            { label: 'OEE', value: '91.5', unit: '%', status: 'normal' },
            { label: 'Cycle Time', value: '12.3', unit: 's', status: 'normal' },
            { label: 'SMT Lines', value: '8/8', status: 'normal' },
            { label: 'Clean Room', value: '22.0', unit: 'C', status: 'normal' },
            { label: 'Particle Count', value: '14', unit: '/m3', status: 'normal' },
            { label: 'Uptime', value: '99.9', unit: '%', status: 'normal' },
        ],
        alerts: [],
        workflows: [
            { id: 'w1', name: 'AOI Calibration', status: 'completed', timeAgo: '5m ago' },
            { id: 'w2', name: 'Solder Paste Check', status: 'completed', timeAgo: '30m ago' },
        ],
    },
    'cdmx-01': {
        metrics: [
            { label: 'OEE', value: '79.4', unit: '%', status: 'warning' },
            { label: 'Cycle Time', value: '55.2', unit: 's', status: 'warning' },
            { label: 'Presses Online', value: '5/6', status: 'warning' },
            { label: 'Hydraulic Temp', value: '68', unit: 'C', status: 'normal' },
            { label: 'Die Wear', value: '72', unit: '%', status: 'warning' },
            { label: 'Uptime', value: '94.1', unit: '%', status: 'warning' },
        ],
        alerts: [
            { id: 'a1', zone: 'Press 3', sensor: 'Pressure', severity: 'critical', message: 'Hydraulic pressure drop — possible seal failure', timeAgo: '1m ago' },
            { id: 'a2', zone: 'Press 5', sensor: 'Vibration', severity: 'warning', message: 'Abnormal vibration during stroke cycle', timeAgo: '15m ago' },
        ],
        workflows: [
            { id: 'w1', name: 'Emergency Seal Replacement', status: 'running', timeAgo: '1m ago' },
            { id: 'w2', name: 'Die Inspection', status: 'running', timeAgo: '10m ago' },
            { id: 'w3', name: 'Tonnage Calibration', status: 'completed', timeAgo: '1h ago' },
        ],
    },
    'ryd-01': {
        metrics: [
            { label: 'OEE', value: '88.7', unit: '%', status: 'normal' },
            { label: 'Cooling Eff.', value: '94.2', unit: '%', status: 'normal' },
            { label: 'Chillers Online', value: '12/12', status: 'normal' },
            { label: 'Ambient Temp', value: '44', unit: 'C', status: 'warning' },
            { label: 'PUE', value: '1.28', status: 'normal' },
            { label: 'Uptime', value: '99.6', unit: '%', status: 'normal' },
        ],
        alerts: [
            { id: 'a1', zone: 'Hall B', sensor: 'Temperature', severity: 'warning', message: 'CRAH unit B-3 supply temp rising (+2.1C)', timeAgo: '6m ago' },
        ],
        workflows: [
            { id: 'w1', name: 'Chiller Optimization Cycle', status: 'running', timeAgo: '3m ago' },
            { id: 'w2', name: 'Filter Replacement — AHU-7', status: 'completed', timeAgo: '45m ago' },
        ],
    },
    'tky-01': {
        metrics: [
            { label: 'OEE', value: '96.1', unit: '%', status: 'normal' },
            { label: 'Cycle Time', value: '8.4', unit: 's', status: 'normal' },
            { label: 'Lines Online', value: '6/6', status: 'normal' },
            { label: 'Clean Room', value: '21.5', unit: 'C', status: 'normal' },
            { label: 'Yield', value: '99.4', unit: '%', status: 'normal' },
            { label: 'Uptime', value: '99.9', unit: '%', status: 'normal' },
        ],
        alerts: [],
        workflows: [
            { id: 'w1', name: 'Predictive Maintenance Scan', status: 'completed', timeAgo: '8m ago' },
            { id: 'w2', name: 'Energy Forecast Update', status: 'completed', timeAgo: '1h ago' },
        ],
    },
    'gru-01': {
        metrics: [
            { label: 'OEE', value: '85.3', unit: '%', status: 'normal' },
            { label: 'Cycle Time', value: '34.1', unit: 's', status: 'normal' },
            { label: 'Machines Online', value: '9/10', status: 'warning' },
            { label: 'Humidity', value: '62', unit: '%', status: 'normal' },
            { label: 'Air Quality', value: '92', unit: 'AQI', status: 'normal' },
            { label: 'Uptime', value: '96.8', unit: '%', status: 'normal' },
        ],
        alerts: [
            { id: 'a1', zone: 'Line 4', sensor: 'Humidity', severity: 'warning', message: 'Humidity sensor drift detected in Zone C', timeAgo: '12m ago' },
        ],
        workflows: [
            { id: 'w1', name: 'Humidity Calibration Check', status: 'running', timeAgo: '5m ago' },
            { id: 'w2', name: 'Shift Handover', status: 'completed', timeAgo: '30m ago' },
        ],
    },
}

import type { Workflow } from '@/lib/types/workflow'

const INITIAL_UPDATES: SystemUpdate[] = [
    {
        id: 1,
        title: 'Security Patch TPX-2025-001',
        version: 'v2.4.0',
        description: 'Critical vulnerability in OPC UA communication stack. Addresses CVE-2025-1234 remote code execution risk.',
        author: 'Edge Compute Nodes, HMI Terminals (8 devices)',
        stats: {
            installs: 124,
            rating: 4.8,
            impact: '€12k / yr'
        },
        category: 'energy',
        date: 'February 10, 2025',
        size: '247 MB',
        downtime: '12-15 minutes',
        type: 'CRITICAL'
    },
    {
        id: 2,
        title: 'KUKA KR300-2 Controller Update',
        version: 'v1.1.2',
        description: 'Improves joint precision and reduces vibration in axis 3. Resolves known issue #KR-2024-487.',
        author: 'Robot Arm Controllers (6 devices)',
        stats: {
            installs: 89,
            rating: 4.9,
            impact: '98% Uptime'
        },
        category: 'maintenance',
        date: 'February 8, 2025',
        size: '189 MB',
        downtime: '18-22 minutes',
        type: 'FIRMWARE'
    },
    {
        id: 3,
        title: 'Workflow: KUKA Axis Vibration Protocol',
        version: 'v1.0.0',
        description: 'Standardized workflow for detecting and resolving axis vibration anomalies in robotic arms. Includes AI-driven vibration pattern matching.',
        author: 'Munich Paint Shop',
        sourceFactoryId: 'muc-01',
        stats: {
            installs: 12,
            rating: 5.0,
            impact: '€45k / yr'
        },
        category: 'maintenance',
        date: 'February 13, 2025',
        size: '15 KB',
        downtime: 'None',
        type: 'WORKFLOW'
    }
]

interface TfoState {
    activeModule: TfoModule
    setActiveModule: (module: TfoModule) => void
    darkMode: boolean
    toggleDarkMode: () => void

    // Location
    locations: FacilityLocation[]
    activeLocationId: string
    setActiveLocation: (id: string) => void

    // Facility data (derived from active location)
    facilityMetrics: FacilityMetric[]
    activeAlerts: ActiveAlert[]
    recentWorkflows: RecentWorkflow[]

    // System Updates (Cross-Facility)
    systemUpdates: SystemUpdate[]
    publishWorkflowUpdate: (workflow: Workflow) => void
}

export const useTfoStore = create<TfoState>((set) => ({
    activeModule: 'overview',
    setActiveModule: (module) => set({ activeModule: module }),
    darkMode: true,
    toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

    locations: LOCATIONS,
    activeLocationId: 'muc-01',
    setActiveLocation: (id) => {
        const data = FACILITY_DATA[id]
        if (!data) return
        set({
            activeLocationId: id,
            facilityMetrics: data.metrics,
            activeAlerts: data.alerts,
            recentWorkflows: data.workflows,
        })
    },

    // Default: Munich Paint Shop
    facilityMetrics: FACILITY_DATA['muc-01'].metrics,
    activeAlerts: FACILITY_DATA['muc-01'].alerts,
    recentWorkflows: FACILITY_DATA['muc-01'].workflows,

    // System Updates
    systemUpdates: INITIAL_UPDATES,
    publishWorkflowUpdate: (workflow) => set((state) => {
        const newUpdate: SystemUpdate = {
            id: Date.now(),
            title: `Workflow: ${workflow.title}`,
            version: `v${workflow.version}.0.0`,
            description: workflow.description || 'New workflow template available for cross-facility implementation. Optimized for failure prevention.',
            author: 'Munich Paint Shop', // Hardcoded for this demo flow
            sourceFactoryId: state.activeLocationId, // Track origin
            stats: {
                installs: 0,
                rating: 5.0,
                impact: 'Est. €24k / yr'
            },
            category: 'maintenance',
            date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            size: '12 KB',
            downtime: 'None',
            type: 'WORKFLOW'
        }
        return { systemUpdates: [newUpdate, ...state.systemUpdates] }
    })
}))
