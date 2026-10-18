import React from 'react';
import BxIcon from './BxIcon.jsx';
import PosterCard, { useLongPress } from './PosterCard.jsx';
import SectionHead from './SectionHead.jsx';
import ScrollRow from './ScrollRow.jsx';
import HeroSlideScope from './HeroSlideScope.jsx';
import LazyMount from './LazyMount.jsx';
import UpdateBanner from './UpdateBanner.jsx';
import ContinueWatchingRow from './ContinueWatchingRow.jsx';
import BecauseYouWatchedRow from './BecauseYouWatchedRow.jsx';
import { SkeletonHero, SkeletonRow } from './Skeleton.jsx';
import { coverForMode } from './dataSaver.js';
import { airingFor, airingLine, buildScheduleDay, formatAirClock } from './airingSchedule.js';
import { todayScheduleId } from './scheduleDays.js';

const HERO_SLIDES = 5;

function PosterRail({ title, items, loading, onMore, isRtl, onOpen, onPeek, dataSaver }) {
  if (loading && !items.length) return <SkeletonRow cards={4} cardWidth={118} cardHeight={177} animated={false} />;
  if (!items.length) return null;
  return (
    <section className="bx-section">
      <SectionHead title={title} onMore={onMore} isRtl={isRtl} />
      <ScrollRow label={title}>
        {items.map((item) => (
          <PosterCard key={item.objectID} item={item} onOpen={onOpen} onPeek={onPeek} dataSaver={dataSaver} />
        ))}
      </ScrollRow>
    </section>
  );
}

