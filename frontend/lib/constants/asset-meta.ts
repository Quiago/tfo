export interface AssetMeta {
    displayName: string
    cluster: string
    productionLine: string
    floor: string
}

/** Mock asset metadata — replaced by API response once backend exposes equipment context. */
const ASSET_META: Record<string, AssetMeta> = {
    'kuka-kr120-right': {
        displayName:    'KUKA KR120',
        cluster:        'Welding Cell B',
        productionLine: 'Line 3 — Body-in-White',
        floor:          'Floor 2',
    },
    'kuka-kr120-left': {
        displayName:    'KUKA KR120',
        cluster:        'Welding Cell A',
        productionLine: 'Line 2 — Body-in-White',
        floor:          'Floor 2',
    },
    'kuka-kr300': {
        displayName:    'KUKA KR300',
        cluster:        'Heavy Weld Bay',
        productionLine: 'Line 1 — Chassis',
        floor:          'Floor 1',
    },
}

/** Fuzzy-match an asset ID against metadata keys (handles casing / separator differences). */
export function resolveAssetMeta(raw: string): AssetMeta | null {
    const key = raw.toLowerCase().replace(/[_\s]/g, '-')
    const exact = ASSET_META[key]
    if (exact) return exact
    const partial = Object.keys(ASSET_META).find((k) => key.includes(k) || k.includes(key))
    return partial ? ASSET_META[partial] : null
}
