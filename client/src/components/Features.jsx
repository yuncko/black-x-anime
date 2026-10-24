import { imgFallback } from '../hooks/hooks.js';
/**
 * Feature panels — ratings, gamification, follow, profile customization,
 * creator submissions and support tickets. Liquid-glass styling via the
 * existing classes; bilingual through useI18n.
 */
import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';

function LoginNote() {
  const { t } = useI18n();
  return (
    <p style={{ opacity: 0.75, margin: 0, fontSize: '0.9rem' }}>
      🔒 {t('account.loginFirst')}
    </p>
  );
}

function Panel({ icon, title, children }) {
  return (
    <section className="glass fx-panel">
      <h3 className="fx-panel__title">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------ ratings ------------------------------ */

export function RatingPanel({ slug, title }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user || !slug) return undefined;
    let alive = true;
    api.get(`/api/content/rating?slug=${encodeURIComponent(slug)}`)
      .then((d) => { if (alive && d.rating?.score) setScore(d.rating.score); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, slug]);

  if (!user) {
    return (
      <section className="glass fx-panel">
        <h3 className="fx-panel__title"><span>⭐</span> {t('account.rating')}</h3>
        <LoginNote />
      </section>
    );
  }

  const send = async (s) => {
    setBusy(true);
    setSaved(false);
    try {
      await api.post('/api/content/rate', { slug, title, score: s });
      setScore(s);
      setSaved(true);
      pushToast?.(t('account.rateSaved'), 'success');
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass fx-panel">
      <h3 className="fx-panel__title"><span>⭐</span> {t('account.rating')}</h3>
      <p style={{ opacity: 0.75, margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{t('account.rateHint')}</p>
      <div className="stars" role="group" aria-label={t('account.rating')}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`star-btn${n <= (score || 0) ? ' star-btn--on' : ''}`}
            disabled={busy}
            onClick={() => send(n)}
            aria-label={`${n}`}
          >
            {n <= (score || 0) ? '★' : '☆'}
          </button>
        ))}
      </div>
      {saved && <p className="fx-done">✓ {t('account.rateSaved')}</p>}
    </section>
  );
}

/* ---------------------------- gamification ---------------------------- */

