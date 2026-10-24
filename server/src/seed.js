import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { fetchShow, fetchLatest } from './witanime.js';
import { fetchTrending, currentSeasonInfo, fetchSeason } from './anilist.js';

/*
 * Hearbor seed — streaming platform edition
 * Users + favorites (watchlist) + continue-watching progress.
 * Show metadata is pulled live from witanime.site; discovery data from AniList.
 */

const USERS = [
  {
    username: 'kuro', email: 'kuro@blackx.app', password: 'blackx2026',
    display_name: 'Kuro', avatar_color: '#22d3ee', role: 'admin',
    bio: 'Founder of Hearbor. Binge-watcher & subtitle perfectionist. | مؤسس Hearbor. مدمن مشاهدة ومثالي في الترجمة.'
  },
  {
    username: 'zero', email: 'zero@blackx.app', password: 'blackx2026',
    display_name: 'Zero', avatar_color: '#f472b6', role: 'user',
    bio: 'Shonen nights, school mornings. | ليل الشونن، وصباحات المدرسة.'
  },
  {
    username: 'mirai', email: 'mirai@blackx.app', password: 'blackx2026',
    display_name: 'Mirai', avatar_color: '#a3e635', role: 'user',
    bio: 'I watch 12 shows at once and finish none. | أشاهد 12 مسلساً دفعة واحدة وأنهي واحداً.'
  },
  {
    username: 'nocturne', email: 'nocturne@blackx.app', password: 'blackx2026',
    display_name: 'Nocturne', avatar_color: '#8b5cf6', role: 'user',
    bio: 'Dark psychological anime only. | أنمي نفسي مظلم فقط.'
  },
  {
    username: 'raven', email: 'raven@blackx.app', password: 'blackx2026',
    display_name: 'Raven', avatar_color: '#fb923c', role: 'user',
    bio: 'Opening theme collector. | جامع أغاني المقدمات.'
  },
  {
    username: 'yuki', email: 'yuki@blackx.app', password: 'blackx2026',
    display_name: 'Yuki', avatar_color: '#60a5fa', role: 'user',
    bio: 'Slice of life is a lifestyle. | أنمي الحياة اليومية هو أسلوب حياة.'
  }
];

/* Fallbacks if witanime is unreachable during seed (slug-only rows still work at runtime) */
const FALLBACK_SHOWS = {
  'one-piece': { titleEn: 'One Piece', titleAr: 'ون بيس', poster: null },
  'black-clover-2nd-season': { titleEn: 'Black Clover 2nd Season', titleAr: 'البرسيم الأسود 2', poster: null },
  'bleach-sennen-kessen-hen-kashin-tan': { titleEn: 'Bleach: Thousand-Year Blood War', titleAr: 'بليتش: حرب الدماء', poster: null },
  'steel-ball-run-jojo-no-kimyou-na-bouken': { titleEn: "JoJo's Bizarre Adventure: Steel Ball Run", titleAr: 'مغامرات جوجو الغريبة', poster: null },
  'tensei-shitara-ken-deshita-ii': { titleEn: 'Reincarnated as a Sword 2', titleAr: 'تناسخت كسيف 2', poster: null },
  'tokyo-revengers-santen-sensou-hen': { titleEn: 'Tokyo Revengers', titleAr: 'طوكيو المنتقمون', poster: null }
};

const FAVORITES = [
  ['kuro', 'one-piece', 1180],
  ['kuro', 'black-clover-2nd-season', 1],
  ['zero', 'bleach-sennen-kessen-hen-kashin-tan', 8],
  ['zero', 'steel-ball-run-jojo-no-kimyou-na-bouken', 3],
  ['mirai', 'one-piece', 1180],
  ['mirai', 'tensei-shitara-ken-deshita-ii', 2],
  ['nocturne', 'bleach-sennen-kessen-hen-kashin-tan', 8],
  ['nocturne', 'tokyo-revengers-santen-sensou-hen', 1],
  ['raven', 'black-clover-2nd-season', 1],
  ['yuki', 'tokyo-revengers-santen-sensou-hen', 1],
  ['yuki', 'tensei-shitara-ken-deshita-ii', 2]
];

const PROGRESS = [
  ['kuro', 'one-piece', 1176, 920, 1420, 0],
  ['kuro', 'black-clover-2nd-season', 1, 310, 1420, 0],
  ['zero', 'bleach-sennen-kessen-hen-kashin-tan', 7, 1280, 1400, 0],
  ['zero', 'bleach-sennen-kessen-hen-kashin-tan', 8, 210, 1400, 0],
  ['mirai', 'one-piece', 1178, 640, 1420, 0],
  ['mirai', 'tensei-shitara-ken-deshita-ii', 1, 1385, 1400, 1],
  ['nocturne', 'tokyo-revengers-santen-sensou-hen', 1, 480, 1420, 0],
  ['raven', 'black-clover-2nd-season', 1, 128, 1420, 0],
  ['yuki', 'tensei-shitara-ken-deshita-ii', 2, 1330, 1400, 0]
];

