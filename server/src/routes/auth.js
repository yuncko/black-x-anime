import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie, publicUser, requireAuth, requireJwtSecret, DEVELOPER_EMAIL, verifyFirebaseGoogleIdToken } from '../auth.js';
import { social } from '../lib/socialDb.js';
import { syncUserToCloud, fetchUserFromCloud, syncAllLocalUsersToCloud, dropLocalUserIfDeleted } from '../services/cloudSync.service.js';
import { verifyCloudPassword } from '../services/apkAccounts.js';

const router = Router();

// Reconcile local accounts only for the long-lived Node host. Vercel runs
// serverless functions, so repeating a full-account sync on every cold start
// wastes invocations; individual auth/library writes still sync on demand.
if (!process.env.VERCEL) {
  setTimeout(() => {
    syncAllLocalUsersToCloud().catch(() => {});
  }, 1500);
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

router.post('/register', requireJwtSecret, (req, res) => {
  const { username, email, password, displayName, referralCode } = req.body || {};
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'invalid_username', message: 'Username must be 3-24 chars (letters, numbers, _ . -)' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address' });
  }
  if (email.toLowerCase() === DEVELOPER_EMAIL) {
    return res.status(403).json({ error: 'google_sign_in_required', message: 'This account must use verified Google sign-in.' });
  }
  if (username.toLowerCase() === 'developer') {
    return res.status(403).json({ error: 'reserved_username', message: 'This username is reserved.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 6 characters' });
  }

  const exists = db.prepare('SELECT id, email FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(username.toLowerCase(), email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'exists', message: 'Username or email already taken' });
  }

  const palette = ['#22d3ee', '#8b5cf6', '#f472b6', '#a3e635', '#fb923c', '#f87171', '#60a5fa'];
  const color = palette[Math.floor(Math.random() * palette.length)];

  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash, display_name, avatar_color, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username.toLowerCase(), email.toLowerCase(), hashPassword(password), displayName || username, color, 'user');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  // Real referral tracking
  if (referralCode) {
    try {
      let cleanRef = String(referralCode).trim();
      if (cleanRef.toUpperCase().startsWith('BLACKX-')) {
        cleanRef = cleanRef.slice(7);
      }
      const referrer = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = ?').get(cleanRef.toLowerCase());
      if (referrer && referrer.username.toLowerCase() !== username.toLowerCase()) {
        social.addReferral(String(referrer.id), user.username);
        try {
          db.prepare(`
            INSERT INTO user_notifications (id, user_id, title, message, link, read)
            VALUES (?, ?, ?, ?, ?, 0)
          `).run(
            `ref_${Date.now()}_${referrer.id}`,
            referrer.id,
            '🎉 انضم صديق جديد عبر دعوتك!',
            `سجل @${user.username} بنجاح عبر رابط دعوتك الخاص!`,
            '/profile?tab=referrals'
          );
        } catch {}
      }
    } catch (refErr) {
      console.warn('Referral tracking warning:', refErr.message);
    }
  }

  const token = signToken(user);
  setAuthCookie(res, token);
  syncUserToCloud(user, password).catch(() => {});
  res.status(201).json({ user: publicUser(user), token });
});

router.post('/login', requireJwtSecret, async (req, res) => {
  const { username, email, password } = req.body || {};
  const identifier = (username || email || '').trim().toLowerCase();
  if (!identifier || !password) {
    return res.status(400).json({ error: 'missing_credentials', message: 'Enter your username/email and password' });
  }
  if (identifier === DEVELOPER_EMAIL || identifier === 'developer') {
    return res.status(401).json({ error: 'google_sign_in_required', message: 'Use verified Google sign-in for this account.' });
  }

  let user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(identifier, identifier);
  if (user && (user.email?.toLowerCase() === DEVELOPER_EMAIL || user.role === 'developer')) {
    return res.status(401).json({ error: 'google_sign_in_required', message: 'Use verified Google sign-in for this account.' });
  }
  // The account may have been deleted in the app after this server copied it.
  if (user && (await dropLocalUserIfDeleted(user).catch(() => false))) user = null;

  // If user registered on the Android APK, pull their account from shared Cloud Firestore
  if (!user) {
    try {
      const cloudUser = await fetchUserFromCloud(identifier);
      const cloudIdentifierMatches = cloudUser && (identifier.includes('@')
        ? String(cloudUser.email || '').toLowerCase() === identifier
        : String(cloudUser.username || '').toLowerCase() === identifier);
      // bcrypt (current) or the legacy SHA-256 of accounts created by older APKs.
      if (cloudIdentifierMatches && (await verifyCloudPassword(cloudUser, password)).ok) {
        const uname = (cloudUser.username || identifier.split('@')[0] || 'user').toLowerCase();
        const uemail = (cloudUser.email || `${uname}@blackx.app`).toLowerCase();
        const info = db.prepare(
          'INSERT INTO users (username, email, password_hash, display_name, avatar_color, photo_url, bio, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          uname,
          uemail,
          hashPassword(password),
          cloudUser.displayName || uname,
          cloudUser.avatarColor || '#22d3ee',
          cloudUser.photoUrl || '',
          cloudUser.bio || '',
          'user'
        );
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    } catch (_) {}
  }

  if (!user) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Invalid credentials' });
  }

  const valid = verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Invalid credentials' });
  }

  const token = signToken(user);
  setAuthCookie(res, token);
  syncUserToCloud(user, password).catch(() => {});
  res.json({ user: publicUser(user), token });
});

