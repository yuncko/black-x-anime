/**
 * Accounts for the BLACK X APK (and the shared website/APK account mirror in
 * Firestore `settings/user_*` + `settings/email_*`).
 *
 * Passwords: new and migrated accounts keep a bcrypt hash in `passBcrypt`. Old
 * documents only had an unsalted SHA-256 in `passSha256`; it is accepted once and
 * replaced on the next successful sign-in. `passSha256` then holds a sentinel that
 * can never equal a SHA-256 hex digest: APK builds <= 15.1 compare that field on
 * the phone and treated an EMPTY value as "any password works", so it must never
 * be left empty.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { deriveAuthSecret, isAuthConfigured, DEVELOPER_EMAIL } from '../auth.js';

export const PASS_SENTINEL_BCRYPT = 'bcrypt-v1';
export const PASS_SENTINEL_GOOGLE = 'google-oauth-only';
// passSha256 of a deleted account: APK builds <= 15.1 accepted ANY password for an empty field.
export const PASS_SENTINEL_DELETED = 'account-deleted';
export const USERNAME_RE = /^[a-z0-9_.-]{3,24}$/;
export const RESERVED_USERNAMES = new Set([
  'developer', 'admin', 'administrator', 'mz0970mmz', 'blackx', 'black_x', 'black-x',
  'support', 'root', 'system', 'moderator', 'official', 'staff'
]);
const TOKEN_TYPE = 'bx-apk';
const TOKEN_TTL = '60d';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isDeveloperIdentity(data) {
  return normalizeEmail(data?.email) === DEVELOPER_EMAIL;
}

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

export async function hashPasswordAsync(password) {
  return bcrypt.hash(String(password), 10);
}

/**
 * Checks a password against a mirror document.
 * Returns { ok, legacy } — legacy=true when it matched the old SHA-256 field
 * (the caller must then store a bcrypt hash and the sentinel).
 */
export async function verifyCloudPassword(data, password) {
  if (!data || typeof password !== 'string' || !password) return { ok: false, legacy: false };
  const bcryptHash = String(data.passBcrypt || '');
  if (/^\$2[aby]\$\d{2}\$/.test(bcryptHash)) {
    try {
      return { ok: await bcrypt.compare(password, bcryptHash), legacy: false };
    } catch {
      return { ok: false, legacy: false };
    }
  }
  const legacy = String(data.passSha256 || '').toLowerCase();
  if (/^[a-f0-9]{64}$/.test(legacy)) {
    const a = Buffer.from(sha256Hex(password), 'hex');
    const b = Buffer.from(legacy, 'hex');
    return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), legacy: true };
  }
  return { ok: false, legacy: false };
}

/** A deleted account's document (see accountTombstone). */
export function isDeletedAccount(data) {
  return Boolean(data && typeof data === 'object' && data.deleted === true);
}

/**
 * What an account document holds after deletion when it cannot be removed (phase-1 rules refuse
 * deletes made with the public key): no name, e-mail, password, lists, positions or VIP — only
 * the fact and the time, and a password sentinel that keeps old APKs out.
 */
export function accountTombstone(now = new Date().toISOString()) {
  return { deleted: true, deletedAt: now, passSha256: PASS_SENTINEL_DELETED, updatedAt: now };
}

/** VIP tier after expiry: 'vip_monarch' | 'vip_basic' | 'free'. */
export function effectiveVipTier(data, now = Date.now()) {
  if (!data) return 'free';
  if (isDeveloperIdentity(data)) return 'vip_monarch';
  const tier = data.vipTier === 'vip_monarch' || data.vipTier === 'vip_basic' ? data.vipTier : 'free';
  if (tier === 'free') return 'free';
  if (data.vipExpiresAt) {
    const exp = new Date(data.vipExpiresAt).getTime();
    if (Number.isFinite(exp) && exp < now) return 'free';
  }
  return tier;
}

export function vipLabel(tier) {
  return tier === 'vip_monarch' ? 'VIP Monarch' : tier === 'vip_basic' ? 'VIP Basic' : 'Free Tier';
}

/** The account as the APK may see it: never includes password material. */
export function publicAccount(data, { includeEmail = true } = {}) {
  if (!data) return null;
  const isDev = isDeveloperIdentity(data);
  const tier = effectiveVipTier(data);
  return {
    id: String(data.id || ''),
    username: String(data.username || ''),
    email: includeEmail ? String(data.email || '') : '',
    displayName: String(data.displayName || data.username || ''),
    photoUrl: String(data.photoUrl || data.photoURL || ''),
    avatarColor: String(data.avatarColor || '#ffffff'),
    bio: String(data.bio || ''),
    role: isDev ? 'developer' : 'user',
    isDeveloper: isDev,
    vipTier: tier,
    vipStatus: vipLabel(tier),
    vipExpiresAt: tier !== 'free' && data.vipExpiresAt ? String(data.vipExpiresAt) : null,
    isGoogleAccount: Boolean(data.isGoogleAccount),
    createdAt: data.createdAt || null
  };
}

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value == null ? undefined : String(value).slice(0, max));

