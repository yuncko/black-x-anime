import { imgFallback } from '../hooks/hooks.js';
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { UserBadges } from './UserBadges.jsx';
import { LiveCreatureOverlay } from './LiveAvatarOrnament.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useAnimeCatalogTotal, formatCount } from '../hooks/useCatalogStats.js';

function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-toggle" data-lang={lang} role="group" aria-label={t('nav.language')}>
      <div className="lang-toggle__thumb" aria-hidden="true" />
      <button
        type="button"
        className={`lang-toggle__btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={`lang-toggle__btn ${lang === 'ar' ? 'active' : ''}`}
        onClick={() => setLang('ar')}
        aria-pressed={lang === 'ar'}
      >
        ع
      </button>
    </div>
  );
}

export default function Navbar({ onOpenAuth }) {
  const { t, lang } = useI18n();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const animeTotal = useAnimeCatalogTotal();

  const isDev = user?.role === 'developer' || user?.email?.toLowerCase() === 'mz0970mmz@gmail.com' || user?.isDeveloper;
  const hasVerified = isDev || (user?.badges || []).includes('blue_verified') || (user?.badges || []).includes('gold_vip') || (user?.badges || []).length > 0;

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close mobile drawer & search bar on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const links = [
    { to: '/', label: lang === 'ar' ? 'الرئيسية' : 'Home', icon: '🏠' },
    { to: '/discover', label: lang === 'ar' ? 'اكتشف' : 'Discover', icon: '✦' },
    { to: '/trending', label: lang === 'ar' ? 'قائمة الأنمي' : 'Anime List', icon: '🔥' },
    { to: '/trending?type=movie', label: lang === 'ar' ? 'أفلام' : 'Movies', icon: '🎬' },
    { to: '/#schedule-section', label: lang === 'ar' ? 'مواعيد الحلقات' : 'Schedule', icon: '📅', isHash: true },
    { to: '/browse', label: lang === 'ar' ? 'المانجا' : 'Manga', icon: '📖' },
    { to: '/rankings', label: lang === 'ar' ? 'التصنيفات' : 'Rankings', icon: '🏆' },
    { to: '/community', label: lang === 'ar' ? 'المجتمع' : 'Community', icon: '💬' }
  ];

  const handleNavSearchSubmit = (e) => {
    e.preventDefault();
    setMobileSearchOpen(false);
    setMobileDrawerOpen(false);
    if (!navSearch.trim()) {
      navigate('/trending');
      return;
    }
    navigate(`/trending?q=${encodeURIComponent(navSearch.trim())}`);
  };

  return (
    <>
      <header className="nav wit-exact-nav">
        <div className="nav__inner wit-exact-nav__inner">
          {/* Right side in RTL: Mobile Hamburger + Brand Logo + Desktop Links */}
          <div className="wit-exact-nav__right">
            <button
              type="button"
              className="wit-mobile-icon-btn wit-mobile-only"
              onClick={() => {
                setMobileDrawerOpen((v) => !v);
                setMobileSearchOpen(false);
              }}
              aria-label={lang === 'ar' ? 'القائمة' : 'Menu'}
              aria-expanded={mobileDrawerOpen}
            >
              {mobileDrawerOpen ? '✕' : '☰'}
            </button>

            <NavLink to="/" className="wit-brand sloth-brand" aria-label="Hearbor">
              <img
                src="/blackx-logo.png"
                alt="Hearbor"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '11px',
                  objectFit: 'cover',
                  background: '#000000',
                  border: '1.5px solid rgba(255,255,255,0.32)',
                  boxShadow: '0 4px 18px rgba(255,0,0,0.28)'
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="wit-brand__text" style={{ fontWeight: 900, fontSize: '1.08rem', letterSpacing: '0.02em' }}>
                    Hearbor
                  </span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>
                    original
                  </span>
                  <span
                    style={{
                      fontSize: '0.58rem',
                      fontWeight: 900,
                      padding: '0.08rem 0.42rem',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#000000'
                    }}
                  >
                    120Hz
                  </span>
                </div>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.52)', marginTop: '2px' }}>
                  {animeTotal ? `slothUI Pro 2.0 • ${formatCount(animeTotal)} ANIME` : 'slothUI Pro 2.0'}
                </span>
              </div>
            </NavLink>

            <nav className="wit-exact-nav__links" aria-label="Main">
              {links.map((l) =>
                l.isHash ? (
                  <a key={l.to} href={l.to} className="wit-exact-nav__link">
                    {l.label}
                  </a>
                ) : (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) => `wit-exact-nav__link ${isActive ? 'active' : ''}`}
                    end={l.to === '/'}
                  >
                    {l.label}
                  </NavLink>
                )
              )}
            </nav>
          </div>

          {/* Left side in RTL: Search Pill + Mobile Search Button + Bell + Lang + Auth/Avatar */}
          <div className="wit-exact-nav__left">
            <form className="wit-nav-search" onSubmit={handleNavSearchSubmit}>
              <span className="wit-nav-search__icon" aria-hidden="true">🔍</span>
              <input
                type="search"
                className="wit-nav-search__input"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث عن الأنمي والأفلام...' : 'Search anime & movies...'}
              />
              <button
                type="button"
                className="wit-nav-search__filter"
                onClick={() => navigate(navSearch.trim() ? `/trending?q=${encodeURIComponent(navSearch.trim())}` : '/trending')}
              >
                {lang === 'ar' ? 'التصفية' : 'Filter'}
              </button>
            </form>

            {/* Mobile-only Search Toggle Button */}
            <button
              type="button"
              className={`wit-mobile-icon-btn wit-mobile-only ${mobileSearchOpen ? 'active' : ''}`}
              onClick={() => {
                setMobileSearchOpen((v) => !v);
                setMobileDrawerOpen(false);
              }}
              aria-label={lang === 'ar' ? 'بحث' : 'Search'}
            >
              🔍
            </button>

            <NotificationBell />
            <div className="wit-desktop-lang">
              <LanguageToggle />
            </div>

            {!user ? (
              <div className="nav__auth-group">
                <button type="button" className="btn btn--ghost btn--sm nav-auth-btn nav-auth-btn--login" onClick={() => onOpenAuth('login')}>
                  {t('nav.login')}
                </button>
                <button type="button" className="btn btn--primary btn--sm nav-auth-btn nav-auth-btn--reg" onClick={() => onOpenAuth('register')}>
                  <span className="btn__shine" />
                  {t('nav.register')}
                </button>
              </div>
            ) : (
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="user-avatar-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={user.displayName || 'User profile'}
                >
                  <div className="user-avatar-wrapper" style={{ position: 'relative' }}>
                    <span className="avatar user-avatar-circle" style={{ background: user.avatarColor, overflow: 'hidden' }}>
                      {(user.photoURL || user.photoUrl) ? (
                        <img onError={imgFallback} src={user.photoURL || user.photoUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        user.displayName?.[0]?.toUpperCase() || 'X'
                      )}
                    </span>
                    <LiveCreatureOverlay
                      ornament={user.frameStyle || (typeof localStorage !== 'undefined' && localStorage.getItem('profile_frame_style')) || 'royal-flame'}
                      mode="frame"
                      size={40}
                    />
                    {isDev ? (
                      <span className="avatar-badge avatar-badge--dev" title="👑 مطور Hearbor">👑</span>
                    ) : hasVerified ? (
                      <span className="avatar-badge avatar-badge--verified" title="✔ حساب موثّق">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                </button>
                {menuOpen && (
                  <div className="user-menu" style={{ insetInlineEnd: 0, top: 'calc(100% + 10px)' }}>
                    <div className="user-menu__header">
                      <div className="user-menu__name">{user.displayName}</div>
                      <div className="user-menu__role">
                        {isDev ? '👑 مطور Hearbor' : `@${user.username || 'user'}`}
                      </div>
                      <UserBadges badges={user.badges} size="sm" />
                    </div>
                    <div className="user-menu__divider" />
                    <button
                      type="button"
                      className="user-menu__item"
                      onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                    >
                      <span>👤</span> {t('nav.profile')}
                    </button>
                    {(user.role === 'developer' || user.email?.toLowerCase() === 'mz0970mmz@gmail.com' || user.isDeveloper) && (
                      <button
                        type="button"
                        className="user-menu__item"
                        style={{ color: '#ffffff', fontWeight: 700 }}
                        onClick={() => { setMenuOpen(false); navigate('/profile?tab=developer'); }}
                      >
                        <span>👑</span> {t('nav.devConsole')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="user-menu__item"
                      onClick={() => { setMenuOpen(false); navigate('/mylist'); }}
                    >
                      <span>♥</span> {t('nav.mylist')}
                    </button>
                    <button
                      type="button"
                      className="user-menu__item user-menu__item--danger"
                      onClick={async () => { setMenuOpen(false); await logout(); navigate('/'); }}
                    >
                      <span>⏻</span> {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Expandable Search Bar */}
        {mobileSearchOpen && (
          <div className="wit-mobile-search-panel">
            <form className="wit-mobile-search-form" onSubmit={handleNavSearchSubmit}>
              <input
                ref={mobileSearchInputRef}
                type="search"
                className="wit-mobile-search-input"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث عن أي أنمي أو فيلم في سيرفرات Hearbor...' : 'Search any anime or movie on Hearbor...'}
              />
              <button type="submit" className="wit-mobile-search-submit">
                {lang === 'ar' ? 'بحث' : 'Search'}
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile Full Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="wit-mobile-drawer-backdrop" onClick={() => setMobileDrawerOpen(false)}>
          <aside className="wit-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="wit-mobile-drawer__head">
              <div className="wit-brand">
                <span className="wit-brand__box">X</span>
                <span className="wit-brand__text">Hearbor</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LanguageToggle />
                <button
                  type="button"
                  className="wit-mobile-icon-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {user ? (
              <div
                className="wit-mobile-drawer__user"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  navigate('/profile');
                }}
              >
                <span className="avatar user-avatar-circle" style={{ background: user.avatarColor, width: 42, height: 42 }}>
                  {(user.photoURL || user.photoUrl) ? (
                    <img onError={imgFallback} src={user.photoURL || user.photoUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user.displayName?.[0]?.toUpperCase() || 'X'
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: '#fff', fontSize: '0.92rem' }}>{user.displayName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                    {isDev ? '👑 مطور Hearbor' : `@${user.username || 'user'}`}
                  </div>
                </div>
                <span style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>←</span>
              </div>
            ) : (
              <div className="wit-mobile-drawer__auth">
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onOpenAuth('login');
                  }}
                >
                  {t('nav.login')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onOpenAuth('register');
                  }}
                >
                  {t('nav.register')}
                </button>
              </div>
            )}

            <nav className="wit-mobile-drawer__nav">
              {links.map((l) =>
                l.isHash ? (
                  <a
                    key={l.to}
                    href={l.to}
                    className="wit-mobile-drawer__link"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                  </a>
                ) : (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/'}
                    className={({ isActive }) => `wit-mobile-drawer__link ${isActive ? 'active' : ''}`}
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                  </NavLink>
                )
              )}
              <NavLink
                to="/mylist"
                className={({ isActive }) => `wit-mobile-drawer__link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileDrawerOpen(false)}
              >
                <span>♥</span>
                <span>{lang === 'ar' ? 'قائمتي المفضلة' : 'My List'}</span>
              </NavLink>
              <NavLink
                to="/profile"
                className={({ isActive }) => `wit-mobile-drawer__link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileDrawerOpen(false)}
              >
                <span>👤</span>
                <span>{lang === 'ar' ? 'الملف الشخصي' : 'Profile'}</span>
              </NavLink>
            </nav>
          </aside>
        </div>
      )}

      <nav className="nav-mobile-tabs" aria-label="Mobile">
        {[
          { to: '/', label: lang === 'ar' ? 'الرئيسية' : 'Home', icon: '🏠' },
          { to: '/discover', label: lang === 'ar' ? 'اكتشف' : 'Discover', icon: '✦' },
          { to: '/trending', label: lang === 'ar' ? 'الأنميات' : 'Anime', icon: '🔥' },
          { to: '/browse', label: lang === 'ar' ? 'المانجا' : 'Manga', icon: '📖' },
          { to: '/profile', label: lang === 'ar' ? 'حسابي' : 'Profile', icon: '👤' }
        ].map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')} end={l.to === '/'}>
            <span className="nav-mobile-tabs__icon">{l.icon}</span>
            <span className="nav-mobile-tabs__label">{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
