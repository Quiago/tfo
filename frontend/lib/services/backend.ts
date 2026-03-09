import { getStoredToken } from '@/lib/store/auth-store';

export const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      // Stored token is expired or invalid — clear it and reload to show login screen
      localStorage.removeItem('tfo_auth');
      window.location.reload();
    }
    throw new ApiError(res.status, `[${res.status}] ${path}`);
  }

  return res.json() as Promise<T>;
}
