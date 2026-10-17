import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dev-only static passthrough.
 * The build-less lab page (`/zellige-3d-lab.html`) lives at the repo root and
 * imports `/client/src/ornaments/core/*` + `/node_modules/three/*` through an
 * import map, so a plain `npx vite` can run the whole 3D engine with no extra
 * setup. Production builds are untouched (nothing is copied into `dist`).
 */
function rootLabPreview(rootDir) {
  return {
    name: 'blackx-root-lab-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        const allowed = /^\/(zellige-3d-lab\.html|client\/.+|node_modules\/three\/.+)$/;
        if (!allowed.test(url)) return next();
        const file = resolve(rootDir, '.' + url);
        if (!file.startsWith(rootDir)) return next();
        res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8'
          : file.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8');
        fs.createReadStream(file).on('error', () => next()).pipe(res);
      });
    }
  };
}

/**
 * APK builds (VITE_BUILD_TARGET=apk, see tools/apk/build-apk.sh) start from
 * src/main-apk.jsx instead of src/main.jsx, so the website shell, router,
 * Firebase SDK and website pages are not bundled into the app at all.
 */
function apkEntry() {
  const isApk = process.env.VITE_BUILD_TARGET === 'apk';
  return {
    name: 'blackx-apk-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!isApk) return html;
        // The APK bundles its fonts (src/mobile/fonts): drop the Google Fonts requests.
        return html
          .replace('/src/main.jsx', '/src/main-apk.jsx')
          .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, '')
          .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"\s+rel="stylesheet"\s*\/>/g, '');
      }
    }
  };
}

// Which deploy a crash report came from (client/src/errorReporter.js): the commit on Vercel.
const BX_BUILD = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.BX_BUILD_ID || '').slice(0, 12);

export default defineConfig({
  root: __dirname,
  define: {
    'import.meta.env.VITE_BX_BUILD': JSON.stringify(BX_BUILD)
  },
  plugins: [apkEntry(), rootLabPreview(resolve(__dirname, '..')), react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
});
