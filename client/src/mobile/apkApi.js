/**
 * Hearbor APK -> website server API (/api/app/*), v16+.
 *
 * Accounts, account sync, VIP, requests and the developer tools used to write
 * straight into a public Firestore collection from the phone. They now go
 * through the server, which checks passwords (bcrypt), verifies Google sign-in,
 * consumes VIP codes atomically and never hands out codes, password hashes or
 * other people's e-mails.
 */
import { bxApiUrl } from './bxServers.js';

const SESSION_KEY = 'bx_mob_session_v16';
const CONFIG_CACHE_KEY = 'bx_mob_app_config_v16';

export class ApkApiError extends Error {
  constructor(code, status = 0, message = '') {
    super(message || code);
    this.name = 'ApkApiError';
    this.code = code;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ session */

export function loadSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return raw && typeof raw.token === 'string' ? raw : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session?.token) localStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.token, savedAt: Date.now() }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage full / private mode */
  }
}

export function hasSession() {
  return Boolean(loadSession()?.token);
}

/* ------------------------------------------------------------------ request */

async function apkRequest(method, path, { body, auth = false, timeoutMs = 15000, token: explicitToken } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = explicitToken || (auth ? loadSession()?.token : null);
  if (auth && !token) throw new ApkApiError('auth_required', 401);
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(bxApiUrl(path), {
      method,
      credentials: 'omit',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    throw new ApkApiError(err?.name === 'AbortError' ? 'timeout' : 'network', 0, String(err?.message || err));
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth && !explicitToken) saveSession(null);
    throw new ApkApiError(String(data?.error || `http_${res.status}`), res.status, data?.message || '');
  }
  return data;
}

/** Arabic / English message for an ApkApiError code. */
export function apiErrorMessage(err, lang = 'ar') {
  const code = err?.code || 'network';
  const ar = {
    network: 'مفيش اتصال بالسيرفر — اتأكد من النت',
    timeout: 'السيرفر اتأخر في الرد — جرّب تاني',
    cloud_unavailable: 'خدمة الحسابات مش متاحة دلوقتي — جرّب بعد شوية',
    auth_unavailable: 'تسجيل الدخول مش شغال على السيرفر لسه — صاحب الموقع لازم يضيف JWT_SECRET في إعدادات الاستضافة',
    auth_required: 'سجّل الدخول الأول',
    account_missing: 'الجلسة انتهت — سجّل الدخول تاني',
    bad_credentials: 'اسم المستخدم أو كلمة المرور غلط',
    missing_credentials: 'اكتب اسم المستخدم وكلمة المرور',
    google_sign_in_required: 'الحساب ده بيدخل بجوجل بس',
    invalid_google_token: 'جوجل ما أكدش الدخول — جرّب تاني',
    auth_verification_unavailable: 'التحقق من جوجل مش متاح دلوقتي',
    username_taken: 'اسم المستخدم ده محجوز — اختار اسم تاني',
    email_taken: 'الإيميل ده عليه حساب بالفعل — سجّل دخول',
    reserved_username: 'الاسم ده محجوز',
    invalid_username: 'اسم المستخدم من 3 لـ 24 حرف (حروف إنجليزي وأرقام و _ . -)',
    invalid_password: 'كلمة المرور لازم تكون 6 حروف على الأقل',
    invalid_email: 'الإيميل مش صحيح',
    invalid_code: 'كود الاشتراك غير صحيح',
    already_redeemed: 'استخدمت الكود ده قبل كده',
    max_uses_reached: 'الكود ده خلص عدد مرات استخدامه',
    rate_limited: 'محاولات كتير — استنى شوية وجرّب تاني',
    empty_request: 'اكتب طلبك الأول',
    forbidden: 'الصلاحية دي للمطور بس',
    account_not_found: 'مفيش حساب بالاسم ده',
    invalid_photo: 'الصورة كبيرة أو صيغتها مش مدعومة',
    try_again: 'حصلت مشكلة — جرّب تاني',
    confirm_mismatch: 'اسم المستخدم اللي كتبته مش مطابق لحسابك',
    bad_password: 'كلمة المرور غلط',
    developer_account: 'حساب المطور مايتمسحش من هنا',
    account_not_synced: 'الحساب ده مش متسجل على السيرفر'
  };
  const en = {
    network: 'No connection to the server',
    timeout: 'The server took too long — try again',
    cloud_unavailable: 'The account service is unavailable right now',
    auth_unavailable: 'Sign-in is not set up on this server yet — the site owner must add JWT_SECRET in the hosting settings',
    confirm_mismatch: 'The user name you typed does not match your account',
    bad_password: 'Wrong password',
    developer_account: 'The developer account cannot be deleted here',
    bad_credentials: 'Wrong username or password',
    google_sign_in_required: 'This account signs in with Google only',
    username_taken: 'That username is taken',
    email_taken: 'That e-mail already has an account',
    invalid_code: 'Invalid VIP code',
    already_redeemed: 'You already used this code',
    max_uses_reached: 'This code has no uses left',
    rate_limited: 'Too many attempts — try again later',
    forbidden: 'Developer only'
  };
  return (lang === 'ar' ? ar[code] : en[code] || ar[code]) || (lang === 'ar' ? 'حصلت مشكلة — جرّب تاني' : 'Something went wrong');
}

