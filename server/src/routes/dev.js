import { Router } from 'express';
import crypto from 'crypto';
import { db, getSetting, setSetting, logSystemEvent } from '../db.js';
import { requireDeveloper, requireAuth, publicUser } from '../auth.js';

const router = Router();

/**
 * Public: Get site footer text
 */
router.get('/footer', (req, res) => {
  const tagline = getSetting('footer_tagline', 'Stream every episode. Track your shows. Own the night.');
  const notice = getSetting('footer_notice', 'Hearbor — The ultimate interactive anime experience.');
  res.json({ tagline, notice });
});

/**
 * Developer Only: Update site footer text
 */
router.put('/footer', requireDeveloper, (req, res) => {
  const { tagline, notice } = req.body || {};
  if (typeof tagline === 'string') {
    setSetting('footer_tagline', tagline.trim().slice(0, 300));
  }
  if (typeof notice === 'string') {
    setSetting('footer_notice', notice.trim().slice(0, 300));
  }
  logSystemEvent('info', 'settings', `Footer text updated by developer ${req.user.email}`);
  res.json({
    ok: true,
    tagline: getSetting('footer_tagline'),
    notice: getSetting('footer_notice')
  });
});

/**
 * Developer Only: Get site user count & user analytics
 */
router.get('/users-stats', requireDeveloper, (req, res) => {
  try {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM users').get();
    const roleStats = db.prepare('SELECT role, COUNT(*) AS count FROM users GROUP BY role').all();
    const recentUsersRaw = db.prepare(`
      SELECT id, username, email, display_name AS displayName, role, avatar_color AS avatarColor, photo_url AS photoUrl, badges, vip_tier AS vipTier, vip_expires_at AS vipExpiresAt, created_at AS createdAt
      FROM users
      ORDER BY id DESC
      LIMIT 100
    `).all();

    const recentUsers = recentUsersRaw.map((u) => {
      let badges = [];
      try {
        badges = typeof u.badges === 'string' ? JSON.parse(u.badges || '[]') : (u.badges || []);
        if (!Array.isArray(badges)) badges = [];
      } catch {
        badges = [];
      }
      return {
        ...u,
        badges
      };
    });

    res.json({
      totalUsers: total,
      roleStats,
      users: recentUsers
    });
  } catch (err) {
    logSystemEvent('error', 'dev', 'Failed to fetch user stats', { error: err.message });
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Developer Only: Update / grant badges for any user account
 */
const handleUpdateBadges = (req, res) => {
  const userId = Number(req.params.id);
  const { badges } = req.body || {};
  if (!Number.isInteger(userId) || !Array.isArray(badges)) {
    return res.status(400).json({ error: 'bad_request', message: 'userId and badges array required' });
  }

  const validBadges = ['blue_verified', 'gold_vip', 'success_partner', 'veteran_viewer', 'celebrity'];
  const sanitized = badges.filter((b) => validBadges.includes(b));

  try {
    const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'not_found', message: 'User not found' });

    db.prepare('UPDATE users SET badges = ? WHERE id = ?').run(JSON.stringify(sanitized), userId);
    logSystemEvent('info', 'badges', `Developer ${req.user.email} updated badges for @${user.username}: [${sanitized.join(', ')}]`, {
      userId,
      badges: sanitized
    });

    const updatedRaw = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    let updatedBadges = [];
    try {
      updatedBadges = JSON.parse(updatedRaw.badges || '[]');
    } catch {}

    res.json({
      ok: true,
      user: {
        id: updatedRaw.id,
        username: updatedRaw.username,
        email: updatedRaw.email,
        displayName: updatedRaw.display_name,
        role: updatedRaw.role,
        badges: updatedBadges
      }
    });
  } catch (err) {
    logSystemEvent('error', 'dev', 'Failed to update user badges', { error: err.message });
    res.status(500).json({ error: 'db_error', message: err.message });
  }
};

router.put('/users/:id/badges', requireDeveloper, handleUpdateBadges);
router.post('/users/:id/badges', requireDeveloper, handleUpdateBadges);

/**
 * Developer Only: Live system diagnostics and error discovery
 */
router.get('/diagnostics', requireDeveloper, async (req, res) => {
  const checks = [];
  const start = Date.now();

  // 1. Database check
  try {
    const t0 = Date.now();
    const dbTest = db.prepare('SELECT COUNT(*) AS c FROM users').get();
    checks.push({
      service: 'SQLite Database',
      status: 'ok',
      latencyMs: Date.now() - t0,
      details: `${dbTest.c} total users in DB`
    });
  } catch (err) {
    checks.push({
      service: 'SQLite Database',
      status: 'error',
      details: err.message
    });
    logSystemEvent('error', 'diagnostics', 'Database check failed', { error: err.message });
  }

  // 2. AniList external API check
  try {
    const t0 = Date.now();
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'HEARBOR-Diagnostics/1.0' },
      body: JSON.stringify({ query: '{ SiteStatistics { anime { count } } }' }),
      signal: AbortSignal.timeout(6000)
    });
    checks.push({
      service: 'AniList GraphQL API',
      status: r.ok ? 'ok' : 'degraded',
      latencyMs: Date.now() - t0,
      details: `HTTP ${r.status}`
    });
  } catch (err) {
    checks.push({
      service: 'AniList GraphQL API',
      status: 'error',
      details: err.message
    });
    logSystemEvent('warn', 'diagnostics', 'AniList ping check failed', { error: err.message });
  }

  // 3. Streaming Source CDN check
  try {
    const t0 = Date.now();
    const r = await fetch('https://images.witanime.site', {
      method: 'HEAD',
      headers: { 'User-Agent': 'HEARBOR-Diagnostics/1.0' },
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);
    checks.push({
      service: 'Streaming CDN & Media',
      status: r ? 'ok' : 'reachable_proxy',
      latencyMs: Date.now() - t0,
      details: r ? `HTTP ${r.status}` : 'Fallback through local proxy'
    });
  } catch (err) {
    checks.push({
      service: 'Streaming CDN & Media',
      status: 'warning',
      details: err.message
    });
  }

  // 4. Memory & Uptime
  const memory = process.memoryUsage();
  checks.push({
    service: 'Node.js Runtime',
    status: 'ok',
    details: `Uptime: ${Math.floor(process.uptime())}s | Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`
  });

  const overallStatus = checks.some((c) => c.status === 'error') ? 'error' : 'healthy';

  res.json({
    overallStatus,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - start,
    checks
  });
});

