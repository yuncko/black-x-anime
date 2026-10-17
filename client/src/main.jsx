import React from 'react';
import { createRoot } from 'react-dom/client';
import { decideWebUi } from './webUi.js';
import { installErrorReporter, reportClientError } from './errorReporter.js';

// Anonymous crash reports → the developer panel's «الأخطاء» tab (errorReporter.js).
installErrorReporter({ endpoint: '/api/telemetry/error', platform: 'web', build: import.meta.env.VITE_BX_BUILD || '' });

// Unregister any injected proxy service worker (_service-worker.js on *.ai.studio)
// that intercepts <video> Range requests and breaks video streaming
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const cleanSw = () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const r of regs) {
          if (r.active?.scriptURL?.includes('_service-worker.js') || r.installing?.scriptURL?.includes('_service-worker.js')) {
            r.unregister().catch(() => {});
          }
        }
      })
      .catch(() => {});
  };
  cleanSw();
  window.addEventListener('load', () => setTimeout(cleanSw, 600));
}

const root = createRoot(document.getElementById('root'));

function showBootError(err) {
  if (err) reportClientError(err, { kind: 'error' });
  root.render(
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '1.5rem' }}>
      <div>
        <p style={{ margin: '0 0 1rem' }}>BLACK X — تعذّر تحميل الصفحة / The page could not load</p>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0.7rem 1.4rem', borderRadius: 12, border: 0, background: '#fff', color: '#000', fontWeight: 700 }}>
          إعادة المحاولة / Retry
        </button>
      </div>
    </div>
  );
}

// Phones get the app interface (the same code as the APK, without the website's pages and
// stylesheet); computers and tablets get the website. See webUi.js.
if (decideWebUi() === 'app') {
  window.__BLACKX_WEB_APP__ = true;
  import('./mobile/ApkRoot.jsx')
    .then(({ default: ApkRoot }) => {
      root.render(
        <React.StrictMode>
          <ApkRoot platform="web" />
        </React.StrictMode>
      );
    })
    .catch(showBootError);
} else {
  import('./SiteRoot.jsx')
    .then(({ default: SiteRoot }) => {
      root.render(
        <React.StrictMode>
          <SiteRoot />
        </React.StrictMode>
      );
    })
    .catch(showBootError);
}
