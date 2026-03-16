/** Two-column layout used by all section modal panels (20% left nav / 80% detail). */
export function PanelLayout({
    leftNav,
    detail,
}: {
    leftNav: React.ReactNode
    detail: React.ReactNode
}) {
    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Nav — 20% */}
            <div className="w-1/5 flex-shrink-0 border-r border-[var(--tp-stroke)] overflow-y-auto bg-[var(--tp-bg-card)] px-2 py-3">
                {leftNav}
            </div>
            {/* Detail — 80% */}
            <div className="flex-1 overflow-y-auto p-6 bg-[var(--tp-bg-surface)]">
                {detail}
            </div>
        </div>
    )
}
