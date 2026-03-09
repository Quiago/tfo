/** Mock machine metadata keyed by mesh name patterns from the GLB */

export interface MachineInfo {
  name: string
  type: 'robot' | 'controller' | 'piping' | 'electrical' | 'structural' | 'generic'
  description: string
  properties: Record<string, string>
  health: {
    status: 'operational' | 'warning' | 'critical' | 'offline'
    score: number // 0-100
    lastService: string
    nextService: string
  }
  energy: {
    currentKw: number
    avgKw: number
    dailyKwh: number
    efficiency: number // 0-100%
  }
}

/** Classify a mesh name into a machine type and generate mock data */
export function getMachineInfo(meshName: string): MachineInfo {
  const lower = meshName.toLowerCase()

  // KUKA robots
  if (lower.includes('kuka') || lower.includes('robot') || lower.includes('kr')) {
    const variant = lower.includes('300') ? 'KR300' : lower.includes('120') ? 'KR120' : lower.includes('210') ? 'KR210' : 'KR Series'
    return {
      name: `KUKA ${variant}`,
      type: 'robot',
      description: `Industrial robot arm — ${variant === 'KR300' ? 'primary paint application' : variant === 'KR120' ? 'sealer & underbody coating' : variant === 'KR210' ? 'clearcoat application' : 'general purpose'}`,
      properties: {
        'Model': `KUKA ${variant}`,
        'Payload': variant === 'KR300' ? '300 kg' : variant === 'KR120' ? '120 kg' : '210 kg',
        'Reach': variant === 'KR300' ? '2,700 mm' : variant === 'KR120' ? '2,500 mm' : '2,600 mm',
        'Axes': '6',
        'Repeatability': '\u00B10.06 mm',
        'Controller': 'KRC4',
      },
      health: {
        status: 'operational',
        score: 87 + Math.floor(Math.random() * 10),
        lastService: '2025-12-15',
        nextService: '2026-03-15',
      },
      energy: {
        currentKw: +(12 + Math.random() * 8).toFixed(1),
        avgKw: 15.2,
        dailyKwh: 364.8,
        efficiency: 91 + Math.floor(Math.random() * 6),
      },
    }
  }

  // Controllers
  if (lower.includes('krc') || lower.includes('controller') || lower.includes('cabinet') || lower.includes('plc')) {
    return {
      name: 'KRC4 Controller',
      type: 'controller',
      description: 'Robot controller cabinet — PLC, motion control, and safety systems',
      properties: {
        'Model': 'KRC4 compact',
        'CPU': 'Intel i5 industrial',
        'I/O Modules': '12',
        'Safety': 'SafeOperation SLS/SOS',
        'Network': 'PROFINET / EtherCAT',
      },
      health: {
        status: 'operational',
        score: 95,
        lastService: '2026-01-10',
        nextService: '2026-07-10',
      },
      energy: {
        currentKw: +(1.2 + Math.random() * 0.8).toFixed(1),
        avgKw: 1.5,
        dailyKwh: 36,
        efficiency: 98,
      },
    }
  }

  // Piping
  if (lower.includes('pipe') || lower.includes('tube') || lower.includes('duct') || lower.includes('hose')) {
    return {
      name: 'Piping System',
      type: 'piping',
      description: 'Paint supply, solvent recirculation, or compressed air line',
      properties: {
        'Material': 'Stainless Steel 316L',
        'Diameter': '50 mm',
        'Pressure Rating': '10 bar',
        'Medium': 'Paint / Solvent',
        'Insulation': 'Yes',
      },
      health: {
        status: 'operational',
        score: 93,
        lastService: '2025-11-20',
        nextService: '2026-05-20',
      },
      energy: {
        currentKw: 0,
        avgKw: 0,
        dailyKwh: 0,
        efficiency: 100,
      },
    }
  }

  // Electrical
  if (lower.includes('junction') || lower.includes('box') || lower.includes('electric') || lower.includes('panel') || lower.includes('switch')) {
    return {
      name: 'Junction Box',
      type: 'electrical',
      description: 'Electrical distribution panel or junction box',
      properties: {
        'Rating': '400V / 63A',
        'Protection': 'IP65',
        'Circuits': '8',
        'Material': 'Steel enclosure',
      },
      health: {
        status: 'operational',
        score: 99,
        lastService: '2025-10-05',
        nextService: '2026-10-05',
      },
      energy: {
        currentKw: +(0.1 + Math.random() * 0.3).toFixed(1),
        avgKw: 0.2,
        dailyKwh: 4.8,
        efficiency: 99,
      },
    }
  }

  // Walkways / structural
  if (lower.includes('walk') || lower.includes('ramp') || lower.includes('fence') || lower.includes('rail') || lower.includes('stair') || lower.includes('platform') || lower.includes('guard')) {
    return {
      name: 'Structural Element',
      type: 'structural',
      description: 'Walkway, ramp, safety fencing, or access platform',
      properties: {
        'Material': 'Galvanized Steel',
        'Load Rating': '300 kg/m\u00B2',
        'Standard': 'EN ISO 14122',
        'Anti-slip': 'Yes',
      },
      health: {
        status: 'operational',
        score: 100,
        lastService: '2025-06-01',
        nextService: '2026-06-01',
      },
      energy: {
        currentKw: 0,
        avgKw: 0,
        dailyKwh: 0,
        efficiency: 100,
      },
    }
  }

  // Generic fallback
  return {
    name: formatMeshName(meshName),
    type: 'generic',
    description: 'Factory component',
    properties: {
      'Mesh': meshName,
      'Category': 'Unclassified',
    },
    health: {
      status: 'operational',
      score: 90 + Math.floor(Math.random() * 10),
      lastService: '2025-12-01',
      nextService: '2026-06-01',
    },
    energy: {
      currentKw: +(Math.random() * 2).toFixed(1),
      avgKw: 1.0,
      dailyKwh: 24,
      efficiency: 95,
    },
  }
}

function formatMeshName(name: string): string {
  return name
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+\d+$/, '') // strip trailing numbers
    .trim() || 'Component'
}
