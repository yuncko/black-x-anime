import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import LegalDoc from '../legal/LegalDoc.jsx';
import { LEGAL_DOCS } from '../legal/legalContent.js';

/** Classic website: /privacy and /terms (the app interface shows the same text as profile pages). */
export default function LegalPage({ id }) {
  const { lang } = useI18n();
  const doc = LEGAL_DOCS[id];
  const other = id === 'policy' ? 'terms' : 'policy';
  useEffect(() => {
    if (doc) document.title = `${lang === 'ar' ? doc.titleAr : doc.titleEn} — Hearbor`;
  }, [doc, lang]);
  if (!doc) return null;
  return (
    <div className="bx-legal-page">
      <LegalDoc
        id={id}
        lang={lang === 'ar' ? 'ar' : 'en'}
        footer={
          <nav className="bx-legal-links" aria-label={lang === 'ar' ? 'صفحات قانونية' : 'Legal pages'}>
            <Link to={LEGAL_DOCS[other].path}>{lang === 'ar' ? LEGAL_DOCS[other].titleAr : LEGAL_DOCS[other].titleEn}</Link>
            <Link to="/">{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link>
          </nav>
        }
      />
    </div>
  );
}
