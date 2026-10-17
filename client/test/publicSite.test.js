// Every absolute link to the website uses one address (shared/publicSite.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLIC_SITE_ORIGIN, PUBLIC_SITE_HOST } from '../../shared/publicSite.js';
import { APK_RELEASE } from '../../shared/apkRelease.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

test('robots.txt, sitemap.xml and the Open Graph tags name the current address', () => {
  assert.equal(PUBLIC_SITE_ORIGIN, `https://${PUBLIC_SITE_HOST}`);
  for (const file of ['client/public/robots.txt', 'client/public/sitemap.xml', 'client/index.html']) {
    const text = read(file);
    const origins = [...text.matchAll(/https:\/\/black-x-anime\.[a-z.]+/g)].map((m) => m[0]);
    assert.ok(origins.length > 0, `${file} has absolute links`);
    assert.deepEqual([...new Set(origins)], [PUBLIC_SITE_ORIGIN], `${file} uses only ${PUBLIC_SITE_ORIGIN}`);
  }
});

test('the APK is built for, and downloaded from, the same address', () => {
  assert.ok(APK_RELEASE.url.startsWith(`${PUBLIC_SITE_ORIGIN}/`), APK_RELEASE.url);
  assert.match(read('tools/apk/build-apk.sh'), new RegExp(`BX_API_BASE:-${PUBLIC_SITE_ORIGIN.replace(/\./g, '\\.')}\\}`));
});
