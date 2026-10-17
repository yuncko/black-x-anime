import { imgFallback } from '../hooks/hooks.js';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';

export function Modal({ title, sub, onClose, children, wide = false }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal glass glass--strong ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="modal__close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        <h2 className="modal__title">{title}</h2>
        {sub && <p className="modal__sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function AuthModal({ initialMode = 'login', onClose }) {
  const { t, lang } = useI18n();
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      const u = await loginWithGoogle();
      pushToast(t('auth.loginSuccess', { name: u.displayName || u.username }), 'success');
      onClose();
    } catch (err) {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (err?.code === 'auth/unauthorized-domain') {
        setError(lang === 'ar'
          ? `نطاق الموقع ${host} غير مضاف في Firebase. أضِفه من Authentication ثم Settings ثم Authorized domains.`
          : `This domain (${host}) is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.`);
      } else if (err?.code === 'auth/popup-blocked') {
        setError(lang === 'ar'
          ? 'المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مرة أخرى.'
          : 'Your browser blocked the Google popup. Allow pop-ups for this site and try again.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError(lang === 'ar'
          ? 'تسجيل Google غير مفعّل في Firebase Authentication.'
          : 'Google sign-in is not enabled in Firebase Authentication.');
      } else {
        setError(err?.message || t('auth.errGeneric'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const u = await login(form.username.trim(), form.password);
        pushToast(t('auth.loginSuccess', { name: u.displayName || u.username }), 'success');
      } else {
        const storedRef = localStorage.getItem('blackx_referral_code') || '';
        await register({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          displayName: form.displayName.trim() || form.username.trim(),
          referralCode: storedRef
        });
        if (storedRef) {
          localStorage.removeItem('blackx_referral_code');
        }
        pushToast(t('auth.registerSuccess'), 'success');
      }
      onClose();
    } catch (err) {
      setError(err.message || t('auth.errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
      sub={t('auth.subtitle')}
      onClose={onClose}
    >
      <button
        type="button"
        onClick={handleGoogle}
        className="btn btn--block"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.65rem',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          color: '#fff',
          fontWeight: 600,
          marginBottom: '0.65rem',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'background 0.2s, border-color 0.2s'
        }}
        disabled={busy}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        {t('auth.googleSignIn')}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', margin: '0.85rem 0 1.1rem', opacity: 0.6, fontSize: '0.82rem' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ padding: '0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('auth.or')}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="auth-username">
            {mode === 'login' ? (lang === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email') : t('auth.username')}
          </label>
          <input
            id="auth-username"
            className="input"
            value={form.username}
            onChange={set('username')}
            placeholder={mode === 'login' ? (lang === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or email') : ''}
            required
            autoFocus
          />
        </div>
        {mode === 'register' && (
          <>
            <div className="field">
              <label className="label" htmlFor="auth-email">{t('auth.email')}</label>
              <input id="auth-email" type="email" className="input" value={form.email} onChange={set('email')} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="auth-display">{t('auth.displayName')}</label>
              <input id="auth-display" className="input" value={form.displayName} onChange={set('displayName')} placeholder={t('common.optional') || ''} />
            </div>
          </>
        )}
        <div className="field">
          <label className="label" htmlFor="auth-password">{t('auth.password')}</label>
          <input id="auth-password" type="password" className="input" value={form.password} onChange={set('password')} required minLength={6} />
        </div>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '0.88rem', fontWeight: 600, marginBlockEnd: '1rem' }}>{error}</div>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          <span className="btn__shine" />
          {mode === 'login' ? t('auth.login') : t('auth.register')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '1.15rem', color: 'var(--ink-dim)', fontSize: '0.92rem' }}>
          {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <button
            type="button"
            style={{ background: 'none', border: 0, color: 'var(--cyan)', fontWeight: 700, cursor: 'pointer' }}
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t('auth.register') : t('auth.login')}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: '0.85rem', marginBottom: 0, color: 'var(--ink-dim)', fontSize: '0.82rem', lineHeight: 1.6 }}>
          {lang === 'ar' ? 'لما تدخل أو تعمل حساب تبقى موافق على ' : 'By signing in or creating an account you agree to the '}
          <a href="/terms" target="_blank" rel="noopener" style={{ color: '#ffffff', textDecoration: 'underline' }}>
            {lang === 'ar' ? 'شروط الاستخدام' : 'Terms of use'}
          </a>
          {lang === 'ar' ? ' و' : ' and the '}
          <a href="/privacy" target="_blank" rel="noopener" style={{ color: '#ffffff', textDecoration: 'underline' }}>
            {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy policy'}
          </a>
          .
        </p>
      </form>
    </Modal>
  );
}

/** Global show search used in the navbar. */
export function ShowSearch({ variant = 'nav' }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const run = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.get(`/api/stream/search?q=${encodeURIComponent(term)}`);
      setResults(data.items || []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChange = (e) => {
    const term = e.target.value;
    setQ(term);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(term), 350);
  };

  return (
    <div className={variant === 'nav' ? 'nav-search' : 'search-inline'} ref={boxRef}>
      <span className="search-inline__icon">⌕</span>
      <input
        className="input"
        value={q}
        onChange={onChange}
        placeholder={t('nav.search')}
        aria-label={t('common.search')}
        lang={lang}
      />
      {open && (results.length > 0 || loading) && (
        <div className="nav-search__results">
          {loading && <div className="anime-picker__option">{t('common.loading')}</div>}
          {results.map((s) => (
            <button
              type="button"
              key={`${s.kind}-${s.slug}`}
              className="anime-picker__option"
              onClick={() => {
                setOpen(false);
                setQ('');
                navigate(`/show/${s.slug}`);
              }}
            >
              {s.poster ? (
                <img onError={imgFallback} src={s.poster} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div style={{ width: 38, height: 52, borderRadius: 6, background: '#1b2138' }} />
              )}
              <span>{(lang === 'ar' ? s.titleAr : s.titleEn) || s.titleEn || s.slug}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
