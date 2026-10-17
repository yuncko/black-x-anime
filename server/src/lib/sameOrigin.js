/**
 * Same-origin test for state-changing requests (POST/PUT/PATCH/DELETE) whose Origin is not on the
 * CORS allowlist (server/src/index.js). `headers`: { host, forwardedHost, forwardedProto, protocol }.
 */
export function isSameOriginRequest(origin, headers) {
  try {
    const parsedOrigin = new URL(origin);
    const first = (value) => String(value || '').split(',')[0].trim().toLowerCase();
    const proto = first(headers.forwardedProto) || first(headers.protocol) || 'http';
    if (parsedOrigin.protocol !== `${proto}:`) return false;
    // Behind a proxy (AI Studio / Cloud Run, Vercel) the public host can arrive as
    // X-Forwarded-Host while Host names the internal service. A browser cannot set either
    // header on a cross-site form post, so both may vouch for "same origin".
    const hosts = [first(headers.host), first(headers.forwardedHost)].filter(Boolean);
    return hosts.includes(parsedOrigin.host.toLowerCase());
  } catch {
    return false; // malformed origin
  }
}
