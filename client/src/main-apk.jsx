/**
 * Entry point of the APK build (VITE_BUILD_TARGET=apk swaps it in for main.jsx,
 * see client/vite.config.js). The APK only needs the mobile UI: no website shell,
 * router, Firebase SDK or website stylesheet, so the app starts with far less
 * JavaScript to parse.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import ApkRoot from './mobile/ApkRoot.jsx';
import { BX_APK_VERSION, bxApiUrl } from './mobile/bxServers.js';
import { installErrorReporter } from './errorReporter.js';

// Anonymous crash reports from the app → the developer panel's «الأخطاء» tab (errorReporter.js).
installErrorReporter({ endpoint: bxApiUrl('/api/telemetry/error'), platform: 'apk', build: `v${BX_APK_VERSION}` });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApkRoot />
  </React.StrictMode>
);
