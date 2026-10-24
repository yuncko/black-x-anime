import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { translations } from './translations.js';

const I18nContext = createContext(null);

const STORAGE_KEY = 'blackx_lang';
const LANGS = ['en', 'ar'];

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (LANGS.includes(saved)) return saved;
    if (typeof navigator !== 'undefined' && (navigator.language || '').startsWith('ar')) return 'ar';
    return 'en';
  });

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = lang === 'ar' ? 'Hearbor — أنمي ومانجا' : 'Hearbor — Anime & Manga';
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const formatDate = useCallback(
    (iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => {
      if (!iso) return '—';
      const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', opts).format(d);
    },
    [lang]
  );

  const timeAgo = useCallback(
    (iso) => {
      if (!iso) return '';
      const then = typeof iso === 'number' ? iso * 1000 : new Date(iso + (String(iso).includes('T') ? '' : 'Z')).getTime();
      const diffSec = Math.round((then - Date.now()) / 1000);
      const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { numeric: 'auto' });
      const abs = Math.abs(diffSec);
      if (abs < 60) return rtf.format(diffSec, 'second');
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
      if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
      if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
      return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
    },
    [lang]
  );

  const formatNumber = useCallback(
    (n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(n ?? 0),
    [lang]
  );

  /** Localized anime title helper — Arabic map first, then English, then romaji. */
  const animeTitle = useCallback(
    (anime) => {
      if (!anime) return '';
      if (lang === 'ar') return anime.titleArabic || anime.titleEnglish || anime.titleRomaji || '';
      return anime.titleEnglish || anime.titleRomaji || '';
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, formatDate, timeAgo, formatNumber, animeTitle, dir: lang === 'ar' ? 'rtl' : 'ltr' }),
    [lang, setLang, t, formatDate, timeAgo, formatNumber, animeTitle]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
