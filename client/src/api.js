/**
 * Hearbor API Client — Hybrid Web + Capacitor Android APK Edition
 * Supports dynamic cloud backend URL resolution for the native Android APK.
 */
import { findPublicCacheRoute } from '../../shared/publicCacheRoutes.js';
import { PUBLIC_SITE_ORIGIN } from '../../shared/publicSite.js';

const TOKEN_KEY = 'blackx_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function isNativeApk() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      window.__BLACKX_APK__ ||
      (window.location.hostname === 'localhost' && !window.location.port)
  );
}

export function getServerUrl() {
  // Browsers (every website host) use their own same-origin /api routes.
  if (!isNativeApk()) return '';
  // The APK runs from https://localhost and calls the website it was built for
  // (VITE_API_BASE_URL, set by tools/apk/build-apk.sh). A server address saved
  // on the phone by old builds (localStorage 'blackx_server_url') is ignored:
  // it could name an old host (black-x-anime.me stopped answering in 2026-10).
  const envUrl = String(import.meta.env?.VITE_API_BASE_URL || '').trim();
  return (envUrl || PUBLIC_SITE_ORIGIN).replace(/\/+$/, '');
}

export function resolveApiUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const base = getServerUrl();
  if (!base) return path;
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}

// Install global fetch wrapper so direct fetch('/api/...') or fetch('/search-anime...')
// calls across all components automatically route to the configured cloud server in APK mode.
if (typeof window !== 'undefined' && !window.__blackxFetchWrapped) {
  window.__blackxFetchWrapped = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      const isBackendPath =
        input.startsWith('/api/') ||
        input.startsWith('/search-anime') ||
        input.startsWith('/get-episodes') ||
        input.startsWith('/get-episode-dl') ||
        input.startsWith('/latest-episodes') ||
        input.startsWith('/fetch-seasonals') ||
        input.startsWith('/get-anime-info');
      if (isBackendPath) {
        const base = getServerUrl();
        if (base) {
          input = `${base}${input}`;
        }
      }
    }
    return nativeFetch(input, init);
  };
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  let res;
  const token = getStoredToken();
  // Public, user-independent GET routes are cached on Vercel's CDN, and Vercel
  // never serves a cached copy to a request that carries an Authorization
  // header. Those routes ignore the user anyway, so leave the token off them.
  const isPublicCacheableGet = method === 'GET' && typeof path === 'string' && Boolean(findPublicCacheRoute(path));
  const reqHeaders = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token && !isPublicCacheableGet ? { Authorization: `Bearer ${token}` } : {}),
    ...headers
  };

  const resolvedPath = resolveApiUrl(path);

  try {
    res = await fetch(resolvedPath, {
      method,
      credentials: 'include',
      headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const e = new Error('network');
    e.code = 'network';
    throw e;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/me' && path !== '/api/auth/login') {
      setStoredToken(null);
    }
    const e = new Error(data.message || 'request_failed');
    e.code = data.error || 'request_failed';
    e.status = res.status;
    throw e;
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' })
};
