import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.VERCEL ? '/tmp/blackx-data' : join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
} catch (err) {
  console.warn('[db] could not create data directory:', err?.message || err);
}

let dbInstance;
try {
  const Database = (await import('better-sqlite3')).default;
  dbInstance = new Database(join(dataDir, 'blackx.db'));
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
} catch (err) {
  // Vercel's Node runtime may expose the built-in SQLite driver. Keep the
  // same file-backed store; never silently fall back to an empty in-memory DB.
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const sqliteDb = new DatabaseSync(join(dataDir, 'blackx.db'));
    const invoke = (statement, method, args) => {
      const params = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])
        ? [args[0]]
        : args;
      return statement[method](...params);
    };
    dbInstance = {
      pragma: (value) => sqliteDb.exec(`PRAGMA ${value}`),
      exec: (sql) => sqliteDb.exec(sql),
      prepare: (sql) => {
        const statement = sqliteDb.prepare(sql);
        return {
          get: (...args) => invoke(statement, 'get', args),
          all: (...args) => invoke(statement, 'all', args) || [],
          run: (...args) => invoke(statement, 'run', args)
        };
      },
      transaction: (fn) => (...args) => {
        sqliteDb.exec('BEGIN');
        try {
          const result = fn(...args);
          if (result && typeof result.then === 'function') {
            throw new TypeError('SQLite transactions must be synchronous');
          }
          sqliteDb.exec('COMMIT');
          return result;
        } catch (error) {
          sqliteDb.exec('ROLLBACK');
          throw error;
        }
      }
    };
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  } catch (fallbackError) {
    console.error('[db] SQLite initialization failed:', err?.message || err);
    throw new Error('BLACK X requires a working SQLite driver.', { cause: fallbackError });
  }
}

export const db = dbInstance;

db.exec(`
-- ===== legacy prediction-engine tables (removed in streaming refactor) =====
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS predictions;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#22d3ee',
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== library: favorites (watchlist) =====
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title_en TEXT,
  title_ar TEXT,
  poster TEXT,
  banner TEXT,
  episodes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug)
);

-- ===== library: per-episode progress (continue watching) =====
CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  episode INTEGER NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  title_en TEXT,
  title_ar TEXT,
  poster TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug, episode)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- ===== community ratings & scores =====
CREATE TABLE IF NOT EXISTS community_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  user_id INTEGER,
  score REAL NOT NULL,
  review TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anime_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_anime ON community_ratings(anime_id);

-- ===== generic API cache (AniList + witanime responses) =====
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ===== resolved streaming sources cache (per episode) =====
CREATE TABLE IF NOT EXISTS stream_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ===== AniList metadata cache (discovery/trending) =====
CREATE TABLE IF NOT EXISTS anime_cache (
  id INTEGER PRIMARY KEY,
  title_romaji TEXT,
  title_english TEXT,
  title_arabic TEXT,
  description TEXT,
  cover_url TEXT,
  banner_url TEXT,
  color TEXT,
  genres TEXT,
  episodes INTEGER,
  status TEXT,
  format TEXT,
  season TEXT,
  season_year INTEGER,
  score INTEGER,
  popularity INTEGER,
  next_episode INTEGER,
  next_airing_at INTEGER,
  trending INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== site settings & diagnostics logs =====
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'system',
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== community posts, reactions & comments (Facebook-like) =====
CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL DEFAULT 'dev-mz',
  author_name TEXT NOT NULL,
  author_username TEXT DEFAULT '',
  author_avatar TEXT DEFAULT '',
  author_role TEXT DEFAULT 'user',
  tag TEXT DEFAULT 'general',
  tag_name TEXT DEFAULT 'عام',
  content TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  voice_url TEXT DEFAULT '',
  voice_duration INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_posts_pinned ON community_posts(is_pinned, created_at DESC);

CREATE TABLE IF NOT EXISTS community_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT DEFAULT '',
  author_role TEXT DEFAULT 'user',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_comments_post ON community_comments(post_id, created_at ASC);

-- ===== VIP subscription codes & plans generator =====
CREATE TABLE IF NOT EXISTS vip_subscription_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  price_egp INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'developer',
  is_used INTEGER NOT NULL DEFAULT 0,
  used_by_user_id INTEGER,
  used_by_username TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vip_codes_code ON vip_subscription_codes(code);
`);

