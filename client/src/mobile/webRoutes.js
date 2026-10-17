/**
 * Website links <-> app pages, for the phone website (the app interface served by the website).
 *
 * The phone website uses the same paths as the computer website, so a link copied on one opens
 * the same page on the other:
 *
 *   /                          home
 *   /trending[?q=]             search / anime catalogue  (computer: the anime page)
 *   /discover, /schedule       schedule                  (computer: the schedule page)
 *   /browse                    manga                     (computer: the manga page)
 *   /browse?manga=ID&server=S[&chapter=C]   a manga / one of its chapters
 *   /community                 community
 *   /profile[/page], /mylist   profile hub and its pages (/mylist = my list)
 *   /show/SLUG                 title page
 *   /watch/SLUG/EP[?party=C]   player (party: join that watch party)
 *   /rankings                  rankings (profile page, website only)
 *   /privacy, /terms           privacy policy / terms of use (profile pages 'policy' / 'terms';
 *                              /profile/privacy is the privacy & security settings page)
 *
 * Pure functions only (no window access) so they can be unit-tested in Node.
 */

export const TAB_PATHS = Object.freeze({
  home: '/',
  catalog: '/trending',
  schedule: '/discover',
  manga: '/browse',
  community: '/community',
  profile: '/profile'
});

/** Profile pages that can be opened straight from a link (the edit form and the developer
 *  panel need the app's own state, so their links open the profile root). */
export const LINKABLE_PROFILE_PAGES = Object.freeze([
  'library',
  'history',
  'manga',
  'offline',
  'snapshots',
  'vip',
  'titles',
  'settings',
  'splash',
  'privacy',
  'requests',
  'backup',
  'signin',
  // website only (2026-10-17)
  'rankings',
  'wrapped',
  'apkperks',
  // legal pages (2026-10-17)
  'policy',
  'terms'
]);

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Website slugs: letters, digits and a few separators (server slugs look like aw-…, a3rb-…, en-…). */
function cleanSlug(value) {
  const slug = safeDecode(String(value || '')).trim();
  return slug && slug.length <= 300 && !/[\s/?#]/.test(slug) ? slug : '';
}

/**
 * What a website URL asks for.
 * Returns one of:
 *   { kind: 'home' }
 *   { kind: 'tab', tab, query? }
 *   { kind: 'profile', page? }
 *   { kind: 'show', slug, source? }
 *   { kind: 'watch', slug, ep, source?, party? }
 *   { kind: 'manga', id, server?, chapter? }
 */
export function parseWebLocation(pathname = '/', search = '') {
  const parts = String(pathname || '/')
    .split('/')
    .filter(Boolean)
    .map(safeDecode);
  const params = new URLSearchParams(String(search || ''));
  const query = (params.get('q') || '').trim().slice(0, 120);
  const source = (params.get('source') || '').trim().toLowerCase();
  const head = (parts[0] || '').toLowerCase();

  if (!head) return { kind: 'home' };
  if (head === 'show' && parts[1]) {
    const slug = cleanSlug(parts[1]);
    return slug ? { kind: 'show', slug, ...(source ? { source } : {}) } : { kind: 'home' };
  }
  if (head === 'watch' && parts[1]) {
    const slug = cleanSlug(parts[1]);
    const ep = Number.parseInt(parts[2] || '1', 10);
    if (!slug) return { kind: 'home' };
    const party = String(params.get('party') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return {
      kind: 'watch',
      slug,
      ep: Number.isInteger(ep) && ep > 0 ? ep : 1,
      ...(source ? { source } : {}),
      ...(party.length >= 4 && party.length <= 16 ? { party } : {})
    };
  }
  if (head === 'rankings' || head === 'ranking') return { kind: 'profile', page: 'rankings' };
  if (head === 'wrapped') return { kind: 'profile', page: 'wrapped' };
  if (head === 'privacy' || head === 'privacy-policy') return { kind: 'profile', page: 'policy' };
  if (head === 'terms' || head === 'tos') return { kind: 'profile', page: 'terms' };
  if (head === 'trending' || head === 'catalog' || head === 'search') {
    return { kind: 'tab', tab: 'catalog', ...(query ? { query } : {}) };
  }
  if (head === 'discover' || head === 'schedule') return { kind: 'tab', tab: 'schedule' };
  if (head === 'browse' || head === 'manga') {
    const id = (params.get('manga') || '').trim();
    if (id && id.length <= 300) {
      const server = (params.get('server') || '').trim().toLowerCase();
      const chapter = (params.get('chapter') || '').trim();
      return { kind: 'manga', id, ...(server ? { server } : {}), ...(chapter ? { chapter } : {}) };
    }
    return { kind: 'tab', tab: 'manga', ...(query ? { query } : {}) };
  }
  if (head === 'community') return { kind: 'tab', tab: 'community' };
  if (head === 'mylist' || head === 'watchlist') return { kind: 'profile', page: 'library' };
  if (head === 'settings') return { kind: 'profile', page: 'settings' };
  if (head === 'profile' || head === 'account') {
    const page = String(parts[1] || '').toLowerCase();
    return LINKABLE_PROFILE_PAGES.includes(page) ? { kind: 'profile', page } : { kind: 'profile' };
  }
  return { kind: 'home' };
}

/**
 * The URL of what is on screen. `state` holds:
 *   tab, catalogQuery, profilePage (top of the profile stack, '' for its root),
 *   show { slug, source? } | null, episode (number) | null (player open, not minimised),
 *   manga { id, server? } | null, chapter (id) | null,
 *   party (room code) | '' — kept on the player's address so the address bar is the invite.
 */
export function webUrlFor(state = {}) {
  const enc = encodeURIComponent;
  const show = state.show && state.show.slug ? state.show : null;
  if (show) {
    const suffix = show.source === 'aniproject' ? '?source=aniproject' : '';
    if (state.episode) {
      const party = String(state.party || '').replace(/[^A-Za-z0-9]/g, '');
      const partySuffix = party ? `${suffix ? '&' : '?'}party=${enc(party)}` : '';
      return `/watch/${enc(show.slug)}/${enc(String(state.episode))}${suffix}${partySuffix}`;
    }
    return `/show/${enc(show.slug)}${suffix}`;
  }
  const manga = state.manga && state.manga.id ? state.manga : null;
  if (manga) {
    const params = new URLSearchParams();
    params.set('manga', String(manga.id));
    if (manga.server) params.set('server', String(manga.server));
    if (state.chapter) params.set('chapter', String(state.chapter));
    return `/browse?${params.toString()}`;
  }
  const tab = state.tab || 'home';
  if (tab === 'profile') {
    const page = String(state.profilePage || '');
    if (!page) return '/profile';
    if (page === 'library') return '/mylist';
    if (page === 'rankings') return '/rankings';
    if (page === 'policy') return '/privacy';
    if (page === 'terms') return '/terms';
    return `/profile/${enc(page)}`;
  }
  if (tab === 'catalog') {
    const q = String(state.catalogQuery || '').trim();
    return q ? `/trending?q=${enc(q)}` : '/trending';
  }
  return TAB_PATHS[tab] || '/';
}
