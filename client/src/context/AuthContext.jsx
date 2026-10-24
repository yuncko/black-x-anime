import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setStoredToken, getStoredToken } from '../api.js';
import {
  auth,
  signInWithGoogle,
  syncProfileToFirestore,
  fetchProfileFromFirestore,
  fetchDeveloperProfileFromFirestore,
  onProfileSnapshot,
  onDeveloperProfileSnapshot
} from '../firebase.js';
import { signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext(null);

const BX_CLOUD_SETTINGS =
  'https://firestore.googleapis.com/v1/projects/spry-oxide-1h7sp/databases/ai-studio-blackxanime-e47e1ba2-315f-4c3b-8557-71352813f36c/documents/settings';
const BX_CLOUD_KEY = 'AIzaSyD4yG_ljN1S8TfwC33E4Z0o499MYC71eUE';

function cleanCloudId(prefix, val) {
  const safe = String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_');
  return `${prefix}_${safe}`.slice(0, 120);
}

async function syncWebsiteUserToSharedCloud(u) {
  if (!u || (!u.email && !u.username)) return;
  try {
    const uKey = u.username ? cleanCloudId('user', u.username) : null;
    const eKey = u.email ? cleanCloudId('email', u.email) : null;

    // Preserve existing cloud favorites/progress if any
    let existing = null;
    if (eKey) {
      const r = await fetch(`${BX_CLOUD_SETTINGS}/${eKey}?key=${BX_CLOUD_KEY}`).catch(() => null);
      if (r && r.ok) {
        const d = await r.json();
        if (d?.fields?.json?.stringValue) existing = JSON.parse(d.fields.json.stringValue);
      }
    }

    const payload = {
      ...(existing || {}),
      id: String(u.id || u.firebaseUid || existing?.id || `u_${Date.now()}`),
      username: String(u.username || u.email?.split('@')[0] || 'user').toLowerCase(),
      email: String(u.email || existing?.email || '').toLowerCase(),
      displayName: u.displayName || existing?.displayName || u.username || 'Hearbor User',
      photoUrl: u.photoUrl || u.photoURL || existing?.photoUrl || '',
      avatarColor: u.avatarColor || existing?.avatarColor || '#ffffff',
      bio: u.bio !== undefined ? u.bio : existing?.bio || '',
      role: u.role || existing?.role || 'user',
      vipStatus: u.vipStatus || existing?.vipStatus || 'VIP Monarch',
      isGoogleAccount: true,
      favorites: Array.isArray(existing?.favorites) ? existing.favorites : [],
      progress: Array.isArray(existing?.progress) ? existing.progress : [],
      updatedAt: new Date().toISOString()
    };

    const docBody = {
      fields: {
        json: { stringValue: JSON.stringify(payload) },
        username: { stringValue: payload.username },
        email: { stringValue: payload.email },
        updatedAt: { stringValue: payload.updatedAt }
      }
    };

    if (uKey) {
      await fetch(`${BX_CLOUD_SETTINGS}/${uKey}?key=${BX_CLOUD_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docBody)
      }).catch(() => {});
    }
    if (eKey) {
      await fetch(`${BX_CLOUD_SETTINGS}/${eKey}?key=${BX_CLOUD_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docBody)
      }).catch(() => {});
    }
  } catch (_) {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fbUser, setFbUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      setStats(data.stats);
      return data.user;
    } catch {
      setUser(null);
      setStats(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync Firebase Auth with app session on any device boot + real-time Firestore profile listener
  useEffect(() => {
    let unsubSnapshot = () => {};

    const unsubAuth = onAuthStateChanged(auth, async (currentFbUser) => {
      setFbUser(currentFbUser);
      unsubSnapshot();

      if (currentFbUser) {
        try {
          // Check Firestore profile for this user
          const firestoreProfile = await fetchProfileFromFirestore(currentFbUser.uid);
          const devProfile = currentFbUser.email?.toLowerCase() === 'mz0970mmz@gmail.com'
            ? await fetchDeveloperProfileFromFirestore()
            : null;

          const effectiveName = firestoreProfile?.displayName || devProfile?.displayName || currentFbUser.displayName;
          const effectivePhoto = firestoreProfile?.photoUrl || firestoreProfile?.photoURL || devProfile?.photoUrl || currentFbUser.photoURL;

          const idToken = await currentFbUser.getIdToken();
          const data = await api.post('/api/auth/google', {
            idToken,
            uid: currentFbUser.uid,
            email: currentFbUser.email,
            displayName: effectiveName,
            photoURL: effectivePhoto,
            username: firestoreProfile?.username,
            bio: firestoreProfile?.bio,
            avatarColor: firestoreProfile?.avatarColor
          });

          if (data.token) setStoredToken(data.token);
          setUser({
            ...data.user,
            photoURL: effectivePhoto || data.user.photoUrl,
            photoUrl: effectivePhoto || data.user.photoUrl,
            displayName: effectiveName || data.user.displayName,
            firebaseUid: currentFbUser.uid
          });

          // Real-time listener: whenever username or profile photo is updated on ANY device, instantly update state everywhere
          unsubSnapshot = onProfileSnapshot(currentFbUser.uid, (data) => {
            if (!data) return;
            setUser((prev) => {
              if (!prev) return prev;
              const newPhoto = data.photoUrl || data.photoURL || prev.photoUrl;
              return {
                ...prev,
                displayName: data.displayName || prev.displayName,
                username: data.username || prev.username,
                photoUrl: newPhoto,
                photoURL: newPhoto,
                avatarColor: data.avatarColor || prev.avatarColor,
                bio: data.bio !== undefined ? data.bio : prev.bio,
                badges: data.badges || prev.badges
              };
            });
          });
        } catch (err) {
          console.warn('Auth state cross-device sync note:', err.message);
        }
      }
    });

    return () => {
      unsubAuth();
      unsubSnapshot();
    };
  }, []);

  const applyRealtimeProfileUpdate = useCallback((data) => {
    if (!data) return;
    setUser((prev) => {
      if (!prev) return prev;
      const newPhoto = data.photoUrl || data.photoURL || prev.photoUrl;
      return {
        ...prev,
        displayName: data.displayName || prev.displayName,
        username: data.username || prev.username,
        photoUrl: newPhoto,
        photoURL: newPhoto,
        avatarColor: data.avatarColor || prev.avatarColor,
        bio: data.bio !== undefined ? data.bio : prev.bio,
        badges: data.badges || prev.badges
      };
    });
  }, []);

  // Additional listener for developer profile when not using Google Auth UID
  useEffect(() => {
    if (!user) return;
    const isDev = user.role === 'developer' || user.email?.toLowerCase() === 'mz0970mmz@gmail.com' || user.isDeveloper;
    if (!isDev) return;

    const unsub = onDeveloperProfileSnapshot((data) => {
      if (!data) return;
      applyRealtimeProfileUpdate(data);
    });
    return () => unsub();
  }, [user?.role, user?.email, applyRealtimeProfileUpdate]);

  useEffect(() => { refresh(); }, [refresh]);

  // Automatically sync active Website user to Shared Cloud Firestore so Mobile APK stays 100% in sync
  useEffect(() => {
    if (user && (user.email || user.username)) {
      syncWebsiteUserToSharedCloud(user);
    }
  }, [user?.email, user?.username, user?.displayName, user?.photoUrl]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/api/auth/login', { username, password });
    if (data.token) setStoredToken(data.token);
    setUser(data.user);
    await refresh();
    return data.user;
  }, [refresh]);

  const loginAsDeveloper = useCallback(async () => {
    const firebaseUser = await signInWithGoogle();
    if (firebaseUser.email?.toLowerCase() !== 'mz0970mmz@gmail.com') {
      await fbSignOut(auth).catch(() => {});
      setStoredToken(null);
      throw new Error('Sign in with the authorized developer Google account.');
    }
    const idToken = await firebaseUser.getIdToken();
    const data = await api.post('/api/auth/google', {
      idToken,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL || firebaseUser.photoUrl
    });
    if (data.token) setStoredToken(data.token);
    setUser({ ...data.user, firebaseUid: firebaseUser.uid });
    await refresh();
    return data.user;
  }, [refresh]);

  const loginWithGoogle = useCallback(async () => {
    const firebaseUser = await signInWithGoogle();
    const idToken = await firebaseUser.getIdToken();
    const data = await api.post('/api/auth/google', {
      idToken,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL || firebaseUser.photoUrl
    });
    if (data.token) setStoredToken(data.token);
    const enrichedUser = {
      ...data.user,
      photoURL: data.user.photoUrl || firebaseUser.photoURL || firebaseUser.photoUrl,
      photoUrl: data.user.photoUrl || firebaseUser.photoURL || firebaseUser.photoUrl,
      displayName: data.user.displayName || firebaseUser.displayName,
      firebaseUid: firebaseUser.uid
    };
    setUser(enrichedUser);
    await refresh();
    return enrichedUser;
  }, [refresh]);

  const register = useCallback(async (payload) => {
    const data = await api.post('/api/auth/register', payload);
    if (data.token) setStoredToken(data.token);
    setUser(data.user);
    await refresh();
    return data.user;
  }, [refresh]);

  const updateProfile = useCallback(async (payload) => {
    // 1. Update server session
    const data = await api.put('/api/auth/profile', payload);
    if (data.token) setStoredToken(data.token);

    // 2. Persist to Firestore across all devices
    const uid = auth.currentUser?.uid || (data.user.role === 'developer' ? 'developer' : null);
    if (uid) {
      await syncProfileToFirestore(uid, {
        ...payload,
        email: auth.currentUser?.email || data.user.email,
        role: data.user.role,
        badges: data.user.badges
      }).catch((e) => console.warn('Firestore profile sync note:', e));
    }

    const updatedUser = {
      ...data.user,
      photoUrl: payload.photoUrl || data.user.photoUrl,
      photoURL: payload.photoUrl || data.user.photoUrl,
      displayName: payload.displayName || data.user.displayName
    };
    setUser(updatedUser);
    await refresh();
    return updatedUser;
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fbSignOut(auth);
    } catch {
      /* ignore */
    }
    setStoredToken(null);
    await api.post('/api/auth/logout', {}).catch(() => {});
    setUser(null);
    setStats(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, fbUser, stats, loading, login, loginWithGoogle, loginAsDeveloper, register, updateProfile, applyRealtimeProfileUpdate, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
