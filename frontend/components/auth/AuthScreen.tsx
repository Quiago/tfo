'use client';

import { useAuthStore } from '@/lib/store/auth-store';
import { login, register } from '@/lib/services/auth.service';
import { ApiError } from '@/lib/services/backend';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'login' | 'register';

type ServerStatus =
  | { phase: 'waking' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

// ── Error message map ─────────────────────────────────────────────────────────

const AUTH_ERROR_MESSAGES: Record<number, string> = {
  401: 'Invalid email or password.',
  409: 'An account with this email already exists.',
  422: 'Please enter a valid email address.',
  503: 'Cannot reach the server. Make sure the backend is running.',
};

function getAuthErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return AUTH_ERROR_MESSAGES[err.status] ?? `Server error (${err.status}). Please try again.`;
  }
  if (err instanceof TypeError) {
    return 'Cannot reach the server. Make sure the backend is running on port 8000.';
  }
  return 'Something went wrong. Please try again.';
}

// ── Server status indicator ───────────────────────────────────────────────────

function ServerStatusBadge({ status, onRetry }: { status: ServerStatus; onRetry: () => void }) {
  if (status.phase === 'ready') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
        Server ready
      </div>
    );
  }

  if (status.phase === 'error') {
    return (
      <div className="flex items-center gap-2 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
        <span className="text-xs text-red-400">{status.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-cyan-500 hover:text-cyan-400 underline ml-auto shrink-0 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // waking
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-4">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      Connecting to factory server…
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuthScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode]           = useState<Mode>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ phase: 'waking' });

  const wakeAbortRef = useRef<AbortController | null>(null);

  // ── Wake-up flow ───────────────────────────────────────────────────────────

  const wakeServer = () => {
    // Cancel any in-flight wake request
    wakeAbortRef.current?.abort();
    const controller = new AbortController();
    wakeAbortRef.current = controller;

    setServerStatus({ phase: 'waking' });

    fetch('/api/wake', { method: 'POST', signal: controller.signal })
      .then((res) => res.json())
      .then((body: { ready: boolean; error?: string }) => {
        if (body.ready) {
          setServerStatus({ phase: 'ready' });
        } else {
          setServerStatus({
            phase: 'error',
            message: 'Server unavailable — retry?',
          });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setServerStatus({ phase: 'error', message: 'Server unavailable — retry?' });
      });
  };

  // Start wake-up on mount; clean up on unmount
  useEffect(() => {
    wakeServer();
    return () => { wakeAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password);
      }
      const { access_token } = await login(email, password);
      setAuth(access_token, email);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const isServerReady  = serverStatus.phase === 'ready';
  const submitDisabled = loading || !isServerReady;
  const submitLabel    = (() => {
    if (loading) return mode === 'register' ? 'Creating account…' : 'Signing in…';
    if (!isServerReady) return 'Waiting for server…';
    return mode === 'login' ? 'Sign In' : 'Create Account';
  })();

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm">

        {/* Glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-cyan-500/20 to-transparent pointer-events-none" />

        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">

          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-cyan-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-zinc-950" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.8L13.5 6 8 9.2 2.5 6 8 2.8zm-6 4.1L7.5 10v4.2L2 11.4V6.9zm6 7.3V10l5.5-3.1v4.5L8 14.2z" />
                </svg>
              </div>
              <span className="text-white font-semibold tracking-wide text-lg">TRIPOLAR</span>
            </div>
            <p className="text-zinc-500 text-sm">Industrial Intelligence Platform</p>
          </div>

          {/* Server status */}
          <ServerStatusBadge status={serverStatus} onRetry={wakeServer} />

          {/* Mode toggle */}
          <div className="flex bg-zinc-800 rounded-lg p-1 mb-6">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  mode === m
                    ? 'bg-zinc-700 text-white shadow'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
              />
            </div>

            {/* Auth error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-400 text-xs leading-relaxed">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full mt-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-950 font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="h-4 w-4 rounded-full border-2 border-zinc-500 border-t-zinc-300 animate-spin" />
              )}
              {submitLabel}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-zinc-600">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              className="text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
