import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import authRoutes from './routes/auth.js';
import animeRoutes from './routes/anime.js';
import streamingRoutes from './routes/streaming.js';
import libraryRoutes from './routes/library.js';
import devRoutes from './routes/dev.js';
import communityRoutes from './routes/community.js';
import contentRoutes from './routes/content.routes.js';
import communitySpecRoutes from './routes/community.routes.js';
import profileRoutes from './routes/profile.routes.js';
import gamificationRoutes from './routes/gamification.routes.js';
import supportRoutes from './routes/support.routes.js';
import mangaNovelRoutes from './routes/mangaNovel.routes.js';
import { animeScraperRouter } from './routes/animeScraper.routes.js';
import apkAppRoutes from './routes/apkApp.js';
import telemetryRoutes from './routes/telemetry.js';
import { optionalAuth, isAuthConfigured } from './auth.js';
import { db } from './db.js';
import { cdnCacheMiddleware } from './lib/cdnCache.js';
import { getFirestoreAuthStatus, getFirestoreAuthHeaders, isServiceAccountConfigured } from './services/firestoreAuth.js';
import { PUBLIC_SITE_ORIGIN, LEGACY_SITE_ORIGINS } from '../../shared/publicSite.js';
import { isSameOriginRequest } from './lib/sameOrigin.js';

// Keep local Node development resilient to client-abort and background-task
// rejections. Vercel should manage the serverless invocation lifecycle itself.
if (!process.env.VERCEL) {
  process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err?.message || err);
  });
}

// Seed only the standalone Node deployment. Vercel functions are short-lived;
// running catalog scrapers and background enrichment on cold start wastes CPU.
if (!process.env.VERCEL) {
  try {
    const { main: seedAll, enrichLibrary } = await import('./seed.js');
    const { c: userCount } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
    if (userCount === 0) {
      console.log('🌱 Empty database — seeding demo data…');
      seedAll({ quick: true })
        .then(() => {
          console.log('🌱 Quick seed done — enriching metadata in background');
          const attempt = (n) => enrichLibrary()
            .then(() => console.log('✨ Library enriched with live metadata'))
            .catch((err) => {
              console.error('enrich attempt failed:', err?.message || err);
              if (n < 5) setTimeout(() => attempt(n + 1), 3 * 60 * 1000);
            });
          return attempt(1);
        })
        .catch((err) => console.error('seed failed:', err?.message || err));
    }
  } catch (err) {
    console.error('auto-seed check failed:', err?.message || err);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
// Hosts such as Render, Railway, Koyeb and the Docker image inject PORT.
const PORT = Number(process.env.PORT) || 3000;

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '').toLowerCase();
const allowedCorsOrigins = new Set([
  PUBLIC_SITE_ORIGIN,
  ...LEGACY_SITE_ORIGINS,
  'http://localhost',
  'https://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'capacitor://localhost',
  'ionic://localhost',
  ...(process.env.CORS_ORIGINS || '').split(',').map(normalizeOrigin)
].filter(Boolean));

const allowedCorsOrigin = (origin, callback) => {
  const normalized = normalizeOrigin(origin);
  callback(null, normalized && allowedCorsOrigins.has(normalized) ? origin : false);
};
app.use(cors({ origin: allowedCorsOrigin, credentials: true }));

// CORS alone does not stop a disallowed simple form request from reaching a
// state-changing route. Reject cross-origin mutations unless the origin is
// explicitly trusted or is the same host/protocol (including Vercel previews).
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || allowedCorsOrigins.has(normalizeOrigin(origin))) return next();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const sameOrigin = isSameOriginRequest(origin, {
      host: req.get('host'),
      forwardedHost: req.get('x-forwarded-host'),
      forwardedProto: req.get('x-forwarded-proto'),
      protocol: req.protocol
    });
    if (sameOrigin) return next();
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  return next();
});

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(optionalAuth);
// Public, user-independent GET routes are cached on Vercel's CDN (see
// shared/publicCacheRoutes.js); everything else is left untouched.
app.use(cdnCacheMiddleware);

