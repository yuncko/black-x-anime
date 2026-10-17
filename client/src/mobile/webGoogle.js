/**
 * Google sign-in for the phone website (the APK signs in through its native OAuth window).
 *
 * Firebase's web popup confirms the Google account and hands back a Firebase ID token; the
 * server's /api/app/auth/google verifies that token exactly like the APK's (same Firebase
 * project), then the BLACK X session takes over. The Firebase session itself is not kept.
 *
 * Loaded on demand (only when a guest is on the profile / sign-in page) because the Firebase
 * Auth SDK is large; prepareWebGoogle() warms it up so the popup opens straight from the tap
 * (browsers block popups that open too long after it).
 */
import { initializeApp, getApp, getApps } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const APP_NAME = 'bx-web-app';
let authInstance = null;

function webAuth() {
  if (authInstance) return authInstance;
  const app = getApps().some((a) => a.name === APP_NAME) ? getApp(APP_NAME) : initializeApp(firebaseConfig, APP_NAME);
  authInstance = getAuth(app);
  return authInstance;
}

export function prepareWebGoogle() {
  try {
    webAuth();
  } catch {
    /* config problem: reported when the visitor taps the button */
  }
}

/** Opens Google's account chooser; resolves to a Firebase ID token. Errors keep Firebase's `code`. */
export async function webGoogleIdToken() {
  const auth = webAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const token = await cred.user.getIdToken();
  signOut(auth).catch(() => {});
  return token;
}

/** Visitor-facing text for Firebase popup errors. */
export function webGoogleErrorMessage(err, lang = 'ar') {
  const code = String(err?.code || '');
  const ar = lang === 'ar';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
    return ar ? 'اتلغى الدخول بجوجل' : 'Google sign-in was cancelled';
  }
  if (code === 'auth/popup-blocked') {
    return ar ? 'المتصفح منع نافذة جوجل — اسمح بالنوافذ المنبثقة وجرّب تاني' : 'The browser blocked the Google window — allow pop-ups and try again';
  }
  if (code === 'auth/unauthorized-domain') {
    // The address is missing from Firebase → Authentication → Settings → Authorized domains.
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return ar
      ? `الدخول بجوجل لسه مش متفعّل على العنوان ده (${host}) — ادخل باسم المستخدم دلوقتي`
      : `Google sign-in is not enabled for this address (${host}) yet — use your username for now`;
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return ar ? 'الدخول بجوجل مش متاح من الصفحة دي — ادخل باسم المستخدم' : 'Google sign-in is not available on this page — use your username';
  }
  if (code === 'auth/network-request-failed') {
    return ar ? 'مفيش اتصال — جرّب تاني' : 'No connection — try again';
  }
  return ar ? 'ماقدرناش نكمّل الدخول بجوجل — جرّب تاني' : 'Could not finish Google sign-in — try again';
}
