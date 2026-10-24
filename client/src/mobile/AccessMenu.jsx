import React from 'react';
import BxIcon from './BxIcon.jsx';
import { openComputerVersion } from './webApp.js';
import { BX_APK_VERSION, formatBxCount } from './bxServers.js';
import { PUBLIC_SITE_HOST } from '../../../shared/publicSite.js';

/**
 * AccessMenu: moved out of MobileApkApp.jsx unchanged (2026-10-17 split). It only renders —
 * the state and the actions stay in MobileApkApp and come in as props.
 */
export default function AccessMenu({
  avatarPhoto,
  bxAnimeTotal,
  goToTab,
  isDeveloper,
  isRtl,
  isWeb,
  menuPresence,
  offlineChapters,
  resetProfileStack,
  setAppSheet,
  setAvatarFailed,
  setCommandMenuOpen,
  user,
  userVipTier,
  visibleFavorites
}) {
  return (
    <div className={`bx-menu-backdrop${menuPresence.closing ? ' is-closing' : ''}`} onClick={() => setCommandMenuOpen(false)} role="presentation">
      <div
        className="bx-menu-card"
        role="dialog"
        aria-modal="true"
        aria-label={isRtl ? 'القائمة' : 'Menu'}
        onClick={(e) => e.stopPropagation()}
        style={{ transformOrigin: isRtl ? 'top left' : 'top right' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.3rem 0.6rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
            {isRtl ? 'القائمة' : 'MENU'}
          </span>
          <button
            type="button"
            className="bx-round-btn"
            onClick={() => setCommandMenuOpen(false)}
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            style={{ width: '34px', height: '34px', fontSize: '1.0625rem', boxShadow: 'none' }}
          >
            <BxIcon name="close" />
          </button>
        </div>

        <button
          type="button"
          className="bx-menu-item"
          onClick={() => goToTab('profile', () => resetProfileStack())}
          style={{
            '--i': 0,
            padding: '0.55rem 0.6rem',
            marginBottom: '0.45rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
            <span className="bx-avatar-btn" style={{ width: '44px', height: '44px', boxShadow: 'none', flexShrink: 0 }}>
              {avatarPhoto ? (
                <img src={avatarPhoto} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
              ) : user ? (
                <span>{(user.displayName?.[0] || user.username?.[0] || 'X').toUpperCase()}</span>
              ) : (
                <BxIcon name="user" />
              )}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'start' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.displayName || (isRtl ? 'زائر' : 'Guest')}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                {user
                  ? isRtl
                    ? 'الملف الشخصي ومكتبتي'
                    : 'Profile & library'
                  : isWeb
                  ? isRtl
                    ? 'سجّل دخولك عشان مكتبتك تتحفظ على كل أجهزتك'
                    : 'Sign in to keep your library on every device'
                  : isRtl
                  ? 'سجّل دخولك لمزامنة مكتبتك مع الموقع'
                  : 'Sign in to sync with the website'}
              </span>
            </span>
          </span>
          <BxIcon name={isRtl ? 'chevron-left' : 'chevron-right'} style={{ opacity: 0.55 }} />
        </button>

        {[
          {
            id: 'mylist',
            icon: 'bookmark',
            label: isRtl ? 'قائمتي' : 'My list',
            badge: visibleFavorites.length || null,
            onClick: () => goToTab('profile', () => resetProfileStack(['library']))
          },
          {
            id: 'history',
            icon: 'clock',
            label: isRtl ? 'سجل المشاهدة' : 'Watch history',
            badge: null,
            onClick: () => goToTab('profile', () => resetProfileStack(['history']))
          },
          {
            id: 'radar',
            icon: 'bell',
            label: isRtl ? 'تنبيهات الحلقات' : 'Episode alerts',
            badge: null,
            onClick: () => {
              setCommandMenuOpen(false);
              setAppSheet('alerts');
            }
          },
          {
            id: 'offline',
            icon: 'download',
            label: isRtl ? 'التنزيلات' : 'Downloads',
            badge: offlineChapters.length || null,
            onClick: () => goToTab('profile', () => resetProfileStack(['offline']))
          },
          {
            id: 'vip',
            icon: 'crown',
            label: isRtl ? 'العضوية و VIP' : 'Membership & VIP',
            badge: userVipTier !== 'free' || isDeveloper ? 'VIP' : null,
            onClick: () => goToTab('profile', () => resetProfileStack(['vip']))
          },
          {
            id: 'settings',
            icon: 'settings',
            label: isRtl ? 'الإعدادات' : 'Settings',
            badge: null,
            onClick: () => goToTab('profile', () => resetProfileStack(['settings']))
          },
          ...(isWeb
            ? [
                // website only (2026-10-17)
                {
                  id: 'rankings',
                  icon: 'trophy',
                  label: isRtl ? 'الترتيب' : 'Rankings',
                  badge: null,
                  onClick: () => goToTab('profile', () => resetProfileStack(['rankings']))
                },
                {
                  id: 'wrapped',
                  icon: 'sparkles',
                  label: isRtl ? 'ملخصك' : 'Your year',
                  badge: null,
                  onClick: () => goToTab('profile', () => resetProfileStack(['wrapped']))
                },
                ...(typeof window !== 'undefined' && window.innerWidth >= 1024
                  ? [
                      {
                        id: 'shortcuts',
                        icon: 'keyboard',
                        label: isRtl ? 'اختصارات الكيبورد' : 'Keyboard shortcuts',
                        badge: '?',
                        onClick: () => {
                          setCommandMenuOpen(false);
                          setAppSheet('shortcuts');
                        }
                      }
                    ]
                  : []),
                {
                  id: 'apkperks',
                  icon: 'smartphone',
                  label: isRtl ? 'تطبيق الأندرويد' : 'Android app',
                  badge: null,
                  onClick: () => goToTab('profile', () => resetProfileStack(['apkperks']))
                },
                {
                  id: 'computer',
                  icon: 'monitor',
                  label: isRtl ? 'التصميم القديم للموقع' : 'Classic website',
                  badge: null,
                  onClick: () => {
                    setCommandMenuOpen(false);
                    openComputerVersion();
                  }
                }
              ]
            : [
                {
                  id: 'webperks',
                  icon: 'globe',
                  label: isRtl ? 'على الموقع بس' : 'Website only',
                  badge: null,
                  onClick: () => goToTab('profile', () => resetProfileStack(['webperks']))
                }
              ])
        ].map((item, idx) => (
          <button key={item.id} type="button" className="bx-menu-item" style={{ '--i': idx + 1 }} onClick={item.onClick}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              <span className="bx-menu-ico">
                <BxIcon name={item.icon} />
              </span>
              <span style={{ textAlign: 'start' }}>{item.label}</span>
            </span>
            {item.badge ? <span className="bx-menu-badge">{item.badge}</span> : null}
          </button>
        ))}

        {/* App info (moved here from the old top header) */}
        <div
          className="bx-fade"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginTop: '0.55rem',
            padding: '0.75rem 0.6rem 0.2rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            animationDelay: '0.45s'
          }}
        >
          <img src="/blackx-logo.png" alt="" style={{ width: '30px', height: '30px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.22)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>Hearbor</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
              {isWeb
                ? `${PUBLIC_SITE_HOST}${bxAnimeTotal ? ` • ${formatBxCount(bxAnimeTotal)} ${isRtl ? 'أنمي' : 'anime'}` : ''}`
                : isRtl
                ? `إصدار ${BX_APK_VERSION}${bxAnimeTotal ? ` • ${formatBxCount(bxAnimeTotal)} أنمي` : ''}`
                : `Version ${BX_APK_VERSION}${bxAnimeTotal ? ` • ${formatBxCount(bxAnimeTotal)} anime` : ''}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
