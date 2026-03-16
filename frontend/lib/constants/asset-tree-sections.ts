import { Activity, BookOpen, Home, Radio, ScrollText, Users, Workflow } from 'lucide-react'
import type { SectionDef } from '@/lib/types/asset-tree'

/** Ordered list of sections shown in the AssetTree sidebar. */
export const SECTIONS: SectionDef[] = [
    { id: 'home',      label: 'Home',          icon: Home },
    { id: 'people',    label: 'People',         icon: Users },
    { id: 'workflows', label: 'Workflows',      icon: Workflow },
    { id: 'events',    label: 'Events',         icon: Activity },
    { id: 'sensors',   label: 'Sensors',        icon: Radio },
    { id: 'logs',      label: 'Logs',           icon: ScrollText },
    { id: 'docs',      label: 'Documentation',  icon: BookOpen },
]
