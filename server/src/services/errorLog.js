/**
 * Crash reports from the website and the APK (client/src/errorReporter.js), grouped per UTC day in
 * Firestore: `settings/error_log_<YYYYMMDD>` = { v: 1, day, entries: { <fingerprint>: { message,
 * stack, kind, path, platform, build, ua, count, firstAt, lastAt } }, dropped }.
 *
 *  - Same error again = its counter goes up (one entry per fingerprint), at most 100 different
 *    errors a day (the rest only count in `dropped`), so the document stays small.
 *  - Writes use the updateTime precondition (settingsStore.updateSettingsDoc).
 *  - Nothing identifies a person: no account, no IP (the route uses the IP only in memory for its
 *    rate limit), the path without query string. Not a social document of firestore.rules.phase2,
 *    so after phase 2 only the server can read it.
 */
import { readSettingsDoc, updateSettingsDoc } from './settingsStore.js';

export const ERROR_LOG_PREFIX = 'error_log_';
export const MAX_ERRORS_PER_DAY = 100;

function cut(value, max) {
  const s = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function errorLogDay(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

export function errorLogDocId(date = new Date()) {
  return `${ERROR_LOG_PREFIX}${errorLogDay(date)}`;
}

/** A report as accepted from a browser, or null when it is not one. */
export function sanitizeErrorReport(body) {
  if (!body || typeof body !== 'object') return null;
  const message = cut(body.message, 300);
  const fp = String(body.fp || '');
  if (!message || !/^[a-z0-9]{1,13}$/.test(fp)) return null;
  const path = cut(String(body.path || '/').split(/[?#]/)[0], 160) || '/';
  return {
    fp,
    message,
    stack: cut(String(body.stack || '').replace(/\r/g, ''), 1200).replace(/ (at |@)/g, '\n$1'),
    kind: ['error', 'promise', 'react'].includes(body.kind) ? body.kind : 'error',
    path: path.startsWith('/') ? path : `/${path}`,
    platform: body.platform === 'apk' ? 'apk' : 'web',
    build: cut(body.build, 40),
    ua: cut(body.ua, 200)
  };
}

function cleanLog(raw, day) {
  const entries = raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  return { v: 1, day, entries: { ...entries }, dropped: Number(raw?.dropped) || 0 };
}

/** Add one report to today's document. Resolves { stored, count }. */
export async function recordClientError(report, now = new Date()) {
  const day = errorLogDay(now);
  const at = now.toISOString();
  let outcome = { stored: false, count: 0 };
  await updateSettingsDoc(
    errorLogDocId(now),
    (current) => {
      const log = cleanLog(current, day);
      const prev = log.entries[report.fp];
      if (prev) {
        const count = (Number(prev.count) || 0) + 1;
        log.entries[report.fp] = { ...prev, count, lastAt: at, build: report.build || prev.build, ua: report.ua || prev.ua };
        outcome = { stored: true, count };
      } else if (Object.keys(log.entries).length >= MAX_ERRORS_PER_DAY) {
        log.dropped += 1;
        outcome = { stored: false, count: 0 };
      } else {
        const { fp, ...rest } = report;
        log.entries[fp] = { ...rest, count: 1, firstAt: at, lastAt: at };
        outcome = { stored: true, count: 1 };
      }
      log.updatedAt = at;
      return log;
    },
    { extraFields: (next) => ({ updatedAt: next.updatedAt }) }
  );
  return outcome;
}

/** The last `days` days (today first): [{ day, entries: [...sorted by lastAt desc], dropped }]. */
export async function readErrorLog(days = 3, now = new Date()) {
  const out = [];
  for (let i = 0; i < Math.max(1, Math.min(7, days)); i += 1) {
    const date = new Date(now.getTime() - i * 86400000);
    const day = errorLogDay(date);
    const doc = await readSettingsDoc(errorLogDocId(date));
    const log = cleanLog(doc.exists ? doc.data : null, day);
    const entries = Object.entries(log.entries)
      .map(([fp, e]) => ({ fp, ...e }))
      .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
    out.push({ day, entries, dropped: log.dropped });
  }
  return out;
}
