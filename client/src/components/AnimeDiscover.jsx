import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { imgFallback } from '../hooks/hooks.js';

const DISCOVERY_GENRES = [
  { id: 'action', en: 'Action', ar: 'أكشن', code: 'ACT // 01' },
  { id: 'school', en: 'School', ar: 'مدرسي', code: 'SCH // 02' },
  { id: 'psychological', en: 'Psychological', ar: 'نفسي', code: 'PSY // 03' },
  { id: 'fantasy', en: 'Fantasy', ar: 'خيال', code: 'FNT // 04' },
  { id: 'sci-fi', en: 'Sci-Fi', ar: 'خيال علمي', code: 'SCI // 05' },
  { id: 'mystery', en: 'Mystery', ar: 'غموض', code: 'MYS // 06' },
  { id: 'supernatural', en: 'Supernatural', ar: 'خارق للطبيعة', code: 'SUP // 07' },
  { id: 'thriller', en: 'Thriller', ar: 'إثارة وتشويق', code: 'THR // 08' },
  { id: 'romance', en: 'Romance', ar: 'رومانسي', code: 'ROM // 09' },
  { id: 'adventure', en: 'Adventure', ar: 'مغامرات', code: 'ADV // 10' },
  { id: 'drama', en: 'Drama', ar: 'دراما', code: 'DRM // 11' },
  { id: 'slice-of-life', en: 'Slice of Life', ar: 'شريحة من الحياة', code: 'SOL // 12' },
  { id: 'comedy', en: 'Comedy', ar: 'كوميديا', code: 'CMD // 13' },
  { id: 'horror', en: 'Horror', ar: 'رعب', code: 'HRR // 14' },
  { id: 'sports', en: 'Sports', ar: 'رياضي', code: 'SPT // 15' }
];

const GENRE_AR_LABELS = DISCOVERY_GENRES.reduce((acc, g) => {
  acc[g.en.toLowerCase()] = g.ar;
  acc[g.id.toLowerCase()] = g.ar;
  return acc;
}, {});

