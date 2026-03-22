import { apiFetch } from './backend';

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  email: string;
  is_active: boolean;
  preferred_connector_id: string | null;
  platform_mode: string | null;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<UserResponse> {
  return apiFetch<UserResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<UserResponse> {
  return apiFetch<UserResponse>('/auth/me');
}

export interface PreferencesPayload {
  preferred_connector_id?: string | null;
  platform_mode?: string | null;
}

export async function updatePreferences(payload: PreferencesPayload): Promise<UserResponse> {
  return apiFetch<UserResponse>('/auth/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