export async function main({ quick = false } = {}) {
  console.log(`🌱 Seeding Hearbor (streaming${quick ? ', quick' : ''}) …`);

  // 1) warm discovery caches (AniList) — best effort (skipped in quick mode)
  if (!quick) {
    try {
      await fetchTrending();
      const { season, year } = currentSeasonInfo();
      await fetchSeason(season, year);
      console.log('🎬 AniList discovery cache warmed');
    } catch (err) {
      console.warn('⚠ AniList unavailable:', err.message);
    }
  }

  // 2) resolve show metadata from witanime — best effort (fallback rows in quick mode)
  const slugs = [...new Set([...FAVORITES.map((f) => f[1]), ...PROGRESS.map((p) => p[1])])];
  const shows = new Map();
  for (const slug of slugs) {
    if (!quick) {
      try {
        const s = await fetchShow(slug);
        if (s) {
          shows.set(slug, {
            titleEn: s.titleEn,
            titleAr: FALLBACK_SHOWS[slug]?.titleAr || null,
            poster: s.poster,
            banner: s.banner,
            episodes: s.episodeCount || null
          });
          console.log(`  ✓ ${slug} (${s.episodeCount} eps)`);
        }
      } catch (err) {
        console.warn(`  ⚠ ${slug}: ${err.message}`);
      }
    }
    if (!shows.has(slug)) {
      shows.set(slug, { ...FALLBACK_SHOWS[slug], banner: null, episodes: null });
    }
  }

  if (!quick) {
    try {
      const latest = await fetchLatest();
      console.log(`📺 ${latest.length} latest episodes cached`);
    } catch { /* offline */ }
  }

  // 3) wipe library + users (idempotent re-seed)
  db.exec('DELETE FROM progress; DELETE FROM favorites; DELETE FROM users;');

  // 4) users
  const passwordHash = bcrypt.hashSync('blackx2026', 10);
  const userId = {};
  for (const u of USERS) {
    const info = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, avatar_color, bio, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(u.username, u.email, passwordHash, u.display_name, u.avatar_color, u.bio, u.role);
    userId[u.username] = info.lastInsertRowid;
  }
  console.log(`👤 ${USERS.length} users (password: blackx2026)`);

  // 5) favorites
  const insFav = db.prepare(`
    INSERT INTO favorites (user_id, slug, title_en, title_ar, poster, banner, episodes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, slug) DO UPDATE SET title_en = excluded.title_en
  `);
  for (const [u, slug] of FAVORITES) {
    const s = shows.get(slug) || {};
    insFav.run(userId[u], slug, s.titleEn || slug, s.titleAr || null, s.poster || null, s.banner || null, s.episodes || null);
  }
  console.log(`❤  ${FAVORITES.length} favorites`);

  // 6) progress
  const insProg = db.prepare(`
    INSERT INTO progress (user_id, slug, episode, position, duration, completed, title_en, title_ar, poster)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, slug, episode) DO UPDATE SET position = excluded.position
  `);
  for (const [u, slug, ep, pos, dur, done] of PROGRESS) {
    const s = shows.get(slug) || {};
    insProg.run(userId[u], slug, ep, pos, dur, done, s.titleEn || slug, s.titleAr || null, s.poster || null);
  }
  console.log(`⏱  ${PROGRESS.length} progress entries`);

  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM favorites) f, (SELECT COUNT(*) FROM progress) p, (SELECT COUNT(*) FROM stream_cache) s, (SELECT COUNT(*) FROM api_cache) a').get();
  console.log(`\n✅ Seed complete — ${counts.u} users | ${counts.f} favorites | ${counts.p} progress | ${counts.s} cached streams`);
  console.log('   Demo login → username: kuro  |  password: blackx2026\n');
}

/**
 * Background enrichment: pull live titles/posters/episode counts into
 * favorites+progress and warm discovery caches. Safe to run any time —
 * never touches users.
 */
export async function enrichLibrary() {
  const rows = db.prepare('SELECT DISTINCT slug FROM favorites UNION SELECT DISTINCT slug FROM progress').all();
  for (const { slug } of rows) {
    try {
      const s = await fetchShow(slug);
      if (!s) continue;
      db.prepare('UPDATE favorites SET title_en = ?, poster = ?, banner = ?, episodes = ? WHERE slug = ?')
        .run(s.titleEn || slug, s.poster || null, s.banner || null, s.episodeCount || null, slug);
      db.prepare('UPDATE progress SET title_en = ?, poster = ? WHERE slug = ?')
        .run(s.titleEn || slug, s.poster || null, slug);
    } catch { /* rate limited or offline — try later */ }
  }
  try { await fetchLatest(); } catch { /* noop */ }
  try {
    await fetchTrending();
    const { season, year } = currentSeasonInfo();
    await fetchSeason(season, year);
  } catch { /* noop */ }
}

// CLI: `node server/src/seed.js [--quick]`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const quick = process.argv.includes('--quick');
  main({ quick }).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
