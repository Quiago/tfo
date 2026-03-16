export interface OptimizationInsight {
    title: string
    description: string
    potentialSavingEur: number
    efficiencyGainPercent: number
    affectedSignals: string[]
    confidence: number        // 0–100
    estimatedHours: number    // Time to implement
    timestamp: string
}

/** Which overlay mode is active on the digital twin. */
export type OverlayMode = 'anomaly' | 'optimization' | null