export default function AnimeDiscover({ compact = false }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const isAr = lang === 'ar';

  const [selectedGenres, setSelectedGenres] = useState(['action', 'school']);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'morphing' | 'revealed'
  const [discoveredAnime, setDiscoveredAnime] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const toggleGenre = (genreId) => {
    if (phase === 'morphing') return;
    setSelectedGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((id) => id !== genreId)
        : [...prev, genreId]
    );
  };

  const clearGenres = () => {
    if (phase === 'morphing') return;
    setSelectedGenres([]);
  };

  const handleInitiateDiscovery = async () => {
    if (phase === 'morphing') return;
    setErrorMsg(null);
    setPhase('morphing');

    const startTime = Date.now();
    const queryParts = [];
    if (selectedGenres.length > 0) {
      queryParts.push(`genres=${encodeURIComponent(selectedGenres.join(','))}`);
    }
    if (discoveredAnime?.id) {
      queryParts.push(`exclude=${encodeURIComponent(discoveredAnime.id)}`);
    }
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    let payload = null;
    try {
      const res = await fetch(`/api/content/random${qs}`, {
        headers: { Accept: 'application/json' }
      });
      const json = await res.json();
      if (json?.success && json?.data) {
        payload = json.data;
      } else {
        throw new Error(json?.message || 'Discovery signal interrupted');
      }
    } catch (err) {
      setErrorMsg(
        isAr
          ? 'تعذر الاتصال بمحرك الاكتشاف حالياً، يرجى المحاولة مرة أخرى.'
          : 'Discovery signal interrupted. Please re-initiate.'
      );
      setPhase(discoveredAnime ? 'revealed' : 'idle');
      return;
    }

    // Enforce the minimum 2.0-second suspenseful glowing liquid morph
    const elapsed = Date.now() - startTime;
    const remainingSuspense = Math.max(0, 2000 - elapsed);

    timerRef.current = setTimeout(() => {
      setDiscoveredAnime(payload);
      setPhase('revealed');
    }, remainingSuspense);
  };

  const resolveWatchSlug = (item) => {
    if (!item) return '';
    if (item.slug) return item.slug;
    const clean = String(item.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `en_anime:${clean || item.id}`;
  };

  const formatGenreLabel = (g) => {
    if (!isAr) return g;
    return GENRE_AR_LABELS[String(g || '').toLowerCase()] || g;
  };

  return (
    <section
      className={`bx-discover-vault ${compact ? 'bx-discover-vault--compact' : ''}`}
      aria-label={isAr ? 'اكتشاف الأنمي الذكي' : 'Luxury Anime Discovery'}
    >
      {/* Ambient Liquid Background Aura */}
      <div className="bx-discover-vault__aura" aria-hidden="true">
        <div className="bx-discover-vault__orb bx-discover-vault__orb--1" />
        <div className="bx-discover-vault__orb bx-discover-vault__orb--2" />
        <div className="bx-discover-vault__grid-lines" />
      </div>

      <div className="bx-discover-vault__inner">
        {/* Luxury Header */}
        <header className="bx-discover-header">
          <div className="bx-discover-eyebrow">
            <span className="bx-discover-eyebrow__dot" />
            <span>
              {isAr
                ? 'Hearbor // بروتوكول الاكتشاف الغامض'
                : 'Hearbor // LIQUID GLASS DISCOVERY PROTOCOL'}
            </span>
          </div>

          <h1 className="bx-discover-title">
            {isAr ? 'اكتشاف الأنمي النخبوي' : 'MYSTERIOUS ANIME ORACLE'}
          </h1>

          <p className="bx-discover-subtitle">
            {isAr
              ? 'اختر التصنيفات التي تفضلها، وسيقوم محرك Hearbor باستحضار عمل أنمي واحد مختار بعناية من أعماق الأرشيف الياباني.'
              : 'Select your desired genre frequencies. The Liquid Glass monolith will synthesize and reveal a single curated anime from the vault.'}
          </p>
        </header>

        {/* Frosted Glass Genre Selector Pills */}
        <div className="bx-discover-genres-wrap">
          <div className="bx-discover-genres-bar">
            <span className="bx-discover-genres-label">
              {isAr ? 'تصفية حسب التصنيفات:' : 'GENRE FREQUENCIES:'}
            </span>
            <div className="bx-discover-genres-actions">
              <span className="bx-discover-genres-count">
                {selectedGenres.length === 0
                  ? isAr
                    ? 'جميع التصنيفات نشطة'
                    : 'ALL GENRES ACTIVE'
                  : isAr
                  ? `${selectedGenres.length} تصنيفات محددة`
                  : `${selectedGenres.length} SELECTED`}
              </span>
              {selectedGenres.length > 0 && (
                <button
                  type="button"
                  onClick={clearGenres}
                  disabled={phase === 'morphing'}
                  className="bx-discover-clear-btn"
                >
                  {isAr ? 'إعادة ضبط' : 'RESET'}
                </button>
              )}
            </div>
          </div>

          <div
            className="bx-discover-pills"
            role="group"
            aria-label={isAr ? 'تصنيفات الأنمي' : 'Anime Genres'}
          >
            {DISCOVERY_GENRES.map((genre) => {
              const isSelected = selectedGenres.includes(genre.id);
              return (
                <motion.button
                  key={genre.id}
                  type="button"
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggleGenre(genre.id)}
                  disabled={phase === 'morphing'}
                  aria-pressed={isSelected}
                  className={`bx-discover-pill backdrop-blur-md bg-white/5 ${
                    isSelected ? 'bx-discover-pill--active' : ''
                  }`}
                >
                  <span className="bx-discover-pill__glow" aria-hidden="true" />
                  <span className="bx-discover-pill__indicator" aria-hidden="true" />
                  <span className="bx-discover-pill__text">
                    {isAr ? genre.ar : genre.en}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Trigger Button ("Initiate" / "Discover") */}
        <div className="bx-discover-trigger-wrap">
          <motion.button
            type="button"
            onClick={handleInitiateDiscovery}
            disabled={phase === 'morphing'}
            whileHover={phase === 'morphing' ? {} : { scale: 1.03, y: -2 }}
            whileTap={phase === 'morphing' ? {} : { scale: 0.97 }}
            className={`bx-discover-trigger ${
              phase === 'morphing' ? 'bx-discover-trigger--busy' : ''
            }`}
          >
            <span className="bx-discover-trigger__shimmer" aria-hidden="true" />
            <span className="bx-discover-trigger__icon" aria-hidden="true">
              {phase === 'morphing' ? '◈' : '✦'}
            </span>
            <span className="bx-discover-trigger__label">
              {phase === 'morphing'
                ? isAr
                  ? 'جاري التشكيل البلوري...'
                  : 'SYNTHESIZING LIQUID GLASS...'
                : discoveredAnime
                ? isAr
                  ? 'استحضار أنمي آخر'
                  : 'INITIATE NEW DISCOVERY'
                : isAr
                ? 'بدء الاكتشاف'
                : 'INITIATE DISCOVERY'}
            </span>
          </motion.button>
        </div>

        {errorMsg && (
          <div className="bx-discover-error" role="alert">
            {errorMsg}
          </div>
        )}

        {/* The Core Experience: Center Mysterious Liquid Glass Monolith Card */}
        <div className="bx-discover-stage">
          <AnimatePresence mode="wait">
            {/* STATE 1 & 2: IDLE OR 2-SECOND FLUID MORPHING SHIMMER */}
            {phase !== 'revealed' && (
              <motion.div
                key={phase === 'morphing' ? 'monolith-morphing' : 'monolith-idle'}
                initial={{ opacity: 0, scale: 0.94, filter: 'blur(14px)' }}
                animate={
                  phase === 'morphing'
                    ? {
                        opacity: 1,
                        scale: [1, 1.035, 0.985, 1.02, 1],
                        rotateX: [0, 4, -4, 2, 0],
                        rotateY: [0, -5, 5, -2, 0],
                        borderRadius: [
                          '28px',
                          '42px 22px 38px 24px',
                          '24px 44px 22px 40px',
                          '36px 28px 42px 26px',
                          '28px'
                        ],
                        filter: 'blur(0px)'
                      }
                    : {
                        opacity: 1,
                        scale: 1,
                        rotateX: 0,
                        rotateY: 0,
                        borderRadius: '28px',
                        filter: 'blur(0px)'
                      }
                }
                exit={{
                  opacity: 0,
                  scale: 1.05,
                  filter: 'blur(26px)',
                  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
                }}
                transition={
                  phase === 'morphing'
                    ? {
                        duration: 2.0,
                        ease: 'easeInOut',
                        times: [0, 0.25, 0.55, 0.8, 1]
                      }
                    : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                }
                className={`bx-monolith-card backdrop-blur-md bg-white/5 ${
                  phase === 'morphing' ? 'bx-monolith-card--morphing' : ''
                }`}
              >
                {/* Liquid Shimmer Waves inside the Glass Monolith */}
                <div className="bx-monolith-card__liquid-layer" aria-hidden="true">
                  <motion.div
                    className="bx-monolith-card__wave bx-monolith-card__wave--1"
                    animate={
                      phase === 'morphing'
                        ? {
                            x: ['-35%', '35%', '-20%'],
                            y: ['-25%', '25%', '-15%'],
                            scale: [1, 1.45, 1.15],
                            opacity: [0.35, 0.85, 0.45]
                          }
                        : {
                            x: ['-10%', '10%', '-10%'],
                            y: ['-8%', '8%', '-8%'],
                            scale: [1, 1.08, 1],
                            opacity: [0.16, 0.28, 0.16]
                          }
                    }
                    transition={{
                      duration: phase === 'morphing' ? 1.8 : 6,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  />
                  <motion.div
                    className="bx-monolith-card__wave bx-monolith-card__wave--2"
                    animate={
                      phase === 'morphing'
                        ? {
                            x: ['30%', '-30%', '20%'],
                            y: ['20%', '-25%', '15%'],
                            scale: [1.1, 1.5, 1],
                            opacity: [0.3, 0.75, 0.35]
                          }
                        : {
                            x: ['8%', '-8%', '8%'],
                            y: ['6%', '-6%', '6%'],
                            scale: [1, 1.06, 1],
                            opacity: [0.12, 0.22, 0.12]
                          }
                    }
                    transition={{
                      duration: phase === 'morphing' ? 1.6 : 7,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  />
                  <div className="bx-monolith-card__specular" />
                </div>

                {/* Center Core Content */}
                <div className="bx-monolith-card__content">
                  <motion.div
                    className="bx-monolith-sigil"
                    animate={
                      phase === 'morphing'
                        ? {
                            scale: [1, 1.22, 0.92, 1.15, 1],
                            rotate: [0, 90, 180, 270, 360]
                          }
                        : { scale: [1, 1.05, 1] }
                    }
                    transition={{
                      duration: phase === 'morphing' ? 2.0 : 4.0,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  >
                    <span className="bx-monolith-sigil__ring" />
                    <span className="bx-monolith-sigil__core">X</span>
                  </motion.div>

                  <div className="bx-monolith-status">
                    {phase === 'morphing'
                      ? isAr
                        ? 'جاري استخلاص البصمة البصرية من الأرشيف...'
                        : 'MORPHING LIQUID GLASS // ALIGNING ARCHIVE...'
                      : isAr
                      ? 'اللوح البلوري جاهز — اضغط «بدء الاكتشاف» لكشف الأنمي'
                      : 'FROSTED MONOLITH READY — PRESS INITIATE TO REVEAL'}
                  </div>

                  <div className="bx-monolith-meta">
                    {selectedGenres.length > 0 ? (
                      selectedGenres.map((gId) => {
                        const found = DISCOVERY_GENRES.find((item) => item.id === gId);
                        return (
                          <span key={gId} className="bx-monolith-meta__chip">
                            {found ? (isAr ? found.ar : found.en) : gId}
                          </span>
                        );
                      })
                    ) : (
                      <span className="bx-monolith-meta__chip">
                        {isAr ? 'البث الشامل لجميع التصنيفات' : 'OMNI-GENRE FREQUENCY'}
                      </span>
                    )}
                  </div>

                  {phase === 'morphing' && (
                    <div className="bx-monolith-progress" aria-hidden="true">
                      <motion.div
                        className="bx-monolith-progress__bar"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.95, ease: 'easeInOut' }}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* STATE 3: REVEALED ANIME CARD */}
            {phase === 'revealed' && discoveredAnime && (
              <motion.article
                key={`revealed-${discoveredAnime.id}`}
                initial={{ opacity: 0, filter: 'blur(24px)', scale: 0.94, y: 18 }}
                animate={{ opacity: 1, filter: 'blur(0px)', scale: 1, y: 0 }}
                exit={{ opacity: 0, filter: 'blur(18px)', scale: 0.95 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="bx-reveal-card backdrop-blur-md bg-white/5"
              >
                {/* Ambient Cover Blur Backdrop */}
                <div
                  className="bx-reveal-card__backdrop"
                  style={{
                    backgroundImage: `url(${
                      discoveredAnime.banner_url || discoveredAnime.cover_url
                    })`
                  }}
                  aria-hidden="true"
                />

                <div className="bx-reveal-card__grid">
                  {/* Cover Art Column */}
                  <motion.div
                    className="bx-reveal-card__poster-wrap"
                    initial={{ opacity: 0, scale: 0.9, filter: 'blur(16px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    transition={{ delay: 0.12, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <img
                      src={discoveredAnime.cover_url}
                      alt={discoveredAnime.title}
                      onError={imgFallback}
                      className="bx-reveal-card__poster"
                    />
                    <div className="bx-reveal-card__poster-gloss" aria-hidden="true" />
                    {discoveredAnime.score && (
                      <div className="bx-reveal-card__score-badge">
                        ★ {(Number(discoveredAnime.score) / 10).toFixed(1)}
                      </div>
                    )}
                  </motion.div>

                  {/* Editorial Info Column */}
                  <div className="bx-reveal-card__body">
                    <motion.div
                      className="bx-reveal-card__kicker"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18, duration: 0.5 }}
                    >
                      <span className="bx-reveal-card__pulse" />
                      <span>
                        {isAr ? 'تم الكشف بنجاح // اختيار حصري' : 'ORACLE REVEAL // MATCH CONFIRMED'}
                      </span>
                    </motion.div>

                    <motion.h2
                      className="bx-reveal-card__title"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.24, duration: 0.55 }}
                    >
                      {isAr && discoveredAnime.title_ar
                        ? discoveredAnime.title_ar
                        : discoveredAnime.title}
                    </motion.h2>

                    {isAr &&
                      discoveredAnime.title_ar &&
                      discoveredAnime.title &&
                      discoveredAnime.title_ar !== discoveredAnime.title && (
                        <div className="bx-reveal-card__subtitle">
                          {discoveredAnime.title}
                        </div>
                      )}

                    {/* Meta row */}
                    <motion.div
                      className="bx-reveal-card__meta"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                    >
                      {discoveredAnime.year && (
                        <span className="bx-reveal-card__meta-item">
                          {discoveredAnime.year}
                        </span>
                      )}
                      {discoveredAnime.episodes && (
                        <span className="bx-reveal-card__meta-item">
                          {discoveredAnime.episodes} {isAr ? 'حلقة' : 'Episodes'}
                        </span>
                      )}
                      <span className="bx-reveal-card__meta-item">FHD 1080P</span>
                    </motion.div>

                    {/* Genres list */}
                    <motion.div
                      className="bx-reveal-card__genres"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.34, duration: 0.5 }}
                    >
                      {(discoveredAnime.genres || []).map((g) => {
                        const isMatched = selectedGenres.some(
                          (sel) => sel.toLowerCase() === String(g).toLowerCase()
                        );
                        return (
                          <span
                            key={g}
                            className={`bx-reveal-card__genre-tag ${
                              isMatched ? 'bx-reveal-card__genre-tag--matched' : ''
                            }`}
                          >
                            {formatGenreLabel(g)}
                          </span>
                        );
                      })}
                    </motion.div>

                    {/* Description */}
                    <motion.p
                      className="bx-reveal-card__description"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.55 }}
                    >
                      {isAr && discoveredAnime.description_ar
                        ? discoveredAnime.description_ar
                        : discoveredAnime.description}
                    </motion.p>

                    {/* Actions */}
                    <motion.div
                      className="bx-reveal-card__actions"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.48, duration: 0.55 }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/watch/${encodeURIComponent(
                              resolveWatchSlug(discoveredAnime)
                            )}/1`
                          )
                        }
                        className="bx-reveal-btn bx-reveal-btn--primary"
                      >
                        <span>▶</span>
                        <span>{isAr ? 'مشاهدة الآن' : 'WATCH NOW'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/show/${encodeURIComponent(
                              resolveWatchSlug(discoveredAnime)
                            )}`
                          )
                        }
                        className="bx-reveal-btn bx-reveal-btn--glass"
                      >
                        <span>{isAr ? 'تفاصيل الأنمي' : 'ANIME DETAILS'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleInitiateDiscovery}
                        className="bx-reveal-btn bx-reveal-btn--ghost"
                      >
                        <span>✦</span>
                        <span>{isAr ? 'اكتشاف آخر' : 'DISCOVER ANOTHER'}</span>
                      </button>
                    </motion.div>
                  </div>
                </div>
              </motion.article>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