// Safe column migrations
try {
  db.exec("ALTER TABLE users ADD COLUMN photo_url TEXT DEFAULT ''");
} catch {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN badges TEXT DEFAULT '[]'");
} catch {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN vip_tier TEXT DEFAULT 'free'");
} catch {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN vip_status TEXT DEFAULT NULL");
} catch {
  /* column already exists */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN vip_expires_at TEXT DEFAULT NULL");
} catch {
  /* column already exists */
}

// Do not preserve legacy developer promotions created by the former password/email flow.
// The only way to regain developer privileges is a freshly verified Firebase Google token.
try {
  db.prepare("UPDATE users SET role = 'user' WHERE LOWER(role) = 'developer'").run();
} catch (err) {
  console.error('[db] could not clear legacy developer roles:', err?.message || err);
}

// ===== VIP Subscription Codes table (generated by Developer, redeemed by Users) =====
db.exec(`
CREATE TABLE IF NOT EXISTS vip_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'vip_basic',
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  price_egp INTEGER NOT NULL DEFAULT 99,
  note TEXT DEFAULT '',
  created_by TEXT DEFAULT 'developer',
  redeemed_by TEXT DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vip_codes_v2_code ON vip_codes(code);
`);

// Default footer settings
try {
  db.prepare(`
    INSERT OR IGNORE INTO site_settings (key, value) 
    VALUES ('footer_tagline', 'Stream every episode. Track your shows. Own the night.')
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO site_settings (key, value) 
    VALUES ('footer_notice', 'BLACK X — The ultimate interactive anime experience.')
  `).run();
} catch (err) {
  console.warn('Settings init note:', err.message);
}

// Ensure community_posts has voice columns
try {
  db.prepare("ALTER TABLE community_posts ADD COLUMN voice_url TEXT DEFAULT ''").run();
} catch {}
try {
  db.prepare("ALTER TABLE community_posts ADD COLUMN voice_duration INTEGER DEFAULT 0").run();
} catch {}

