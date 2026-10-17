import { Router } from 'express';
import { db, getAnimeRow, parseAnimeRow } from '../db.js';
import { optionalAuth, sessionClaimsFromRequest, verifyFirebaseGoogleIdToken } from '../auth.js';
import { verifyApkToken } from '../services/apkAccounts.js';
import { castRankingVote, loadRankingVotes, statsFor, voterKey } from '../services/rankingVotes.js';
import {
  fetchTrending, fetchTopRanked, fetchSeason, fetchSchedule, fetchAnime, fetchSearch, currentSeasonInfo
} from '../anilist.js';

const router = Router();

router.get('/rankings', async (req, res) => {
  try {
    const list = await fetchTopRanked(15);
    // The ranking is AniList's (its average score, 0–100). BLACK X members' own votes are added
    // as they are: their real count and average, nothing when nobody voted yet. No invented
    // vote totals or star breakdowns. Votes: settings/ranking_votes (services/rankingVotes.js);
    // when Firestore cannot be read the list still comes, without member votes.
    // The same answer for everyone (no req.user here): cached on the CDN (publicCacheRoutes).
    let votesDoc = null;
    try {
      votesDoc = await loadRankingVotes();
    } catch (err) {
      console.warn('[anime/rankings] votes unavailable:', err.message);
    }
    const rankings = list.map((item, index) => {
      const stats = votesDoc ? statsFor(votesDoc, item.id) : { votes: 0, avgScore: null };
      const votes = Number(stats.votes) || 0;
      return {
        ...item,
        rank: index + 1,
        scoreTen: Number(item.score) > 0 ? Number((item.score / 10).toFixed(1)) : null,
        communityScore: votes > 0 && stats.avgScore ? Number((stats.avgScore * 10).toFixed(1)) : null,
        votesCount: votes
      };
    });

    res.json({ anime: rankings });
  } catch (err) {
    console.error('[anime/rankings]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not reach rankings', anime: [] });
  }
});

/**
 * Who is voting: a website account (cookie / bearer JWT), an app session (APK / app interface
 * token) or a Google sign-in (Firebase ID token). Returns `u:<username>` / `e:<email>` or ''.
 */
async function rankingVoterIdentity(req) {
  if (req.user?.username) return `u:${String(req.user.username).trim().toLowerCase()}`;
  if (req.user?.email) return `e:${String(req.user.email).trim().toLowerCase()}`;
  const session = sessionClaimsFromRequest(req); // valid website token, user unknown to this instance
  if (session?.username) return `u:${String(session.username).trim().toLowerCase()}`;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return '';
  const claims = verifyApkToken(token);
  if (claims) {
    if (claims.u) return `u:${String(claims.u).trim().toLowerCase()}`;
    if (claims.e) return `e:${String(claims.e).trim().toLowerCase()}`;
    return '';
  }
  if (token.length > 100) {
    try {
      const identity = await verifyFirebaseGoogleIdToken(token);
      if (identity?.email) return `e:${String(identity.email).trim().toLowerCase()}`;
    } catch {
      /* certificates unreachable: treated as signed out */
    }
  }
  return '';
}

router.post('/rankings/rate', optionalAuth, async (req, res) => {
  try {
    const { animeId, score } = req.body || {};
    const id = Number(animeId);
    if (!Number.isInteger(id) || id <= 0 || typeof score !== 'number' || score < 1 || score > 10) {
      return res.status(400).json({ error: 'invalid_rating', message: 'Score must be between 1 and 10' });
    }
    // One vote per account (up to 2026-10-17 a vote without an account was a new row each time).
    const identity = await rankingVoterIdentity(req);
    if (!identity) return res.status(401).json({ error: 'auth_required', message: 'Sign in to rate' });
    const top = await fetchTopRanked(15).catch(() => []);
    if (!top.some((item) => Number(item.id) === id)) {
      return res.status(400).json({ error: 'not_ranked', message: 'Only titles on the rankings can be rated' });
    }
    const stats = await castRankingVote(id, voterKey(identity), score, { keepIds: top.map((item) => item.id) });
    res.json({ ok: true, stats });
  } catch (err) {
    console.error('[anime/rankings/rate]', err.message);
    if (err.message === 'title_full' || err.message === 'too_many_titles' || err.message === 'votes_full') {
      return res.status(409).json({ error: err.message, message: 'Voting is full for this title' });
    }
    res.status(503).json({ error: 'votes_unavailable', message: 'Could not save the vote, try again later' });
  }
});

router.get('/trending', async (req, res) => {
  try {
    res.json({ anime: await fetchTrending() });
  } catch (err) {
    console.error('[anime/trending]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not reach AniList', anime: [] });
  }
});

router.get('/season', async (req, res) => {
  try {
    const { season, year } = currentSeasonInfo();
    res.json({ season, year, anime: await fetchSeason(season, year) });
  } catch (err) {
    console.error('[anime/season]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not reach AniList', anime: [] });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    // The next 7 days from now: each weekly show appears once, on its weekday.
    // (Starting at 00:00 UTC dropped the shows that had already aired today,
    // because their next episode lands just after a window ending 7 days later.)
    const now = Math.floor(Date.now() / 1000);
    const weekStart = now;
    const weekEnd = now + 7 * 86400;
    const items = await fetchSchedule(weekStart, weekEnd);
    const days = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }; // JS getUTCDay: 0=Sun
    for (const item of items) {
      const day = new Date(item.airingAt * 1000).getUTCDay();
      days[day].push(item);
    }
    res.json({ days, weekStart, weekEnd });
  } catch (err) {
    console.error('[anime/schedule]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not reach AniList', days: {} });
  }
});

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ anime: [] });
  try {
    res.json({ anime: await fetchSearch(q) });
  } catch (err) {
    console.error('[anime/search]', err.message);
    res.status(502).json({ error: 'upstream', message: 'Could not reach AniList', anime: [] });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id', message: 'Invalid anime id' });
  try {
    let anime = parseAnimeRow(getAnimeRow(id));
    if (!anime) anime = await fetchAnime(id);
    if (!anime) return res.status(404).json({ error: 'not_found', message: 'Anime not found' });

    const counts = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN status = 'wrong' THEN 1 ELSE 0 END) AS wrong
      FROM predictions WHERE anime_id = ?
    `).get(id);

    let myEntry = null;
    if (req.user) {
      const row = db.prepare('SELECT * FROM watchlist WHERE user_id = ? AND anime_id = ?').get(req.user.id, id);
      if (row) {
        myEntry = {
          status: row.status,
          episodesWatched: row.episodes_watched,
          score: row.score
        };
      }
    }
    res.json({ anime, predictionStats: counts, myEntry });
  } catch (err) {
    console.error('[anime/:id]', err.message);
    const row = parseAnimeRow(getAnimeRow(id));
    if (row) return res.json({ anime: row, predictionStats: null, myEntry: null });
    res.status(502).json({ error: 'upstream', message: 'Could not reach AniList' });
  }
});

export default router;
