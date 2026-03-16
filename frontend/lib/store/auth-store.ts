import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Temporary mock profile — replaced once the backend returns user metadata
const DEFAULT_PROFILE = {
  name: 'Carlos Méndez',
  role: 'Ops. Manager',
  initials: 'CM',
} as const

interface AuthState {
  token: string | null;
  email: string | null;
  name: string;
  role: string;
  initials: string;
  _hydrated: boolean;
  setAuth: (token: string, email: string, profile?: { name?: string; role?: string; initials?: string }) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      name: DEFAULT_PROFILE.name,
      role: DEFAULT_PROFILE.role,
      initials: DEFAULT_PROFILE.initials,
      _hydrated: false,
      setAuth: (token, email, profile) => set({
        token,
        email,
        name:     profile?.name     ?? DEFAULT_PROFILE.name,
        role:     profile?.role     ?? DEFAULT_PROFILE.role,
        initials: profile?.initials ?? DEFAULT_PROFILE.initials,
      }),
      clear: () => set({
        token: null,
        email: null,
        name:     DEFAULT_PROFILE.name,
        role:     DEFAULT_PROFILE.role,
        initials: DEFAULT_PROFILE.initials,
      }),
      setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: 'tfo_auth',
      partialize: (s) => ({ token: s.token, email: s.email, name: s.name, role: s.role, initials: s.initials }),
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
