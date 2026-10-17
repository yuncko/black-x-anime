/**
 * Server-side access to the Firestore `settings` collection (accounts mirror,
 * global VIP/broadcast document) used by the website server and the APK API.
 *
 * - Requests carry the service-account token when FIREBASE_SERVICE_ACCOUNT is set
 *   (IAM bypasses firestore.rules, so `settings/*` can later be locked to browsers),
 *   otherwise they use the public API key exactly like the old clients did.
 * - Every write that depends on what was read uses an `updateTime` precondition
 *   and retries, so two phones redeeming a code or two visitors sending requests
 *   at the same time never overwrite each other (the old clients rewrote the whole
 *   document from a stale copy).
 */
import { getFirestoreAuthHeaders } from './firestoreAuth.js';

export const FIRESTORE_PROJECT_ID = 'spry-oxide-1h7sp';
export const FIRESTORE_DATABASE_ID = 'ai-studio-blackxanime-e47e1ba2-315f-4c3b-8557-71352813f36c';
// Public web API key (it ships in every client bundle; access is decided by the rules or IAM).
export const FIRESTORE_API_KEY = 'AIzaSyD4yG_ljN1S8TfwC33E4Z0o499MYC71eUE';
export const SETTINGS_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/settings`;

let fetchImpl = (...args) => fetch(...args);
let authHeadersImpl = getFirestoreAuthHeaders;

/** Test hook: replace fetch and the auth-header provider. Call with no args to restore. */
export function __setSettingsStoreTransportForTests(nextFetch, nextAuthHeaders) {
  fetchImpl = nextFetch || ((...args) => fetch(...args));
  authHeadersImpl = nextAuthHeaders || getFirestoreAuthHeaders;
}

export function cleanDocKey(prefix, val) {
  const safe = String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_');
  return `${prefix}_${safe}`.slice(0, 120);
}

export function isValidDocId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function encodeValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value ?? '') };
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  return undefined;
}

export class SettingsStoreError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SettingsStoreError';
    this.status = status;
  }
}

async function request(id, { method = 'GET', body, query = '' } = {}) {
  if (!isValidDocId(id)) throw new SettingsStoreError('invalid_doc_id', 400);
  const headers = { Accept: 'application/json', ...(await authHeadersImpl()) };
  if (body) headers['Content-Type'] = 'application/json';
  const url = `${SETTINGS_BASE_URL}/${id}?key=${FIRESTORE_API_KEY}${query}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    throw new SettingsStoreError(`firestore_unreachable: ${err?.message || err}`, 0);
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * Reads settings/{id}. Returns { exists, data, fields, updateTime } where `data`
 * is the parsed `json` field (null when missing or invalid). Throws
 * SettingsStoreError on network/permission failures so callers can answer 503
 * instead of treating an outage as "account not found".
 */
export async function readSettingsDoc(id) {
  const { res, data } = await request(id);
  if (res.status === 404) return { exists: false, data: null, fields: {}, rawFields: {}, updateTime: null };
  if (!res.ok) throw new SettingsStoreError(`firestore_read_failed (${res.status})`, res.status);
  const fields = {};
  for (const [key, value] of Object.entries(data.fields || {})) fields[key] = decodeValue(value);
  let parsed = null;
  if (typeof fields.json === 'string' && fields.json) {
    try {
      parsed = JSON.parse(fields.json);
    } catch {
      parsed = null;
    }
  }
  return { exists: true, data: parsed, fields, rawFields: data.fields || {}, updateTime: data.updateTime || null };
}

function isConflict(res, data) {
  const status = String(data?.error?.status || '');
  return (
    res.status === 409 ||
    status === 'FAILED_PRECONDITION' ||
    status === 'ALREADY_EXISTS' ||
    status === 'ABORTED' ||
    (res.status === 404 && status === 'NOT_FOUND')
  );
}

/**
 * Writes settings/{id} as { json: JSON.stringify(data), ...extraFields }.
 * `precondition` is { exists: false } (create only) or { updateTime } (unchanged
 * since read). Returns { ok, conflict, updateTime }.
 */
export async function writeSettingsDoc(id, data, { extraFields = {}, rawFields = {}, precondition = null } = {}) {
  // Other top-level fields already on the document are kept (a PATCH without an
  // update mask replaces the whole field set).
  const fields = {};
  for (const [key, value] of Object.entries(rawFields || {})) if (key !== 'json') fields[key] = value;
  for (const [key, value] of Object.entries(extraFields)) fields[key] = encodeValue(value);
  fields.json = { stringValue: JSON.stringify(data) };
  let query = '';
  if (precondition?.exists === false) query = '&currentDocument.exists=false';
  else if (precondition?.exists === true) query = '&currentDocument.exists=true';
  else if (precondition?.updateTime) query = `&currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`;
  const { res, data: body } = await request(id, { method: 'PATCH', body: { fields }, query });
  if (res.ok) return { ok: true, conflict: false, updateTime: body.updateTime || null };
  if (precondition && isConflict(res, body)) return { ok: false, conflict: true, updateTime: null };
  throw new SettingsStoreError(`firestore_write_failed (${res.status} ${body?.error?.status || ''})`.trim(), res.status);
}

/**
 * Deletes settings/{id}. Phase-1 rules refuse deletes made with the public API key, so this
 * only works with FIREBASE_SERVICE_ACCOUNT (IAM) — callers erase the content first and treat
 * `{ ok: false, denied: true }` as "emptied but still there". `precondition` as in writes.
 */
export async function deleteSettingsDoc(id, { precondition = null } = {}) {
  let query = '';
  if (precondition?.updateTime) query = `&currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`;
  const { res, data: body } = await request(id, { method: 'DELETE', query });
  if (res.ok || res.status === 404) return { ok: true, denied: false, conflict: false };
  if (res.status === 403 || String(body?.error?.status || '') === 'PERMISSION_DENIED') return { ok: false, denied: true, conflict: false };
  if (precondition && isConflict(res, body)) return { ok: false, denied: false, conflict: true };
  throw new SettingsStoreError(`firestore_delete_failed (${res.status} ${body?.error?.status || ''})`.trim(), res.status);
}

/**
 * Read-modify-write with optimistic concurrency. `mutate(current, meta)` gets
 * the parsed document (or null) and returns the next document, or undefined to
 * skip the write (the current value is returned). `extraFields(next)` adds the
 * plain fields stored next to `json`.
 */
export async function updateSettingsDoc(id, mutate, { extraFields = () => ({}), retries = 4 } = {}) {
  let lastConflict = false;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const current = await readSettingsDoc(id);
    const next = await mutate(current.exists ? current.data : null, current);
    if (next === undefined) return { ok: true, written: false, data: current.data, updateTime: current.updateTime };
    const precondition = current.exists ? { updateTime: current.updateTime } : { exists: false };
    const result = await writeSettingsDoc(id, next, {
      extraFields: extraFields(next),
      rawFields: current.rawFields,
      precondition
    });
    if (result.ok) return { ok: true, written: true, data: next, updateTime: result.updateTime };
    lastConflict = result.conflict;
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.floor(Math.random() * 120) * (attempt + 1)));
  }
  throw new SettingsStoreError(lastConflict ? 'firestore_write_conflict' : 'firestore_write_failed', 409);
}
