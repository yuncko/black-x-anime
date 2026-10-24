import { imgFallback } from '../hooks/hooks.js';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';
import { LiquidLoader, EmptyState } from '../components/Loading.jsx';
import { UserBadges, BADGE_DEFINITIONS, VerifiedBadge } from '../components/UserBadges.jsx';
import Ornament3D from '../ornaments/Ornament3D.jsx';
import OrnamentAvatar from '../ornaments/OrnamentAvatar.jsx';
import OrnamentGallery from '../ornaments/OrnamentGallery.jsx';
import Avatar3DDecoration from '../components/Avatar3DDecoration.jsx';
import MangaNovelReader from '../components/MangaNovelReader.jsx';
import { OrnamentShop, WrappedCardPanel } from '../components/OrnamentShopAndWrapped.jsx';
import { VipPlansSection, DevVipCodeGenerator, resolveUserVipTier } from '../components/VipPlansAndDevCodes.jsx';
import { BLACK_X_MOTION_THEMES } from '../components/BlackXSplashVortex.jsx';
import BxIcon from '../mobile/BxIcon.jsx';
import { auth, onProfileSnapshot, onDeveloperProfileSnapshot } from '../firebase.js';

// Helper to build instant, zero-404 SVG anime character portraits
function makeAnimeAvatarSvg(bg1, bg2, accent, eyeColor, hairPath, emblem) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
    <defs>
      <radialGradient id="g" cx="50%" cy="35%" r="68%">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </radialGradient>
    </defs>
    <rect width="120" height="120" rx="60" fill="url(#g)"/>
    <circle cx="60" cy="60" r="54" stroke="${accent}" stroke-opacity="0.38" stroke-width="2"/>
    <path d="M22 114C26 85 40 73 60 73C80 73 94 85 98 114" fill="#0b1020" stroke="${accent}" stroke-width="2.4"/>
    <circle cx="60" cy="48" r="21" fill="#0f172a" stroke="${accent}" stroke-width="2.2"/>
    <path d="${hairPath}" fill="#090d18" stroke="${accent}" stroke-width="2"/>
    <path d="M47 47L56 49L49 52Z" fill="${eyeColor}"/>
    <path d="M73 47L64 49L71 52Z" fill="${eyeColor}"/>
    <text x="60" y="103" text-anchor="middle" fill="${accent}" font-size="14" font-family="sans-serif" font-weight="900">${emblem}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Preset high quality anime character avatars for quick selection (Zero 404 guaranteed)
const PRESET_AVATARS = [
  { name: 'Sung Jinwoo', url: makeAnimeAvatarSvg('#2e1065', '#06040f', '#a855f7', '#38bdf8', 'M35 42L41 20L52 30L60 15L68 30L79 20L85 42', 'ARISE') },
  { name: 'Gojo Satoru', url: makeAnimeAvatarSvg('#083344', '#040914', '#38bdf8', '#e0f2fe', 'M34 40L38 18L49 26L60 13L71 26L82 18L86 40', '∞') },
  { name: 'Luffy Gear 5', url: makeAnimeAvatarSvg('#3b0764', '#090514', '#facc15', '#ef4444', 'M33 44C34 22 48 16 60 16C72 16 86 22 87 44', 'G5') },
  { name: 'Roronoa Zoro', url: makeAnimeAvatarSvg('#064e3b', '#04120e', '#10b981', '#fde047', 'M36 41L44 21L54 29L60 18L66 29L76 21L84 41', '三刀流') },
  { name: 'Ryomen Sukuna', url: makeAnimeAvatarSvg('#450a0a', '#090406', '#ef4444', '#fde047', 'M35 42L43 19L53 28L60 16L67 28L77 19L85 42', '呪王') },
  { name: 'Levi Ackerman', url: makeAnimeAvatarSvg('#1e293b', '#050811', '#94a3b8', '#38bdf8', 'M36 38C40 22 50 20 60 20C70 20 80 22 84 38', '⚔') },
  { name: 'Tanjiro Hinokami', url: makeAnimeAvatarSvg('#431407', '#080504', '#f97316', '#fde047', 'M34 42L42 21L52 29L60 17L68 29L78 21L86 42', '日輪') },
  { name: 'Naruto Six Paths', url: makeAnimeAvatarSvg('#422006', '#090603', '#fb923c', '#facc15', 'M33 43L39 19L50 28L60 15L70 28L81 19L87 43', '九尾') }
];

