/**
 * Crash reports from visitors' browsers and the APK (2026-10-17).
 *
 * Until now an error on someone's phone was only visible if they told the developer. This sends
 * a short, anonymous report to POST /api/telemetry/error (server/src/routes/telemetry.js), which
 * groups them per day in Firestore (`settings/error_log_<YYYYMMDD>`) for the developer panel's
 * «الأخطاء» tab.
 *
 * A report holds: the error message, the first lines of its stack, where it came from (window
 * error / unhandled promise / React screen), the page path WITHOUT the query string or hash,
 * the platform (web / apk) and build, and the browser's user-agent. No account, no e-mail, no
 * page content. At most 5 different errors per page load, each once; noise is ignored (network
 * drops, browser extensions, cross-origin "Script error.", autoplay refusals, ResizeObserver).
 */

const MAX_PER_PAGE = 5;
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network error|ERR_NETWORK|ERR_INTERNET_DISCONNECTED/i,
  /AbortError|(?:operation|request|user|fetch) (?:was |is )?aborted|signal is aborted/i,
  /The play\(\) request was interrupted|play\(\) failed because the user didn't interact|NotAllowedError/i,
  /Non-Error promise rejection captured/i,
  /^Request timeout|timeout of \d+ms exceeded/i,
  /Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i,
  /QuotaExceededError/i
];
const EXTENSION_SOURCE = /(?:chrome|moz|safari(?:-web)?)-extension:\/\/|^webkit-masked-url:/i;

const state = { installed: false, sent: 0, seen: new Set(), endpoint: '/api/telemetry/error', platform: 'web', build: '' };

function cut(value, max) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The first `lines` lines of a stack, each trimmed, query strings dropped. */
export function shortStack(stack, lines = 6) {
  return String(stack || '')
    .split('\n')
    .map((l) => l.trim().replace(/\?[^\s):]*/g, ''))
    .filter(Boolean)
    .slice(0, lines)
    .join('\n')
    .slice(0, 1200);
}

/** True for errors that say nothing about BLACK X's code. */
export function shouldIgnoreError(message, stack = '', source = '') {
  const msg = String(message || '');
  if (!msg.trim()) return true;
  if (IGNORED.some((re) => re.test(msg))) return true;
  if (EXTENSION_SOURCE.test(String(source || '')) || EXTENSION_SOURCE.test(String(stack || '').split('\n').slice(0, 3).join('\n'))) return true;
  return false;
}

/** Same error = same message (numbers / ids blurred) + same first stack frame. */
export function errorFingerprint(message, stack = '') {
  const msg = String(message || '')
    .replace(/\d+/g, '#')
    .replace(/(['"`]).*?\1/g, '$1…$1')
    .slice(0, 160);
  const frame = String(stack || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^at |@/.test(l)) || '';
  const where = frame.replace(/\?[^\s):]*/g, '').replace(/:\d+:\d+\)?$/, '');
  let h = 2166136261;
  const text = `${msg}|${where}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The JSON sent to the server (also used by tests). */
export function buildErrorReport({ message, stack, kind = 'error', path = '', platform = 'web', build = '', ua = '' } = {}) {
  const cleanPath = String(path || '/').split(/[?#]/)[0] || '/';
  return {
    message: cut(message, 300),
    stack: shortStack(stack),
    kind: ['error', 'promise', 'react'].includes(kind) ? kind : 'error',
    path: cut(cleanPath, 160),
    platform: platform === 'apk' ? 'apk' : 'web',
    build: cut(build, 40),
    ua: cut(ua, 200),
    fp: errorFingerprint(message, stack)
  };
}

function send(report) {
  try {
    const body = JSON.stringify(report);
    if (typeof fetch === 'function') {
      fetch(state.endpoint, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }
  } catch {
    /* never let the reporter itself throw */
  }
}

/** Report one error (deduplicated, capped). `extra.kind`: 'error' | 'promise' | 'react'. */
export function reportClientError(error, extra = {}) {
  try {
    const message = error && typeof error === 'object' ? error.message || String(error.name || '') : String(error || '');
    const stack = (error && typeof error === 'object' && error.stack) || extra.stack || '';
    if (shouldIgnoreError(message, stack, extra.source)) return false;
    const fp = errorFingerprint(message, stack);
    if (state.seen.has(fp) || state.sent >= MAX_PER_PAGE) return false;
    state.seen.add(fp);
    state.sent += 1;
    send(
      buildErrorReport({
        message,
        stack: extra.componentStack ? `${stack}\n${extra.componentStack}` : stack,
        kind: extra.kind || 'error',
        path: typeof location !== 'undefined' ? location.pathname : '',
        platform: state.platform,
        build: state.build,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      })
    );
    return true;
  } catch {
    return false;
  }
}

/** Once per page: window errors and unhandled promise rejections. */
export function installErrorReporter({ endpoint, platform = 'web', build = '' } = {}) {
  if (endpoint) state.endpoint = endpoint;
  state.platform = platform;
  state.build = build;
  if (state.installed || typeof window === 'undefined') return;
  state.installed = true;
  window.addEventListener('error', (event) => {
    // resource errors (a broken poster) bubble here too; only script errors have `error`/message
    if (!event || event.target !== window || (!event.error && !event.message)) return;
    reportClientError(event.error || event.message, { kind: 'error', source: event.filename || '' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    if (!reason || (typeof reason !== 'object' && typeof reason !== 'string')) return;
    reportClientError(reason, { kind: 'promise' });
  });
}

/** Tests only. */
export function __resetErrorReporterForTests() {
  state.sent = 0;
  state.seen.clear();
}
