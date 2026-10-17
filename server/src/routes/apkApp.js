/**
 * /api/app/* — server API for the BLACK X APK (v16+).
 *
 * Everything that used to be read or written straight from the phone into the
 * public Firestore `settings` collection goes through here: app config (VIP
 * enforcement, broadcast, pinned pick, latest APK), accounts (password, Google),
 * account state sync, profile, VIP code redemption, requests to the developer
 * and the developer tools. The phone never receives VIP codes, password hashes
 * or other users' e-mails any more, and every shared-document write is a
 * read-modify-write with a precondition instead of a blind overwrite.
 */
import { Router } from 'express';
import { APK_RELEASE } from '../../../shared/apkRelease.js';
import {
  readSettingsDoc,
  writeSettingsDoc,
  updateSettingsDoc,
  cleanDocKey,
  SettingsStoreError
} from '../services/settingsStore.js';
import {
  PASS_SENTINEL_BCRYPT,
  PASS_SENTINEL_GOOGLE,
  USERNAME_RE,
  RESERVED_USERNAMES,
  normalizeUsername,
  normalizeEmail,
  isValidEmail,
  isDeveloperIdentity,
  hashPasswordAsync,
  verifyCloudPassword,
  effectiveVipTier,
  vipLabel,
  publicAccount,
  sanitizeStateInput,
  mergePositions,
  accountState,
  signApkToken,
  verifyApkToken,
  randomId,
  generateVipCode
} from '../services/apkAccounts.js';
import { verifyFirebaseGoogleIdToken, DEVELOPER_EMAIL, isAuthConfigured } from '../auth.js';
import { getSkipTimes } from '../services/aniskip.js';
import { readErrorLog } from '../services/errorLog.js';

const router = Router();
export const GLOBAL_DOC_ID = 'global_vip_system';
const nowIso = () => new Date().toISOString();
// Drops control characters (keeps tab/newline) and trims to `max` characters.
const stripControl = (text) =>
  Array.from(text).filter((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 32 || c === 9 || c === 10 || c === 13;
  }).join('');
const clip = (value, max) => stripControl(String(value ?? '')).trim().slice(0, max);

