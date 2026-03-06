'use client'

import { type FacilityLocation } from '@/lib/store/tfo-store'
import type { TfoModule } from '@/lib/types/tfo'
import nav from '@/styles/navbar/navbar.module.css'
import {
    Activity,
    ChevronDown,
    LayoutDashboard,
    LayoutGrid,
    MapPin,
    RefreshCw,
    Search,
    Workflow
} from 'lucide-react'
import React, { useState } from 'react'

// ─── Constants ──────────────────────────────────────────────────────────────
export const MODULES: { id: TfoModule; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} />, description: 'Facility dashboard' },
    { id: 'timeline', label: 'Timeline', icon: <Activity size={16} />, description: 'Sensor time-series' },
    { id: 'workflows', label: 'Workflows', icon: <Workflow size={16} />, description: 'Process automation' },
    { id: 'opshub', label: 'OpsHub', icon: <LayoutDashboard size={16} />, description: 'Cross-facility ops' },
    { id: 'updates', label: 'Updates', icon: <RefreshCw size={16} />, description: 'Latest automations' },
]

// ─── Subcomponents ──────────────────────────────────────────────────────────
function TripolarLogo({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <path d="M566.271 32.3738C555.165 42.0235 503.282 90.6547 442.599 143.994C390.827 189.506 338.811 217.307 299.203 216.186C281.72 215.713 264.6 211.988 248.419 205.484C247.771 205.213 247.139 204.948 246.49 204.677C242.181 202.812 237.808 200.75 233.339 198.481C232.712 198.146 232.106 197.833 231.479 197.493C208.79 185.733 182.646 169.282 156.593 144.892C133.818 123.595 110.815 101.606 90.1021 82.461C63.8045 58.1613 42.3689 38.7024 34.6534 31.6564C33.5056 30.5777 32.1134 30.9178 31.2845 31.7892C30.4077 32.6448 30.0729 34.0104 31.1304 35.1794C38.1764 42.879 57.6352 64.3093 81.9349 90.6069C101.102 111.32 123.09 134.323 144.366 157.098C168.761 183.172 185.207 209.316 196.988 232.005C197.323 232.611 197.641 233.217 197.955 233.844C200.224 238.307 202.286 242.686 204.172 247.017C204.443 247.665 204.709 248.271 204.98 248.924C211.489 265.104 215.214 282.225 215.681 299.729C216.781 339.337 189.001 391.332 143.489 443.104C90.1234 503.786 41.5187 555.67 31.8477 566.802C29.8285 569.113 33.0805 572.413 35.3282 570.346C49.1067 557.737 106.261 505.11 157.942 456.818C278.925 343.758 366.358 386.364 392.873 396.927C395.094 397.815 397.289 395.62 396.401 393.399C385.838 366.884 343.237 279.43 456.314 158.469C504.584 106.787 557.205 49.6327 569.82 35.8277C571.882 33.5853 568.587 30.3545 566.276 32.3738H566.271ZM330.341 263.585L263.069 330.857C262.724 331.202 262.166 330.851 262.32 330.389C262.527 303.695 261.964 286.056 261.964 263.043C261.836 262.681 262.166 262.352 262.527 262.479C286.903 263.585 307.255 263.585 329.868 262.841C330.33 262.687 330.681 263.245 330.336 263.585H330.341Z" fill="url(#paint0_linear_538_741)" />
            <defs>
                <linearGradient id="paint0_linear_538_741" x1="300.471" y1="30.981" x2="300.471" y2="570.999" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#505050" />
                    <stop offset="1" />
                </linearGradient>
            </defs>
        </svg>
    )
}

function UserAvatar({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 43 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
            <path d="M40.375 45.125V40.375C40.375 37.8554 39.3741 35.4391 37.5925 33.6575C35.8109 31.8759 33.3946 30.875 30.875 30.875H11.875C9.35544 30.875 6.93908 31.8759 5.15749 33.6575C3.37589 35.4391 2.375 37.8554 2.375 40.375V45.125M30.875 11.875C30.875 17.1217 26.6217 21.375 21.375 21.375C16.1283 21.375 11.875 17.1217 11.875 11.875C11.875 6.62829 16.1283 2.375 21.375 2.375C26.6217 2.375 30.875 6.62829 30.875 11.875Z" stroke="currentColor" strokeWidth="4.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// ─── Navbar Component ───────────────────────────────────────────────────────
export function Navbar({
    activeModule,
    onModuleChange,
    locations,
    activeLocation,
    onLocationChange,
}: {
    activeModule: TfoModule
    onModuleChange: (mod: TfoModule) => void
    locations: FacilityLocation[]
    activeLocation: FacilityLocation
    onLocationChange: (id: string) => void
}) {
    const [dropdownOpen, setDropdownOpen] = useState(false)

    return (
        <nav className={nav.navbar}>
            {/* Logo */}
            <div className={nav.navLogo}>
                <TripolarLogo className={nav.navLogoImg} />
                <span className={nav.navBrand}>Tripolar</span>
            </div>

            <div className={nav.navSep} />

            {/* Operations Label */}
            <div className={nav.navOps}>
                <LayoutGrid size={16} />
                <span className={nav.navOpsText}>Operations</span>
            </div>

            {/* Modules Pill */}
            <div className={nav.modulePill}>
                {MODULES.map((mod) => (
                    <button
                        key={mod.id}
                        title={mod.description}
                        onClick={() => onModuleChange(mod.id)}
                        className={activeModule === mod.id ? nav.moduleBtnActive : nav.moduleBtn}
                    >
                        {mod.icon}
                    </button>
                ))}
            </div>

            <div className={nav.navSep} />

            {/* Search */}
            <button className={nav.searchBtn}>
                <Search size={16} />
                <span>Search</span>
            </button>


            {/* Spacer */}
            <div className={nav.spacer} />

            {/* Factory Selector */}
            <div className={`relative`}>
                <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={nav.factoryPill}
                >
                    <MapPin size={16} />
                    <span>{activeLocation.name}</span>
                    <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden z-50 py-1">
                            {locations.map(loc => (
                                <button
                                    key={loc.id}
                                    onClick={() => {
                                        onLocationChange(loc.id)
                                        setDropdownOpen(false)
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 flex items-center gap-3 transition-colors
                                    ${activeLocation.id === loc.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-zinc-700'}
                                `}
                                >
                                    <span className={`w-2 h-2 rounded-full ${activeLocation.id === loc.id ? 'bg-indigo-500' : 'bg-zinc-300'}`} />
                                    {loc.name}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* User Profile */}
            <div className={nav.userSection}>
                <UserAvatar className={nav.userAvatar} />
                <span className={nav.userName}>User</span>
                <ChevronDown size={14} className={nav.userChevron} />
            </div>
        </nav>
    )
}