app.get('/api/health', async (req, res) => {
  try {
    // Verify the schema used by authentication, not just that Express is alive.
    db.prepare('SELECT id, username, email, password_hash FROM users LIMIT 0').all();
    // When a service-account key is configured, obtain a token once per
    // instance so the reported status reflects whether the key really works.
    if (isServiceAccountConfigured() && getFirestoreAuthStatus() === 'service_account_pending') {
      await getFirestoreAuthHeaders();
    }
    res.json({
      ok: true,
      name: 'BLACK X API',
      database: 'ok',
      authentication: isAuthConfigured() ? 'ok' : 'unavailable',
      firestoreAuth: getFirestoreAuthStatus(),
      time: new Date().toISOString()
    });
  } catch (err) {
    const requestId = req.get('x-vercel-id') || req.get('x-request-id') || null;
    console.error('[health database failure]', JSON.stringify({
      requestId,
      name: err?.name || 'Error',
      code: err?.code || null,
      message: err?.message || String(err)
    }));
    res.status(503).json({
      ok: false,
      name: 'BLACK X API',
      database: 'error',
      requestId,
      time: new Date().toISOString()
    });
  }
});

/**
 * Image proxy for the dominant-color extractor.
 * Restricted to the AniList + witanime image CDNs to avoid open-proxy abuse.
 */
app.get('/api/proxy-image', async (req, res) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'missing_url' });
    const url = new URL(req.query.url);
    const ok = url.hostname === 's4.anilist.co' ||
      url.hostname === 'images.witanime.site' ||
      url.hostname === 'anime3rb.com' ||
      url.hostname.endsWith('.anime3rb.com') ||
      url.hostname.includes('animeify.net') ||
      url.hostname.includes('mangalik.net');
    if (!ok) {
      return res.status(400).json({ error: 'bad_host', message: 'Host not allowed' });
    }
    const upstream = await fetch(url.href, {
      headers: { 'User-Agent': 'BLACK-X/1.0 (color-extraction)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: 'upstream', message: 'Image fetch failed' });
  }
});

app.use('/api/app', apkAppRoutes); // BLACK X APK v16+: config, accounts, sync, VIP, developer tools
app.use('/api/telemetry', telemetryRoutes); // anonymous crash reports (developer panel «الأخطاء»)
app.use('/api/auth', authRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/stream', streamingRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/settings', devRoutes);
app.use('/api/community', communityRoutes);

// Prisma/PostgreSQL social & gamification API (see prisma/schema.prisma)
app.use('/api/content', contentRoutes);
app.use('/api/community', communitySpecRoutes); // POST /follow (+ spec GET /posts fallback)
app.use('/api/profile', profileRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/creator', gamificationRoutes); // POST /submit lives in gamification.routes.js
app.use('/api/support', supportRoutes);
app.use('/api', mangaNovelRoutes); // Manga, Manhwa, Light Novels, AniList, MangaDex, Scraper & Tracking
app.use('/api/anime-scraper', animeScraperRouter); // 3v1ltw1n0x01/anime_scraper API under /api/anime-scraper
app.use('/', animeScraperRouter); // Also expose top-level /search-anime, /get-episodes, /get-episode-dl, /latest-episodes, /fetch-seasonals, /get-anime-info

// Platform injectors (AI Studio _websocket-interceptor.js) register a
// service worker via a relative URL — serve a valid one for ANY nested path
// so registration stops failing with an HTML MIME SecurityError.
const SW_JS = "self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())); });\nself.addEventListener('fetch', () => {});\n";
app.get(/_service-worker\.js$/, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('application/javascript').send(SW_JS);
});

// Serve the built client in production
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (!process.env.VERCEL && fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
      }
    })
  );
  app.get(/^(?!\/api).*/, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const requestId = req.get('x-vercel-id') || req.get('x-request-id') || null;
  const safePath = String(req.originalUrl || req.path || '').split('?')[0];
  const error = err instanceof Error ? err : new Error(String(err || 'Unknown server error'));
  console.error('[server error]', JSON.stringify({
    requestId,
    method: req.method,
    path: safePath,
    name: error.name,
    code: error.code || null,
    message: error.message,
    stack: error.stack || null
  }));

  if (res.headersSent) return next(error);
  if (requestId) res.setHeader('x-blackx-request-id', requestId);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong', requestId });
});

if (!process.env.VERCEL) {
  // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
  app.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
      console.error(`\n  ✖ BLACK X API could not listen on port ${PORT}: ${err.message}\n`);
      process.exit(1);
    }
    console.log(`\n  ⚡ BLACK X API listening on http://0.0.0.0:${PORT}\n`);
  });
}

export default app;