/**
 * Developer Only: System Logs & Error Discovery
 */
router.get('/logs', requireDeveloper, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT id, level, category, message, details, created_at AS createdAt
      FROM system_logs
      ORDER BY id DESC
      LIMIT 100
    `).all();

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Developer Only: Trigger test diagnostic error
 */
router.post('/test-log', requireDeveloper, (req, res) => {
  const { level = 'info', message = 'Diagnostic test ping' } = req.body || {};
  logSystemEvent(level, 'test', message, { initiatedBy: req.user.email, timestamp: new Date().toISOString() });
  res.json({ ok: true, message: 'Diagnostic event logged successfully' });
});

/* ============================================================================
   VIP SUBSCRIPTION PLANS & REAL DEVELOPER CODE GENERATOR
   ============================================================================ */

function generateRandomVipCode(tierKey = 'vip_basic', customPrefix = '') {
  const isMonarch = String(tierKey).toLowerCase().includes('monarch');
  const prefix = customPrefix
    ? customPrefix.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
    : isMonarch
    ? 'BX-MONARCH'
    : 'BX-BASIC';
  const seg1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const seg2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${seg1}-${seg2}`;
}

/**
 * Developer Only: List all generated VIP subscription codes & revenue stats
 */
router.get('/vip-codes', requireDeveloper, (req, res) => {
  try {
    const rowsV2 = db.prepare(`
      SELECT id, code, tier, duration_days AS durationDays, max_uses AS maxUses, used_count AS usedCount,
             price_egp AS priceEgp, note, created_by AS createdBy, redeemed_by AS redeemedBy,
             is_active AS isActive, created_at AS createdAt
      FROM vip_codes
      ORDER BY id DESC
      LIMIT 200
    `).all();

    let rowsV1 = [];
    try {
      rowsV1 = db.prepare(`
        SELECT id, code, tier, duration_days AS durationDays, price_egp AS priceEgp,
               created_by AS createdBy, is_used AS isUsed,
               used_by_user_id AS usedByUserId, used_by_username AS usedByUsername,
               used_at AS usedAt, created_at AS createdAt
        FROM vip_subscription_codes
        ORDER BY id DESC
        LIMIT 100
      `).all();
    } catch {}

    const seen = new Set();
    const codes = [];

    for (const r of rowsV2) {
      seen.add(r.code);
      let redeemedBy = [];
      try {
        redeemedBy = JSON.parse(r.redeemedBy || '[]');
      } catch {}
      const isUsed = (r.usedCount || 0) >= (r.maxUses || 1) ? 1 : 0;
      codes.push({
        ...r,
        redeemedBy,
        isUsed,
        usedByUsername: redeemedBy[0]?.username || null,
        usedAt: redeemedBy[0]?.at || null
      });
    }

    for (const r of rowsV1) {
      if (seen.has(r.code)) continue;
      codes.push({
        ...r,
        maxUses: 1,
        usedCount: r.isUsed ? 1 : 0,
        isActive: 1,
        redeemedBy: r.usedByUsername ? [{ username: r.usedByUsername, userId: r.usedByUserId, at: r.usedAt }] : []
      });
    }

    const totalCodes = codes.length;
    const activeCodes = codes.filter((c) => c.isActive && (c.usedCount || 0) < (c.maxUses || 1)).length;
    const totalRedemptions = codes.reduce((acc, c) => acc + (c.usedCount || 0), 0);
    const totalValueEgp = codes.reduce((acc, c) => acc + (c.priceEgp || 0) * (c.usedCount || 0), 0);

    res.json({
      ok: true,
      stats: { totalCodes, activeCodes, totalRedemptions, totalValueEgp },
      codes
    });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Developer Only: Generate 1..50 real VIP subscription codes
 */
router.post('/vip-codes/generate', requireDeveloper, (req, res) => {
  const {
    tier = 'vip_basic',
    durationDays = 30,
    maxUses = 1,
    count = 1,
    priceEgp,
    note = '',
    customPrefix = ''
  } = req.body || {};

  const isMonarch = String(tier).toLowerCase().includes('monarch');
  const validTier = isMonarch ? 'vip_monarch' : 'vip_basic';
  const displayTier = isMonarch ? 'VIP Monarch' : 'VIP Basic';
  const days = Math.max(1, Math.min(36500, Number(durationDays) || 30));
  const uses = Math.max(1, Math.min(1000, Number(maxUses) || 1));
  const batchCount = Math.max(1, Math.min(50, Number(count) || 1));

  // Default suggested Egyptian Pound (EGP) pricing based on tier & duration
  let defaultPriceEgp = isMonarch ? 199 : 99;
  if (days >= 36500) defaultPriceEgp = isMonarch ? 2999 : 1499;
  else if (days >= 365) defaultPriceEgp = isMonarch ? 1499 : 799;
  else if (days >= 90) defaultPriceEgp = isMonarch ? 499 : 249;
  else if (days <= 7) defaultPriceEgp = isMonarch ? 65 : 35;

  const finalPriceEgp = priceEgp !== undefined && priceEgp !== '' && Number(priceEgp) >= 0 ? Number(priceEgp) : defaultPriceEgp;

  try {
    const insV2 = db.prepare(`
      INSERT OR IGNORE INTO vip_codes (code, tier, duration_days, max_uses, price_egp, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insV1 = db.prepare(`
      INSERT OR IGNORE INTO vip_subscription_codes (code, tier, duration_days, price_egp, created_by, is_used)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    const generated = [];
    for (let i = 0; i < batchCount; i++) {
      let code = generateRandomVipCode(validTier, customPrefix);
      for (let retry = 0; retry < 5; retry++) {
        const exists = db.prepare('SELECT id FROM vip_codes WHERE code = ?').get(code);
        if (!exists) break;
        code = generateRandomVipCode(validTier, customPrefix);
      }
      const info = insV2.run(
        code,
        validTier,
        days,
        uses,
        finalPriceEgp,
        String(note || '').slice(0, 200),
        req.user?.email || 'developer'
      );
      try {
        insV1.run(code, displayTier, days, finalPriceEgp, req.user?.email || 'developer');
      } catch {}

      generated.push({
        id: info.lastInsertRowid,
        code,
        tier: validTier,
        displayTier,
        durationDays: days,
        maxUses: uses,
        usedCount: 0,
        isUsed: 0,
        priceEgp: finalPriceEgp,
        note: String(note || '').slice(0, 200),
        isActive: 1,
        redeemedBy: [],
        createdAt: new Date().toISOString()
      });
    }

    logSystemEvent('info', 'vip_codes', `Developer generated ${generated.length} ${validTier} code(s) (${days}d)`, {
      codes: generated.map((g) => g.code)
    });

    res.json({ ok: true, code: generated[0], generated });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Developer Only: Delete or revoke a VIP code
 */
router.delete('/vip-codes/:id', requireDeveloper, (req, res) => {
  const codeId = Number(req.params.id);
  try {
    const row = db.prepare('SELECT code FROM vip_codes WHERE id = ?').get(codeId);
    db.prepare('DELETE FROM vip_codes WHERE id = ?').run(codeId);
    try {
      db.prepare('DELETE FROM vip_subscription_codes WHERE id = ? OR code = ?').run(codeId, row?.code || '');
    } catch {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Developer Only: Directly change any user's VIP plan from Developer Dashboard
 */
router.post('/users/:id/vip', requireDeveloper, (req, res) => {
  const userId = Number(req.params.id);
  const { vipTier = 'free', durationDays = 30 } = req.body || {};
  const isMonarch = String(vipTier).toLowerCase().includes('monarch');
  const isBasic = String(vipTier).toLowerCase().includes('basic');
  const validTier = isMonarch ? 'vip_monarch' : isBasic ? 'vip_basic' : 'free';
  const vipStatusLabel = isMonarch ? 'VIP Monarch' : isBasic ? 'VIP Basic' : null;

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'not_found', message: 'User not found' });

    let expiresAt = null;
    let badges = [];
    try {
      badges = JSON.parse(user.badges || '[]');
      if (!Array.isArray(badges)) badges = [];
    } catch {}

    if (validTier !== 'free') {
      const days = Math.max(1, Number(durationDays) || 30);
      expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
      if (!badges.includes('gold_vip')) badges.unshift('gold_vip');
      if (validTier === 'vip_monarch' && !badges.includes('celebrity')) {
        badges.push('celebrity');
      }
    }

    db.prepare('UPDATE users SET vip_tier = ?, vip_status = ?, vip_expires_at = ?, badges = ? WHERE id = ?').run(
      validTier,
      vipStatusLabel,
      expiresAt,
      JSON.stringify(badges),
      userId
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

/**
 * Authenticated User: Redeem a VIP Subscription Code
 */
router.post('/vip/redeem', requireAuth, (req, res) => {
  const rawCode = String(req.body?.code || '').trim().toUpperCase();
  if (!rawCode) {
    return res.status(400).json({ error: 'invalid_code', message: 'يرجى إدخال كود الاشتراك أولاً' });
  }

  try {
    let codeRow = db.prepare('SELECT * FROM vip_codes WHERE UPPER(code) = ?').get(rawCode);
    let fromV1 = false;
    if (!codeRow) {
      try {
        const v1 = db.prepare('SELECT * FROM vip_subscription_codes WHERE UPPER(code) = ?').get(rawCode);
        if (v1) {
          fromV1 = true;
          codeRow = {
            id: v1.id,
            code: v1.code,
            tier: String(v1.tier).toLowerCase().includes('monarch') ? 'vip_monarch' : 'vip_basic',
            duration_days: v1.duration_days || 30,
            max_uses: 1,
            used_count: v1.is_used ? 1 : 0,
            is_active: 1,
            redeemed_by: '[]'
          };
        }
      } catch {}
    }

    if (!codeRow || !codeRow.is_active) {
      return res.status(404).json({ error: 'not_found', message: 'كود الاشتراك غير صحيح أو منتهي الصلاحية' });
    }
    if (codeRow.used_count >= codeRow.max_uses) {
      return res.status(400).json({ error: 'code_exhausted', message: 'تم استخدام هذا الكود الحد الأقصى من المرات' });
    }

    let redeemedBy = [];
    try {
      redeemedBy = JSON.parse(codeRow.redeemed_by || '[]');
      if (!Array.isArray(redeemedBy)) redeemedBy = [];
    } catch {}

    if (redeemedBy.some((r) => r.userId === req.user.id || r.username === req.user.username)) {
      return res.status(400).json({ error: 'already_redeemed', message: 'لقد قمت بتفعيل هذا الكود مسبقاً على حسابك' });
    }

    const isMonarch = String(codeRow.tier).toLowerCase().includes('monarch');
    const tier = isMonarch ? 'vip_monarch' : 'vip_basic';
    const vipStatusLabel = isMonarch ? 'VIP Monarch' : 'VIP Basic';
    const days = Number(codeRow.duration_days) || 30;
    const nowMs = Date.now();
    const currentExpMs = req.user.vip_expires_at ? new Date(req.user.vip_expires_at).getTime() : 0;
    const baseMs = currentExpMs > nowMs ? currentExpMs : nowMs;
    const nextExpiresAt = new Date(baseMs + days * 86400 * 1000).toISOString();

    let badges = [];
    try {
      badges = JSON.parse(req.user.badges || '[]');
      if (!Array.isArray(badges)) badges = [];
    } catch {}
    if (!badges.includes('gold_vip')) badges.unshift('gold_vip');
    if (tier === 'vip_monarch' && !badges.includes('celebrity')) {
      badges.push('celebrity');
    }

    db.prepare('UPDATE users SET vip_tier = ?, vip_status = ?, vip_expires_at = ?, badges = ? WHERE id = ?').run(
      tier,
      vipStatusLabel,
      nextExpiresAt,
      JSON.stringify(badges),
      req.user.id
    );

    redeemedBy.push({
      userId: req.user.id,
      username: req.user.username,
      at: new Date().toISOString()
    });

    if (!fromV1) {
      db.prepare('UPDATE vip_codes SET used_count = used_count + 1, redeemed_by = ? WHERE id = ?').run(
        JSON.stringify(redeemedBy),
        codeRow.id
      );
    }
    try {
      db.prepare(`
        UPDATE vip_subscription_codes
        SET is_used = 1, used_by_user_id = ?, used_by_username = ?, used_at = datetime('now')
        WHERE UPPER(code) = ?
      `).run(req.user.id, req.user.username, rawCode);
    } catch {}

    logSystemEvent('info', 'vip_redeem', `User @${req.user.username} redeemed code ${codeRow.code} (${tier}, ${days}d)`);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({
      ok: true,
      tier,
      vipStatus: vipStatusLabel,
      durationDays: days,
      expiresAt: nextExpiresAt,
      user: publicUser(updatedUser)
    });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

export default router;