router.post('/google', requireJwtSecret, async (req, res) => {
  const { idToken, displayName, photoURL, username: customUsername, bio, avatarColor } = req.body || {};
  if (typeof idToken !== 'string' || !idToken) {
    return res.status(401).json({ error: 'google_token_required', message: 'Verified Google sign-in is required.' });
  }

  let identity;
  try {
    identity = await verifyFirebaseGoogleIdToken(idToken);
  } catch (err) {
    console.error('[auth/google] token verification unavailable:', err?.message || err);
    return res.status(503).json({ error: 'auth_verification_unavailable', message: 'Google sign-in verification is temporarily unavailable.' });
  }
  if (!identity) {
    return res.status(401).json({ error: 'invalid_google_token', message: 'Google sign-in could not be verified.' });
  }

  const email = identity.email;
  const uid = identity.uid;
  const isDev = email === DEVELOPER_EMAIL;
  const safeDisplayName = String(displayName || identity.displayName || '').trim().slice(0, 120);
  const safePhotoURL = String(photoURL || identity.photoURL || '').trim().slice(0, 2_000_000);
  const safeBio = typeof bio === 'string' ? bio.trim().slice(0, 200) : '';

  let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
  // Deleted in the app since this server copied it: signing in again starts a new account.
  if (user && (await dropLocalUserIfDeleted(user).catch(() => false))) user = null;

  if (!user) {
    let baseUsername = String(customUsername || email.split('@')[0] || 'user')
      .replace(/[^a-zA-Z0-9_.-]/g, '')
      .slice(0, 18);
    if (baseUsername.length < 3) baseUsername = `user_${Math.random().toString(36).slice(2, 7)}`;
    if (baseUsername.toLowerCase() === 'developer' && !isDev) baseUsername = 'user_developer';

    const palette = ['#22d3ee', '#8b5cf6', '#f472b6', '#a3e635', '#fb923c', '#f87171', '#60a5fa'];
    const safeAvatarColor = /^#[0-9a-f]{6}$/i.test(String(avatarColor || ''))
      ? avatarColor
      : palette[Math.floor(Math.random() * palette.length)];
    const dummyHash = `google-oauth-only:${uid}`;
    const insertGoogleUser = db.prepare(
      'INSERT OR IGNORE INTO users (username, email, password_hash, display_name, avatar_color, photo_url, bio, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    // Firebase onAuthStateChanged and the explicit Google-login handler can
    // hit this endpoint at nearly the same time. Re-read by email after each
    // insert attempt so a unique-key race never returns another user's row.
    for (let attempt = 0; attempt < 5 && !user; attempt += 1) {
      const username = attempt === 0
        ? baseUsername
        : `${baseUsername.slice(0, 17)}_${Math.random().toString(36).slice(2, 7)}`;
      insertGoogleUser.run(
        username.toLowerCase(), email, dummyHash,
        safeDisplayName || (isDev ? 'Developer MZ' : username),
        safeAvatarColor, safePhotoURL, safeBio, isDev ? 'developer' : 'user'
      );
      user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
    }
    if (!user) {
      return res.status(409).json({ error: 'username_conflict', message: 'Could not create the account. Please try again.' });
    }
  } else {
    const verifiedRole = isDev ? 'developer' : 'user';
    if (user.role !== verifiedRole) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(verifiedRole, user.id);
      user.role = verifiedRole;
    }
    if (safeDisplayName && safeDisplayName !== user.display_name && safeDisplayName !== 'Anime Fan') {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(safeDisplayName, user.id);
      user.display_name = safeDisplayName;
    }
    if (safePhotoURL && safePhotoURL !== user.photo_url) {
      db.prepare('UPDATE users SET photo_url = ? WHERE id = ?').run(safePhotoURL, user.id);
      user.photo_url = safePhotoURL;
    }
    if (avatarColor && /^#[0-9a-f]{6}$/i.test(String(avatarColor)) && avatarColor !== user.avatar_color) {
      db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(avatarColor, user.id);
      user.avatar_color = avatarColor;
    }
    if (safeBio && safeBio !== user.bio) {
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(safeBio, user.id);
      user.bio = safeBio;
    }
  }

  const token = signToken(user);
  setAuthCookie(res, token);
  syncUserToCloud(user).catch(() => {});
  res.json({ user: publicUser(user), token });
});

/**
 * Update user profile (username, displayName, avatarColor, photoUrl, bio)
 */
