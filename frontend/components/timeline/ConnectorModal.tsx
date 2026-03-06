'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, X } from 'lucide-react';
import { ApiError } from '@/lib/services/backend';
import { createConnector, discoverConnector } from '@/lib/services/connector.service';
import type { ConnectorType, DiscoveryResponse } from '@/lib/types/connector';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ConnectorType, { label: string; placeholder: string; hint: string }> = {
    opcua: {
        label: 'OPC-UA',
        placeholder: 'opc.tcp://192.168.1.100:4840',
        hint: 'Industrial automation servers — PLCs, SCADA, DCS',
    },
    mqtt: {
        label: 'MQTT',
        placeholder: 'mqtt://broker.example.com:1883',
        hint: 'Lightweight IoT messaging broker',
    },
    rest: {
        label: 'REST',
        placeholder: 'https://api.example.com/v1',
        hint: 'Generic HTTP API endpoint',
    },
};

function slugify(str: string): string {
    const base = str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return base || `connector`;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ModalStep = 'form' | 'connecting' | 'connected' | 'error';

export interface ConnectorModalProps {
    onClose: () => void;
    /** Called when user clicks "Start Streaming" after a successful discovery. */
    onConnected: (connectorId: string, nodeCount: number) => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function ConnectorModal({ onClose, onConnected }: ConnectorModalProps) {
    const [step, setStep] = useState<ModalStep>('form');
    const [type, setType] = useState<ConnectorType>('opcua');
    const [name, setName] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [statusText, setStatusText] = useState('');
    const [error, setError] = useState('');
    const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);

    async function handleConnect() {
        const trimmedEndpoint = endpoint.trim();
        if (!trimmedEndpoint) return;

        const connectorId = slugify(name.trim() || type);
        const connectorName = name.trim() || `${TYPE_CONFIG[type].label} Connector`;

        setStep('connecting');
        setError('');

        // Register the connector (409 = already exists → proceed anyway)
        try {
            setStatusText('Registering connector…');
            await createConnector({ id: connectorId, name: connectorName, type, endpoint: trimmedEndpoint });
        } catch (err: unknown) {
            if (!(err instanceof ApiError && err.status === 409)) {
                const msg = err instanceof ApiError ? `Server error ${err.status}` : 'Network error';
                setError(`Failed to register: ${msg}. Make sure the backend is running.`);
                setStep('error');
                return;
            }
            // 409 → connector already registered under this id, proceed to discover
        }

        // Discover nodes
        try {
            setStatusText('Discovering nodes…');
            const result = await discoverConnector(connectorId);
            setDiscovery(result);
            setStep('connected');
        } catch (err: unknown) {
            const detail =
                err instanceof ApiError
                    ? err.status === 404
                        ? 'Connector not found in DB after registration.'
                        : err.status === 503
                            ? `Cannot reach ${trimmedEndpoint}. Verify the server is running.`
                            : `Server error ${err.status}`
                    : 'Network error — check backend is running.';
            setError(`Discovery failed: ${detail}`);
            setStep('error');
        }
    }

    const numericNodes = discovery?.nodes.filter((n) =>
        ['double', 'float', 'int', 'uint', 'number', 'byte', 'sbyte'].some((t) =>
            n.data_type.toLowerCase().includes(t),
        ),
    ) ?? [];

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-md bg-[#1a1f2e] border border-[#98A6D4]/20 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#98A6D4]/20">
                    <div>
                        <h2 className="text-sm font-semibold text-white">Add Data Source</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Connect an industrial data source to the timeline</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded">
                        <X size={16} />
                    </button>
                </div>

                {/* ── FORM ── */}
                {step === 'form' && (
                    <div className="px-6 py-5 space-y-5">

                        {/* Protocol */}
                        <div>
                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">Protocol</label>
                            <div className="flex gap-2">
                                {(Object.keys(TYPE_CONFIG) as ConnectorType[]).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setType(t)}
                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${type === t
                                            ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                                            : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                                            }`}
                                    >
                                        {TYPE_CONFIG[t].label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1.5">{TYPE_CONFIG[type].hint}</p>
                        </div>

                        {/* Name */}
                        <div>
                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
                                Name <span className="normal-case font-normal text-zinc-600">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={`My ${TYPE_CONFIG[type].label} Server`}
                                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
                            />
                            {name && (
                                <p className="text-xs text-zinc-600 mt-1">
                                    ID: <span className="font-mono text-zinc-500">{slugify(name)}</span>
                                </p>
                            )}
                        </div>

                        {/* Endpoint */}
                        <div>
                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">Endpoint</label>
                            <input
                                type="text"
                                value={endpoint}
                                onChange={(e) => setEndpoint(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                                placeholder={TYPE_CONFIG[type].placeholder}
                                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors font-mono"
                            />
                        </div>

                        <button
                            onClick={handleConnect}
                            disabled={!endpoint.trim()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 rounded-lg transition-colors"
                        >
                            Connect <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {/* ── CONNECTING ── */}
                {step === 'connecting' && (
                    <div className="px-6 py-12 flex flex-col items-center gap-4">
                        <span className="h-10 w-10 rounded-full border-2 border-zinc-600 border-t-cyan-400 animate-spin" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-white">{statusText}</p>
                            <p className="text-xs text-zinc-500 mt-1 font-mono truncate max-w-xs">{endpoint}</p>
                        </div>
                    </div>
                )}

                {/* ── CONNECTED ── */}
                {step === 'connected' && discovery && (
                    <div className="px-6 py-5 space-y-4">
                        <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <Check size={18} className="text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-emerald-400">Connected</p>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                    {discovery.node_count} nodes · {numericNodes.length} numeric · ready to stream
                                </p>
                            </div>
                        </div>

                        {/* Preview nodes */}
                        {discovery.nodes.slice(0, 4).length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                                    Streaming (first 4 nodes)
                                </p>
                                <div className="space-y-1.5">
                                    {discovery.nodes.slice(0, 4).map((n, i) => (
                                        <div key={n.node_id} className="flex items-center gap-2.5 px-3 py-2 bg-zinc-800/50 rounded-lg">
                                            <span className="text-xs font-mono text-cyan-500 w-4 shrink-0">{i + 1}</span>
                                            <span className="text-xs text-white truncate flex-1">{n.display_name}</span>
                                            <span className="text-[10px] text-zinc-500 font-mono shrink-0">{n.data_type}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => { onConnected(discovery.connector_id, discovery.node_count); onClose(); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded-lg transition-colors"
                        >
                            Start Streaming <ArrowRight size={14} />
                        </button>
                    </div>
                )}

                {/* ── ERROR ── */}
                {step === 'error' && (
                    <div className="px-6 py-5 space-y-4">
                        <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                        </div>
                        <button
                            onClick={() => setStep('form')}
                            className="w-full py-2.5 text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
