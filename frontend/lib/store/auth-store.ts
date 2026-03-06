import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  email: string | null;
  _hydrated: boolean;
  setAuth: (token: string, email: string) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      _hydrated: false,
      setAuth: (token, email) => set({ token, email }),
      clear: () => set({ token: null, email: null }),
      setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: 'tfo_auth',
      partialize: (s) => ({ token: s.token, email: s.email }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/**
 * Read token outside of React (for services layer).
 * Reads directly from localStorage to avoid circular store imports.
 */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('tfo_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}
