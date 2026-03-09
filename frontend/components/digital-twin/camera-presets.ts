export interface CameraPreset {
    id: string
    name: string
    description: string
    icon: string
    position: [number, number, number]
    target: [number, number, number]
    hotspotPosition?: [number, number, number]
    category?: 'overview' | 'equipment' | 'infrastructure' | 'monitoring'
}

export const CAMERA_PRESETS: CameraPreset[] = [
    {
        id: 'overview',
        name: '',
        description: 'Bird\'s eye view of the automotive paint shop floor',
        icon: '🏭',
        position: [0, 35, 55],
        target: [0, 0, 0],
        category: 'overview',
    },
    {
        id: 'kuka-kr300',
        name: 'KUKA KR300',
        description: 'Primary paint application robot — high-payload spray arm',
        icon: '🤖',
        position: [12, 5, 8],
        target: [12, 2, 3],
        hotspotPosition: [12, 3.5, 3],
        category: 'equipment',
    },
    {
        id: 'kuka-kr120',
        name: 'KUKA KR120',
        description: 'Sealer and underbody coating robot arm',
        icon: '🦾',
        position: [-8, 4, 6],
        target: [-8, 1, 2],
        hotspotPosition: [-8, 2.5, 2],
        category: 'equipment',
    },
    {
        id: 'kuka-kr210',
        name: 'KUKA KR210',
        description: 'Clearcoat application robot — final finish layer',
        icon: '🤖',
        position: [3, 5, 6],
        target: [3, 2, 3],
        hotspotPosition: [3, 3.5, 3],
        category: 'equipment',
    },
    {
        id: 'piping-system',
        name: 'Piping System',
        description: 'Paint supply lines, solvent recirculation, and air ducts',
        icon: '🔧',
        position: [-15, 6, -5],
        target: [-15, 2, -10],
        hotspotPosition: [-15, 3, -10],
        category: 'infrastructure',
    },
    {
        id: 'krc4-controllers',
        name: 'KRC4 Controllers',
        description: 'Robot controller cabinets — PLC and motion control units',
        icon: '🎛️',
        position: [8, 4, -8],
        target: [8, 2, -12],
        hotspotPosition: [8, 3, -12],
        category: 'monitoring',
    },
    {
        id: 'walkways-ramps',
        name: 'Walkways & Ramps',
        description: 'Operator access walkways, maintenance ramps, and safety fencing',
        icon: '🚶',
        position: [20, 5, 0],
        target: [20, 1, -5],
        hotspotPosition: [20, 2, -5],
        category: 'infrastructure',
    },
    {
        id: 'junction-boxes',
        name: 'Junction Boxes',
        description: 'Electrical junction boxes and power distribution panels',
        icon: '⚡',
        position: [0, 8, -15],
        target: [0, 3, -20],
        hotspotPosition: [0, 4, -20],
        category: 'infrastructure',
    },
    {
        id: 'paint-booth-3',
        name: 'Paint Booth #3',
        description: 'Automated spray booth with temperature and humidity control',
        icon: '🎨',
        position: [15, 6, 15],
        target: [12, 2, 12],
        hotspotPosition: [12, 4, 12],
        category: 'equipment',
    },
]