export function GamificationPanel() {
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadStats = () => {
    if (!user) { setBusy(false); return; }
    api.get('/api/gamification/stats')
      .then((d) => setData(d.data))
      .catch(() => setData(null))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    loadStats();
  }, [user]);

  const simulateActivity = async (type, sessionMinutes) => {
    setSyncing(true);
    try {
      const res = await api.post('/api/gamification/sync-time', { type, sessionMinutes });
      pushToast?.(
        lang === 'ar'
          ? `✓ تم تسجيل النشاط! ${type === 'watch' ? 'مشاهدة أنمي' : 'قراءة مانجا'} (+${sessionMinutes * 10} XP)`
          : `✓ Activity logged! ${type === 'watch' ? 'Anime watch' : 'Manga read'} (+${sessionMinutes * 10} XP)`,
        'success'
      );
      if (res?.levelUp) {
        pushToast?.(
          lang === 'ar'
            ? `🎉 مبروك! ارتقيت إلى المستوى الجديد: Level ${res.newLevel}!`
            : `🎉 Level Up! You reached Level ${res.newLevel}!`,
          'success'
        );
      }
      loadStats();
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Panel icon="🏆" title={t('account.statsTitle')}>
      {!user ? <LoginNote /> : busy ? (
        <p style={{ opacity: 0.6, margin: 0 }}>…</p>
      ) : !data ? (
        <p style={{ opacity: 0.6, margin: 0 }}>{t('error.generic')}</p>
      ) : (
        <>
          {/* Rank Badge */}
          {data.rank && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.95rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem' }}>{data.rank.icon || '🎖️'}</span>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-dim)', display: 'block' }}>{t('account.rank')}</span>
                  <strong style={{ fontSize: '0.92rem', color: data.rank.color || 'var(--cyan)' }}>
                    {lang === 'ar' ? data.rank.titleAr : data.rank.titleEn}
                  </strong>
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--ink-dim)', display: 'block' }}>{t('account.xp')}</span>
                <strong style={{ color: 'var(--cyan)', fontSize: '0.95rem' }}>{formatNumber(data.xp || 0)} XP</strong>
              </div>
            </div>
          )}

          <div className="fx-grid fx-grid--stats">
            <div className="stat-tile">
              <div className="stat-tile__value">{formatNumber ? formatNumber(data.currentLevel) : data.currentLevel}</div>
              <div className="stat-tile__label">{t('account.level')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__value">{formatNumber ? formatNumber(data.totalWatchTimeMin) : data.totalWatchTimeMin}</div>
              <div className="stat-tile__label">{t('account.watchTime')}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__value">{formatNumber ? formatNumber(data.totalReadTimeMin || 0) : 0}</div>
              <div className="stat-tile__label">{t('account.readTime')}</div>
            </div>
          </div>

          <div style={{ margin: '0.75rem 0 0.35rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
            <span>{t('account.levelProgress')}</span>
            <span>{data.progressPercentage}%</span>
          </div>
          <div className="fx-progress" aria-hidden="true">
            <div className="fx-progress__fill" style={{ width: `${Math.min(100, data.progressPercentage)}%` }} />
          </div>

          {/* Quick activity test buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => simulateActivity('watch', 24)}
              disabled={syncing}
              style={{ flex: 1, fontSize: '0.76rem', padding: '0.4rem 0.6rem' }}
            >
              🎬 {lang === 'ar' ? 'سجل حلقة (+24 د)' : 'Log Watch (24m)'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => simulateActivity('read', 20)}
              disabled={syncing}
              style={{ flex: 1, fontSize: '0.76rem', padding: '0.4rem 0.6rem' }}
            >
              📖 {lang === 'ar' ? 'سجل قراءة (+20 د)' : 'Log Read (20m)'}
            </button>
          </div>

          <h4 style={{ margin: '1rem 0 0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>🎖 {t('account.badges')}</h4>
          {data.unlockedBadges?.length ? (
            <div className="fx-badges">
              {data.unlockedBadges.map((b) => (
                <span key={b.name} className="chip" title={b.name}>
                  {b.iconUrl ? <img onError={imgFallback} src={b.iconUrl} alt="" width={18} height={18} referrerPolicy="no-referrer" /> : '🏅'} {b.name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ opacity: 0.65, margin: 0, fontSize: '0.88rem' }}>{t('account.noBadges')}</p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------- follow ------------------------------- */

export function FollowPanel() {
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState(null);

  const loadNetwork = () => {
    if (!user?.username) return;
    api.get(`/api/community/network/${user.username}`)
      .then((res) => setNetwork(res))
      .catch(() => {});
  };

  useEffect(() => {
    loadNetwork();
  }, [user?.username]);

  const send = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.post('/api/community/follow', { targetUsername: name.trim() });
      pushToast?.(t('account.followed'), 'success');
      setName('');
      loadNetwork();
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon="➕" title={t('account.followTitle')}>
      {!user ? <LoginNote /> : (
        <div>
          {network && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                <strong style={{ fontSize: '1.2rem', color: 'var(--cyan)' }}>{formatNumber(network.followersCount || 0)}</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--ink-dim)' }}>{lang === 'ar' ? 'المتابعون' : 'Followers'}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem', borderRadius: '10px', textAlign: 'center' }}>
                <strong style={{ fontSize: '1.2rem', color: 'var(--magenta)' }}>{formatNumber(network.followingCount || 0)}</strong>
                <div style={{ fontSize: '0.74rem', color: 'var(--ink-dim)' }}>{lang === 'ar' ? 'تتابعهم' : 'Following'}</div>
              </div>
            </div>
          )}

          <form onSubmit={send}>
            <p style={{ opacity: 0.75, margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{t('account.followHint')}</p>
            <div className="fx-row">
              <input
                className="input"
                placeholder={t('account.followPh')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
              <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
                <span className="btn__shine" /> {t('account.followBtn')}
              </button>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------- customize ----------------------------- */

export function CustomizePanel() {
  const { t, lang } = useI18n();
  const { user, refresh } = useAuth();
  const [bannerUrl, setBannerUrl] = useState('');
  const [frameStyle, setFrameStyle] = useState('default');
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);

  const PRESET_BANNERS = [
    { label: 'Cyberpunk Tokyo', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80' },
    { label: 'Dark Nebula', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80' },
    { label: 'Sakura Sunset', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80' },
    { label: 'Shadow Monarch', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80' }
  ];

  const FRAMES = [
    { id: 'default', labelAr: 'بدون إطار', labelEn: 'Default' },
    { id: 'royal-flame', labelAr: 'لهب التنين الملكي 🔥 (3D)', labelEn: 'Royal Flame 3D 🔥' },
    { id: 'cyber-neon', labelAr: 'نيون سايبربانك ⚡ (3D)', labelEn: 'Cyber Neon 3D ⚡' },
    { id: 'shadow-monarch', labelAr: 'هالة ملك الظلال 👑 (3D)', labelEn: 'Shadow Monarch 3D 👑' },
    { id: 'imperial-gold', labelAr: 'التاج الإمبراطوري ⚜️ (3D)', labelEn: 'Imperial Gold 3D ⚜️' },
    { id: 'sakura-blossom', labelAr: 'أزهار الساكورا 🌸 (3D)', labelEn: 'Sakura Blossom 3D 🌸' },
    { id: 'prismatic-diamond', labelAr: 'الماسة الكريستالية 💎 (3D)', labelEn: 'Prismatic Diamond 3D 💎' },
    { id: 'celestial-void', labelAr: 'الفضاء الكوني 🌌 (3D)', labelEn: 'Celestial Void 3D 🌌' },
    { id: 'dragon-ascension', labelAr: 'التنين السماوي 🐉 (3D)', labelEn: 'Dragon Ascension 3D 🐉' }
  ];

  useEffect(() => {
    if (user) {
      api.get('/api/profile/profile')
        .then((res) => {
          if (res?.data) {
            setBannerUrl(res.data.bannerUrl || '');
            setFrameStyle(res.data.frameStyle || 'default');
            setTheme(res.data.themePreference || '');
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const body = {
        bannerUrl: bannerUrl.trim(),
        frameStyle,
        themePreference: theme.trim()
      };
      await api.put('/api/profile/customize', body);
      pushToast?.(t('account.saved'), 'success');
      refresh?.();
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon="🎨" title={t('account.customizeTitle')}>
      {!user ? <LoginNote /> : (
        <form onSubmit={send}>
          <div className="field">
            <label className="field__label" htmlFor="fx-banner">{t('account.bannerUrl')}</label>
            <input id="fx-banner" className="input" placeholder="https://…" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
          </div>

          {/* Quick preset banners */}
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--ink-dim)', display: 'block', marginBottom: '0.4rem' }}>
              🖼️ {t('account.presetBanners')}:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {PRESET_BANNERS.map((pb) => (
                <button
                  key={pb.label}
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ fontSize: '0.74rem', padding: '0.25rem 0.55rem' }}
                  onClick={() => setBannerUrl(pb.url)}
                >
                  {pb.label}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar Frames Selector */}
          <div className="field">
            <label className="field__label">{t('account.profileFrames')}</label>
            <select
              className="input"
              value={frameStyle}
              onChange={(e) => setFrameStyle(e.target.value)}
              style={{ background: 'var(--bg-card)' }}
            >
              {FRAMES.map((f) => (
                <option key={f.id} value={f.id}>
                  {lang === 'ar' ? f.labelAr : f.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="fx-theme">{t('account.themePref')}</label>
            <input id="fx-theme" className="input" placeholder={t('account.themePh')} value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>

          <button type="submit" className="btn btn--primary" disabled={busy}>
            <span className="btn__shine" /> {t('account.save')}
          </button>
        </form>
      )}
    </Panel>
  );
}

/* ----------------------------- referrals ----------------------------- */

export function ReferralPanel() {
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();
  const [refData, setRefData] = useState(null);
  const [inviting, setInviting] = useState(false);

  const loadReferrals = () => {
    if (!user) return;
    api.get('/api/gamification/referrals')
      .then((res) => setRefData(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    loadReferrals();
  }, [user]);

  const copyLink = () => {
    if (!refData?.referralLink) return;
    navigator.clipboard.writeText(refData.referralLink);
    pushToast?.(t('account.linkCopied'), 'success');
  };

  const handleMockInvite = async () => {
    setInviting(true);
    try {
      const res = await api.post('/api/gamification/referrals/mock-invite');
      pushToast?.(`✓ ${res.message}`, 'success');
      if (res?.data?.isVipUnlocked) {
        pushToast?.(
          lang === 'ar'
            ? '👑 مبروك! وصلت إلى 3 دعوات وفزت باشتراك VIP Basic مجاناً!'
            : '👑 Congratulations! You invited 3 friends and unlocked VIP Basic free!',
          'success'
        );
      }
      loadReferrals();
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setInviting(false);
    }
  };

  return (
    <Panel icon="🎁" title={t('account.referralsTitle')}>
      {!user ? <LoginNote /> : !refData ? (
        <p style={{ opacity: 0.6 }}>…</p>
      ) : (
        <div>
          <p style={{ opacity: 0.75, margin: '0 0 1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {t('account.referralsSub')}
          </p>

          {/* VIP Unlocked Banner if count >= 3 */}
          {refData.isVipUnlocked ? (
            <div className="vip-card-banner" style={{ marginBottom: '1.25rem' }}>
              <div>
                <strong style={{ fontSize: '1rem', color: '#eab308', display: 'block' }}>
                  👑 {t('account.vipUnlocked')}
                </strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-dim)' }}>
                  {lang === 'ar'
                    ? 'تمت ترقية حسابك إلى VIP Basic تلقائياً بفضل دعوة أصدقائك!'
                    : 'Your account is upgraded to VIP Basic thanks to your friend referrals!'}
                </span>
              </div>
              <span className="badge badge--vip" style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
                VIP Active
              </span>
            </div>
          ) : (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '0.4rem' }}>
                <span>{t('account.invitedCount', { count: refData.count, target: refData.target })}</span>
                <strong style={{ color: 'var(--cyan)' }}>{Math.round((refData.count / refData.target) * 100)}%</strong>
              </div>
              <div className="fx-progress">
                <div className="fx-progress__fill" style={{ width: `${Math.min(100, (refData.count / refData.target) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Referral link box */}
          <div className="referral-box" style={{ marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--cyan)', wordBreak: 'break-all' }}>
              {refData.referralLink}
            </span>
            <button type="button" className="btn btn--primary btn--sm" onClick={copyLink}>
              {t('account.copyLink')}
            </button>
          </div>

          {/* Real Share Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `انضم معي إلى منصة Hearbor لمشاهدة وقراءة أحدث الأنمي والمانجا بجودة فائقة! ${refData.referralLink}`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn--sm"
              style={{ background: '#25D366', color: '#fff', textDecoration: 'none', fontWeight: 700 }}
            >
              💬 WhatsApp
            </a>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(refData.referralLink)}&text=${encodeURIComponent(
                'انضم معي إلى منصة Hearbor واستمتع بمشاهدة أحدث الأنمي مجاناً!'
              )}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn--sm"
              style={{ background: '#0088cc', color: '#fff', textDecoration: 'none', fontWeight: 700 }}
            >
              ✈️ Telegram
            </a>
          </div>

          {/* List of referred friends who joined */}
          {refData.referrals && refData.referrals.length > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--ink-dim)', display: 'block', marginBottom: '0.4rem' }}>
                👥 {lang === 'ar' ? 'الأصدقاء الذين انضموا عبرك:' : 'Friends joined through your link:'}
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {refData.referrals.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.75rem',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>@{r.referred_username}</span>
                    <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓ {lang === 'ar' ? 'مكتمل' : 'Joined'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)', textAlign: 'center', padding: '0.5rem' }}>
              {lang === 'ar' ? 'لم ينضم أي صديق بعد. شارك الرابط وابدأ بجمع الدعوات!' : 'No friends joined yet. Share your link to start earning!'}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------ creator ------------------------------ */

export function CreatorPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setDone(false);
    try {
      await api.post('/api/creator/submit', { videoUrl: url.trim() });
      setDone(true);
      setUrl('');
      pushToast?.(t('account.creatorSent'), 'success');
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon="🎬" title={t('account.creatorTitle')}>
      {!user ? <LoginNote /> : (
        <form onSubmit={send}>
          <p style={{ opacity: 0.75, margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{t('account.creatorHint')}</p>
          <div className="field">
            <input className="input" placeholder="https://tiktok.com/@user/video/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy || !url.trim()}>
            <span className="btn__shine" /> {t('account.creatorSend')}
          </button>
          {done && <p className="fx-done">✓ {t('account.creatorSent')}</p>}
        </form>
      )}
    </Panel>
  );
}

/* ------------------------------ support ------------------------------ */

export function SupportPanel() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('streaming');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [myTickets, setMyTickets] = useState([]);

  const loadTickets = () => {
    if (!user) return;
    api.get('/api/support/my-tickets')
      .then((res) => setMyTickets(res.tickets || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadTickets();
  }, [user]);

  const send = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || busy) return;
    setBusy(true);
    setDone(false);
    try {
      await api.post('/api/support/ticket', {
        subject: subject.trim(),
        message: message.trim(),
        category
      });
      setDone(true);
      setSubject('');
      setMessage('');
      pushToast?.(t('account.ticketSent'), 'success');
      loadTickets();
    } catch (err) {
      pushToast?.(err.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon="🎧" title={t('account.supportTitle')}>
      {!user ? <LoginNote /> : (
        <div>
          <form onSubmit={send}>
            <div className="field">
              <label className="field__label">{t('account.ticketCategory')}</label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ background: 'var(--bg-card)' }}
              >
                <option value="streaming">{lang === 'ar' ? 'مشكلة في تشغيل/بث الحلقات' : 'Streaming or playback issue'}</option>
                <option value="content">{lang === 'ar' ? 'طلب إضافة مانجا أو مانهوا أو كتب' : 'Request Manga, Manhwa, or Books'}</option>
                <option value="account">{lang === 'ar' ? 'مشكلة في الحساب أو العضوية' : 'Account or membership inquiry'}</option>
                <option value="suggestion">{lang === 'ar' ? 'اقتراح أو فكرة لتطوير الموقع' : 'Feature suggestion'}</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="fx-subject">{t('account.subject')}</label>
              <input id="fx-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="fx-message">{t('account.message')}</label>
              <textarea id="fx-message" className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <button type="submit" className="btn btn--primary" disabled={busy || !subject.trim() || !message.trim()}>
              <span className="btn__shine" /> {t('account.sendTicket')}
            </button>
            {done && <p className="fx-done">✓ {t('account.ticketSent')}</p>}
          </form>

          {/* User's Previous Tickets List */}
          {myTickets.length > 0 && (
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
                📋 {t('account.myTickets')}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '220px', overflowY: 'auto' }}>
                {myTickets.map((tk) => (
                  <div
                    key={tk.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      padding: '0.75rem 0.95rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.86rem' }}>{tk.subject}</strong>
                      <span className={`ticket-status ticket-status--${tk.status?.toLowerCase()}`}>
                        {tk.status === 'OPEN' ? (lang === 'ar' ? 'قيد المراجعة' : 'Open') : tk.status === 'RESOLVED' ? (lang === 'ar' ? 'تم الحل ✓' : 'Resolved') : (lang === 'ar' ? 'جاري الحل' : 'In Progress')}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', margin: '0 0 0.4rem', lineHeight: 1.4 }}>
                      {tk.message}
                    </p>
                    {tk.admin_reply && (
                      <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '0.5rem 0.75rem', borderRadius: '8px', marginTop: '0.35rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 800, display: 'block' }}>
                          🛡️ {t('account.adminReply')}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#fff' }}>{tk.admin_reply}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
