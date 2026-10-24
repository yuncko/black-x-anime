/**
 * The app interface running on the phone WEBSITE instead of inside the APK.
 *
 * main.jsx sets `window.__BLACKX_WEB_APP__` before this code loads (see client/src/webUi.js).
 * Everything native has a web replacement here:
 *
 * - Google sign-in: Firebase's web popup instead of the APK's OAuth window (webGoogle.js);
 * - full screen: the browser Fullscreen API + landscape lock where the browser allows it;
 * - the back button and the address bar: webHistory.js + webRoutes.js;
 * - "update the app": replaced by "download the Android app" and "computer version" rows.
 */
import { switchWebUi } from '../webUi.js';

export const WEB_APK_PATH = '/HEARBOR-Mobile-120Hz.apk';

export function isWebApp() {
  return typeof window !== 'undefined' && window.__BLACKX_WEB_APP__ === true;
}

/** Leave the phone interface for the website pages (remembered on this browser). */
export function openComputerVersion() {
  switchWebUi('site');
}

/* ------------------------------------------------------------------ full screen */

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

/** Real browser full screen + landscape (Android browsers). iPhone Safari has no element
 *  full screen: the player's own full-screen layout still covers the page there. */
export function enterWebFullscreen(landscape = true) {
  try {
    if (!fullscreenElement()) {
      const el = document.documentElement;
      const request = el.requestFullscreen || el.webkitRequestFullscreen;
      if (typeof request === 'function') {
        const result = request.call(el, { navigationUI: 'hide' });
        if (result && typeof result.then === 'function') {
          result
            .then(() => {
              if (landscape) window.screen?.orientation?.lock?.('landscape')?.catch?.(() => {});
            })
            .catch(() => {});
          return;
        }
      }
    }
    if (landscape) window.screen?.orientation?.lock?.('landscape')?.catch?.(() => {});
  } catch {
    /* not allowed (no user gesture, iframe): the in-page full-screen layout still works */
  }
}

export function exitWebFullscreen() {
  try {
    window.screen?.orientation?.unlock?.();
  } catch {
    /* not locked */
  }
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      const result = typeof exit === 'function' ? exit.call(document) : null;
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  } catch {
    /* already left */
  }
}

/** Calls `onExit` when the browser leaves full screen by itself (system back, Esc, swipe). */
export function onWebFullscreenExit(onExit) {
  const handler = () => {
    if (!fullscreenElement()) onExit();
  };
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}

/* ------------------------------------------------------------------ language */

/** First visit: start in the language the website (or the browser) already uses. */
export function seedWebLanguage() {
  try {
    if (localStorage.getItem('bx_mob_lang')) return;
    const site = localStorage.getItem('blackx_lang');
    const lang = site === 'en' || site === 'ar' ? site : String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
    localStorage.setItem('bx_mob_lang', lang);
  } catch {
    /* private mode: the app falls back to Arabic */
  }
}

/** Keep the website's language in step, so switching to the computer version keeps it. */
export function rememberWebLanguage(lang) {
  try {
    if (lang === 'ar' || lang === 'en') localStorage.setItem('blackx_lang', lang);
  } catch {
    /* ignore */
  }
}
