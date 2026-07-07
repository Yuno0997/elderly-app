const TOKEN_KEY = 'safealert_token';

/** Resolves /api/... to include Vite `base` (e.g. /elderly-app/api/... under XAMPP). */
export function apiUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const q = input.indexOf('?');
  const pathPart = q === -1 ? input : input.slice(0, q);
  const search = q === -1 ? '' : input.slice(q);
  let path = pathPart;
  if (path.startsWith('/api/')) path = path.slice(5);
  else if (path === '/api') path = '';
  else if (path.startsWith('/api')) path = path.slice(4).replace(/^\//, '');
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/api/${path}${search}`;
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Central fetch wrapper that:
 * 1. Attaches the Bearer token from localStorage.
 * 2. On 401 — clears the stale token and fires a global 'auth:unauthorized'
 *    event so App.tsx can immediately log the user out without waiting for
 *    the next polling cycle to repeat the failure.
 */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(apiUrl(input), { ...init, headers });
  if (response.status === 401) {
    // Only auto-logout for protected endpoints (not the login/bootstrap calls).
    const isAuthEndpoint = input.includes('/auth/login') || input.includes('/auth/bootstrap');
    if (!isAuthEndpoint && token) {
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }
  return response;
}