// ---------------------------------------------------------------- rate limits
const buckets = new Map();
export function isRateLimited(key, max, windowMs, now = Date.now()) {
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(key, list);
    return true;
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > 3600_000) buckets.delete(k);
      if (buckets.size <= 4000) break;
    }
  }
  return false;
}
export function __resetRateLimitsForTests() {
  buckets.clear();
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
const tooMany = (res) => res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again later.' });

function sendFailure(res, err, where) {
  if (err instanceof SettingsStoreError) {
    console.warn(`[apkApp:${where}]`, err.message);
    return res.status(503).json({ error: 'cloud_unavailable', message: 'The account service is temporarily unavailable.' });
  }
  console.error(`[apkApp:${where}]`, err?.message || err);
  return res.status(500).json({ error: 'server_error' });
}

const bearerToken = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

// ---------------------------------------------------------------- account docs
function identityFields(data) {
  return {
    username: normalizeUsername(data.username),
    email: normalizeEmail(data.email),
    updatedAt: data.updatedAt || nowIso()
  };
}

/** Document ids an account is stored under: [primary, ...mirrors]. */
export function accountKeys(data) {
  const userKey = data?.username ? cleanDocKey('user', normalizeUsername(data.username)) : null;
  const emailKey = data?.email && isValidEmail(data.email) && !/@blackx\.app$/i.test(data.email)
    ? cleanDocKey('email', normalizeEmail(data.email))
    : null;
  const keys = data?.isGoogleAccount ? [emailKey, userKey] : [userKey, emailKey];
  return [...new Set(keys.filter(Boolean))];
}

async function writeMirrors(data, primaryKey) {
  for (const key of accountKeys(data)) {
    if (key === primaryKey) continue;
    try {
      const current = await readSettingsDoc(key);
      // Never overwrite a different person's document that happens to share a key.
      if (current.exists && current.data) {
        const sameUser =
          (current.data.username && normalizeUsername(current.data.username) === normalizeUsername(data.username)) ||
          (current.data.email && normalizeEmail(current.data.email) === normalizeEmail(data.email));
        if (!sameUser) continue;
      }
      await writeSettingsDoc(key, data, { extraFields: identityFields(data), rawFields: current.rawFields });
    } catch (err) {
      console.warn('[apkApp:mirror]', key, err?.message || err);
    }
  }
}

/** Read-modify-write of the account (primary doc) + mirror copy. */
async function updateAccount(primaryKey, mutate) {
  const result = await updateSettingsDoc(primaryKey, (current) => {
    if (!current) return undefined;
    const next = mutate({ ...current });
    if (next === undefined) return undefined;
    return { ...next, updatedAt: nowIso() };
  }, { extraFields: identityFields });
  if (result.written) await writeMirrors(result.data, primaryKey);
  return result;
}

function sessionPayload(data, key) {
  const dev = isDeveloperIdentity(data);
  return {
    token: signApkToken({ key, username: data.username, email: data.email, dev }),
    user: publicAccount(data),
    state: accountState(data)
  };
}

async function requireApkUser(req, res, next) {
  if (!isAuthConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
  const claims = verifyApkToken(bearerToken(req));
  if (!claims) return res.status(401).json({ error: 'auth_required' });
  try {
    const doc = await readSettingsDoc(claims.key);
    const data = doc.exists ? doc.data : null;
    const sameUser = data && (
      (claims.u && normalizeUsername(data.username) === normalizeUsername(claims.u)) ||
      (!claims.u && claims.e && normalizeEmail(data.email) === normalizeEmail(claims.e))
    );
    if (!sameUser) return res.status(401).json({ error: 'account_missing' });
    req.apk = { claims, key: claims.key, data };
    return next();
  } catch (err) {
    return sendFailure(res, err, 'session');
  }
}

/**
 * APK session, or (website) a Firebase ID token of a Google account whose mirror
 * document already exists (created by the website server on Google sign-in).
 */
async function requireAccount(req, res, next) {
  const token = bearerToken(req);
  if (verifyApkToken(token)) return requireApkUser(req, res, next);
  if (token.length <= 100) return res.status(401).json({ error: 'auth_required' });
  let identity;
  try {
    identity = await verifyFirebaseGoogleIdToken(token);
  } catch (err) {
    console.warn('[apkApp:account]', err?.message || err);
    return res.status(503).json({ error: 'auth_verification_unavailable' });
  }
  if (!identity) return res.status(401).json({ error: 'auth_required' });
  try {
    const key = cleanDocKey('email', identity.email);
    const doc = await readSettingsDoc(key);
    if (!doc.exists || !doc.data) return res.status(404).json({ error: 'account_not_synced' });
    req.apk = { claims: { key, u: doc.data.username, e: identity.email }, key, data: doc.data };
    return next();
  } catch (err) {
    return sendFailure(res, err, 'account');
  }
}

async function optionalApkUser(req) {
  const claims = verifyApkToken(bearerToken(req));
  if (!claims) return null;
  try {
    const doc = await readSettingsDoc(claims.key);
    return doc.exists && doc.data ? { claims, key: claims.key, data: doc.data } : null;
  } catch {
    return null;
  }
}

// Developer: an APK session from verified Google sign-in with the developer
// e-mail, or (website) a Firebase ID token for that e-mail.
async function requireDeveloper(req, res, next) {
  const token = bearerToken(req);
  const claims = verifyApkToken(token);
  if (claims) {
    if (claims.dev && normalizeEmail(claims.e) === DEVELOPER_EMAIL) {
      req.developer = { via: 'apk', email: DEVELOPER_EMAIL };
      return next();
    }
    return res.status(403).json({ error: 'forbidden' });
  }
  if (token.length > 100) {
    try {
      const identity = await verifyFirebaseGoogleIdToken(token);
      if (identity?.email === DEVELOPER_EMAIL) {
        req.developer = { via: 'firebase', email: DEVELOPER_EMAIL };
        return next();
      }
      if (identity) return res.status(403).json({ error: 'forbidden' });
    } catch (err) {
      console.warn('[apkApp:developer]', err?.message || err);
      return res.status(503).json({ error: 'auth_verification_unavailable' });
    }
  }
  return res.status(401).json({ error: 'auth_required' });
}

// ---------------------------------------------------------------- global doc
function sanitizePinned(pin) {
  if (!pin || typeof pin !== 'object') return null;
  const objectID = clip(pin.objectID, 160);
  const titleEn = clip(pin.titleEn || pin.title, 200);
  if (!objectID && !titleEn) return null;
  return {
    objectID,
    slug: clip(pin.slug, 200),
    titleEn,
    titleAr: clip(pin.titleAr, 200),
    poster: clip(pin.poster, 700),
    banner: clip(pin.banner, 700),
    rating: clip(pin.rating, 8),
    type: clip(pin.type, 40),
    state: clip(pin.state, 40),
    storyAr: clip(pin.storyAr, 500),
    devNote: clip(pin.devNote, 300),
    pinnedAt: clip(pin.pinnedAt, 40) || nowIso()
  };
}

function sanitizeRequest(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    id: clip(r.id, 60) || randomId('req'),
    type: ['anime', 'manga', 'issue'].includes(r.type) ? r.type : 'anime',
    text: clip(r.text, 400),
    author: clip(r.author, 80),
    username: clip(r.username, 40),
    createdAt: clip(r.createdAt, 40)
  };
}

function normalizeGlobal(current) {
  const g = current && typeof current === 'object' ? { ...current } : {};
  g.enforced = typeof g.enforced === 'boolean' ? g.enforced : true;
  g.codes = Array.isArray(g.codes) ? g.codes : [];
  g.broadcastMsg = typeof g.broadcastMsg === 'string' ? g.broadcastMsg : '';
  g.pinnedRec = sanitizePinned(g.pinnedRec);
  // Requests used to carry the sender's e-mail in a publicly readable document.
  g.userRequests = (Array.isArray(g.userRequests) ? g.userRequests : []).map(sanitizeRequest).filter((r) => r && r.text);
  return g;
}

async function mutateGlobal(mutator, updatedBy) {
  const result = await updateSettingsDoc(GLOBAL_DOC_ID, (current) => {
    const next = mutator(normalizeGlobal(current));
    if (next === undefined) return undefined;
    return { ...next, updatedAt: nowIso(), updatedBy: updatedBy || 'server' };
  }, { extraFields: (doc) => ({ enforced: doc.enforced !== false, updatedAt: doc.updatedAt }) });
  configCache = { at: 0, value: null };
  return result;
}

let configCache = { at: 0, value: null };
export function __resetConfigCacheForTests() {
  configCache = { at: 0, value: null };
}

export function buildPublicConfig(doc) {
  if (!doc?.exists) return { enforced: true, broadcastMsg: '', pinnedRec: null };
  const d = doc.data || {};
  const enforced = typeof d.enforced === 'boolean' ? d.enforced : typeof doc.fields?.enforced === 'boolean' ? doc.fields.enforced : true;
  return { enforced, broadcastMsg: clip(d.broadcastMsg, 500), pinnedRec: sanitizePinned(d.pinnedRec) };
}

// ---------------------------------------------------------------- public
router.get('/config', async (_req, res) => {
  try {
    if (!configCache.value || Date.now() - configCache.at > 20_000) {
      configCache = { at: Date.now(), value: buildPublicConfig(await readSettingsDoc(GLOBAL_DOC_ID)) };
    }
    res.json({ ...configCache.value, apk: APK_RELEASE, serverTime: nowIso() });
  } catch (err) {
    console.warn('[apkApp:config]', err?.message || err);
    res.status(503).json({ error: 'cloud_unavailable', apk: APK_RELEASE });
  }
});

router.get('/skip-times', async (req, res) => {
  try {
    const result = await getSkipTimes({
      malId: req.query.mal,
      title: clip(req.query.title, 160),
      episode: req.query.ep,
      episodeLength: req.query.len
    });
    res.json(result);
  } catch (err) {
    console.warn('[apkApp:skip-times]', err?.message || err);
    res.status(502).json({ error: 'skip_times_unavailable', found: false, segments: [] });
  }
});

router.post('/requests', async (req, res) => {
  if (isRateLimited(`req:${clientIp(req)}`, 6, 3600_000)) return tooMany(res);
  const type = ['anime', 'manga', 'issue'].includes(req.body?.type) ? req.body.type : 'anime';
  const text = clip(req.body?.text, 400);
  if (text.length < 2) return res.status(400).json({ error: 'empty_request' });
  const session = await optionalApkUser(req);
  const entry = {
    id: randomId('req'),
    type,
    text,
    author: clip(session?.data?.displayName || session?.data?.username || 'زائر BLACK X', 80),
    username: clip(session?.data?.username || '', 40),
    createdAt: nowIso()
  };
  try {
    await mutateGlobal((g) => ({ ...g, userRequests: [entry, ...g.userRequests].slice(0, 60) }), entry.username || 'guest');
    res.json({ ok: true, id: entry.id });
  } catch (err) {
    sendFailure(res, err, 'requests');
  }
});

// ---------------------------------------------------------------- auth
router.post('/auth/register', async (req, res) => {
  if (!isAuthConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
  if (isRateLimited(`reg:${clientIp(req)}`, 6, 3600_000)) return tooMany(res);
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const email = normalizeEmail(req.body?.email);
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (RESERVED_USERNAMES.has(username)) return res.status(403).json({ error: 'reserved_username' });
  if (password.length < 6 || password.length > 128) return res.status(400).json({ error: 'invalid_password' });
  if (email && (!isValidEmail(email) || email === DEVELOPER_EMAIL)) return res.status(400).json({ error: 'invalid_email' });
  try {
    const userKey = cleanDocKey('user', username);
    const emailKey = email ? cleanDocKey('email', email) : null;
    if (emailKey && (await readSettingsDoc(emailKey)).exists) return res.status(409).json({ error: 'email_taken' });
    const state = sanitizeStateInput(req.body?.state || {});
    const now = nowIso();
    const data = {
      id: randomId('bx'),
      username,
      email,
      displayName: clip(req.body?.displayName, 60) || username,
      photoUrl: '',
      avatarColor: '#ffffff',
      bio: '',
      role: 'user',
      vipTier: 'free',
      passBcrypt: await hashPasswordAsync(password),
      passSha256: PASS_SENTINEL_BCRYPT,
      isGoogleAccount: false,
      favorites: state.favorites || [],
      progress: state.progress || [],
      positions: state.positions || {},
      xp: state.xp || 0,
      createdAt: now,
      updatedAt: now,
      source: 'apk-v16'
    };
    const created = await writeSettingsDoc(userKey, data, { extraFields: identityFields(data), precondition: { exists: false } });
    if (!created.ok) return res.status(409).json({ error: 'username_taken' });
    if (emailKey) {
      await writeSettingsDoc(emailKey, data, { extraFields: identityFields(data), precondition: { exists: false } }).catch(() => null);
    }
    res.status(201).json(sessionPayload(data, userKey));
  } catch (err) {
    sendFailure(res, err, 'register');
  }
});

router.post('/auth/login', async (req, res) => {
  if (!isAuthConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
  const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || '').trim().toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!identifier || !password) return res.status(400).json({ error: 'missing_credentials' });
  const ip = clientIp(req);
  if (isRateLimited(`login:${ip}`, 30, 900_000) || isRateLimited(`login:${ip}:${identifier}`, 8, 900_000)) return tooMany(res);
  if (identifier === DEVELOPER_EMAIL || RESERVED_USERNAMES.has(identifier)) {
    return res.status(403).json({ error: 'google_sign_in_required' });
  }
  try {
    const isEmail = identifier.includes('@');
    const key = isEmail ? cleanDocKey('email', identifier) : cleanDocKey('user', identifier);
    const doc = await readSettingsDoc(key);
    const data = doc.exists ? doc.data : null;
    const identityMatches = data && (isEmail
      ? normalizeEmail(data.email) === identifier
      : !data.username || normalizeUsername(data.username) === identifier);
    if (!identityMatches) return res.status(401).json({ error: 'bad_credentials' });
    if (isDeveloperIdentity(data)) return res.status(403).json({ error: 'google_sign_in_required' });
    const check = await verifyCloudPassword(data, password);
    if (!check.ok) {
      const googleOnly = data.isGoogleAccount && !data.passBcrypt && !/^[a-f0-9]{64}$/i.test(String(data.passSha256 || ''));
      return res.status(401).json({ error: googleOnly ? 'google_sign_in_required' : 'bad_credentials' });
    }
    let account = { ...data, username: data.username || (isEmail ? identifier.split('@')[0] : identifier) };
    const primaryKey = accountKeys(account)[0] || key;
    if (check.legacy) {
      const passBcrypt = await hashPasswordAsync(password);
      const upgraded = await updateAccount(primaryKey === key ? key : primaryKey, (cur) => ({
        ...cur,
        passBcrypt,
        passSha256: PASS_SENTINEL_BCRYPT
      })).catch(() => null);
      if (upgraded?.data) account = upgraded.data;
      else if (primaryKey !== key) {
        // The primary copy is missing: upgrade the document we found instead.
        const fallback = await updateAccount(key, (cur) => ({ ...cur, passBcrypt, passSha256: PASS_SENTINEL_BCRYPT })).catch(() => null);
        if (fallback?.data) account = fallback.data;
      }
    }
    const sessionKey = (await readSettingsDoc(primaryKey).catch(() => ({ exists: false }))).exists ? primaryKey : key;
    res.json(sessionPayload(account, sessionKey));
  } catch (err) {
    sendFailure(res, err, 'login');
  }
});

router.post('/auth/google', async (req, res) => {
  if (!isAuthConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
  if (isRateLimited(`google:${clientIp(req)}`, 30, 900_000)) return tooMany(res);
  let identity;
  try {
    identity = await verifyFirebaseGoogleIdToken(req.body?.idToken);
  } catch (err) {
    console.warn('[apkApp:google]', err?.message || err);
    return res.status(503).json({ error: 'auth_verification_unavailable' });
  }
  if (!identity) return res.status(401).json({ error: 'invalid_google_token' });
  const email = identity.email;
  const isDev = email === DEVELOPER_EMAIL;
  try {
    const emailKey = cleanDocKey('email', email);
    const existing = await readSettingsDoc(emailKey);
    let data = existing.exists && existing.data && normalizeEmail(existing.data.email || email) === email ? existing.data : null;
    const state = sanitizeStateInput(req.body?.state || {});
    if (!data) {
      let base = isDev ? 'developer' : email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 18);
      if (base.length < 3) base = `user_${Math.random().toString(36).slice(2, 7)}`;
      if (!isDev && RESERVED_USERNAMES.has(base)) base = `${base.slice(0, 14)}_fan`;
      let username = null;
      for (let attempt = 0; attempt < 6 && !username; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base.slice(0, 17)}_${Math.random().toString(36).slice(2, 6)}`;
        const doc = await readSettingsDoc(cleanDocKey('user', candidate));
        if (!doc.exists) username = candidate;
        else if (doc.data && normalizeEmail(doc.data.email) === email) {
          data = doc.data;
          username = candidate;
        }
      }
      if (!username) return res.status(409).json({ error: 'username_conflict' });
      if (!data) {
        const now = nowIso();
        data = {
          id: identity.uid,
          username,
          email,
          displayName: clip(identity.displayName, 60) || username,
          photoUrl: clip(identity.photoURL, 700),
          avatarColor: '#ffffff',
          bio: '',
          role: isDev ? 'developer' : 'user',
          vipTier: 'free',
          passSha256: PASS_SENTINEL_GOOGLE,
          isGoogleAccount: true,
          favorites: state.favorites || [],
          progress: state.progress || [],
          positions: state.positions || {},
          xp: state.xp || 0,
          createdAt: now,
          updatedAt: now,
          source: 'apk-v16'
        };
        const created = await writeSettingsDoc(emailKey, data, { extraFields: identityFields(data), precondition: { exists: false } });
        if (!created.ok) return res.status(409).json({ error: 'try_again' });
        await writeMirrors(data, emailKey);
        return res.json(sessionPayload(data, emailKey));
      }
    }
    // Existing account: an empty legacy password field let old APK builds sign in
    // with ANY password, so Google accounts always get the sentinel.
    const legacyHash = /^[a-f0-9]{64}$/i.test(String(data.passSha256 || ''));
    const result = await updateSettingsDoc(emailKey, (cur) => {
      const base = cur && normalizeEmail(cur.email || email) === email ? cur : data;
      return {
        ...base,
        email,
        isGoogleAccount: true,
        role: isDev ? 'developer' : 'user',
        passSha256: base.passBcrypt || legacyHash ? base.passSha256 : PASS_SENTINEL_GOOGLE,
        displayName: base.displayName || clip(identity.displayName, 60) || base.username,
        photoUrl: base.photoUrl || clip(identity.photoURL, 700),
        updatedAt: nowIso()
      };
    }, { extraFields: identityFields });
    const account = result.data || data;
    await writeMirrors(account, emailKey);
    res.json(sessionPayload(account, emailKey));
  } catch (err) {
    sendFailure(res, err, 'google');
  }
});

// ---------------------------------------------------------------- session
router.get('/me', requireApkUser, (req, res) => {
  res.json({ user: publicAccount(req.apk.data), state: accountState(req.apk.data) });
});

router.put('/state', requireApkUser, async (req, res) => {
  if (isRateLimited(`state:${req.apk.key}`, 40, 600_000)) return tooMany(res);
  const input = sanitizeStateInput(req.body || {});
  try {
    const result = await updateAccount(req.apk.key, (cur) => {
      const next = { ...cur };
      if (input.favorites) next.favorites = input.favorites;
      if (input.progress) next.progress = input.progress;
      if (input.positions) next.positions = mergePositions(cur.positions, input.positions);
      if (input.xp !== undefined) next.xp = Math.max(Number(cur.xp) || 0, input.xp);
      return next;
    });
    res.json({ ok: true, state: accountState(result.data) });
  } catch (err) {
    sendFailure(res, err, 'state');
  }
});

router.put('/profile', requireApkUser, async (req, res) => {
  const patch = {};
  if (req.body?.displayName !== undefined) {
    const v = clip(req.body.displayName, 60);
    if (!v) return res.status(400).json({ error: 'invalid_display_name' });
    patch.displayName = v;
  }
  if (req.body?.bio !== undefined) patch.bio = clip(req.body.bio, 200);
  if (req.body?.avatarColor !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(String(req.body.avatarColor))) return res.status(400).json({ error: 'invalid_color' });
    patch.avatarColor = String(req.body.avatarColor);
  }
  if (req.body?.photoUrl !== undefined) {
    const v = String(req.body.photoUrl || '').trim();
    // Firestore documents are limited to 1 MiB; keep room for the lists.
    if (v && (v.length > 600_000 || !/^(https:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(v))) {
      return res.status(400).json({ error: 'invalid_photo' });
    }
    patch.photoUrl = v;
  }
  try {
    const result = await updateAccount(req.apk.key, (cur) => ({ ...cur, ...patch }));
    res.json({ ok: true, user: publicAccount(result.data) });
  } catch (err) {
    sendFailure(res, err, 'profile');
  }
});

router.post('/vip/redeem', requireAccount, async (req, res) => {
  const code = clip(req.body?.code, 40).toUpperCase();
  if (!code) return res.status(400).json({ error: 'invalid_code' });
  if (isRateLimited(`vip:${req.apk.key}`, 8, 3600_000) || isRateLimited(`vip-ip:${clientIp(req)}`, 20, 3600_000)) return tooMany(res);
  const me = normalizeUsername(req.apk.data.username || req.apk.data.email);
  let outcome = null;
  try {
    await mutateGlobal((g) => {
      const codes = g.codes.map((c) => ({ ...c }));
      const idx = codes.findIndex((c) => String(c.code || '').toUpperCase() === code);
      if (idx === -1) {
        outcome = { status: 404, error: 'invalid_code' };
        return undefined;
      }
      const c = codes[idx];
      if (c.isActive === 0 || c.isActive === false || c.active === false) {
        outcome = { status: 404, error: 'invalid_code' };
        return undefined;
      }
      const redeemedBy = Array.isArray(c.redeemedBy) ? c.redeemedBy : [];
      if (redeemedBy.some((r) => normalizeUsername(r?.username) === me)) {
        outcome = { status: 409, error: 'already_redeemed' };
        return undefined;
      }
      if ((Number(c.usedCount) || 0) >= (Number(c.maxUses) || 1)) {
        outcome = { status: 410, error: 'max_uses_reached' };
        return undefined;
      }
      codes[idx] = { ...c, usedCount: (Number(c.usedCount) || 0) + 1, redeemedBy: [...redeemedBy, { username: me, at: nowIso() }].slice(-300) };
      outcome = { code: codes[idx] };
      return { ...g, codes };
    }, me);
    if (!outcome || outcome.error) return res.status(outcome?.status || 404).json({ error: outcome?.error || 'invalid_code' });
    const tier = String(outcome.code.tier || '').toLowerCase().includes('monarch') ? 'vip_monarch' : 'vip_basic';
    const days = Math.max(1, Math.min(3650, Number(outcome.code.durationDays) || 30));
    const result = await updateAccount(req.apk.key, (cur) => {
      const active = effectiveVipTier(cur) === tier && cur.vipExpiresAt && new Date(cur.vipExpiresAt).getTime() > Date.now();
      const from = active ? new Date(cur.vipExpiresAt).getTime() : Date.now();
      return { ...cur, vipTier: tier, vipStatus: vipLabel(tier), vipExpiresAt: new Date(from + days * 86400_000).toISOString(), vipCode: code };
    });
    res.json({ ok: true, tier, days, user: publicAccount(result.data) });
  } catch (err) {
    sendFailure(res, err, 'redeem');
  }
});

// ---------------------------------------------------------------- developer
router.get('/admin/vip', requireDeveloper, async (_req, res) => {
  try {
    const doc = await readSettingsDoc(GLOBAL_DOC_ID);
    const g = normalizeGlobal(doc.exists ? doc.data : null);
    res.json({ enforced: g.enforced, codes: g.codes.slice(0, 300), userRequests: g.userRequests, broadcastMsg: g.broadcastMsg, pinnedRec: g.pinnedRec, updatedAt: g.updatedAt || null });
  } catch (err) {
    sendFailure(res, err, 'admin-vip');
  }
});

router.post('/admin/vip/enforced', requireDeveloper, async (req, res) => {
  if (typeof req.body?.enforced !== 'boolean') return res.status(400).json({ error: 'enforced_must_be_boolean' });
  try {
    const result = await mutateGlobal((g) => ({ ...g, enforced: req.body.enforced }), req.developer.email);
    res.json({ ok: true, enforced: result.data.enforced });
  } catch (err) {
    sendFailure(res, err, 'admin-enforced');
  }
});

router.post('/admin/vip/codes', requireDeveloper, async (req, res) => {
  const tier = req.body?.tier === 'vip_basic' ? 'vip_basic' : 'vip_monarch';
  const days = Math.max(1, Math.min(3650, Number(req.body?.days) || 30));
  const uses = Math.max(1, Math.min(10_000, Number(req.body?.uses) || 1));
  const count = Math.max(1, Math.min(20, Number(req.body?.count) || 1));
  const priceEgp = Math.max(0, Math.min(100_000, Number(req.body?.priceEgp) || 0));
  const created = [];
  for (let i = 0; i < count; i += 1) {
    created.push({
      code: generateVipCode(tier, req.body?.prefix),
      tier,
      durationDays: days,
      maxUses: uses,
      usedCount: 0,
      priceEgp,
      note: clip(req.body?.note, 120),
      isActive: 1,
      redeemedBy: [],
      createdAt: nowIso()
    });
  }
  try {
    await mutateGlobal((g) => ({ ...g, codes: [...created, ...g.codes].slice(0, 300) }), req.developer.email);
    res.status(201).json({ ok: true, codes: created });
  } catch (err) {
    sendFailure(res, err, 'admin-codes');
  }
});

router.delete('/admin/vip/codes/:code', requireDeveloper, async (req, res) => {
  const code = clip(req.params.code, 40).toUpperCase();
  try {
    await mutateGlobal((g) => ({ ...g, codes: g.codes.filter((c) => String(c.code || '').toUpperCase() !== code) }), req.developer.email);
    res.json({ ok: true });
  } catch (err) {
    sendFailure(res, err, 'admin-delete-code');
  }
});

router.post('/admin/broadcast', requireDeveloper, async (req, res) => {
  const message = clip(req.body?.message, 500);
  try {
    await mutateGlobal((g) => ({ ...g, broadcastMsg: message }), req.developer.email);
    res.json({ ok: true, broadcastMsg: message });
  } catch (err) {
    sendFailure(res, err, 'admin-broadcast');
  }
});

router.post('/admin/pin', requireDeveloper, async (req, res) => {
  const pinnedRec = sanitizePinned(req.body?.pinnedRec);
  try {
    await mutateGlobal((g) => ({ ...g, pinnedRec }), req.developer.email);
    res.json({ ok: true, pinnedRec });
  } catch (err) {
    sendFailure(res, err, 'admin-pin');
  }
});

router.delete('/admin/requests/:id', requireDeveloper, async (req, res) => {
  const id = clip(req.params.id, 60);
  try {
    await mutateGlobal((g) => ({ ...g, userRequests: g.userRequests.filter((r) => r.id !== id) }), req.developer.email);
    res.json({ ok: true });
  } catch (err) {
    sendFailure(res, err, 'admin-requests');
  }
});

async function findAccountDoc(target) {
  const q = String(target || '').trim().toLowerCase();
  if (!q) return null;
  const keys = q.includes('@') ? [cleanDocKey('email', q)] : [cleanDocKey('user', q), cleanDocKey('email', `${q}@gmail.com`)];
  for (const key of keys) {
    const doc = await readSettingsDoc(key);
    if (doc.exists && doc.data) return { key, data: doc.data };
  }
  return null;
}

router.post('/admin/users/vip', requireDeveloper, async (req, res) => {
  const tier = ['vip_basic', 'vip_monarch', 'free'].includes(req.body?.tier) ? req.body.tier : null;
  if (!tier) return res.status(400).json({ error: 'invalid_tier' });
  const days = Math.max(1, Math.min(3650, Number(req.body?.days) || 30));
  try {
    const found = await findAccountDoc(req.body?.target);
    if (!found) return res.status(404).json({ error: 'account_not_found' });
    const result = await updateAccount(found.key, (cur) => tier === 'free'
      ? { ...cur, vipTier: 'free', vipStatus: vipLabel('free'), vipExpiresAt: null, vipRevokedAt: nowIso() }
      : { ...cur, vipTier: tier, vipStatus: vipLabel(tier), vipExpiresAt: new Date(Date.now() + days * 86400_000).toISOString(), grantedByDeveloperAt: nowIso() });
    res.json({ ok: true, user: publicAccount(result.data) });
  } catch (err) {
    sendFailure(res, err, 'admin-user-vip');
  }
});

// Crash reports of the last days (services/errorLog.js), for the developer panel's «الأخطاء» tab.
router.get('/admin/errors', requireDeveloper, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(7, Number(req.query.days) || 3));
    res.json({ days: await readErrorLog(days) });
  } catch (err) {
    sendFailure(res, err, 'admin-errors');
  }
});

router.get('/admin/users/inspect', requireDeveloper, async (req, res) => {
  try {
    const found = await findAccountDoc(req.query.q);
    if (!found) return res.status(404).json({ error: 'account_not_found' });
    const d = found.data;
    res.json({
      user: publicAccount(d),
      stats: {
        favorites: Array.isArray(d.favorites) ? d.favorites.length : 0,
        history: Array.isArray(d.progress) ? d.progress.length : 0,
        xp: Number(d.xp) || 0,
        source: clip(d.source, 40),
        updatedAt: d.updatedAt || null,
        hasPassword: Boolean(d.passBcrypt) || /^[a-f0-9]{64}$/i.test(String(d.passSha256 || '')),
        passwordStorage: d.passBcrypt ? 'bcrypt' : /^[a-f0-9]{64}$/i.test(String(d.passSha256 || '')) ? 'legacy-sha256' : 'none'
      }
    });
  } catch (err) {
    sendFailure(res, err, 'admin-inspect');
  }
});

export default router;
