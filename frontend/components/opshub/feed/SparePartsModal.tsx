'use client'

import { AlertCircle, CheckCircle, X } from 'lucide-react'

interface SparePart {
    name: string
    sku: string
    quantity: number
    location: string
    status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'on-order'
    eta?: string
    cost: number
}

interface SparePartsModalProps {
    isOpen: boolean
    onClose: () => void
    onApprove: () => void
}

const MOCK_PARTS: SparePart[] = [
    {
        name: 'Bearing SKF 6205-2RS',
        sku: 'SKF-6205',
        quantity: 5,
        location: 'Warehouse B, Shelf 4A',
        status: 'in-stock',
        cost: 45
    },
    {
        name: 'Heating Element 2.5kW',
        sku: 'HT-2500-A',
        quantity: 1,
        location: 'Warehouse A, Shelf 12C',
        status: 'low-stock',
        cost: 850
    },
    {
        name: 'Ventilation Fan Motor',
        sku: 'MTR-VENT-500',
        quantity: 0,
        location: '-',
        status: 'on-order',
        eta: '2-3 days',
        cost: 405
    }
]

export function SparePartsModal({ isOpen, onClose, onApprove }: SparePartsModalProps) {
    if (!isOpen) return null

    const totalCost = MOCK_PARTS.reduce((sum, part) => sum + part.cost, 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <div>
                        <h3 className="text-lg font-semibold text-zinc-100">Spare Parts Availability</h3>
                        <p className="text-sm text-zinc-400">For: Paint Booth Temperature Control</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-3">
                        {MOCK_PARTS.map((part) => (
                            <div key={part.sku} className="flex items-start justify-between p-3 bg-zinc-950/50 border border-zinc-800 rounded-lg">
                                <div className="flex items-start gap-3">
                                    {part.status === 'in-stock' || part.status === 'low-stock' ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-zinc-200">{part.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${part.status === 'in-stock' ? 'bg-emerald-500/10 text-emerald-400' :
                                                    part.status === 'low-stock' ? 'bg-amber-500/10 text-amber-400' :
                                                        'bg-zinc-800 text-zinc-400'
                                                }`}>
                                                {part.quantity} in stock
                                            </span>
                                            <span className="text-xs text-zinc-500">{part.location}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium text-zinc-300">€{part.cost}</p>
                                    {part.eta && (
                                        <p className="text-xs text-amber-400 mt-1">ETA: {part.eta}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                        <span className="text-sm text-zinc-400">Total Estimated Cost</span>
                        <span className="text-xl font-bold text-zinc-100">€{totalCost.toLocaleString()}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onApprove()
                            onClose()
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-sm transition"
                    >
                        <CheckCircle className="w-4 h-4 ml-[-2px]" />
                        Approve & Create Work Order
                    </button>
                </div>
            </div>
        </div>
    )
}