/* ------------------------------------------------------------------ config */

export function readCachedConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function fetchAppConfig() {
  const cfg = await apkRequest('GET', '/api/app/config', { timeoutMs: 12000 });
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ ...cfg, cachedAt: Date.now() }));
  } catch {
    /* ignore */
  }
  return cfg;
}

/* ------------------------------------------------------------------ account */

const sessionFrom = (data) => {
  if (data?.token) saveSession({ token: data.token });
  return data;
};

export const loginWithPassword = (identifier, password, state) =>
  apkRequest('POST', '/api/app/auth/login', { body: { identifier, password, state } }).then(sessionFrom);

export const registerAccount = ({ username, password, displayName, email, state }) =>
  apkRequest('POST', '/api/app/auth/register', { body: { username, password, displayName, email, state } }).then(sessionFrom);

export const loginWithGoogle = (idToken, state) =>
  apkRequest('POST', '/api/app/auth/google', { body: { idToken, state } }).then(sessionFrom);

export const fetchMe = () => apkRequest('GET', '/api/app/me', { auth: true });

export const pushAccountState = (state) => apkRequest('PUT', '/api/app/state', { auth: true, body: state });

export const updateAccountProfile = (patch) => apkRequest('PUT', '/api/app/profile', { auth: true, body: patch });

export const redeemVipCode = (code) => apkRequest('POST', '/api/app/vip/redeem', { auth: true, body: { code } });

/** Deletes the signed-in account (server/src/routes/apkApp.js). `password` only for password accounts. */
export const deleteAccount = ({ confirm, password }) =>
  apkRequest('POST', '/api/app/account/delete', { auth: true, body: { confirm, ...(password ? { password } : {}) }, timeoutMs: 30000 });

export const sendDeveloperRequest = (type, text) =>
  apkRequest('POST', '/api/app/requests', { auth: hasSession(), body: { type, text } }).catch((err) => {
    // A stale session must not block guests from sending a request.
    if (err?.status === 401) return apkRequest('POST', '/api/app/requests', { body: { type, text } });
    throw err;
  });

export function signOut() {
  saveSession(null);
}

/* ------------------------------------------------------------------ developer */

export const adminGetVip = () => apkRequest('GET', '/api/app/admin/vip', { auth: true });
export const adminSetEnforced = (enforced) => apkRequest('POST', '/api/app/admin/vip/enforced', { auth: true, body: { enforced } });
export const adminGenerateCodes = (opts) => apkRequest('POST', '/api/app/admin/vip/codes', { auth: true, body: opts });
export const adminDeleteCode = (code) => apkRequest('DELETE', `/api/app/admin/vip/codes/${encodeURIComponent(code)}`, { auth: true });
export const adminBroadcast = (message) => apkRequest('POST', '/api/app/admin/broadcast', { auth: true, body: { message } });
export const adminPin = (pinnedRec) => apkRequest('POST', '/api/app/admin/pin', { auth: true, body: { pinnedRec } });
export const adminDeleteRequest = (id) => apkRequest('DELETE', `/api/app/admin/requests/${encodeURIComponent(id)}`, { auth: true });
export const adminSetUserVip = (target, tier, days) => apkRequest('POST', '/api/app/admin/users/vip', { auth: true, body: { target, tier, days } });
export const adminInspectUser = (q) => apkRequest('GET', `/api/app/admin/users/inspect?q=${encodeURIComponent(q)}`, { auth: true });
/** Crash reports of the last `days` days (newest first), see server/src/services/errorLog.js. */
export const adminGetErrors = (days = 3) => apkRequest('GET', `/api/app/admin/errors?days=${encodeURIComponent(days)}`, { auth: true });

/* ------------------------------------------------------------------ skip times */

const skipCache = new Map();
/** { found, malId, segments: [{ type: 'op'|'ed'|'recap', start, end }] } or null. */
export async function fetchSkipTimes({ malId, title, episode, duration }) {
  const ep = Number.parseInt(episode, 10);
  if (!Number.isInteger(ep) || ep < 1) return null;
  const len = Math.round(Number(duration) || 0);
  const key = `${malId || title}:${ep}:${Math.round(len / 30)}`;
  if (skipCache.has(key)) return skipCache.get(key);
  const qs = new URLSearchParams({ ep: String(ep), len: String(len) });
  if (malId) qs.set('mal', String(malId));
  if (title) qs.set('title', String(title).slice(0, 160));
  try {
    const data = await apkRequest('GET', `/api/app/skip-times?${qs.toString()}`, { timeoutMs: 10000 });
    const value = data && Array.isArray(data.segments) ? data : null;
    skipCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}