function sanitizeTitleItem(item) {
  if (!item || typeof item !== 'object') return null;
  const key = clip(item.objectID || item.slug, 160);
  if (!key) return null;
  const out = {
    objectID: clip(item.objectID, 160),
    slug: clip(item.slug, 200),
    titleEn: clip(item.titleEn, 200),
    titleAr: clip(item.titleAr, 200),
    titleRomaji: clip(item.titleRomaji, 200),
    poster: clip(item.poster, 700),
    banner: clip(item.banner, 700),
    rating: clip(item.rating, 8),
    type: clip(item.type, 40),
    year: clip(item.year, 10),
    state: clip(item.state, 40),
    storyAr: clip(item.storyAr, 500),
    storyEn: clip(item.storyEn, 500),
    malId: item.malId == null ? undefined : clip(item.malId, 20),
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 8).map((t) => clip(t, 40)).filter(Boolean) : undefined,
    episode: Number.isFinite(Number(item.episode)) ? Number(item.episode) : undefined,
    docId: clip(item.docId, 60),
    position: Number.isFinite(Number(item.position)) ? Math.max(0, Math.round(Number(item.position))) : undefined,
    duration: Number.isFinite(Number(item.duration)) ? Math.max(0, Math.round(Number(item.duration))) : undefined,
    updatedAt: clip(item.updatedAt, 40),
    addedAt: clip(item.addedAt, 40)
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === '') delete out[k];
  return out;
}

function sanitizeList(list, max) {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const item = sanitizeTitleItem(raw);
    if (!item) continue;
    const key = item.objectID || item.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** positions: { "<slug>:<episode>": { sec, dur, at } } — newest 80 kept. */
export function sanitizePositions(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const entries = [];
  for (const [rawKey, value] of Object.entries(map)) {
    const key = String(rawKey).slice(0, 220);
    if (!key || !value || typeof value !== 'object') continue;
    const sec = Math.max(0, Math.round(Number(value.sec) || 0));
    const dur = Math.max(0, Math.round(Number(value.dur) || 0));
    const at = Number(value.at) || 0;
    if (!at) continue;
    entries.push([key, { sec, dur, at }]);
  }
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, 80));
}

export function mergePositions(serverMap, clientMap) {
  const merged = { ...(serverMap || {}) };
  for (const [key, value] of Object.entries(clientMap || {})) {
    if (!merged[key] || (Number(value.at) || 0) >= (Number(merged[key].at) || 0)) merged[key] = value;
  }
  return sanitizePositions(merged) || {};
}

export function sanitizeStateInput(body) {
  const out = {};
  const favorites = sanitizeList(body?.favorites, 200);
  if (favorites) out.favorites = favorites;
  const progress = sanitizeList(body?.progress, 120);
  if (progress) out.progress = progress;
  const positions = sanitizePositions(body?.positions);
  if (positions) out.positions = positions;
  if (Number.isFinite(Number(body?.xp))) out.xp = Math.max(0, Math.min(10_000_000, Math.round(Number(body.xp))));
  return out;
}

/** What the APK syncs back: lists + positions + xp (never VIP or password fields). */
export function accountState(data) {
  return {
    favorites: Array.isArray(data?.favorites) ? data.favorites : [],
    progress: Array.isArray(data?.progress) ? data.progress : [],
    positions: data?.positions && typeof data.positions === 'object' ? data.positions : {},
    xp: Number(data?.xp) || 0
  };
}

function tokenSecret() {
  return deriveAuthSecret('apk-session-v1');
}

export function signApkToken({ key, username, email, dev = false }) {
  if (!isAuthConfigured()) throw new Error('auth_unavailable');
  return jwt.sign({ typ: TOKEN_TYPE, key, u: username, e: email || '', dev: Boolean(dev) }, tokenSecret(), {
    expiresIn: TOKEN_TTL
  });
}

export function verifyApkToken(token) {
  if (!isAuthConfigured() || typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  try {
    const claims = jwt.verify(token, tokenSecret(), { algorithms: ['HS256'] });
    if (claims?.typ !== TOKEN_TYPE || typeof claims.key !== 'string') return null;
    return claims;
  } catch {
    return null;
  }
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

/** VIP code like BX-MON-7K2Q-9XQF (no ambiguous characters). */
export function generateVipCode(tier, prefix = '') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let body = '';
  for (let i = 0; i < 8; i += 1) body += alphabet[bytes[i] % alphabet.length];
  const head = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BX';
  const t = tier === 'vip_monarch' ? 'MON' : 'VIP';
  return `${head}-${t}-${body.slice(0, 4)}-${body.slice(4)}`;
}
