/**
 * Public API routes whose responses are identical for every visitor.
 *
 * Shared by:
 *  - the server (server/src/lib/cdnCache.js), which marks successful responses
 *    from these routes as cacheable on Vercel's CDN (`s-maxage`), and
 *  - the web client (client/src/api.js), which omits the Authorization header
 *    on GET requests to these routes, because Vercel never caches a request
 *    that carries one (https://vercel.com/docs/caching/cdn-cache).
 *
 * A cached response is served to everyone. Only list a route here if its
 * handler never reads req.user, cookies or the Authorization header.
 * Personalised routes (watchlist state on /api/anime/:id, VIP servers on
 * /api/stream/episode, the library, auth, proxies, download links) must never
 * be listed.
 */

export const CDN_CACHE_PROFILES = Object.freeze({
  // New episodes: refreshed every 5 minutes.
  feed: { sMaxAge: 300, staleWhileRevalidate: 1800, staleIfError: 86400, browserMaxAge: 60 },
  // Trending lists, catalog pages, show pages and schedules: refreshed every 10 minutes.
  catalog: { sMaxAge: 600, staleWhileRevalidate: 3600, staleIfError: 86400, browserMaxAge: 60 },
  // Search results.
  search: { sMaxAge: 300, staleWhileRevalidate: 3600, staleIfError: 86400, browserMaxAge: 60 },
  // Small settings the developer can edit (footer text, server list): 1 minute.
  config: { sMaxAge: 60, staleWhileRevalidate: 600, staleIfError: 86400, browserMaxAge: 0 },
  // Intro/outro timestamps (AniSkip): 1 day.
  skipTimes: { sMaxAge: 86400, staleWhileRevalidate: 604800, staleIfError: 604800, browserMaxAge: 3600 },
  // Proxied cover images and the bundled hls.js library: 7 days.
  asset: { sMaxAge: 604800, staleWhileRevalidate: 86400, staleIfError: 604800, browserMaxAge: 86400 }
});

export const PUBLIC_CACHE_ROUTES = Object.freeze([
  { pattern: /^\/api\/anime\/(?:trending|season|schedule|rankings)$/, profile: 'catalog' },
  { pattern: /^\/api\/anime\/search$/, profile: 'search' },
  { pattern: /^\/api\/stream\/latest$/, profile: 'feed' },
  { pattern: /^\/api\/stream\/catalog$/, profile: 'catalog' },
  { pattern: /^\/api\/stream\/stats$/, profile: 'catalog' },
  { pattern: /^\/api\/stream\/search$/, profile: 'search' },
  { pattern: /^\/api\/stream\/show\/[^/]+$/, profile: 'catalog' },
  { pattern: /^\/api\/stream\/sources$/, profile: 'config' },
  { pattern: /^\/api\/stream\/hls-lib\.js$/, profile: 'asset' },
  { pattern: /^\/api\/content\/library$/, profile: 'catalog' },
  { pattern: /^\/api\/settings\/footer$/, profile: 'config' },
  // App config for the APK and the website VIP gate (no codes, no e-mails, no per-user data).
  { pattern: /^\/api\/app\/config$/, profile: 'config' },
  { pattern: /^\/api\/app\/skip-times$/, profile: 'skipTimes' },
  { pattern: /^\/api\/proxy-image$/, profile: 'asset' }
]);

/** Returns the matching route rule for a path (query string ignored), or null. */
export function findPublicCacheRoute(pathname) {
  const path = String(pathname || '').split('?')[0].split('#')[0];
  return PUBLIC_CACHE_ROUTES.find((route) => route.pattern.test(path)) || null;
}
