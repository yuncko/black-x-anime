import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const DEFAULT_DEV_JWT_SECRET = 'black-x-dev-secret-change-in-production';
const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
const isProductionRuntime = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
const authSecretIsValid =
  configuredJwtSecret.length >= 32 && configuredJwtSecret !== DEFAULT_DEV_JWT_SECRET;
const authDisabledByConfiguration = isProductionRuntime && !authSecretIsValid;
if (authDisabledByConfiguration) {
  // Keep public catalog/streaming APIs available when Vercel is missing its
  // JWT secret. Never fall back to the development key in production.
  console.error('[auth] JWT_SECRET is missing or invalid; authentication is disabled until configured.');
}
const JWT_SECRET = configuredJwtSecret || DEFAULT_DEV_JWT_SECRET;

export function isAuthConfigured() {
  return !authDisabledByConfiguration;
}

/**
 * Secret for a separate token family (e.g. APK sessions), derived from JWT_SECRET
 * so tokens of one family can never be replayed against the other.
 */
export function deriveAuthSecret(label) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`blackx:${String(label)}`).digest('hex');
}

export function requireJwtSecret(_req, res, next) {
  if (authDisabledByConfiguration) {
    return res.status(503).json({
      error: 'auth_unavailable',
      message: 'Authentication is temporarily unavailable; the server owner must configure JWT_SECRET.'
    });
  }
  return next();
}
const COOKIE_NAME = 'blackx_token';
export const DEVELOPER_EMAIL = 'mz0970mmz@gmail.com';
const FIREBASE_PROJECT_ID = 'spry-oxide-1h7sp';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let firebaseCertCache = null;
let firebaseCertCacheUntil = 0;

async function getFirebaseSigningCerts() {
  if (firebaseCertCache && firebaseCertCacheUntil > Date.now()) return firebaseCertCache;
  const response = await fetch(FIREBASE_CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Firebase signing-certificate lookup failed (${response.status}).`);
  const certs = await response.json();
  if (!certs || typeof certs !== 'object') throw new Error('Firebase signing-certificate response was invalid.');
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebaseCertCache = certs;
  firebaseCertCacheUntil = Date.now() + Math.max(60, Math.min(maxAge, 86400)) * 1000;
  return certs;
}

/** Verify a Firebase-issued Google ID token before trusting its email or UID. */
export async function verifyFirebaseGoogleIdToken(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 12000) return null;
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || decoded.header?.alg !== 'RS256' || typeof decoded.header?.kid !== 'string') return null;
  const certs = await getFirebaseSigningCerts();
  const cert = certs[decoded.header.kid];
  if (!cert) return null;

  let claims;
  try {
    claims = jwt.verify(idToken, cert, {
      algorithms: ['RS256'],
      audience: FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      clockTolerance: 5
    });
  } catch {
    return null;
  }

  const uid = String(claims.sub || '');
  const email = String(claims.email || '').trim().toLowerCase();
  if (
    !uid || uid.length > 128 ||
    !email || claims.email_verified !== true ||
    claims.firebase?.sign_in_provider !== 'google.com'
  ) return null;

  return { uid, email, displayName: String(claims.name || ''), photoURL: String(claims.picture || '') };
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  // Google-only accounts carry a non-bcrypt sentinel; never compare it as a password hash.
  if (!/^\$2[aby]\$/.test(String(hash || ''))) return false;
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function signToken(user) {
  if (authDisabledByConfiguration) {
    throw new Error('auth_unavailable: configure JWT_SECRET before issuing tokens.');
  }
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    sameSite: 'none',
    secure: true
  });
}

export function publicUser(row) {
  if (!row) return null;
  const isDev = row.role === 'developer';
  let badges = [];
  try {
    badges = typeof row.badges === 'string' ? JSON.parse(row.badges || '[]') : (row.badges || []);
    if (!Array.isArray(badges)) badges = [];
  } catch {
    badges = [];
  }

  // Check VIP tier & expiration
  let vipTier =
    row.vip_tier ||
    (row.vip_status === 'VIP Monarch'
      ? 'vip_monarch'
      : row.vip_status === 'VIP Basic'
      ? 'vip_basic'
      : 'free');
  const vipExpiresAt = row.vip_expires_at || null;
  if (vipTier !== 'free' && vipExpiresAt) {
    const expTime = new Date(vipExpiresAt).getTime();
    if (!Number.isNaN(expTime) && expTime < Date.now()) {
      vipTier = 'free';
    }
  }

  // Developer account gets vip_monarch, gold_vip & blue_verified by default
  if (isDev) {
    vipTier = 'vip_monarch';
    if (!badges.includes('blue_verified')) badges.unshift('blue_verified');
    if (!badges.includes('gold_vip')) badges.unshift('gold_vip');
  } else if (vipTier === 'vip_basic' || vipTier === 'vip_monarch') {
    if (!badges.includes('gold_vip')) badges.unshift('gold_vip');
  }

  const effectiveVip =
    isDev || vipTier === 'vip_monarch'
      ? 'VIP Monarch'
      : vipTier === 'vip_basic'
      ? 'VIP Basic'
      : row.vip_status || null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    photoUrl: row.photo_url || '',
    photoURL: row.photo_url || '',
    bio: row.bio,
    role: isDev ? 'developer' : row.role,
    isDeveloper: isDev,
    vipTier,
    vipStatus: effectiveVip,
    vip_status: effectiveVip,
    vipExpiresAt,
    badges,
    createdAt: row.created_at
  };
}

function userFromRequest(req) {
  // Do not accept tokens signed with the development fallback in production.
  if (authDisabledByConfiguration) return null;
  const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * The verified claims ({ id, username, role }) of the website session token, without looking the
 * user up in SQLite. On Vercel SQLite is per-instance /tmp, so a valid token can reach an instance
 * that never saw the user; callers that only need "who is this" (rankings votes) use this.
 */
export function sessionClaimsFromRequest(req) {
  if (authDisabledByConfiguration) return null;
  const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload && typeof payload === 'object' && payload.id ? payload : null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

export function requireAuth(req, res, next) {
  if (authDisabledByConfiguration) {
    return res.status(503).json({
      error: 'auth_unavailable',
      message: 'Authentication is temporarily unavailable; the server owner must configure JWT_SECRET.'
    });
  }
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Authentication required' });
  req.user = user;
  next();
}

export function requireDeveloper(req, res, next) {
  if (authDisabledByConfiguration) {
    return res.status(503).json({
      error: 'auth_unavailable',
      message: 'Authentication is temporarily unavailable; the server owner must configure JWT_SECRET.'
    });
  }
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Authentication required' });
  const isDev = user.role === 'developer';
  if (!isDev) return res.status(403).json({ error: 'forbidden', message: 'Developer access required' });
  req.user = user;
  next();
}
