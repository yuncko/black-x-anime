import React from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';

/**
 * The classic player page's watch party, 2026-10-17.
 *
 * Until then this panel was a local imitation: messages were saved in this browser only, it
 * opened with two sample messages from people who do not exist («Kuro_Kun», «Mirai_Sama»),
 * and the «share the link with friends» room never reached anybody. The real party (rooms,
 * synced playback, chat between people) lives in the app interface of the website
 * (client/src/mobile/useWatchParty.js), so this card sends the visitor to the same episode
 * there; `?ui=app` also remembers the choice (client/src/webUi.js).
 */
export default function WatchPartyPanel() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const openInApp = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('party'); // the old local room codes never existed anywhere
    params.set('ui', 'app');
    window.location.assign(`${window.location.pathname}?${params.toString()}`);
  };
  return (
    <section className="watch-party-panel watch-party-panel--handoff" aria-label={ar ? 'حفلة المشاهدة' : 'Watch party'}>
      <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>{ar ? '🍿 حفلة المشاهدة' : '🍿 Watch party'}</h3>
      <p style={{ margin: '0 0 0.8rem', lineHeight: 1.7, opacity: 0.85 }}>
        {ar
          ? 'اتفرجوا مع بعض في نفس اللحظة: صاحب الغرفة بيشغّل ويوقف والكل بيمشي معاه، وفيه شات حقيقي بين اللي في الغرفة. الحفلة موجودة في واجهة Hearbor الجديدة — هتفتح الحلقة دي هناك وتدوس «حفلة مشاهدة».'
          : 'Watch together at the same moment: the host plays and pauses for everyone, with a real chat for the room. Parties live in the new Hearbor interface — this opens the same episode there; then press «Watch party».'}
      </p>
      <button type="button" className="btn btn--primary" onClick={openInApp}>
        {ar ? 'افتح الحلقة في الواجهة الجديدة' : 'Open this episode in the new interface'}
      </button>
    </section>
  );
}