// Initial seed for community if empty
try {
  const postCount = db.prepare('SELECT COUNT(*) AS c FROM community_posts').get()?.c || 0;
  if (postCount === 0) {
    const welcome = db.prepare(`
      INSERT INTO community_posts (uid, author_name, author_username, author_avatar, author_role, tag, tag_name, content, is_pinned, likes_count, comments_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      'mz0970mmz@gmail.com',
      'Developer MZ',
      'developer',
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80',
      'developer',
      'announcement',
      '👑 إعلان المطور',
      'مرحباً بكم جميعاً في مجتمع BLACK X الرسمي! 🖤✨\n\nهنا مساحتكم الخاصة كعشاق ومتابعي الأنمي لمشاركة الآراء، النقاشات حول الحلقات الأسبوعية، النظريات، المراجعات، والتوصيات.\n\nيسعدنا تفاعلكم ومشاركاتكم، واستمتعوا بتجربة المشاهدة والتواصل!',
      1,
      7,
      1
    );

    const postId = welcome.lastInsertRowid;
    db.prepare(`
      INSERT INTO community_comments (post_id, user_id, author_name, author_avatar, author_role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      postId,
      'dev-team',
      'فريق الدعم',
      '',
      'developer',
      'أهلاً بكم في مجتمعنا الجديد! يسعدنا انضمام الجميع 🚀'
    );
  }
} catch (err) {
  console.warn('Community seed note:', err.message);
}

/* ---------------- settings & logs helpers ---------------- */
export function getSetting(key, defaultValue = '') {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

export function logSystemEvent(level, category, message, details = null) {
  try {
    db.prepare(`
      INSERT INTO system_logs (level, category, message, details)
      VALUES (?, ?, ?, ?)
    `).run(level, category, message, details ? JSON.stringify(details) : null);
  } catch (err) {
    console.error('Failed to log system event:', err.message);
  }
}

/* ---------------- cache helpers ---------------- */
function cacheGet(table, key, { allowExpired = false } = {}) {
  const row = db.prepare(`SELECT value, expires_at FROM ${table} WHERE key = ?`).get(key);
  if (!row) return null;
  if (!allowExpired && row.expires_at < Date.now()) {
    db.prepare(`DELETE FROM ${table} WHERE key = ?`).run(key);
    return null;
  }
  try { return JSON.parse(row.value); } catch { return null; }
}

function cacheSet(table, key, value, ttlMs = 30 * 60 * 1000) {
  db.prepare(
    `INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
  ).run(key, JSON.stringify(value), Date.now() + ttlMs);
}

export const apiGet = (key) => cacheGet('api_cache', key);
// Used only for stale-while-error fallback; regular reads still enforce expiry.
export const apiGetStale = (key) => cacheGet('api_cache', key, { allowExpired: true });
export const apiSet = (key, value, ttl) => cacheSet('api_cache', key, value, ttl);
export const streamGet = (key) => cacheGet('stream_cache', key);
export const streamSet = (key, value, ttl) => cacheSet('stream_cache', key, value, ttl);

/* ---------------- anime_cache upsert (AniList discovery) ---------------- */
export function upsertAnime(media) {
  if (!media || !media.id) return;
  db.prepare(`
    INSERT INTO anime_cache
      (id, title_romaji, title_english, title_arabic, description, cover_url, banner_url, color,
       genres, episodes, status, format, season, season_year, score, popularity,
       next_episode, next_airing_at, trending, raw, cached_at)
    VALUES
      (@id, @title_romaji, @title_english, @title_arabic, @description, @cover_url, @banner_url, @color,
       @genres, @episodes, @status, @format, @season, @season_year, @score, @popularity,
       @next_episode, @next_airing_at, @trending, @raw, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title_romaji = excluded.title_romaji,
      title_english = excluded.title_english,
      title_arabic = COALESCE(excluded.title_arabic, anime_cache.title_arabic),
      description = excluded.description,
      cover_url = excluded.cover_url,
      banner_url = excluded.banner_url,
      color = excluded.color,
      genres = excluded.genres,
      episodes = excluded.episodes,
      status = excluded.status,
      format = excluded.format,
      season = excluded.season,
      season_year = excluded.season_year,
      score = excluded.score,
      popularity = excluded.popularity,
      next_episode = excluded.next_episode,
      next_airing_at = excluded.next_airing_at,
      trending = excluded.trending,
      raw = excluded.raw,
      cached_at = datetime('now')
  `).run({
    id: media.id,
    title_romaji: media.title_romaji ?? media.titleRomaji ?? null,
    title_english: media.title_english ?? media.titleEnglish ?? null,
    title_arabic: media.title_arabic ?? media.titleArabic ?? null,
    description: media.description ?? null,
    cover_url: media.cover_url ?? media.coverUrl ?? null,
    banner_url: media.banner_url ?? media.bannerUrl ?? null,
    color: media.color || '#8b5cf6',
    genres: JSON.stringify(media.genres || []),
    episodes: media.episodes ?? null,
    status: media.status ?? null,
    format: media.format ?? null,
    season: media.season ?? null,
    season_year: media.season_year ?? media.seasonYear ?? null,
    score: media.score ?? null,
    popularity: media.popularity ?? null,
    next_episode: media.next_episode ?? media.nextEpisode ?? null,
    next_airing_at: media.next_airing_at ?? media.nextAiringAt ?? null,
    trending: media.trending ? 1 : 0,
    raw: media.raw ? JSON.stringify(media.raw) : null
  });
}

export function getAnimeRow(id) {
  return db.prepare('SELECT * FROM anime_cache WHERE id = ?').get(id);
}

export function parseAnimeRow(row) {
  if (!row) return null;
  let genres = [];
  try { genres = JSON.parse(row.genres || '[]'); } catch { /* noop */ }
  return {
    id: row.id,
    titleRomaji: row.title_romaji,
    titleEnglish: row.title_english,
    titleArabic: row.title_arabic,
    description: row.description,
    coverUrl: row.cover_url,
    bannerUrl: row.banner_url,
    color: row.color,
    genres,
    episodes: row.episodes,
    status: row.status,
    format: row.format,
    season: row.season,
    seasonYear: row.season_year,
    score: row.score,
    popularity: row.popularity,
    nextEpisode: row.next_episode,
    nextAiringAt: row.next_airing_at
  };
}

// Rankings votes moved to Firestore on 2026-10-17 (services/rankingVotes.js); the old
// community_ratings table above is no longer read or written.