router.put('/profile', requireAuth, (req, res) => {
  const { displayName, username, avatarColor, photoUrl, bio } = req.body || {};
  const current = req.user;

  if (username && username.toLowerCase() !== current.username.toLowerCase()) {
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'invalid_username', message: 'Username must be 3-24 characters (letters, numbers, _ . -)' });
    }
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.toLowerCase(), current.id);
    if (taken) {
      return res.status(409).json({ error: 'username_taken', message: 'Username is already taken' });
    }
  }

  const newDisplayName = (displayName || current.display_name).trim().slice(0, 60);
  const newUsername = (username || current.username).trim().toLowerCase();
  const newColor = avatarColor || current.avatar_color;
  const newPhoto = typeof photoUrl === 'string' ? photoUrl.trim().slice(0, 2000000) : (current.photo_url || '');
  const newBio = typeof bio === 'string' ? bio.trim().slice(0, 200) : (current.bio || '');

  db.prepare(`
    UPDATE users
    SET display_name = ?, username = ?, avatar_color = ?, photo_url = ?, bio = ?
    WHERE id = ?
  `).run(newDisplayName, newUsername, newColor, newPhoto, newBio, current.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(current.id);
  const token = signToken(updated);
  setAuthCookie(res, token);
  syncUserToCloud(updated).catch(() => {});
  res.json({ user: publicUser(updated), token });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * Redeem VIP Subscription Code (Activated by user)
 */
router.post('/redeem-vip-code', requireAuth, (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'invalid_code', message: 'يرجى إدخال كود اشتراك صالح' });
    }
    const cleanCode = code.trim().toUpperCase();
    let row = db.prepare('SELECT * FROM vip_subscription_codes WHERE UPPER(code) = ?').get(cleanCode);
    const rowV2 = db.prepare('SELECT * FROM vip_codes WHERE UPPER(code) = ?').get(cleanCode);

    if (!row && !rowV2) {
      return res.status(404).json({ error: 'not_found', message: 'كود الاشتراك غير صحيح أو غير موجود' });
    }
    if ((row && row.is_used && (!rowV2 || rowV2.used_count >= rowV2.max_uses)) || (rowV2 && rowV2.used_count >= rowV2.max_uses)) {
      return res.status(400).json({ error: 'already_used', message: 'تم استخدام هذا الكود من قبل مسبقاً' });
    }

    const rawTier = (rowV2?.tier || row?.tier || 'VIP Basic');
    const isMonarch = String(rawTier).toLowerCase().includes('monarch');
    const vipStatusLabel = isMonarch ? 'VIP Monarch' : 'VIP Basic';
    const vipTierKey = isMonarch ? 'vip_monarch' : 'vip_basic';
    const durationDays = rowV2?.duration_days || row?.duration_days || 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    if (row) {
      db.prepare(`
        UPDATE vip_subscription_codes
        SET is_used = 1, used_by_user_id = ?, used_by_username = ?, used_at = datetime('now')
        WHERE id = ?
      `).run(req.user.id, req.user.username, row.id);
    }
    if (rowV2) {
      let redeemedBy = [];
      try { redeemedBy = JSON.parse(rowV2.redeemed_by || '[]'); } catch {}
      redeemedBy.push({ userId: req.user.id, username: req.user.username, at: new Date().toISOString() });
      db.prepare('UPDATE vip_codes SET used_count = used_count + 1, redeemed_by = ? WHERE id = ?').run(JSON.stringify(redeemedBy), rowV2.id);
    }

    // Update user vip_status, vip_tier and badges
    let badges = [];
    try {
      badges = typeof req.user.badges === 'string' ? JSON.parse(req.user.badges || '[]') : (req.user.badges || []);
      if (!Array.isArray(badges)) badges = [];
    } catch {
      badges = [];
    }
    if (!badges.includes('gold_vip')) {
      badges.unshift('gold_vip');
    }
    if (isMonarch && !badges.includes('celebrity')) {
      badges.push('celebrity');
    }

    db.prepare(`
      UPDATE users
      SET vip_status = ?, vip_tier = ?, vip_expires_at = ?, badges = ?
      WHERE id = ?
    `).run(vipStatusLabel, vipTierKey, expiresAt, JSON.stringify(badges), req.user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    res.json({
      ok: true,
      message: `تم تفعيل اشتراك ${vipStatusLabel} بنجاح لمدة ${durationDays} يوماً! 🎉`,
      tier: vipStatusLabel,
      vipTier: vipTierKey,
      expiresAt,
      user: publicUser(updatedUser)
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

/**
 * Optional me: returns 200 with user:null when unauthenticated
 * (avoids noisy 401s on first load; login state is simply null).
 */
router.get('/me', (req, res) => {
  const user = req.user;
  if (!user) return res.json({ user: null, stats: null });
  const favorites = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
  const watchedEpisodes = db.prepare('SELECT COUNT(*) AS c FROM progress WHERE user_id = ?').get(user.id).c;
  const completed = db.prepare('SELECT COUNT(*) AS c FROM progress WHERE user_id = ? AND completed = 1').get(user.id).c;
  const showsTracked = db.prepare('SELECT COUNT(DISTINCT slug) AS c FROM progress WHERE user_id = ?').get(user.id).c;
  res.json({
    user: publicUser(user),
    stats: { favorites, watchedEpisodes, completed, showsTracked }
  });
});

export default router;