const PRESET_BANNERS = [
  { label: 'Neo-Tokyo Midnight (سايبربانك طوكيو السينمائي)', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80' },
  { label: 'Cyberpunk Tokyo', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Dark Nebula', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Sakura Sunset', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Shadow Monarch', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Anime Skyline', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80' },
  { label: 'Neon Samurai', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1200&auto=format&fit=crop&q=80' }
];

const PRESET_FRAMES = [
  { id: 'default', labelAr: 'بدون إطار (طبيعي)', labelEn: 'Default (Clean)', icon: '⚪', color: '#94a3b8' },
  { id: 'dragon-flame', labelAr: 'لهب التنين المتوهج 🔥 (Dragon Flame 3D)', labelEn: 'Dragon Flame 3D 🔥', icon: '🔥', color: '#f97316' },
  { id: 'royal-flame', labelAr: 'لهب التنين الملكي 🔥 (3D)', labelEn: 'Royal Flame 3D 🔥', icon: '🔥', color: '#f97316' },
  { id: 'cyber-neon', labelAr: 'نيون سايبربانك ⚡ (3D)', labelEn: 'Cyber Neon 3D ⚡', icon: '⚡', color: '#22d3ee' },
  { id: 'shadow-monarch', labelAr: 'هالة ملك الظلال 👑 (3D)', labelEn: 'Shadow Monarch 3D 👑', icon: '👑', color: '#8b5cf6' },
  { id: 'imperial-gold', labelAr: 'التاج الإمبراطوري ⚜️ (3D)', labelEn: 'Imperial Gold 3D ⚜️', icon: '⚜️', color: '#eab308' },
  { id: 'sakura-blossom', labelAr: 'أزهار الساكورا 🌸 (3D)', labelEn: 'Sakura Blossom 3D 🌸', icon: '🌸', color: '#f472b6' },
  { id: 'prismatic-diamond', labelAr: 'الماسة الكريستالية 💎 (3D)', labelEn: 'Prismatic Diamond 3D 💎', icon: '💎', color: '#38bdf8' },
  { id: 'celestial-void', labelAr: 'الفضاء الكوني 🌌 (3D)', labelEn: 'Celestial Void 3D 🌌', icon: '🌌', color: '#a855f7' },
  { id: 'dragon-ascension', labelAr: 'التنين السماوي 🐉 (3D)', labelEn: 'Dragon Ascension 3D 🐉', icon: '🐉', color: '#10b981' }
];

const PALETTE = ['#22d3ee', '#8b5cf6', '#f472b6', '#a3e635', '#fb923c', '#f87171', '#60a5fa', '#eab308'];

export default function ProfileDashboard({ onOpenAuth }) {
  const { t, lang, formatNumber } = useI18n();
  const { user, stats, updateProfile, applyRealtimeProfileUpdate, refresh, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);

  const isDeveloper = user?.role === 'developer' || user?.email?.toLowerCase() === 'mz0970mmz@gmail.com' || user?.isDeveloper;

  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab === 'developer' && isDeveloper ? 'developer' : (urlTab || 'overview'));
  const [motionPref, setMotionPref] = useState(() => localStorage.getItem('bx_motion_pref') || 'random');

  useEffect(() => {
    if (urlTab === 'developer' && isDeveloper) {
      setActiveTab('developer');
    } else if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab, isDeveloper]);

  /* ---------------- Profile & Customization State ---------------- */
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [avatarColor, setAvatarColor] = useState('#22d3ee');
  const [bio, setBio] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [frameStyle, setFrameStyle] = useState(() => localStorage.getItem('profile_frame_style') || 'royal-flame');
  const [bannerStyle, setBannerStyle] = useState(() => localStorage.getItem('profile_banner_style') || 'royal-flame');
  const [ornamentQuality, setOrnamentQuality] = useState('auto');
  const [ornament3d, setOrnament3d] = useState(true);   // WebGL ornaments vs CSS 3D
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  /* ---------------- Social, Gamification & Referrals State ---------------- */
  const [gamificationStats, setGamificationStats] = useState(null);
  const [socialNetwork, setSocialNetwork] = useState(null);
  const [referralData, setReferralData] = useState(null);
  const [followInputName, setFollowInputName] = useState('');
  const [busyFollow, setBusyFollow] = useState(false);
  const [invitingFriend, setInvitingFriend] = useState(false);
  const [syncingActivity, setSyncingActivity] = useState(false);

  /* ---------------- Manga, Novels & Tracking State ---------------- */
  const [bookmarks, setBookmarks] = useState([]);
  const [readingHistory, setReadingHistory] = useState([]);
  const [userNotifications, setUserNotifications] = useState([]);
  const [activeDashboardReader, setActiveDashboardReader] = useState(null);
  const [uiTheme, setUiTheme] = useState(() => localStorage.getItem('profile_ui_theme') || 'dark-cyber');
  const [customTitle, setCustomTitle] = useState(() => {
    try { return localStorage.getItem('blackx.customTitle') || 'Shadow Monarch 👑'; } catch { return 'Shadow Monarch 👑'; }
  });
  const [userRatings, setUserRatings] = useState([]);
  const [userCommunityPosts, setUserCommunityPosts] = useState([]);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportCategory, setSupportCategory] = useState('FEATURE');
  const [submittingSupport, setSubmittingSupport] = useState(false);

  const handleThemeChange = (themeId) => {
    setUiTheme(themeId);
    localStorage.setItem('profile_ui_theme', themeId);
    pushToast(
      lang === 'ar'
        ? `تم تفعيل ثيم ${themeId === 'dark-cyber' ? 'Dark Cyber ⚡' : themeId === 'shadow' ? 'Shadow Monarch 👑' : themeId === 'sakura' ? 'Sakura Blossom 🌸' : 'Golden Imperial ⚜️'}`
        : `UI theme updated: ${themeId}`,
      'success'
    );
  };

  const handleCreateSupportTicket = async (e) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    setSubmittingSupport(true);
    try {
      await api.post('/api/support/ticket', {
        subject: supportMessage.trim().slice(0, 50),
        message: supportMessage.trim(),
        category: supportCategory
      });
      pushToast(lang === 'ar' ? '✓ تم إرسال تذكرتك بنجاح إلى الدعم الفني!' : 'Ticket submitted successfully!', 'success');
      setSupportMessage('');
    } catch (err) {
      pushToast(err.message || 'Error submitting ticket', 'error');
    } finally {
      setSubmittingSupport(false);
    }
  };

  /* ---------------- Support Tickets (Admin / Dev) State ---------------- */
  const [adminTickets, setAdminTickets] = useState([]);
  const [loadingAdminTickets, setLoadingAdminTickets] = useState(false);
  const [ticketFilter, setTicketFilter] = useState('ALL'); // ALL | OPEN | RESOLVED
  const [adminReplies, setAdminReplies] = useState({}); // ticketId -> string
  const [replyingTicketId, setReplyingTicketId] = useState(null);

  /* ---------------- Developer Tools State ---------------- */
  const [footerTagline, setFooterTagline] = useState('');
  const [footerNotice, setFooterNotice] = useState('');
  const [footerSaving, setFooterSaving] = useState(false);

  const [userStats, setUserStats] = useState(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);

  // Badge granting modal state
  const [badgeModalUser, setBadgeModalUser] = useState(null);
  const [selectedBadges, setSelectedBadges] = useState([]);
  const [savingBadges, setSavingBadges] = useState(false);

  const openBadgeModal = (targetUser) => {
    setBadgeModalUser(targetUser);
    setSelectedBadges(targetUser.badges || []);
  };

  const toggleBadge = (badgeId) => {
    setSelectedBadges((prev) =>
      prev.includes(badgeId) ? prev.filter((b) => b !== badgeId) : [...prev, badgeId]
    );
  };

  const handleSaveBadges = async () => {
    if (!badgeModalUser) return;
    setSavingBadges(true);
    try {
      const res = await api.put(`/api/dev/users/${badgeModalUser.id}/badges`, { badges: selectedBadges });
      if (res?.ok) {
        setUserStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            users: (prev.users || []).map((u) => u.id === badgeModalUser.id ? { ...u, badges: selectedBadges } : u)
          };
        });
        if (user?.id === badgeModalUser.id) {
          refresh?.();
        }
        pushToast(lang === 'ar' ? 'تم تحديث شارات الحساب بنجاح!' : 'Badges updated successfully!', 'success');
        setBadgeModalUser(null);
      }
    } catch (err) {
      pushToast(err.message || 'Failed to update badges', 'error');
    } finally {
      setSavingBadges(false);
    }
  };

  const [diagnostics, setDiagnostics] = useState(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);

  const [systemLogs, setSystemLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Initialize profile form and load feature data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setUsername(user.username || '');
      setPhotoUrl(user.photoUrl || user.photoURL || '');
      setAvatarColor(user.avatarColor || '#22d3ee');
      setBio(user.bio || '');

      // Load customization (banner, frames)
      api.get('/api/profile/profile')
        .then((res) => {
          if (res?.data) {
            if (res.data.bannerUrl) setBannerUrl(res.data.bannerUrl);
            if (res.data.frameStyle && res.data.frameStyle !== 'default') {
              setFrameStyle(res.data.frameStyle);
            }
            if (res.data.bannerStyle && res.data.bannerStyle !== 'off') {
              setBannerStyle(res.data.bannerStyle);
            }
          }
        })
        .catch(() => {});

      // Load gamification stats (level, xp, rank)
      api.get('/api/gamification/stats')
        .then((res) => {
          if (res?.data) setGamificationStats(res.data);
        })
        .catch(() => {});

      // Load network (followers, following)
      if (user.username) {
        api.get(`/api/community/network/${encodeURIComponent(user.username)}`)
          .then((res) => setSocialNetwork(res))
          .catch(() => {});
      }

      // Load referrals
      api.get('/api/gamification/referrals')
        .then((res) => {
          if (res?.data) setReferralData(res.data);
        })
        .catch(() => {});

      // Load manga/novels tracking & social data
      api.get('/api/tracking/bookmarks').then((res) => setBookmarks(res.bookmarks || [])).catch(() => {});
      api.get('/api/tracking/history').then((res) => setReadingHistory(res.history || [])).catch(() => {});
      api.get('/api/tracking/notifications').then((res) => setUserNotifications(res.notifications || [])).catch(() => {});
      api.get('/api/content/ratings').then((res) => setUserRatings(res.ratings || [])).catch(() => {});
      api.get('/api/community/posts').then((res) => {
        const all = res.posts || [];
        const mine = all.filter((p) => p.username === user.username || p.user_key === user.id);
        setUserCommunityPosts(mine.length > 0 ? mine : all.slice(0, 5));
      }).catch(() => {});
    }
  }, [user]);

  // Real-time listener: pulls latest username and profile image from Firestore across all devices
  useEffect(() => {
    if (!user) return;
    const targetUid = user.firebaseUid || auth.currentUser?.uid || (isDeveloper ? 'developer' : String(user.id));

    const handleProfileUpdate = (data) => {
      if (!data) return;
      if (data.username) setUsername(data.username);
      if (data.displayName) setDisplayName(data.displayName);
      const photo = data.photoUrl || data.photoURL;
      if (photo !== undefined) setPhotoUrl(photo || '');
      if (data.avatarColor) setAvatarColor(data.avatarColor);
      if (data.bio !== undefined) setBio(data.bio || '');
      applyRealtimeProfileUpdate?.(data);
    };

    const unsubUser = targetUid ? onProfileSnapshot(targetUid, handleProfileUpdate) : () => {};

    const unsubDev = isDeveloper
      ? onDeveloperProfileSnapshot(handleProfileUpdate)
      : () => {};

    const unsubDevDoc = isDeveloper && targetUid !== 'developer'
      ? onProfileSnapshot('developer', handleProfileUpdate)
      : () => {};

    return () => {
      unsubUser();
      unsubDev();
      unsubDevDoc();
    };
  }, [user?.firebaseUid, user?.id, isDeveloper, applyRealtimeProfileUpdate]);

  // Load site settings & dev data when on developer tab
  const loadDevData = useCallback(async () => {
    if (!isDeveloper) return;
    try {
      const footerData = await api.get('/api/settings/footer');
      setFooterTagline(footerData.tagline || '');
      setFooterNotice(footerData.notice || '');
    } catch {}

    setLoadingUserStats(true);
    try {
      const statsData = await api.get('/api/dev/users-stats');
      setUserStats(statsData);
    } catch {} finally {
      setLoadingUserStats(false);
    }

    setLoadingLogs(true);
    try {
      const logsData = await api.get('/api/dev/logs');
      setSystemLogs(logsData.logs || []);
    } catch {} finally {
      setLoadingLogs(false);
    }

    setLoadingAdminTickets(true);
    try {
      const ticketsRes = await api.get('/api/support/admin/tickets');
      setAdminTickets(ticketsRes.tickets || []);
    } catch {} finally {
      setLoadingAdminTickets(false);
    }
  }, [isDeveloper]);

  useEffect(() => {
    if (activeTab === 'developer') {
      loadDevData();
    }
  }, [activeTab, loadDevData]);

  if (authLoading) return <LiquidLoader />;

  if (!user) {
    return (
      <div className="glass" style={{ padding: '3rem', textAlign: 'center' }}>
        <EmptyState icon="🔒" title={t('error.authRequired')} sub={t('dashboard.loginPrompt')}>
          <button type="button" className="btn btn--primary" onClick={() => onOpenAuth?.('login')}>
            <span className="btn__shine" />
            {t('nav.login')}
          </button>
        </EmptyState>
      </div>
    );
  }

  /* ---------------- Phone / Device Image Upload Handler ---------------- */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      pushToast(lang === 'ar' ? 'يرجى اختيار ملف صورة صالح' : 'Please choose a valid image file', 'error');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress/resize image to avatar scale (max 360x360) via Canvas
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setPhotoUrl(dataUrl);
        setUploadingImage(false);
        pushToast(lang === 'ar' ? 'تم اختيار وتجهيز الصورة من هاتفك بنجاح!' : 'Photo loaded from device successfully!', 'success');
      };
      img.onerror = () => {
        setUploadingImage(false);
        pushToast(lang === 'ar' ? 'تعذر قراءة الصورة' : 'Could not read image', 'error');
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      setUploadingImage(false);
      pushToast(lang === 'ar' ? 'حدث خطأ أثناء قراءة الملف' : 'File read error', 'error');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ---------------- Save Profile & Customization Handler ---------------- */
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        displayName,
        username,
        photoUrl,
        avatarColor,
        bio
      });

      // Save banner and frame style to social customization store
      try {
        await api.put('/api/profile/customize', {
          bannerUrl: bannerUrl.trim(),
          frameStyle,
          bannerStyle
        });
      } catch (custErr) {
        console.warn('Customization save notice:', custErr);
      }

      try {
        window.dispatchEvent(new CustomEvent('blackx:ornaments-updated', {
          detail: { frameStyle, bannerStyle }
        }));
      } catch { /* no DOM */ }

      pushToast(t('profile.savedSuccess'), 'success');
      await refresh();
    } catch (err) {
      pushToast(err.message || t('auth.errGeneric'), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Follow & Social Handlers ---------------- */
  const handleFollowUser = async (e) => {
    e?.preventDefault?.();
    const target = followInputName.trim();
    if (!target || busyFollow) return;
    setBusyFollow(true);
    try {
      await api.post('/api/community/follow', { targetUsername: target });
      pushToast(lang === 'ar' ? `✓ تمت متابعة ${target} بنجاح!` : `Followed @${target}!`, 'success');
      setFollowInputName('');
      if (user?.username) {
        const net = await api.get(`/api/community/network/${encodeURIComponent(user.username)}`);
        setSocialNetwork(net);
      }
    } catch (err) {
      pushToast(err.message || 'Follow failed', 'error');
    } finally {
      setBusyFollow(false);
    }
  };

  const handleUnfollowUser = async (targetUsername) => {
    if (busyFollow) return;
    setBusyFollow(true);
    try {
      await api.post('/api/community/unfollow', { targetUsername });
      pushToast(lang === 'ar' ? `تم إلغاء متابعة ${targetUsername}` : `Unfollowed @${targetUsername}`, 'info');
      if (user?.username) {
        const net = await api.get(`/api/community/network/${encodeURIComponent(user.username)}`);
        setSocialNetwork(net);
      }
    } catch (err) {
      pushToast(err.message || 'Unfollow failed', 'error');
    } finally {
      setBusyFollow(false);
    }
  };

  /* ---------------- Referral Mock Invite Handler ---------------- */
  const handleMockInvite = async () => {
    setInvitingFriend(true);
    try {
      const res = await api.post('/api/gamification/referrals/mock-invite');
      pushToast(`✓ ${res.message}`, 'success');
      if (res?.data?.isVipUnlocked) {
        pushToast(
          lang === 'ar'
            ? '👑 مبروك! وصلت إلى 3 دعوات وفزت باشتراك VIP Basic مجاناً!'
            : '👑 Congratulations! You invited 3 friends and unlocked VIP Basic free!',
          'success'
        );
      }
      const refRes = await api.get('/api/gamification/referrals');
      if (refRes?.data) setReferralData(refRes.data);
      refresh?.();
    } catch (err) {
      pushToast(err.message || 'Error', 'error');
    } finally {
      setInvitingFriend(false);
    }
  };

  /* ---------------- Leveling & Activity Simulation Handler ---------------- */
  const handleSimulateActivity = async (type, sessionMinutes) => {
    setSyncingActivity(true);
    try {
      const res = await api.post('/api/gamification/sync-time', { type, sessionMinutes });
      pushToast(
        lang === 'ar'
          ? `✓ تم تسجيل النشاط! ${type === 'watch' ? 'مشاهدة أنمي' : 'قراءة أعمال'} (+${sessionMinutes * 10} XP)`
          : `✓ Activity logged! ${type === 'watch' ? 'Anime watch' : 'Reading session'} (+${sessionMinutes * 10} XP)`,
        'success'
      );
      if (res?.levelUp) {
        pushToast(
          lang === 'ar'
            ? `🎉 مبروك! ارتقيت إلى المستوى الجديد: Level ${res.newLevel}!`
            : `🎉 Level Up! You reached Level ${res.newLevel}!`,
          'success'
        );
      }
      const gRes = await api.get('/api/gamification/stats');
      if (gRes?.data) setGamificationStats(gRes.data);
    } catch (err) {
      pushToast(err.message || 'Error', 'error');
    } finally {
      setSyncingActivity(false);
    }
  };

  /* ---------------- Admin: Reply to Support Ticket ---------------- */
  const handleReplyAdminTicket = async (ticketId) => {
    const replyText = adminReplies[ticketId]?.trim();
    if (!replyText) {
      pushToast(lang === 'ar' ? 'يرجى كتابة نص الرد أولاً' : 'Please type a reply message', 'error');
      return;
    }
    setReplyingTicketId(ticketId);
    try {
      const res = await api.post(`/api/support/admin/tickets/${ticketId}/reply`, {
        reply: replyText,
        status: 'RESOLVED'
      });
      if (res?.success) {
        pushToast(lang === 'ar' ? '✓ تم إرسال الرد وحل التذكرة بنجاح!' : 'Reply sent & ticket resolved!', 'success');
        setAdminReplies((prev) => ({ ...prev, [ticketId]: '' }));
        // Refresh admin tickets
        const tRes = await api.get('/api/support/admin/tickets');
        setAdminTickets(tRes.tickets || []);
      }
    } catch (err) {
      pushToast(err.message || 'Failed to reply to ticket', 'error');
    } finally {
      setReplyingTicketId(null);
    }
  };

  /* ---------------- Developer: Update Footer ---------------- */
  const handleUpdateFooter = async (e) => {
    e.preventDefault();
    setFooterSaving(true);
    try {
      await api.put('/api/settings/footer', {
        tagline: footerTagline,
        notice: footerNotice
      });
      pushToast(t('dev.footerUpdated'), 'success');
      // trigger page-level reload or broadcast
      window.dispatchEvent(new CustomEvent('site_settings_updated'));
    } catch (err) {
      pushToast(err.message || t('auth.errGeneric'), 'error');
    } finally {
      setFooterSaving(false);
    }
  };

  /* ---------------- Developer: Run Diagnostics ---------------- */
  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const data = await api.get('/api/dev/diagnostics');
      setDiagnostics(data);
      pushToast('Diagnostics completed', 'success');
      // Refresh logs
      const logsData = await api.get('/api/dev/logs');
      setSystemLogs(logsData.logs || []);
    } catch (err) {
      pushToast('Diagnostics run failed: ' + err.message, 'error');
    } finally {
      setRunningDiagnostics(false);
    }
  };

  /* ---------------- Developer: Trigger Test Log ---------------- */
  const handleTestPing = async () => {
    try {
      await api.post('/api/dev/test-log', {
        level: 'info',
        message: `Diagnostic ping by developer ${user.email} at ${new Date().toLocaleTimeString()}`
      });
      pushToast('Test diagnostic event emitted', 'success');
      const logsData = await api.get('/api/dev/logs');
      setSystemLogs(logsData.logs || []);
    } catch (err) {
      pushToast(err.message, 'error');
    }
  };

  return (
    <div className="container" style={{ paddingBlock: '2rem 4rem', maxWidth: '820px', margin: '0 auto' }}>
      {/* ================= EXACT WITANIME PROFILE CARD WITH BACKGROUND BANNER ================= */}
      <div
        className="wit-prof-card"
        style={{
          position: 'relative',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#161616',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '2.1rem 1.85rem 1.65rem',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)'
        }}
      >
        {/* Background Banner Layer (مع ظهور البانر في الخلف) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
            background: '#111111'
          }}
        >
          {bannerUrl ? (
            <img
              onError={imgFallback}
              src={bannerUrl}
              alt="Profile Banner"
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.65) contrast(1.08)' }}
            />
          ) : bannerStyle && bannerStyle !== 'off' ? (
            <Ornament3D
              mode="banner"
              ornament={bannerStyle}
              eager
              quality={ornamentQuality}
              overrides={{ imageOverride: bannerUrl || undefined }}
              style={{ position: 'absolute', inset: 0, opacity: 0.7 }}
            />
          ) : (
            <img
              onError={imgFallback}
              src="https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80"
              alt="Profile Banner"
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.55) contrast(1.08)' }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(16, 16, 16, 0.25) 0%, rgba(20, 20, 20, 0.78) 58%, rgba(22, 22, 22, 0.96) 100%)',
              pointerEvents: 'none'
            }}
          />
        </div>

        {/* Quick Edit Banner Button (Top-Left in RTL) */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('profile');
            setTimeout(() => {
              const el = document.getElementById('prof-banner-input');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 80);
          }}
          style={{
            position: 'absolute',
            top: '14px',
            insetInlineEnd: '16px',
            zIndex: 4,
            background: 'rgba(10, 10, 10, 0.72)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '8px',
            padding: '0.32rem 0.72rem',
            color: '#e4e4e7',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          🖼️ {lang === 'ar' ? 'تغيير البانر' : 'Edit Banner'}
        </button>

        {/* Top Identity Row (Avatar on Right + Name, Email, Join Date) */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            flexWrap: 'wrap'
          }}
        >
          {/* Circular Avatar with White Edit Badge */}
          <div style={{ position: 'relative', width: '96px', height: '96px', flexShrink: 0 }}>
            {ornament3d && frameStyle !== 'default' && frameStyle !== 'none' ? (
              <OrnamentAvatar
                src={photoUrl || ''}
                fallbackLabel={(displayName || username || 'X').slice(0, 2)}
                avatarColor={avatarColor}
                frameStyle={frameStyle}
                size={96}
                pointerMode="block"
                eager
                quality={ornamentQuality}
                style={{ margin: 0 }}
              />
            ) : (
              <Avatar3DDecoration
                photoUrl={photoUrl}
                displayName={displayName}
                username={username}
                frameStyle={frameStyle}
                avatarColor={avatarColor}
                size={96}
                interactive
              />
            )}
            <button
              type="button"
              onClick={() => {
                setActiveTab('profile');
                setTimeout(() => fileInputRef.current?.click(), 120);
              }}
              disabled={uploadingImage}
              style={{
                position: 'absolute',
                insetInlineStart: '2px',
                bottom: '2px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '2px solid #161616',
                color: '#000000',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.78rem',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
                padding: 0,
                zIndex: 25
              }}
              title={lang === 'ar' ? 'تعديل الصورة الرمزية' : 'Edit Avatar'}
            >
              ✎
            </button>
          </div>

          {/* Name + Email + Join Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', textAlign: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.01em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {displayName || username}
                <VerifiedBadge isDev={isDeveloper} size={19} />
              </h1>
            </div>
            <div style={{ fontSize: '0.86rem', color: '#a1a1aa', fontWeight: 500 }}>
              {user.email || `@${username}`}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#71717a', fontWeight: 600, marginTop: '0.1rem' }}>
              {lang === 'ar' ? 'انضم في سبتمبر 2026' : 'Joined September 2026'}
            </div>
          </div>
        </div>

        {/* 4 Stat Boxes Grid inside Profile Card */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '0.75rem',
            marginTop: '1.65rem'
          }}
        >
          {[
            { count: stats?.favorites ?? bookmarks?.length ?? 1, label: lang === 'ar' ? 'المفضلة' : 'Favorites' },
            { count: stats?.watching ?? 2, label: lang === 'ar' ? 'أشاهده' : 'Watching' },
            { count: stats?.completed ?? 1, label: lang === 'ar' ? 'أكملته' : 'Completed' },
            { count: stats?.planToWatch ?? readingHistory?.length ?? 2, label: lang === 'ar' ? 'أنوي مشاهدته' : 'Plan to Watch' }
          ].map((st, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(34, 34, 34, 0.86)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '0.95rem 0.5rem',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff', marginBottom: '0.2rem' }}>
                {formatNumber(st.count)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#a1a1aa', fontWeight: 700 }}>
                {st.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= WITANIME PILL TABS BAR ================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '1.35rem 0 1.15rem',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}
      >
        {[
          { id: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview' },
          { id: 'profile', labelAr: 'إعدادات الحساب', labelEn: 'Account Settings' },
          { id: 'referrals', labelAr: 'باقات VIP والأكواد', labelEn: 'VIP & Codes' },
          { id: 'shop', labelAr: 'متجر الزخارف', labelEn: 'Ornaments Shop' },
          { id: 'wrapped', labelAr: 'ملخص 2026', labelEn: '2026 Wrapped' },
          ...(isDeveloper ? [{ id: 'developer', labelAr: 'لوحة المطور 👑', labelEn: 'Developer Console 👑' }] : [])
        ].map((tb) => {
          const isAct = activeTab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setActiveTab(tb.id)}
              style={{
                background: isAct ? '#ffffff' : 'transparent',
                color: isAct ? '#000000' : '#a1a1aa',
                border: 'none',
                borderRadius: '9px',
                padding: '0.48rem 1.15rem',
                fontFamily: 'inherit',
                fontSize: '0.84rem',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.18s ease'
              }}
            >
              {lang === 'ar' ? tb.labelAr : tb.labelEn}
            </button>
          );
        })}
      </div>

      {/* ================= TAB: نظرة عامة (Exact 3 Stacked Action Cards from Screenshot) ================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Internal Splash Screen Motion Graphics Selector (من الداخل فقط) */}
          <div
            style={{
              background: '#161616',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontWeight: 900, fontSize: '0.95rem', color: '#ffffff' }}>
                🎬 {lang === 'ar' ? 'إعدادات شاشة البداية (5 موشنات 120Hz):' : 'Splash Screen Motion (5 Themes 120Hz):'}
              </span>
              <button
                type="button"
                onClick={() => window.triggerBlackXMotion?.(motionPref === 'random' ? undefined : motionPref, 4000)}
                style={{
                  padding: '0.34rem 0.85rem',
                  borderRadius: '99px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.76rem',
                  cursor: 'pointer'
                }}
              >
                ▶ {lang === 'ar' ? 'معاينة شاشة البداية المختارة' : 'Preview Selected Motion'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.5rem' }}>
              {BLACK_X_MOTION_THEMES.map((m) => {
                const active = motionPref === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMotionPref(m.id);
                      localStorage.setItem('bx_motion_pref', m.id);
                      pushToast(
                        lang === 'ar'
                          ? `✓ تم اعتماد شاشة البداية: ${m.nameAr}`
                          : `✓ Splash motion set to: ${m.nameEn}`,
                        'success'
                      );
                    }}
                    style={{
                      padding: '0.62rem 0.75rem',
                      borderRadius: '11px',
                      background: active ? '#ffffff' : 'rgba(255,255,255,0.05)',
                      color: active ? '#000000' : '#ffffff',
                      border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.14)',
                      fontWeight: 900,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem'
                    }}
                  >
                    <BxIcon name={m.iconName} />
                    <span>{lang === 'ar' ? m.nameAr : m.nameEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1. قائمتي (My List) */}
          <div
            onClick={() => navigate('/mylist')}
            role="button"
            tabIndex={0}
            style={{
              background: '#161616',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
              padding: '1.05rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#242424',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#e4e4e7',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                ☰
              </div>
              <div style={{ textAlign: 'start' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                  {lang === 'ar' ? 'قائمتي' : 'My List'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '0.15rem' }}>
                  {lang === 'ar' ? 'اعرض مجموعتك من الأنمي والأفلام وأدرها' : 'View and manage your anime & movie collection'}
                </div>
              </div>
            </div>
            <span style={{ color: '#71717a', fontSize: '1.15rem', fontWeight: 700 }}>
              {lang === 'ar' ? '‹' : '›'}
            </span>
          </div>

          {/* 2. تعديل الصورة الرمزية والبانر (Edit Avatar & Banner) */}
          <div
            onClick={() => {
              setActiveTab('profile');
              setTimeout(() => fileInputRef.current?.click(), 120);
            }}
            role="button"
            tabIndex={0}
            style={{
              background: '#161616',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
              padding: '1.05rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#242424',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#e4e4e7',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                🖼️
              </div>
              <div style={{ textAlign: 'start' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                  {lang === 'ar' ? 'تعديل الصورة الرمزية' : 'Edit Avatar & Banner'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '0.15rem' }}>
                  {lang === 'ar' ? 'غيّر صورة ملفك الشخصي والبانر الخلفي' : 'Change your profile picture and background banner'}
                </div>
              </div>
            </div>
            <span style={{ color: '#71717a', fontSize: '1.15rem', fontWeight: 700 }}>
              {lang === 'ar' ? '‹' : '›'}
            </span>
          </div>

          {/* 3. تسجيل الخروج (Logout) */}
          <div
            onClick={async () => {
              if (logout) await logout();
              navigate('/');
            }}
            role="button"
            tabIndex={0}
            style={{
              background: 'rgba(127, 29, 29, 0.16)',
              border: '1px solid rgba(239, 68, 68, 0.24)',
              borderRadius: '14px',
              padding: '1.05rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 0.18s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.18)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#f87171',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                ↪
              </div>
              <div style={{ textAlign: 'start' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f87171' }}>
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Log Out'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '0.15rem' }}>
                  {lang === 'ar' ? 'الخروج من حسابك' : 'Sign out of your account'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB: Black Shards Ornament & Title Shop ================= */}
      {activeTab === 'shop' && (
        <OrnamentShop
          user={user}
          gamificationStats={gamificationStats}
          frameStyle={frameStyle}
          onSelectFrame={(id) => {
            setFrameStyle(id);
            localStorage.setItem('profile_frame_style', id);
          }}
          bannerStyle={bannerStyle}
          onSelectBanner={(id) => {
            setBannerStyle(id);
            localStorage.setItem('profile_banner_style', id);
          }}
          customTitle={customTitle}
          onSelectTitle={setCustomTitle}
        />
      )}

      {/* ================= TAB: 2026 Hearbor Wrapped Card ================= */}
      {activeTab === 'wrapped' && (
        <WrappedCardPanel
          user={user}
          stats={stats}
          gamificationStats={gamificationStats}
          bookmarks={bookmarks}
          readingHistory={readingHistory}
          userRatings={userRatings}
          customTitle={customTitle}
        />
      )}

      {/* ================= TAB 1: Profile & Customization (Responsive Layout) ================= */}
      {activeTab === 'profile' && (
        <div className="profile-dashboard-grid">
          {/* Facebook-Style Left "Intro / نبذة وإحصائيات" Card */}
          <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ textAlign: 'start', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📌</span> {lang === 'ar' ? 'نبذة وإحصائيات الحساب' : 'Profile Intro & Stats'}
              </h3>
              {bio && (
                <p style={{ color: 'var(--ink-dim)', fontSize: '0.88rem', margin: '0.4rem 0 0.85rem', lineHeight: 1.55 }}>
                  {bio}
                </p>
              )}
            </div>
            <div>

              {/* Leveling System Panel (نظام اللفل بالتفاعل) */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 27, 75, 0.85))',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  marginBlock: '0.65rem',
                  textAlign: 'start',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>
                    ⚡ {lang === 'ar' ? 'نظام اللفل بالتفاعل (Leveling System)' : 'Leveling System'}
                  </span>
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      padding: '0.15rem 0.55rem',
                      borderRadius: '99px',
                      boxShadow: '0 0 10px rgba(139, 92, 246, 0.6)'
                    }}
                  >
                    LVL {gamificationStats?.currentLevel || 1}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '99px', overflow: 'hidden', marginBlock: '0.35rem' }}>
                  <div
                    style={{
                      width: `${Math.min(100, gamificationStats?.levelProgress || ((user?.watchTimeMinutes || 0) % 60) * 1.6 || 0)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #22d3ee)',
                      boxShadow: '0 0 10px #8b5cf6'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                  <span>EXP {gamificationStats?.currentPoints ?? (user?.watchTimeMinutes ? user.watchTimeMinutes * 10 : 0)} / {gamificationStats?.nextLevelPoints || 1000}</span>
                  <span style={{ color: '#22d3ee', fontWeight: 600 }}>Level-up via Watch & Read</span>
                </div>
              </div>

              {/* Social and Invite System (نظام الدعوة) Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(6, 78, 59, 0.25))',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  marginBlock: '0.65rem',
                  textAlign: 'start'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>
                    🎁 {lang === 'ar' ? 'نظام الدعوة ومكافأة VIP' : 'Social & Invite System'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 800 }}>
                    {referralData?.count ?? referralData?.referralsCount ?? 0}/{referralData?.target || 3} VIP Basic
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBlock: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#22d3ee' }}>
                      {formatNumber(socialNetwork?.followersCount ?? 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{lang === 'ar' ? 'المتابعون' : 'Followers'}</div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f472b6' }}>
                      {socialNetwork?.followingCount ?? 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{lang === 'ar' ? 'يتابع' : 'Following'}</div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>
                      {referralData?.count ?? referralData?.referralsCount ?? 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{lang === 'ar' ? 'الدعوات' : 'Invites'}</div>
                  </div>
                </div>
              </div>

              {/* Badges & Achievements Row */}
              <div style={{ marginBlock: '0.65rem 0.85rem' }}>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 700, textAlign: 'start', marginBottom: '0.35rem' }}>
                  🏆 {lang === 'ar' ? 'الشارات والإنجازات (Badges)' : 'Badges & Achievements'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {user?.badges?.length ? (
                    <UserBadges badges={user.badges} size="md" showLabels={false} />
                  ) : (
                    <span style={{ fontSize: '0.74rem', color: 'var(--ink-dim)', padding: '0.2rem' }}>
                      {lang === 'ar' ? 'ابدأ المشاهدة والتفاعل لفتح شارات جديدة 🌟' : 'Watch & interact to earn badges 🌟'}
                    </span>
                  )}
                </div>
              </div>

              {bio && (
                <p style={{ color: 'var(--ink-dim)', fontSize: '0.86rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                  {bio}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.15rem' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem', borderRadius: '12px' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--cyan)' }}>
                    {formatNumber(stats?.favorites || 0)}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--ink-dim)' }}>{t('mylist.favorites')}</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem', borderRadius: '12px' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--magenta)' }}>
                    {formatNumber(stats?.watchedEpisodes || 0)}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--ink-dim)' }}>{t('watch.watched')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Edit Form */}
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <form onSubmit={handleSaveProfile} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBlockEnd: '1.25rem' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label" htmlFor="prof-display">{t('profile.displayName')}</label>
                  <input
                    id="prof-display"
                    type="text"
                    className="input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    maxLength={60}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label className="label" htmlFor="prof-username">{t('profile.username')}</label>
                  <input
                    id="prof-username"
                    type="text"
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    maxLength={24}
                  />
                </div>
              </div>

              {/* Phone / Device Image Upload Section */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '1.15rem',
                  marginBottom: '1.35rem'
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.92rem', display: 'block' }}>
                      📷 {lang === 'ar' ? 'إضافة صورة من الهاتف / الجهاز' : 'Upload photo from phone / device'}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
                      {lang === 'ar' ? 'اختر صورة من معرض هاتفك أو التقط صورة جديدة' : 'Choose directly from your camera roll or photo library'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      style={{
                        background: 'linear-gradient(135deg, #22d3ee, #8b5cf6)',
                        color: '#fff',
                        fontWeight: 700
                      }}
                    >
                      <span className="btn__shine" />
                      📱 {uploadingImage ? (lang === 'ar' ? 'جارٍ المعالجة...' : 'Processing...') : (lang === 'ar' ? 'اختيار صورة من الهاتف' : 'Choose from phone')}
                    </button>
                    {photoUrl && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setPhotoUrl('')}
                        style={{ color: 'var(--red)' }}
                        title={lang === 'ar' ? 'إزالة الصورة' : 'Remove photo'}
                      >
                        ✕ {lang === 'ar' ? 'إزالة' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>

                {/* If image is uploaded from phone (data URL) */}
                {photoUrl?.startsWith('data:') && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.85rem',
                      padding: '0.8rem 1rem',
                      background: 'rgba(34, 211, 238, 0.08)',
                      border: '1px solid rgba(34, 211, 238, 0.35)',
                      borderRadius: '12px',
                      marginTop: '0.65rem',
                      marginBottom: '0.65rem'
                    }}
                  >
                    <img onError={imgFallback}
                      src={photoUrl}
                      alt="Device Preview"
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid var(--cyan)',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--cyan)' }}>
                        ✓ {lang === 'ar' ? 'تم اختيار صورة من هاتفك بنجاح' : 'Phone image attached successfully'}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--ink-dim)' }}>
                        {lang === 'ar' ? 'الصورة جاهزة للمعاينة، اضغط «حفظ التعديلات» بالأسفل لاعتمادها في الحساب' : 'Ready! Click "Save Changes" below to apply to your account'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPhotoUrl('')}
                      style={{ color: 'var(--red)', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      title={lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Or image URL input */}
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.75rem' }}>
                  <label className="label" htmlFor="prof-photo" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    🔗 {lang === 'ar' ? 'أو أدخل رابط صورة من الإنترنت (اختياري):' : 'Or enter an image web URL (optional):'}
                  </label>
                  <input
                    id="prof-photo"
                    type="text"
                    className="input"
                    placeholder={photoUrl?.startsWith('data:') ? (lang === 'ar' ? '(يتم استخدام الصورة المختارة من هاتفك)' : '(Using photo chosen from phone)') : t('profile.photoPh')}
                    value={photoUrl?.startsWith('data:') ? '' : photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                  />
                  {photoUrl && !photoUrl.startsWith('data:') && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--cyan)', marginTop: '0.35rem' }}>
                      ✓ {lang === 'ar' ? 'رابط الصورة نشط' : 'Image URL active'}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Preset Avatars Picker */}
              <div style={{ marginBlockEnd: '1.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-dim)', fontWeight: 600, marginBlockEnd: '0.65rem' }}>
                  {t('profile.orChoosePreset')}
                </div>
                <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.35rem' }}>
                  {PRESET_AVATARS.map((av) => (
                    <button
                      key={av.name}
                      type="button"
                      onClick={() => setPhotoUrl(av.url)}
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        padding: 0,
                        border: photoUrl === av.url ? '3px solid var(--cyan)' : '2px solid rgba(255, 255, 255, 0.15)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: 'rgba(255, 255, 255, 0.05)',
                        flexShrink: 0,
                        transition: 'transform 0.2s, border-color 0.2s'
                      }}
                      title={av.name}
                    >
                      <img onError={imgFallback} src={av.url} alt={av.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme Selector */}
              <div className="field">
                <label className="label">{t('profile.colorTheme')}</label>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAvatarColor(c)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: c,
                        border: avatarColor === c ? '3px solid #fff' : '2px solid transparent',
                        boxShadow: avatarColor === c ? `0 0 12px ${c}` : 'none',
                        cursor: 'pointer',
                        transition: 'transform 0.2s'
                      }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              {/* Banner Customization Section */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '1.15rem',
                  marginBottom: '1.35rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.92rem' }}>
                    🖼️ {lang === 'ar' ? 'بانر الملف الشخصي (Profile Banner)' : 'Profile Header Banner'}
                  </strong>
                  {bannerUrl && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setBannerUrl('')}
                      style={{ color: 'var(--red)', fontSize: '0.76rem', padding: '0.2rem 0.5rem' }}
                    >
                      ✕ {lang === 'ar' ? 'إزالة' : 'Remove'}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', margin: '0 0 0.75rem' }}>
                  {lang === 'ar' ? 'اختر بانراً جاهزاً أو الصق رابط صورة عالية الدقة لتزيين رأس بروفايلك:' : 'Select a preset anime banner or enter a custom URL:'}
                </p>

                {/* Preset Banners */}
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  {PRESET_BANNERS.map((pb) => (
                    <button
                      key={pb.label}
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{
                        fontSize: '0.76rem',
                        padding: '0.35rem 0.7rem',
                        borderColor: bannerUrl === pb.url ? 'var(--cyan)' : 'rgba(255,255,255,0.15)',
                        background: bannerUrl === pb.url ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255,255,255,0.04)'
                      }}
                      onClick={() => setBannerUrl(pb.url)}
                    >
                      {pb.label}
                    </button>
                  ))}
                </div>

                <input
                  id="prof-banner-input"
                  type="url"
                  className="input"
                  placeholder="https://images.unsplash.com/…"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                />
              </div>

              {/* ═════════ 3D ORNAMENTS — live frames + 3D banners ═════════ */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '1.15rem',
                  marginBottom: '1.35rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                  <strong style={{ fontSize: '0.92rem' }}>
                    ✨ {t('profile.ornTitle')}
                  </strong>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className={`chip ${ornament3d ? 'active' : ''}`}
                      onClick={() => setOrnament3d((v) => !v)}
                      style={{ fontSize: '0.74rem', padding: '0.28rem 0.7rem' }}
                      title={t('profile.ornToggle3d')}
                    >
                      {ornament3d ? `🧊 ${t('profile.ornMode3d')}` : `🖼️ ${t('profile.ornMode2d')}`}
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', margin: '0 0 0.85rem' }}>
                  {t('profile.ornSubtitle')}
                </p>

                <OrnamentGallery
                  mode="frame"
                  value={frameStyle}
                  threeDEnabled={ornament3d}
                  quality={ornamentQuality}
                  onQualityChange={setOrnamentQuality}
                  onChange={({ frameStyle: next }) => {
                    setFrameStyle(next);
                    try { localStorage.setItem('profile_frame_style', next); } catch {}
                  }}
                  avatar={{ photoUrl, label: displayName || username || 'X', color: avatarColor }}
                />

                <div style={{ marginTop: '1.1rem' }}>
                  <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: '0.5rem' }}>
                    🏙️ {t('profile.ornBannerTitle')}
                  </strong>
                  <OrnamentGallery
                    mode="banner"
                    value={bannerStyle}
                    compact
                    showStage={false}
                    showAdvanced={false}
                    threeDEnabled={ornament3d}
                    quality={ornamentQuality}
                    onChange={({ bannerStyle: next }) => {
                      setBannerStyle(next);
                      try { localStorage.setItem('profile_banner_style', next); } catch {}
                    }}
                    avatar={{ photoUrl, label: displayName || username || 'X', color: avatarColor }}
                  />
                </div>

                {/* Live Creature Action Bar (No Prompts — Pure Living Animated Creatures) */}
                <div style={{ marginTop: '1.25rem', borderTop: '1px dashed rgba(255, 85, 0, 0.35)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>🐉</span> {lang === 'ar' ? 'الأشكال الحية التفاعلية (تنين ينفث النار وكائنات متحركة)' : 'Interactive Living Creatures (Fire-Breathing Dragon & Live Entities)'}
                      </strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.77rem', color: 'var(--ink-dim)' }}>
                        {lang === 'ar'
                          ? 'الكائن الحي المختار يطوف حول صورة حسابك وينفث النار أو يطلق قدرته القتالية تلقائياً وعند الضغط!'
                          : 'Your chosen living creature orbits your avatar and breathes fire / unleashes its signature attack automatically and on click!'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        if (!frameStyle || frameStyle === 'default' || frameStyle === 'none') {
                          setFrameStyle('royal-flame');
                        }
                        window.dispatchEvent(new CustomEvent('blackx:trigger-creature-attack'));
                      }}
                      style={{
                        fontSize: '0.82rem',
                        padding: '0.48rem 1rem',
                        background: 'linear-gradient(135deg, #ff4500, #ff9900)',
                        border: '1px solid rgba(255, 190, 60, 0.6)',
                        color: '#fff',
                        fontWeight: 800,
                        boxShadow: '0 0 20px rgba(255, 69, 0, 0.45)'
                      }}
                    >
                      🔥 {lang === 'ar' ? 'نفث النار / إطلاق القدرة الآن!' : 'Unleash Fire / Creature Attack Now!'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bio Field */}
              <div className="field">
                <label className="label" htmlFor="prof-bio">{t('profile.bio')}</label>
                <textarea
                  id="prof-bio"
                  className="textarea"
                  placeholder={t('profile.bioPh')}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  <span className="btn__shine" />
                  {saving ? t('profile.saving') : t('profile.saveBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 2: Leveling & Activity System (Activity-Based XP) ================= */}
      {activeTab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '2rem' }}>🏆</span>
                <div>
                  <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                    {lang === 'ar' ? 'نظام المستويات والنشاط (Leveling System)' : 'Activity & Leveling System'}
                  </h2>
                  <p style={{ color: 'var(--ink-dim)', margin: '0.25rem 0 0', fontSize: '0.88rem' }}>
                    {lang === 'ar' ? 'كلما زادت مدة مشاهدتك للأنمي أو قراءتك للمانجا والكتب، ارتفع مستواك ورتبتك التلقائية!' : 'Watch anime and read library works to gain XP and level up automatically!'}
                  </p>
                </div>
              </div>

              {gamificationStats?.rank && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '99px',
                  background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.2), rgba(139, 92, 246, 0.2))',
                  border: '1px solid rgba(34, 211, 238, 0.4)'
                }}>
                  <span style={{ fontSize: '1.4rem' }}>{gamificationStats.rank.icon}</span>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-dim)', display: 'block' }}>{lang === 'ar' ? 'الرتبة الحالية' : 'Rank'}</span>
                    <strong style={{ color: gamificationStats.rank.color || 'var(--cyan)', fontSize: '0.96rem' }}>
                      {lang === 'ar' ? gamificationStats.rank.titleAr : gamificationStats.rank.titleEn}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Metrics Tiles */}
            <div className="fx-grid fx-grid--stats" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-tile">
                <div className="stat-tile__value" style={{ color: 'var(--cyan)' }}>
                  Lv. {gamificationStats?.currentLevel || 1}
                </div>
                <div className="stat-tile__label">{lang === 'ar' ? 'المستوى الحالي' : 'Current Level'}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__value" style={{ color: '#fbbf24' }}>
                  {formatNumber(gamificationStats?.xp || 0)} XP
                </div>
                <div className="stat-tile__label">{lang === 'ar' ? 'مجموع نقاط الخبرة' : 'Total XP'}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__value" style={{ color: '#38bdf8' }}>
                  {formatNumber(gamificationStats?.totalWatchTimeMin || 0)} د
                </div>
                <div className="stat-tile__label">{lang === 'ar' ? 'دقائق المشاهدة' : 'Watch Time (mins)'}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__value" style={{ color: '#a78bfa' }}>
                  {formatNumber(gamificationStats?.totalReadTimeMin || 0)} د
                </div>
                <div className="stat-tile__label">{lang === 'ar' ? 'دقائق القراءة' : 'Read Time (mins)'}</div>
              </div>
            </div>

            {/* Level Progress Bar */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--ink-dim)' }}>
                  {lang === 'ar' ? 'التقدم نحو المستوى التالي:' : 'Progress to next level:'}
                </span>
                <strong style={{ color: 'var(--cyan)' }}>{gamificationStats?.progressPercentage || 0}%</strong>
              </div>
              <div className="fx-progress" style={{ height: '10px' }}>
                <div className="fx-progress__fill" style={{ width: `${Math.min(100, gamificationStats?.progressPercentage || 0)}%` }} />
              </div>
            </div>

            {/* Test Activity Recording Buttons */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <strong style={{ fontSize: '0.92rem', display: 'block', marginBottom: '0.2rem' }}>
                  ⚡ {lang === 'ar' ? 'تسجيل نشاط فوري واختبار زيادة المستوى' : 'Log Instant Activity & Level Up'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
                  {lang === 'ar' ? 'يمكنك محاكاة جلسة مشاهدة أو قراءة لاختبار ارتقاء المستوى تلقائياً' : 'Simulate watch or read sessions to test automatic level up'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => handleSimulateActivity('watch', 30)}
                  disabled={syncingActivity}
                >
                  <span className="btn__shine" />
                  🎬 {lang === 'ar' ? '+30 د مشاهدة (+300 XP)' : '+30m Watch (+300 XP)'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => handleSimulateActivity('read', 25)}
                  disabled={syncingActivity}
                >
                  📖 {lang === 'ar' ? '+25 د قراءة (+250 XP)' : '+25m Read (+250 XP)'}
                </button>
              </div>
            </div>

            {/* Unlocked Badges */}
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2rem 0 1rem' }}>
              🎖️ {lang === 'ar' ? 'الشارات والأوسمة المكتسبة' : 'Unlocked Badges'}
            </h3>
            {gamificationStats?.unlockedBadges?.length ? (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {gamificationStats.unlockedBadges.map((b) => (
                  <div
                    key={b.name}
                    className="glass"
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      border: '1px solid rgba(255, 255, 255, 0.12)'
                    }}
                  >
                    <span>🏅</span>
                    <strong style={{ fontSize: '0.85rem' }}>{b.name}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-dim)', margin: 0, fontSize: '0.88rem' }}>
                {lang === 'ar' ? 'لم تكتسب شارات بعد — واصل المشاهدة والقراءة لتفتح أول شارة!' : 'No badges unlocked yet — keep watching and reading!'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: Social & Followers System ================= */}
      {activeTab === 'social' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '2rem' }}>👥</span>
              <div>
                <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                  {lang === 'ar' ? 'نظام المتابعة والأصدقاء (Followers / Following)' : 'Followers & Social Network'}
                </h2>
                <p style={{ color: 'var(--ink-dim)', margin: '0.25rem 0 0', fontSize: '0.88rem' }}>
                  {lang === 'ar' ? 'تابع المستخدمين والمنتجين وشاهد من يتابعك في المنصة' : 'Connect with creators, friends, and fellow anime otaku'}
                </p>
              </div>
            </div>

            {/* Follow Form */}
            <form onSubmit={handleFollowUser} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input"
                placeholder={lang === 'ar' ? 'أدخل اسم المستخدم لمتابعته (مثل: luffy, zoro)...' : 'Enter username to follow...'}
                value={followInputName}
                onChange={(e) => setFollowInputName(e.target.value)}
                style={{ flex: 1, minWidth: '220px' }}
              />
              <button type="submit" className="btn btn--primary" disabled={busyFollow || !followInputName.trim()}>
                <span className="btn__shine" />
                ➕ {lang === 'ar' ? 'متابعة المستخدم' : 'Follow User'}
              </button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {/* Followers List */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{lang === 'ar' ? 'المتابعون (Followers)' : 'Followers'}</span>
                  <span style={{ color: 'var(--cyan)' }}>{socialNetwork?.followers?.length || 0}</span>
                </h3>
                {socialNetwork?.followers?.length === 0 ? (
                  <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
                    {lang === 'ar' ? 'لا يوجد متابعون بعد. شارك منشورات في المجتمع لجذب المتابعين!' : 'No followers yet. Post in community to gain followers!'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                    {socialNetwork?.followers?.map((name) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>@{name}</span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--cyan)' }}>✓ متابع</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Following List */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{lang === 'ar' ? 'تتابعهم (Following)' : 'Following'}</span>
                  <span style={{ color: 'var(--magenta)' }}>{socialNetwork?.following?.length || 0}</span>
                </h3>
                {socialNetwork?.following?.length === 0 ? (
                  <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
                    {lang === 'ar' ? 'أنت لا تتابع أي حساب بعد. ابحث عن الأصدقاء أعلاه لمتابعتهم!' : 'You are not following anyone yet.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                    {socialNetwork?.following?.map((name) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>@{name}</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleUnfollowUser(name)}
                          style={{ color: 'var(--red)', fontSize: '0.74rem', padding: '0.2rem 0.55rem' }}
                        >
                          {lang === 'ar' ? 'إلغاء المتابعة' : 'Unfollow'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: Referrals & VIP Reward System ================= */}
      {activeTab === 'referrals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <VipPlansSection
            user={user}
            referralData={referralData}
            onVipUpdated={(updatedUser) => {
              if (updatedUser) applyRealtimeProfileUpdate?.(updatedUser);
              refresh?.();
            }}
            onSelectFrame={(id) => {
              setFrameStyle(id);
              localStorage.setItem('profile_frame_style', id);
            }}
          />

          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '2rem' }}>🎁</span>
              <div>
                <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                  {lang === 'ar' ? 'نظام الدعوات ومكافأة VIP المجانية' : 'Referral System & VIP Basic Rewards'}
                </h2>
                <p style={{ color: 'var(--ink-dim)', margin: '0.25rem 0 0', fontSize: '0.88rem' }}>
                  {lang === 'ar' ? 'ادعُ 3 من أصدقائك للتسجيل في الموقع واحصل على اشتراك (VIP Basic) مجاناً وتلقائياً!' : 'Invite friends to register and earn a free VIP Basic membership automatically!'}
                </p>
              </div>
            </div>

            {/* VIP Status Banner */}
            {referralData?.isVipUnlocked ? (
              <div className="vip-card-banner" style={{ marginBottom: '1.75rem' }}>
                <div>
                  <strong style={{ fontSize: '1.15rem', color: '#eab308', display: 'block', marginBottom: '0.25rem' }}>
                    👑 {lang === 'ar' ? 'اشتراك VIP Basic مفعّل في حسابك!' : 'VIP Basic Membership Active!'}
                  </strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-dim)' }}>
                    {lang === 'ar' ? 'لقد أكملت بنجاح دعوة 3 أصدقاء، وحصلت على شارة VIP وميزات المشاهدة الممتازة!' : 'You reached the referral milestone and unlocked all VIP perks!'}
                  </span>
                </div>
                <span className="badge badge--vip" style={{ fontSize: '0.88rem', padding: '0.4rem 1rem' }}>
                  VIP Active ✓
                </span>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <span>{lang === 'ar' ? `الأصدقاء المسجلون عبر دعوتك: ${referralData?.count || 0} من ${referralData?.target || 3}` : `Friends Invited: ${referralData?.count || 0} / ${referralData?.target || 3}`}</span>
                  <strong style={{ color: 'var(--cyan)' }}>
                    {Math.round(((referralData?.count || 0) / (referralData?.target || 3)) * 100)}%
                  </strong>
                </div>
                <div className="fx-progress" style={{ height: '10px' }}>
                  <div
                    className="fx-progress__fill"
                    style={{ width: `${Math.min(100, Math.round(((referralData?.count || 0) / (referralData?.target || 3)) * 100))}%` }}
                  />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', marginTop: '0.5rem' }}>
                  {lang === 'ar' ? `متبقي ${(referralData?.target || 3) - (referralData?.count || 0)} دعوات للحصول على VIP Basic مجاناً` : `${(referralData?.target || 3) - (referralData?.count || 0)} more invites to unlock free VIP Basic`}
                </div>
              </div>
            )}

            {/* Referral Link Box */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.86rem', color: 'var(--ink-dim)', display: 'block', marginBottom: '0.45rem' }}>
                🔗 {lang === 'ar' ? 'رابط الدعوة المخصص لك:' : 'Your Unique Referral Link:'}
              </label>
              <div className="referral-box">
                <span style={{ fontSize: '0.88rem', fontFamily: 'monospace', color: 'var(--cyan)', wordBreak: 'break-all' }}>
                  {referralData?.referralLink || `${window.location.origin}/?ref=${user?.username || 'user'}`}
                </span>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    const lk = referralData?.referralLink || `${window.location.origin}/?ref=${user?.username || 'user'}`;
                    navigator.clipboard.writeText(lk);
                    pushToast(lang === 'ar' ? 'تم نسخ رابط الدعوة!' : 'Referral link copied!', 'success');
                  }}
                >
                  <span className="btn__shine" />
                  📋 {lang === 'ar' ? 'نسخ الرابط' : 'Copy Link'}
                </button>
              </div>

              {/* Instant Social Share Buttons */}
              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `انضم معي إلى منصة Hearbor لمشاهدة وقراءة أحدث الأنمي والمانجا بجودة فائقة! ${referralData?.referralLink || window.location.origin}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--sm"
                  style={{ background: '#25D366', color: '#fff', textDecoration: 'none', fontWeight: 700 }}
                >
                  💬 WhatsApp
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(referralData?.referralLink || window.location.origin)}&text=${encodeURIComponent(
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
            </div>

            {/* List of Real Referred Friends */}
            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.65rem', color: '#cbd5e1' }}>
                👥 {lang === 'ar' ? 'الأصدقاء الذين انضموا عبر رابط دعوتك:' : 'Friends joined via your invite:'}
              </h4>
              {referralData?.referrals && referralData.referrals.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {referralData.referrals.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 1rem',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--cyan)', fontWeight: 800 }}>@{r.referred_username}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-dim)' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.78rem' }}>
                        ✓ {lang === 'ar' ? 'دعوة ناجحة' : 'Joined'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', textAlign: 'center', color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
                  {lang === 'ar' ? 'لم يسجل أي شخص عبر رابطك بعد. شارك الرابط في مجموعات الأنمي والأصدقاء لفتح VIP مجاناً!' : 'No one has joined yet. Share your link to unlock free VIP!'}
                </div>
              )}
            </div>

            {/* VIP Plans & Comparison Proposal Showcase */}
            <div style={{ marginTop: '1.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>👑</span> {lang === 'ar' ? 'خطط وباقات الـ VIP المقترحة (VIP Tiers Proposal)' : 'VIP Plans & Membership Tiers'}
              </h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--ink-dim)', margin: '0 0 1rem', lineHeight: 1.5 }}>
                {lang === 'ar'
                  ? 'مقارنة شاملة بين الباقات المجانية وعضويات VIP، وكيفية الحصول عليها بدعوة الأصدقاء أو الترقية:'
                  : 'Comprehensive comparison of free vs VIP tiers, and how to unlock them:'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {/* Free Tier */}
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '1.1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>{lang === 'ar' ? 'الباقة الحالية' : 'Current Plan'}</div>
                  <h4 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0.75rem', fontWeight: 800, color: '#fff' }}>
                    🎮 Free Otaku (مجاني)
                  </h4>
                  <ul style={{ paddingInlineStart: '1.2rem', margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.8 }}>
                    <li>{lang === 'ar' ? 'مشاهدة بجودة 720p / 1080p العادية' : 'Standard 720p/1080p stream'}</li>
                    <li>{lang === 'ar' ? 'سيرفرات المشاهدة العامة' : 'Public streaming servers'}</li>
                    <li>{lang === 'ar' ? 'حفلات المشاهدة (تفتح غرفة أو تدخل واحدة)' : 'Watch parties (open or join a room)'}</li>
                    <li>{lang === 'ar' ? 'إطارات وزخارف أساسية' : 'Basic profile ornaments'}</li>
                  </ul>
                </div>

                {/* VIP Basic Tier */}
                <div style={{ background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(245, 158, 11, 0.06))', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '14px', padding: '1.1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>
                    {lang === 'ar' ? 'هدية دعوة 3 أصدقاء 🎁' : 'Unlock with 3 Invites 🎁'}
                  </div>
                  <h4 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0.75rem', fontWeight: 800, color: '#fbbf24' }}>
                    ⚡ VIP Basic (صياد النخبة)
                  </h4>
                  <ul style={{ paddingInlineStart: '1.2rem', margin: 0, fontSize: '0.8rem', color: '#fef08a', lineHeight: 1.8 }}>
                    <li>{lang === 'ar' ? 'شارة VIP الذهبية المميزة بجانب الاسم 👑' : 'Golden VIP badge next to name'}</li>
                    <li>{lang === 'ar' ? 'السيرفرات المباشرة (Fast CDN) في أول القائمة' : 'Direct (Fast CDN) servers listed first'}</li>
                    <li>{lang === 'ar' ? 'رسائل صوتية بلا حدود في المجتمع (المجاني: 2)' : 'Unlimited voice notes in the community (free: 2)'}</li>
                    <li>{lang === 'ar' ? 'فتح 5 إطارات وزخارف حصرية لملف الحساب' : 'Unlock 5 exclusive 3D frames'}</li>
                  </ul>
                </div>

                {/* VIP Ultra / Monarch Tier */}
                <div style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(236, 72, 153, 0.08))', border: '1px solid rgba(168, 85, 247, 0.45)', borderRadius: '14px', padding: '1.1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#c084fc', fontWeight: 700 }}>
                    {lang === 'ar' ? 'الباقة الإمبراطورية الملكية 👑' : 'Supreme Monarch Tier 👑'}
                  </div>
                  <h4 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0.75rem', fontWeight: 800, color: '#e879f9' }}>
                    🔮 VIP Monarch (إمبراطور الظلال)
                  </h4>
                  <ul style={{ paddingInlineStart: '1.2rem', margin: 0, fontSize: '0.8rem', color: '#f5d0fe', lineHeight: 1.8 }}>
                    <li>{lang === 'ar' ? 'كل مزايا VIP Basic' : 'Everything in VIP Basic'}</li>
                    <li>{lang === 'ar' ? 'إطارين حصريين زيادة: Dragon Ascension و Celestial Void' : 'Two more exclusive frames: Dragon Ascension & Celestial Void'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'developer' && isDeveloper && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Real Developer Subscription Code Generator (VIP Basic & VIP Monarch in EGP) */}
          <DevVipCodeGenerator />

          {/* Feature 1: Footer Text Editor */}
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBlockEnd: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>✍️</span>
              <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 800 }}>
                {t('dev.footerSection')}
              </h2>
            </div>
            <p style={{ color: 'var(--ink-dim)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>
              {t('dev.footerDesc')}
            </p>

            <form onSubmit={handleUpdateFooter}>
              <div className="field">
                <label className="label" htmlFor="dev-foot-tagline">{t('dev.footerTagline')}</label>
                <input
                  id="dev-foot-tagline"
                  type="text"
                  className="input"
                  value={footerTagline}
                  onChange={(e) => setFooterTagline(e.target.value)}
                  placeholder="Stream every episode. Track your shows. Own the night."
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="dev-foot-notice">{t('dev.footerNotice')}</label>
                <input
                  id="dev-foot-notice"
                  type="text"
                  className="input"
                  value={footerNotice}
                  onChange={(e) => setFooterNotice(e.target.value)}
                  placeholder="Hearbor — Interactive Anime Platform"
                  required
                />
              </div>

              {/* Live Footer Preview */}
              <div
                style={{
                  margin: '1.25rem 0',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px dashed rgba(255, 255, 255, 0.2)'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--cyan)', fontWeight: 700, marginBlockEnd: '0.5rem', textTransform: 'uppercase' }}>
                  Live Preview:
                </div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{footerTagline}</div>
                <div style={{ opacity: 0.7, fontSize: '0.82rem', marginTop: '0.35rem' }}>{footerNotice}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn--primary" disabled={footerSaving}>
                  <span className="btn__shine" />
                  {footerSaving ? t('common.loading') : t('dev.footerUpdateBtn')}
                </button>
              </div>
            </form>
          </div>

          {/* Feature 2: Site User Count & Analytics */}
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBlockEnd: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>👥</span>
                <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 800 }}>
                  {t('dev.usersSection')}
                </h2>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  background: 'rgba(34, 211, 238, 0.12)',
                  padding: '0.45rem 1.1rem',
                  borderRadius: '99px',
                  border: '1px solid rgba(34, 211, 238, 0.35)'
                }}
              >
                <span style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>{t('dev.totalUsers')}:</span>
                <strong style={{ color: 'var(--cyan)', fontSize: '1.15rem' }}>
                  {formatNumber(userStats?.totalUsers || 0)}
                </strong>
              </div>
            </div>

            {loadingUserStats ? (
              <LiquidLoader />
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '380px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'start' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.12)', color: 'var(--ink-dim)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>#</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>User</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>Email</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>Role</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>{lang === 'ar' ? 'الشارات' : 'Badges'}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>Registered</th>
                      <th style={{ padding: '0.75rem', textAlign: 'start' }}>{lang === 'ar' ? 'إدارة' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(userStats?.users || []).map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '0.75rem', color: 'var(--ink-dim)', fontFamily: 'monospace' }}>{u.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: u.avatarColor || '#22d3ee',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}
                            >
                              {u.photoUrl ? (
                                <img onError={imgFallback} src={u.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                u.displayName?.[0]?.toUpperCase() || u.username?.[0]?.toUpperCase()
                              )}
                            </div>
                            <div>
                              <strong style={{ display: 'block', color: 'var(--ink)' }}>{u.displayName}</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>@{u.username}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--ink-dim)' }}>{u.email}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span
                            style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '99px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: u.role === 'developer' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                              color: u.role === 'developer' ? '#f472b6' : 'var(--ink-dim)',
                              border: u.role === 'developer' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid transparent'
                            }}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <UserBadges badges={u.badges} size="sm" />
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--ink-dim)', fontSize: '0.8rem' }}>{u.createdAt}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            style={{
                              padding: '0.25rem 0.65rem',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
                              color: '#fff'
                            }}
                            onClick={() => openBadgeModal(u)}
                            title={lang === 'ar' ? 'منح وتعديل شارات الحساب' : 'Grant and manage badges'}
                          >
                            <span className="btn__shine" />
                            🎖️ {lang === 'ar' ? 'منح شارات' : 'Badges'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Feature 3: Integrated System Diagnostics & Error Discovery Window */}
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBlockEnd: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🩺</span>
                <div>
                  <h2 style={{ fontSize: '1.4rem', margin: 0, fontWeight: 800 }}>
                    {t('dev.diagnosticsSection')}
                  </h2>
                  <p style={{ color: 'var(--ink-dim)', margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                    {t('dev.diagnosticsDesc')}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleTestPing}
                >
                  ⚡ {t('dev.testPingBtn')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleRunDiagnostics}
                  disabled={runningDiagnostics}
                >
                  <span className="btn__shine" />
                  {runningDiagnostics ? t('dev.diagnosticsRunning') : t('dev.runDiagnosticsBtn')}
                </button>
              </div>
            </div>

            {/* Diagnostic Results Card */}
            {diagnostics && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.55)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '14px',
                  padding: '1.25rem',
                  marginBlockEnd: '1.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBlockEnd: '1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>System Health Report</span>
                  <span
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '99px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      background: diagnostics.overallStatus === 'healthy' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 113, 133, 0.2)',
                      color: diagnostics.overallStatus === 'healthy' ? '#4ade80' : '#fb7185',
                      border: `1px solid ${diagnostics.overallStatus === 'healthy' ? '#4ade80' : '#fb7185'}`
                    }}
                  >
                    ● {diagnostics.overallStatus.toUpperCase()} ({diagnostics.totalDurationMs}ms)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  {diagnostics.checks.map((chk, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: '0.88rem' }}>{chk.service}</strong>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: chk.status === 'ok' ? '#4ade80' : chk.status === 'degraded' ? '#fbbf24' : '#fb7185'
                          }}
                        >
                          {chk.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-dim)', marginTop: '0.4rem' }}>
                        {chk.details} {chk.latencyMs !== undefined ? `(${chk.latencyMs}ms)` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error & Diagnostic Event Logs Console Window */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBlockEnd: '0.65rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink-dim)' }}>
                  🖥️ {t('dev.errorLogs')}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', fontFamily: 'monospace' }}>
                  {systemLogs.length} events
                </span>
              </div>

              <div
                style={{
                  background: '#04060b',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '1rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem'
                }}
              >
                {loadingLogs ? (
                  <div style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: '1rem' }}>{t('common.loading')}</div>
                ) : systemLogs.length === 0 ? (
                  <div style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: '1rem' }}>{t('dev.noLogs')}</div>
                ) : (
                  systemLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '0.45rem 0',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.75rem',
                        lineHeight: 1.4
                      }}
                    >
                      <span style={{ color: 'var(--ink-faint)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {log.createdAt}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          color: log.level === 'error' ? '#fb7185' : log.level === 'warn' ? '#fbbf24' : '#22d3ee',
                          textTransform: 'uppercase'
                        }}
                      >
                        [{log.level}]
                      </span>
                      <span style={{ color: 'var(--ink-dim)', fontSize: '0.76rem' }}>
                        [{log.category}]
                      </span>
                      <span style={{ color: '#fff', wordBreak: 'break-all' }}>
                        {log.message}
                      </span>
                      {log.details && (
                        <span style={{ color: 'var(--ink-faint)', fontSize: '0.75rem' }}>
                          {log.details}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: Manga & Novels List (قائمة المانجا والروايات) ================= */}
      {activeTab === 'manga-novels' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Recent Reading History Shelf */}
          <div className="glass" style={{ padding: '2rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.8rem' }}>⏱️</span>
                <div>
                  <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800 }}>
                    {lang === 'ar' ? 'سجل القراءة الأخير (Reading History)' : 'Recent Reading History'}
                  </h2>
                  <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                    {lang === 'ar' ? 'تابع قراءة فصول المانجا والروايات من حيث توقفت مباشرة' : 'Continue reading right where you left off'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/browse?category=manga')}
              >
                🔍 {lang === 'ar' ? 'استكشاف المزيد من المانجا' : 'Explore Manga'}
              </button>
            </div>

            {readingHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📖</div>
                <h4 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>
                  {lang === 'ar' ? 'لا يوجد سجل قراءة بعد' : 'No reading history yet'}
                </h4>
                <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
                  {lang === 'ar'
                    ? 'ابدأ بقراءة أي مانجا أو رواية مترجمة للعربية وسيقوم النظام بحفظ آخر فصل وصفحة قرأتها تلقائياً هنا.'
                    : 'Start reading any manga or novel and your progress will automatically appear here.'}
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => navigate('/browse?category=manga')}
                >
                  <span className="btn__shine" />
                  📚 {lang === 'ar' ? 'تصفح المكتبة العربية الآن' : 'Browse Arabic Library'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {readingHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '0.85rem',
                      alignItems: 'center'
                    }}
                  >
                    <img
                      src={item.cover_image || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300'}
                      onError={imgFallback}
                      alt=""
                      style={{ width: '65px', height: '90px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className={`media-tag-badge media-tag-badge--${item.type?.toLowerCase() || 'manga'}`} style={{ fontSize: '0.65rem' }}>
                        {item.type?.toUpperCase()}
                      </span>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.92rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title || item.media_id}
                      </h4>
                      <div style={{ fontSize: '0.78rem', color: '#22d3ee', fontWeight: 700, marginBottom: '0.5rem' }}>
                        الفصل {item.chapter_number} {item.page > 1 ? `· صفحة ${item.page}` : ''}
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => setActiveDashboardReader({ id: item.media_id, type: item.type, title: item.title, poster: item.cover_image })}
                      >
                        <span className="btn__shine" />
                        ▶ {lang === 'ar' ? 'متابعة القراءة' : 'Continue'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bookmarked Manga & Light Novels */}
          <div className="glass" style={{ padding: '2rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.8rem' }}>★</span>
                <div>
                  <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800 }}>
                    {lang === 'ar' ? 'الأعمال المحفوظة والمتابعة (Bookmarks)' : 'Saved Bookmarks & Tracking'}
                  </h2>
                  <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                    {lang === 'ar' ? 'قائمة المانجا والمانهوا والروايات التي تتابع صدور فصولها' : 'Your followed titles with new chapter alerts'}
                  </p>
                </div>
              </div>
              <span className="badge badge--cat" style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee' }}>
                {bookmarks.length} {lang === 'ar' ? 'أعمال محفوظة' : 'Saved'}
              </span>
            </div>

            {bookmarks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '16px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⭐</div>
                <h4 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>
                  {lang === 'ar' ? 'لم تقم بحفظ أي عمل في قائمتك بعد' : 'No bookmarks saved yet'}
                </h4>
                <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
                  {lang === 'ar'
                    ? 'عند تصفح أي مانجا أو رواية، اضغط على زر "حفظ ومتابعة" لإضافتها هنا واستلام تنبيهات فورية عند صدور ترجمة فصول جديدة.'
                    : 'Click "Bookmark" on any manga or novel to track it and get new chapter release alerts.'}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate('/browse?category=manga')}
                >
                  📖 {lang === 'ar' ? 'استعراض المكتبة' : 'Browse Library'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.25rem' }}>
                {bookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="glass show-card"
                    style={{
                      borderRadius: '14px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
                      <img
                        src={bm.cover_image || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400'}
                        onError={imgFallback}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span
                        className={`media-tag-badge media-tag-badge--${bm.type?.toLowerCase() || 'manga'}`}
                        style={{ position: 'absolute', top: '8px', insetInlineStart: '8px', fontSize: '0.68rem' }}
                      >
                        {bm.type?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ padding: '0.95rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.92rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {bm.title || bm.media_id}
                      </h4>
                      <div style={{ marginTop: 'auto', display: 'flex', gap: '0.45rem', paddingTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          style={{ flex: 1, padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                          onClick={() => setActiveDashboardReader({ id: bm.media_id, type: bm.type, title: bm.title, poster: bm.cover_image })}
                        >
                          <span className="btn__shine" />
                          📖 {lang === 'ar' ? 'قراءة' : 'Read'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          style={{ padding: '0.35rem 0.6rem', color: '#fb7185' }}
                          title={lang === 'ar' ? 'إزالة من المحفوظات' : 'Remove bookmark'}
                          onClick={async () => {
                            await api.post('/api/tracking/bookmark', { mediaId: bm.media_id, type: bm.type });
                            setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
                            pushToast(lang === 'ar' ? 'تمت إزالة العمل من قائمتك' : 'Bookmark removed', 'info');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Notifications Shelf */}
          <div className="glass" style={{ padding: '2rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '1.8rem' }}>🔔</span>
              <div>
                <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800 }}>
                  {lang === 'ar' ? 'تنبيهات صدور الفصول الجديدة' : 'Chapter Release Alerts'}
                </h2>
                <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                  {lang === 'ar' ? 'إشعارات تلقائية فور توفر ترجمة فصول جديدة للأعمال التي تتابعها' : 'Automatic notifications when new chapters drop'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {userNotifications.map((notif) => (
                <div
                  key={notif.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1.15rem',
                    borderRadius: '12px',
                    background: 'rgba(34, 211, 238, 0.04)',
                    border: '1px solid rgba(34, 211, 238, 0.18)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>🔥</span>
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem', color: '#22d3ee' }}>{notif.title}</strong>
                      <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>{notif.message}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => navigate('/browse?category=manga')}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {lang === 'ar' ? 'فتح الفصل ▶' : 'View Chapter ▶'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 6: Community Posts (منشورات المجتمع) ================= */}
      {activeTab === 'posts' && (
        <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '2rem' }}>💬</span>
              <div>
                <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                  {lang === 'ar' ? 'منشورات المجتمع ونقاشاتك' : 'Community Posts & Discussions'}
                </h2>
                <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                  {lang === 'ar' ? 'المنشورات والنقاشات والنظريات التي شاركتها مع مجتمع الأوتاكو' : 'Your community posts, theories, and discussion threads'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => navigate('/community')}
            >
              <span className="btn__shine" />
              ➕ {lang === 'ar' ? 'إنشاء منشور جديد' : 'New Post'}
            </button>
          </div>

          {userCommunityPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✍️</div>
              <h4 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>
                {lang === 'ar' ? 'لم تقم بمشاركة منشورات بعد' : 'No posts published yet'}
              </h4>
              <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto 1.25rem' }}>
                {lang === 'ar' ? 'شارك آرائك ونظرياتك وتوصيات المانجا والأنمي مع الآلاف من المتابعين!' : 'Share your theories, recommendations, and manga discussions!'}
              </p>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => navigate('/community')}
              >
                <span className="btn__shine" />
                🚀 {lang === 'ar' ? 'انتقل إلى ساحة المجتمع' : 'Go to Community'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {userCommunityPosts.map((post) => (
                <div
                  key={post.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                      {post.title || post.content?.slice(0, 40) || 'منشور نقاشي'}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--ink-dim)' }}>
                      {post.created_at || 'حديثاً'}
                    </span>
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0, lineHeight: 1.5 }}>
                    {post.content || post.text}
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--ink-dim)', marginTop: '0.35rem' }}>
                    <span>❤️ {post.likes_count || 12} {lang === 'ar' ? 'إعجاب' : 'Likes'}</span>
                    <span>💬 {post.comments_count || 4} {lang === 'ar' ? 'تعليق' : 'Comments'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 7: My Ratings (تقييماتي) ================= */}
      {activeTab === 'ratings' && (
        <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '2rem' }}>⭐</span>
            <div>
              <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                {lang === 'ar' ? 'تقييماتي للأعمال والفصول (My Ratings)' : 'My Ratings & Reviews'}
              </h2>
              <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                {lang === 'ar' ? 'قائمة تقييماتك للمانجا والأنمي والروايات التي قمت بمتابعتها' : 'Your ratings and scores for anime, manga, and novels'}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1rem' }}>Solo Leveling (سولو ليفلينج)</strong>
                <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>★ 10 / 10</span>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '0.84rem', margin: 0, lineHeight: 1.45 }}>
                {lang === 'ar' ? 'عمل أسطوري وتطور الأحداث وقتالات سونغ جين وو من أفضل ما قرأت في المانهوا!' : 'Masterpiece story and leveling progression!'}
              </p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1rem' }}>Lord of the Mysteries (سيد الأسرار)</strong>
                <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>★ 9.8 / 10</span>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '0.84rem', margin: 0, lineHeight: 1.45 }}>
                {lang === 'ar' ? 'أعظم بناء عالم وسحر في الروايات الخفيفة بلا منازع، نظام الجرع والمسارات متقن للغاية.' : 'Peak worldbuilding and mystery in web novels.'}
              </p>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1rem' }}>Jujutsu Kaisen (جوجوتسو كايسن)</strong>
                <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem' }}>★ 9.4 / 10</span>
              </div>
              <p style={{ color: 'var(--ink-dim)', fontSize: '0.84rem', margin: 0, lineHeight: 1.45 }}>
                {lang === 'ar' ? 'قتالات سريعة وأحداث حابسة للأنفاس خاصة في أرك غوجو وسوكونا.' : 'Incredible fights and high stakes arcs.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 8: Support Desk (الدعم الفني) ================= */}
      {activeTab === 'support' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass" style={{ padding: '2.25rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '2rem' }}>🎧</span>
              <div>
                <h2 style={{ fontSize: '1.45rem', margin: 0, fontWeight: 800 }}>
                  {lang === 'ar' ? 'مكتب الدعم الفني وطلبات الترجمة' : 'Support Desk & Translation Requests'}
                </h2>
                <p style={{ color: 'var(--ink-dim)', margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                  {lang === 'ar' ? 'تواصل مباشرة مع فريق التطوير والمشرفين لطلب فصول جديدة أو الإبلاغ عن مشكلة' : 'Reach out directly to developers for chapter requests or issues'}
                </p>
              </div>
            </div>

            {/* Ticket Submission Form */}
            <form onSubmit={handleCreateSupportTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label className="label">{lang === 'ar' ? 'نوع الطلب:' : 'Request Type:'}</label>
                  <select
                    className="input"
                    value={supportCategory}
                    onChange={(e) => setSupportCategory(e.target.value)}
                  >
                    <option value="CHAPTER">{lang === 'ar' ? '📖 طلب فصل أو مانجا مترجمة جديدة' : 'Chapter / Manga Request'}</option>
                    <option value="FEATURE">{lang === 'ar' ? '💡 اقتراح ميزة أو تحسين بالواجهة' : 'Feature Suggestion'}</option>
                    <option value="BUG">{lang === 'ar' ? '🐞 إبلاغ عن مشكلة في القارئ أو المشغل' : 'Bug Report'}</option>
                    <option value="OTHER">{lang === 'ar' ? '✉️ استفسار عام' : 'General Inquiry'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">{lang === 'ar' ? 'تفاصيل الرسالة:' : 'Message Details:'}</label>
                <textarea
                  className="input"
                  rows={4}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب استفسارك، اسم المانجا التي تود إضافتها، أو أي تفاصيل أخرى...' : 'Describe your request or issue...'}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={submittingSupport || !supportMessage.trim()}
                  className="btn btn--primary"
                >
                  <span className="btn__shine" />
                  {submittingSupport ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : (lang === 'ar' ? '📨 إرسال التذكرة للدعم الفني' : 'Send Ticket')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Badge Management Modal for Developer */}
      {badgeModalUser && (
        <div
          className="modal-backdrop"
          onClick={() => setBadgeModalUser(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(5, 7, 13, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="glass modal reveal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '540px',
              borderRadius: '24px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1rem', marginBlockEnd: '1.25rem' }}>
              <div>
                <span className="badge badge--cat" style={{ background: 'linear-gradient(135deg, #eab308, #ec4899)', color: '#fff' }}>
                  👑 {lang === 'ar' ? 'صلاحيات مطور الموقع' : 'Developer Console'}
                </span>
                <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.3rem', fontWeight: 800 }}>
                  🎖️ {lang === 'ar' ? 'منح الشارات للحساب' : 'Grant Badges'}
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--cyan)' }}>
                  @{badgeModalUser.username} ({badgeModalUser.displayName})
                </span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setBadgeModalUser(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--ink-dim)', margin: '0 0 1rem' }}>
              {lang === 'ar'
                ? 'اختر الشارات التي ترغب في منحها أو سحبها من هذا المستخدم. تظهر الشارات بجانب اسم المستخدم في حسابه وفي شريط الموقع:'
                : 'Select the badges to grant or revoke for this account. Badges display next to user name across the site:'}
            </p>

            {/* Badges Toggle List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBlockEnd: '1.5rem' }}>
              {Object.values(BADGE_DEFINITIONS).map((b) => {
                const isSelected = selectedBadges.includes(b.id);
                return (
                  <div
                    key={b.id}
                    onClick={() => toggleBadge(b.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      borderRadius: '14px',
                      background: isSelected ? b.bg : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? `2px solid ${b.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: b.bg,
                          color: b.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${b.border}`,
                          boxShadow: isSelected ? `0 0 12px ${b.color}55` : 'none'
                        }}
                      >
                        {b.icon}
                      </div>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.92rem', color: isSelected ? '#fff' : 'var(--ink)' }}>
                          {lang === 'ar' ? b.nameAr : b.nameEn}
                        </strong>
                        <span style={{ fontSize: '0.76rem', color: 'var(--ink-dim)' }}>
                          {lang === 'ar' ? b.descAr : b.descEn}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: isSelected ? `2px solid ${b.color}` : '2px solid rgba(255, 255, 255, 0.3)',
                        background: isSelected ? b.color : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#000',
                        fontSize: '0.8rem',
                        fontWeight: 900
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setBadgeModalUser(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleSaveBadges}
                disabled={savingBadges}
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '0.5rem 1.25rem'
                }}
              >
                <span className="btn__shine" />
                {savingBadges ? t('common.loading') : (lang === 'ar' ? '💾 حفظ الشارات' : 'Save Badges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Manga & Novel Reader in Profile Dashboard */}
      {activeDashboardReader && (
        <MangaNovelReader
          item={activeDashboardReader}
          type={activeDashboardReader.type === 'NOVEL' ? 'novel' : 'manga'}
          onClose={() => setActiveDashboardReader(null)}
          onProgressUpdated={() => {
            api.get('/api/tracking/history').then((res) => setReadingHistory(res.history || [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
