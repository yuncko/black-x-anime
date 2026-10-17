/**
 * /api/telemetry — anonymous crash reports from the website and the APK
 * (client/src/errorReporter.js → services/errorLog.js → settings/error_log_<day>).
 *
 * Limits, so a broken page or a script cannot burn the Firestore quota: 8 reports per IP per 10
 * minutes and 150 written per server instance per hour (the IP is only a key of an in-memory
 * counter, never stored). Extra reports get 204 like the others and are not written.
 */
import { Router } from 'express';
import { recordClientError, sanitizeErrorReport } from '../services/errorLog.js';

const router = Router();

const PER_IP = 8;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const PER_INSTANCE = 150;
const PER_INSTANCE_WINDOW_MS = 60 * 60 * 1000;

const ipHits = new Map();
let instance = { start: Date.now(), count: 0 };

/** Test hook. */
export function __resetTelemetryLimitsForTests() {
  ipHits.clear();
  instance = { start: Date.now(), count: 0 };
}

function clientIp(req) {
  const fwd = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

/** true when this report may be written. */
export function allowReport(ip, now = Date.now()) {
  if (now - instance.start > PER_INSTANCE_WINDOW_MS) instance = { start: now, count: 0 };
  if (instance.count >= PER_INSTANCE) return false;
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < PER_IP_WINDOW_MS);
  if (hits.length >= PER_IP) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) {
    // forget the oldest addresses (a long-lived local server)
    for (const key of ipHits.keys()) {
      ipHits.delete(key);
      if (ipHits.size <= 4000) break;
    }
  }
  instance.count += 1;
  return true;
}

router.post('/error', async (req, res) => {
  const report = sanitizeErrorReport(req.body);
  if (!report) return res.status(400).json({ error: 'invalid_report' });
  if (!allowReport(clientIp(req))) return res.status(204).end();
  // Also in the Vercel function logs, for the moment Firestore is unreachable.
  console.warn('[client-error]', JSON.stringify({ platform: report.platform, build: report.build, path: report.path, kind: report.kind, message: report.message }));
  try {
    await recordClientError(report);
  } catch (err) {
    console.warn('[telemetry] not stored:', err?.message || err);
  }
  return res.status(204).end();
});

export default router;
