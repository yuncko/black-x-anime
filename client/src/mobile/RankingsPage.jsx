import React, { useEffect, useState } from 'react';
import BxIcon from './BxIcon.jsx';
import { coverForMode } from './dataSaver.js';

const STATUS_AR = { RELEASING: 'مستمر', FINISHED: 'مكتمل', NOT_YET_RELEASED: 'لسه ماعرضش', HIATUS: 'متوقف مؤقتًا', CANCELLED: 'اتلغى' };
const STATUS_EN = { RELEASING: 'Airing', FINISHED: 'Finished', NOT_YET_RELEASED: 'Not yet aired', HIATUS: 'On hiatus', CANCELLED: 'Cancelled' };

/**
 * «الترتيب» in the app interface (website only, 2026-10-17): /api/anime/rankings — AniList's
 * top-rated titles with their AniList average, plus the Hearbor members' own votes only when
 * someone really voted. A row opens the title on Hearbor (matched by its MAL id).
 */
export default function RankingsPage({ isRtl, dataSaver, loadRankings, onOpenRanked }) {
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    let alive = true;
    loadRankings()
      .then((rows) => {
        if (alive) setList(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (alive) {
          setList([]);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [loadRankings]);

  if (list === null) {
    return (
      <div className="bx-rank-list" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bx-rank-row is-skeleton" />
        ))}
      </div>
    );
  }
  if (!list.length) {
    return (
      <div className="bx-empty">
        <BxIcon name="trophy" size="1.6rem" />
        <p>{failed ? (isRtl ? 'ماقدرناش نجيب الترتيب دلوقتي — جرّب كمان شوية.' : 'Could not load the rankings — try again later.') : isRtl ? 'مفيش ترتيب دلوقتي.' : 'No rankings right now.'}</p>
      </div>
    );
  }

  return (
    <>
      <p className="bxp-lead">
        {isRtl
          ? 'أعلى الأعمال تقييمًا على AniList (متوسط تقييم المشاهدين هناك). تقييم أعضاء Hearbor بيظهر بس لو حد قيّم فعلًا.'
          : "AniList's top-rated titles (its viewers' average). Hearbor members' score shows only when someone really voted."}
      </p>
      <ol className="bx-rank-list">
        {list.map((m) => {
          const title = m.titleEnglish || m.titleRomaji || '';
          const meta = [
            m.format === 'MOVIE' ? (isRtl ? 'فيلم' : 'Movie') : m.format || '',
            m.seasonYear || '',
            Number(m.episodes) > 0 ? (isRtl ? `${m.episodes} حلقة` : `${m.episodes} eps`) : '',
            (isRtl ? STATUS_AR : STATUS_EN)[m.status] || ''
          ].filter(Boolean);
          return (
            <li key={m.id}>
              <button
                type="button"
                className="bx-rank-row"
                disabled={opening === m.id}
                onClick={async () => {
                  setOpening(m.id);
                  try {
                    await onOpenRanked(m);
                  } finally {
                    setOpening(0);
                  }
                }}
              >
                <span className="bx-rank-num">{m.rank}</span>
                <img src={coverForMode(m.coverUrl, dataSaver)} alt="" loading="lazy" decoding="async" />
                <span className="bx-rank-main">
                  <strong dir="auto">{title}</strong>
                  {meta.length ? <small>{meta.join(' • ')}</small> : null}
                  {Array.isArray(m.genres) && m.genres.length ? <small className="bx-rank-genres">{m.genres.slice(0, 3).join(' • ')}</small> : null}
                </span>
                <span className="bx-rank-scores">
                  {m.scoreTen ? (
                    <span>
                      <BxIcon name="star" size="0.95em" filled />
                      {m.scoreTen}
                      <small>AniList</small>
                    </span>
                  ) : null}
                  {m.votesCount > 0 && m.communityScore ? (
                    <span>
                      {/* the API sends members' average on AniList's 0–100 scale (8.5 → 85) */}
                      {(Number(m.communityScore) / 10).toFixed(1)}
                      <small>{isRtl ? `${m.votesCount} صوت على Hearbor` : `${m.votesCount} Hearbor votes`}</small>
                    </span>
                  ) : null}
                </span>
                {opening === m.id ? <BxIcon name="loader" spin /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
