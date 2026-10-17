import React, { Suspense, lazy, useEffect, useState } from 'react';
import BlackXSplashVortex from '../components/BlackXSplashVortex.jsx';
import { BX_APK_VERSION } from './bxServers.js';
import { SPLASH_SEEN_KEY, SPLASH_SOUND_KEY } from './splashPrefs.js';
import { seedWebLanguage } from './webApp.js';
import { reportClientError } from '../errorReporter.js';
import './apkBase.css';

const MobileApkApp = lazy(() => import('./MobileApkApp.jsx'));

class ApkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[BLACK X APK]', error, info);
    reportClientError(error, { kind: 'react', componentStack: info?.componentStack || '' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '18px', background: '#fff', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.75rem', marginBottom: '1rem' }}>X</div>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: 800 }}>BLACK X</h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.72)' }}>حصلت مشكلة مؤقتة في الواجهة — اضغط لإعادة التشغيل</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '0.8rem 1.5rem', minHeight: 44, borderRadius: 12, background: '#fff', color: '#000', border: 'none', fontWeight: 700, fontSize: '0.9375rem' }}
        >
          إعادة تحميل التطبيق
        </button>
      </div>
    );
  }
}

function readLang(platform) {
  if (platform === 'web') seedWebLanguage();
  try {
    return localStorage.getItem('bx_mob_lang') || 'ar';
  } catch {
    return 'ar';
  }
}

/**
 * Splash policy: the full 4-second brand animation plays on the first launch of
 * each installed version; later launches get a short 1.1 s version (still
 * skippable). Its sound is off unless the user turns it on in settings.
 */
function initialSplash(platform) {
  let seen = '';
  try {
    seen = localStorage.getItem(SPLASH_SEEN_KEY) || '';
  } catch {
    seen = '';
  }
  if (platform === 'web') {
    // Phone website: once per browser session (links opened later in the same session go
    // straight to their page), 2.5 s the first time, then the short version.
    let played = false;
    try {
      played = sessionStorage.getItem('bx_splash_played') === '1';
    } catch {
      played = false;
    }
    return { active: !played, mode: undefined, durationMs: seen === BX_APK_VERSION ? 1100 : 2500, subtitleAr: '', subtitleEn: '' };
  }
  return { active: true, mode: undefined, durationMs: seen === BX_APK_VERSION ? 1100 : 4000, subtitleAr: '', subtitleEn: '' };
}

/** `platform="web"`: the phone website (main.jsx), otherwise the APK (main-apk.jsx). */
export default function ApkRoot({ platform = 'apk' }) {
  const [lang] = useState(() => readLang(platform));
  const [splash, setSplash] = useState(() => initialSplash(platform));
  const [soundOn] = useState(() => {
    try {
      return localStorage.getItem(SPLASH_SOUND_KEY) === 'on';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (platform !== 'web') window.__BLACKX_APK__ = true;
  }, [lang, platform]);

  // Motion themes (profile setting / episode start) replay the splash on demand.
  useEffect(() => {
    const handleReplay = (e) => {
      const d = e?.detail || {};
      setSplash({ active: true, mode: d.mode || undefined, durationMs: d.durationMs || 4000, subtitleAr: d.subtitleAr || '', subtitleEn: d.subtitleEn || '' });
    };
    window.triggerBlackXMotion = (mode, durationMs = 1500, subtitleAr = '', subtitleEn = '') => {
      setSplash({ active: true, mode: mode || undefined, durationMs: Number(durationMs) || 1500, subtitleAr: subtitleAr || '', subtitleEn: subtitleEn || '' });
    };
    window.addEventListener('bx_replay_splash', handleReplay);
    window.addEventListener('bx_trigger_motion', handleReplay);
    return () => {
      window.removeEventListener('bx_replay_splash', handleReplay);
      window.removeEventListener('bx_trigger_motion', handleReplay);
    };
  }, []);

  const handleSplashDone = () => {
    try {
      localStorage.setItem(SPLASH_SEEN_KEY, BX_APK_VERSION);
      if (platform === 'web') sessionStorage.setItem('bx_splash_played', '1');
    } catch {
      /* ignore */
    }
    setSplash((prev) => ({ ...prev, active: false }));
  };

  return (
    <ApkErrorBoundary>
      {splash.active && (
        <BlackXSplashVortex
          durationMs={splash.durationMs}
          initialMode={splash.mode}
          customSubtitleAr={splash.subtitleAr}
          customSubtitleEn={splash.subtitleEn}
          lang={lang}
          enableSound={soundOn}
          onComplete={handleSplashDone}
        />
      )}
      <Suspense fallback={<div role="status" aria-live="polite" style={{ minHeight: '100vh', background: '#000' }} />}>
        <MobileApkApp />
      </Suspense>
    </ApkErrorBoundary>
  );
}
