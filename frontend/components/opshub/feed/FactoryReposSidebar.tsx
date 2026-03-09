'use client'

import { useOpshubStore } from '@/lib/store/opshub-store'
import { Building2, ChevronDown, GitFork, Package, Plus, Search, Star } from 'lucide-react'

export function FactoryReposSidebar() {
    const {
        factories,
        selectedFactoryId,
        setSelectedFactory,
        getFilteredRepos,
        searchQuery,
        setSearchQuery,
    } = useOpshubStore()

    const filteredRepos = getFilteredRepos()
    const selectedFactory = factories.find(f => f.id === selectedFactoryId)

    const languageColors: Record<string, string> = {
        Motors: 'bg-amber-500',
        HVAC: 'bg-sky-500',
        Robotics: 'bg-purple-500',
        Paint: 'bg-rose-500',
        Welding: 'bg-orange-500',
        Assembly: 'bg-emerald-500',
        Vision: 'bg-indigo-500',
        Energy: 'bg-green-500',
        Analytics: 'bg-blue-500',
        Environment: 'bg-teal-500',
        General: 'bg-zinc-500',
    }

    return (
        <div className="h-full flex flex-col">
            {/* Factory Selector */}
            <div className="p-3 border-b border-zinc-800">
                <div className="relative">
                    <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-200 bg-zinc-800 rounded-md hover:bg-zinc-700 transition"
                        onClick={() => setSelectedFactory(selectedFactoryId ? null : factories[0]?.id || null)}
                    >
                        {selectedFactory ? (
                            <>
                                <Building2 className="w-4 h-4 text-zinc-500" />
                                <span className="truncate flex-1 text-left">{selectedFactory.displayName}</span>
                            </>
                        ) : (
                            <>
                                <Building2 className="w-4 h-4 text-zinc-500" />
                                <span className="truncate flex-1 text-left">All Factories</span>
                            </>
                        )}
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                    </button>

                    {/* Dropdown */}
                    {!selectedFactoryId && (
                        <div className="mt-2 space-y-0.5">
                            {factories.map(factory => (
                                <button
                                    key={factory.id}
                                    onClick={() => setSelectedFactory(factory.id)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 rounded transition"
                                >
                                    <Building2 className="w-3.5 h-3.5 text-zinc-600" />
                                    <span className="truncate">{factory.displayName}</span>
                                    <span className="ml-auto text-[10px] text-zinc-600">{factory.location}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Top Repositories Header */}
            <div className="px-3 py-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Top Solution Kits
                </h2>
                <button className="p-1 hover:bg-zinc-800 rounded transition">
                    <Plus className="w-4 h-4 text-zinc-500" />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Find a workflow..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-zinc-500"
                    />
                </div>
            </div>

            {/* Repos List */}
            <div className="flex-1 overflow-y-auto px-1">
                {filteredRepos.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-zinc-500">
                        No workflows found
                    </div>
                ) : (
                    <ul className="space-y-0.5">
                        {filteredRepos.map(repo => {
                            const factory = factories.find(f => f.id === repo.factoryId)
                            return (
                                <li key={repo.id}>
                                    <button className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-zinc-800 rounded transition group">
                                        <Package className="mt-0.5 w-4 h-4 text-zinc-600 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-zinc-300 truncate">
                                                <span className="text-zinc-500">{factory?.name || 'unknown'}/</span>
                                                {repo.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                                                {repo.language && (
                                                    <span className="flex items-center gap-1">
                                                        <span className={`w-2 h-2 rounded-full ${languageColors[repo.language] || 'bg-zinc-500'}`} />
                                                        {repo.language}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-0.5">
                                                    <Star className="w-3 h-3" />
                                                    {repo.stars}
                                                </span>
                                                <span className="flex items-center gap-0.5">
                                                    <GitFork className="w-3 h-3" />
                                                    {repo.forks}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            {/* Show more */}
            <div className="p-3 border-t border-zinc-800">
                <button className="text-xs text-cyan-400 hover:text-cyan-300 transition">
                    Show more
                </button>
            </div>
        </div>
    )
}
