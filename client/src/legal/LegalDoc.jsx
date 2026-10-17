import React from 'react';
import { LEGAL_DOCS, LEGAL_UPDATED } from './legalContent.js';
import './legal.css';

/**
 * One legal document (privacy policy / terms), used by the app interface's profile pages and the
 * classic website's /privacy and /terms routes. `footer` is rendered under the text (links to the
 * other document, owned by the caller since each UI navigates differently).
 */
export default function LegalDoc({ id, lang = 'ar', showTitle = true, footer = null }) {
  const doc = LEGAL_DOCS[id];
  if (!doc) return null;
  const ar = lang === 'ar';
  return (
    <article className="bx-legal" dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'} data-legal={id}>
      {showTitle ? <h1 className="bx-legal-title">{ar ? doc.titleAr : doc.titleEn}</h1> : null}
      <p className="bx-legal-updated">
        {ar ? 'آخر تحديث: ' : 'Last updated: '}
        <time dateTime={LEGAL_UPDATED} dir="ltr">
          {LEGAL_UPDATED}
        </time>
      </p>
      <p className="bx-legal-intro">{ar ? doc.introAr : doc.introEn}</p>
      {doc.sections.map((sec) => {
        const paras = ar ? sec.ar : sec.en;
        return (
          <section key={sec.hEn} className="bx-legal-section">
            <h2>{ar ? sec.hAr : sec.hEn}</h2>
            {paras.length > 1 ? (
              <ul>
                {paras.map((p) => (
                  <li key={p.slice(0, 40)}>{p}</li>
                ))}
              </ul>
            ) : (
              <p>{paras[0]}</p>
            )}
          </section>
        );
      })}
      {footer ? <div className="bx-legal-footer">{footer}</div> : null}
    </article>
  );
}