/** A wide (16:9) card: the show's banner art, its title and the real next air time when known. */
function WideCard({ item, line, onOpen, onPeek, dataSaver }) {
  const { handlers, consumeClick } = useLongPress(onPeek ? () => onPeek(item) : null);
  const fallback =
    item.rating || item.type ? (
      <>
        {item.rating ? (
          <span className="bx-wide-rating">
            <BxIcon name="star" size="0.95em" filled />
            {item.rating}
          </span>
        ) : null}
        {item.rating && item.type ? ' • ' : ''}
        {item.type || ''}
      </>
    ) : null;
  return (
    <div
      className="bx-wide-card bx-mob-card"
      data-bx-oid={item.objectID}
      role="button"
      tabIndex={0}
      aria-label={item.titleEn}
      {...handlers}
      onClick={(e) => {
        if (consumeClick()) {
          e.preventDefault();
          return;
        }
        onOpen(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(item);
      }}
    >
      <img src={coverForMode(item.banner || item.poster, dataSaver)} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className="bx-wide-shade" aria-hidden="true" />
      <span className="bx-wide-copy">
        <span className="bx-wide-title" dir="auto">
          {item.titleEn}
        </span>
        {line || fallback ? <span className={`bx-wide-sub${line ? ' is-airing' : ''}`}>{line || fallback}</span> : null}
      </span>
    </div>
  );
}

/** "Airing now" as wide cards (a different shape from the poster rails around it). */
function AiringRail({ title, items, loading, onMore, isRtl, onOpen, onPeek, dataSaver, airingMap, now }) {
  if (loading && !items.length) return <SkeletonRow cards={2} cardWidth={272} cardHeight={153} animated={false} />;
  if (!items.length) return null;
  return (
    <section className="bx-section">
      <SectionHead title={title} onMore={onMore} isRtl={isRtl} />
      <ScrollRow className="bx-wide-row" label={title}>
        {items.map((item) => (
          <WideCard
            key={item.objectID}
            item={item}
            line={airingLine(airingFor(item, airingMap), now, isRtl)}
            onOpen={onOpen}
            onPeek={onPeek}
            dataSaver={dataSaver}
          />
        ))}
      </ScrollRow>
    </section>
  );
}

/**
 * Home: one hero, then rows that each show something different (no row repeats the
 * same list). Every list comes from the catalogue index; nothing is hard-coded.
 */
export default function HomeTab({
  pageClassName = 'bx-page',
  isRtl,
  lang,
  dataSaver,
  loading,
  lists,
  watchHistory,
  watchedIds,
  mangaHistory,
  favorites,
  genres,
  airingMap,
  apkRelease,
  heroPaused,
  onOpen,
  onPeek,
  onStory,
  onToggleFavorite,
  onSeeAll,
  onGenre,
  onOpenManga,
  onMangaLibrary,
  loadSimilar,
  onClassicSite
}) {
  const { popular = [], topRated = [], airing = [], latest = [], movies = [], today: todayTagged = [] } = lists;
  const now = Date.now();
  // Today's shows by their real air time (AniList) when known, in time order; the catalogue's
  // weekday tag for the rest (airingSchedule.js). Before the times arrive it is the tagged list.
  const today = React.useMemo(
    () => buildScheduleDay({ dayId: todayScheduleId(), airingItems: airing, dayItems: todayTagged, map: airingMap }),
    [airing, todayTagged, airingMap]
  );
  const isFav = (item) => favorites.some((f) => f.objectID === item?.objectID);
  const resumeEpisode = (item) => watchHistory.find((h) => h.objectID === item?.objectID)?.episode || 1;

  return (
    <main className={`${pageClassName} bx-home`}>
      {/* 1. Hero: the five most popular titles */}
      {loading && !popular.length && <SkeletonHero height={480} />}
      <HeroSlideScope count={Math.min(HERO_SLIDES, popular.length)} paused={heroPaused}>
        {(slide, setSlide, swipe) => {
          const hero = popular[slide] || popular[0] || null;
          if (!hero) return null;
          const fav = isFav(hero);
          const meta = [hero.year, hero.type, hero.tags?.[0]].filter(Boolean);
          return (
            <section className="bx-hero" {...swipe}>
              {/* Phones: the tall poster. Wide screens: the show's landscape banner (one image is loaded). */}
              <picture key={hero.objectID}>
                {hero.banner && hero.banner !== hero.poster ? (
                  <source media="(min-width: 1024px)" srcSet={coverForMode(hero.banner, dataSaver)} />
                ) : null}
                <img className="bx-hero-img" src={coverForMode(hero.poster || hero.banner, dataSaver)} alt="" decoding="async" />
              </picture>
              <div className="bx-hero-shade" aria-hidden="true" />
              <div className="bx-hero-copy nv-hero-copy" key={`copy-${hero.objectID}`}>
                <div className="bx-hero-meta nv-hero-meta">
                  {meta.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
                <h1 className="bx-hero-title nv-hero-title" dir="auto">
                  {hero.titleEn}
                </h1>
                <div className="bx-hero-actions nv-hero-actions">
                  <button type="button" className="nv-hero-cta" onClick={() => onOpen(hero)}>
                    Voir les détails
                  </button>
                </div>
              </div>
              <div className="bx-hero-dots" aria-hidden="true">
                {popular.slice(0, HERO_SLIDES).map((p, i) => (
                  <span key={p.objectID} className={i === slide ? 'is-on' : ''} onClick={() => setSlide(i)} />
                ))}
              </div>
            </section>
          );
        }}
      </HeroSlideScope>

      {/* New APK version available (from /api/app/config) */}
      <UpdateBanner release={apkRelease} lang={lang} />

      {/* 2. Continue watching (real resume positions) */}
      <ContinueWatchingRow
        history={watchHistory}
        isRtl={isRtl}
        dataSaver={dataSaver}
        onResume={(h, ep) =>
          onOpen({ objectID: h.objectID, slug: h.slug, titleEn: h.titleEn, titleAr: h.titleAr, poster: h.poster, banner: h.poster }, ep)
        }
        onInfo={(h) => onPeek({ objectID: h.objectID, slug: h.slug, titleEn: h.titleEn, titleAr: h.titleAr, poster: h.poster, banner: h.poster })}
      />

      {/* 3. Because you watched X (computed on the phone) */}
      <LazyMount minHeight={240} placeholder={<SkeletonRow cards={4} animated={false} />}>
        <BecauseYouWatchedRow
          seed={watchHistory[0]}
          excludeIds={watchedIds}
          loadSimilar={loadSimilar}
          onOpen={onOpen}
          onPeek={onPeek}
          isRtl={isRtl}
          dataSaver={dataSaver}
        />
      </LazyMount>

      {/* 4. Airing today (schedule of this weekday) */}
      {today.length > 0 && (
        <section className="bx-section">
          <SectionHead title="Aujourd'hui" onMore={() => onSeeAll('schedule')} isRtl={false} />
          <ScrollRow className="bx-stories" label="Aujourd'hui">
            {today.slice(0, 14).map((item, idx) => (
              <button
                key={`today-${item.objectID}`}
                type="button"
                className="bx-story"
                onClick={() => onStory({ item, index: idx, pool: today.slice(0, 14) })}
              >
                <span className="bx-story-ring">
                  <img src={coverForMode(item.poster, dataSaver)} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="bx-story-name" dir="auto">
                  {item.titleEn}
                </span>
                {item.airing ? <span className="bx-story-time">{formatAirClock(item.airing.airingAt, isRtl)}</span> : null}
              </button>
            ))}
          </ScrollRow>
        </section>
      )}

      {/* 5. Top 10 by rating (an honest title: it is the rating order, not "today") */}
      {topRated.length >= 3 && (
        <LazyMount minHeight={250} placeholder={<SkeletonRow cards={3} cardWidth={150} cardHeight={200} animated={false} />}>
          <section className="bx-section">
            <SectionHead title="Top 10" onMore={() => onSeeAll('best_mal_ranked')} isRtl={false} />
            <ScrollRow className="bx-top10-row" label="Top 10">
              {topRated.slice(0, 10).map((item, idx) => (
                <div key={`top-${item.objectID}`} className="bx-top10">
                  <span className="bx-top10-num" aria-hidden="true">
                    {idx + 1}
                  </span>
                  <PosterCard item={item} onOpen={onOpen} onPeek={onPeek} dataSaver={dataSaver} width={112} />
                </div>
              ))}
            </ScrollRow>
          </section>
        </LazyMount>
      )}

      {/* 6–8. Distinct catalogue rows */}
      <LazyMount minHeight={220} placeholder={<SkeletonRow cards={2} cardWidth={272} cardHeight={153} animated={false} />}>
        <AiringRail
          title="En cours de diffusion"
          items={airing}
          loading={loading}
          onMore={() => onSeeAll('series_fav_count_desc', 'airing')}
          isRtl={false}
          onOpen={onOpen}
          onPeek={onPeek}
          dataSaver={dataSaver}
          airingMap={airingMap}
          now={now}
        />
      </LazyMount>
      <LazyMount minHeight={250} placeholder={<SkeletonRow cards={4} animated={false} />}>
        <PosterRail
          title="Derniers épisodes"
          items={latest}
          loading={loading}
          onMore={() => onSeeAll('series_date_created')}
          isRtl={false}
          onOpen={onOpen}
          onPeek={onPeek}
          dataSaver={dataSaver}
        />
      </LazyMount>
      <LazyMount minHeight={250} placeholder={<SkeletonRow cards={4} animated={false} />}>
        <PosterRail
          title="Films"
          items={movies}
          loading={loading}
          onMore={() => onSeeAll('series_fav_count_desc', 'movie')}
          isRtl={false}
          onOpen={onOpen}
          onPeek={onPeek}
          dataSaver={dataSaver}
        />
      </LazyMount>

      {/* 9. Continue reading (manga) */}
      {mangaHistory.length > 0 && (
        <section className="bx-section">
          <SectionHead title="Continuer la lecture" onMore={onMangaLibrary} isRtl={false} />
          <ScrollRow label="Continuer la lecture">
            {mangaHistory.slice(0, 10).map((mh, i) => (
              <button key={`${mh.objectID}-${i}`} type="button" className="bx-read-card" onClick={() => onOpenManga(mh)}>
                <img src={mh.poster_uri} alt="" loading="lazy" decoding="async" />
                <span className="bx-read-copy">
                  <span className="bx-read-title" dir="auto">
                    {mh.name}
                  </span>
                  <span className="bx-read-sub">Chapitre {mh.lastChapter}</span>
                </span>
              </button>
            ))}
          </ScrollRow>
        </section>
      )}

      {/* 10. Browse by genre */}
      <section className="bx-section bx-section-last">
        <SectionHead title="Découvrir" isRtl={false} />
        <div className="bx-row bx-chip-row bx-genre-row">
          {genres.map((g) => (
            <button key={g.id} type="button" className="bx-chip" onClick={() => onGenre(g)}>
              {g.fr || g.en}
            </button>
          ))}
        </div>
      </section>

      {/* Website only: the classic pages stay one tap away (webUi.js) */}
      {onClassicSite ? (
        <footer className="bx-home-foot">
          <button type="button" className="bx-classic-link" onClick={onClassicSite}>
            <BxIcon name="monitor" size="1em" />
            Site classique (romans, boutique…)
          </button>
        </footer>
      ) : null}
    </main>
  );
}
