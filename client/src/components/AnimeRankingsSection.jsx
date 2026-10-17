import { imgFallback } from '../hooks/hooks.js';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts';
import * as d3 from 'd3';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';
import { SkeletonGrid, EmptyState } from './Loading.jsx';

// Custom Recharts Tooltip for anime ranking visualization
function CustomTooltip({ active, payload, lang }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div
      style={{
        background: 'rgba(10, 12, 22, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        padding: '0.85rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        maxWidth: '300px',
        direction: lang === 'ar' ? 'rtl' : 'ltr'
      }}
    >
      {data.coverUrl && (
        <img onError={imgFallback}
          src={data.coverUrl}
          alt={data.name}
          style={{ width: '48px', height: '68px', objectFit: 'cover', borderRadius: '6px' }}
        />
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
          <span
            style={{
              background: data.rank === 1 ? '#eab308' : data.rank === 2 ? '#94a3b8' : data.rank === 3 ? '#d97706' : 'rgba(255,255,255,0.15)',
              color: '#000',
              fontWeight: 800,
              fontSize: '0.72rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '4px'
            }}
          >
            #{data.rank}
          </span>
          <strong style={{ fontSize: '0.92rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
            {data.name}
          </strong>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--cyan)', fontWeight: 700 }}>
          {data.score != null ? `★ ${data.score} / 100 (${Number((data.score / 10).toFixed(1))} / 10)` : '★ —'}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--ink-dim)', marginTop: '0.2rem' }}>
          👥 {Number(data.votes || 0).toLocaleString()} {lang === 'ar' ? 'صوت' : 'votes'}
        </div>
      </div>
    </div>
  );
}

export default function AnimeRankingsSection({ onOpenAuth }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Controls: chart view, metric, genre filter
  const [viewMode, setViewMode] = useState('bar'); // 'bar' | 'radar' | 'area'
  const [metric, setMetric] = useState('score'); // 'score' | 'popularity' | 'episodes'
  const [selectedGenre, setSelectedGenre] = useState('all');

  // Rate anime modal state
  const [rateModalItem, setRateModalItem] = useState(null);
  const [selectedRating, setSelectedRating] = useState(10);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Fetch rankings
  const fetchRankings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/anime/rankings');
      setItems(res?.anime || []);
    } catch (err) {
      console.error('Rankings fetch error:', err);
      setError(err.message || 'Failed to load rankings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, []);

  // Filter items by genre
  const filteredItems = useMemo(() => {
    if (selectedGenre === 'all') return items;
    return items.filter((item) =>
      item.genres && item.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase())
    );
  }, [items, selectedGenre]);

  // Extract available genres
  const availableGenres = useMemo(() => {
    const set = new Set();
    items.forEach((it) => {
      (it.genres || []).forEach((g) => set.add(g));
    });
    return Array.from(set).slice(0, 6);
  }, [items]);

  // D3 color scale interpolation for dynamic visual chart accents
  const d3ColorScale = useMemo(() => {
    return d3.scaleSequential(d3.interpolateCool).domain([0, 10]);
  }, []);

  // Chart data format
  const chartData = useMemo(() => {
    return filteredItems.slice(0, 10).map((it, idx) => {
      const shortName = (lang === 'ar' && it.titleArabic)
        ? (it.titleArabic.length > 14 ? it.titleArabic.slice(0, 14) + '…' : it.titleArabic)
        : (it.titleEnglish || it.titleRomaji || '').slice(0, 14);

      return {
        id: it.id,
        rank: it.rank || idx + 1,
        name: shortName,
        fullName: (lang === 'ar' && it.titleArabic) ? it.titleArabic : (it.titleEnglish || it.titleRomaji),
        // Real values only (AniList score / popularity, members' votes); unknown = no bar.
        score: Number(it.score) > 0 ? Number(it.score) : null,
        popularity: Number(it.popularity) > 0 ? Math.round(Number(it.popularity) / 1000) : null, // in thousands
        episodes: it.episodes ?? null,
        votes: Number(it.votesCount) || 0,
        coverUrl: it.coverUrl,
        color: it.color || d3ColorScale(idx)
      };
    });
  }, [filteredItems, lang, d3ColorScale]);

  // Handle submitting community rating
  const handleRatingSubmit = async (e) => {
    e.preventDefault();
    if (!rateModalItem) return;
    setRatingSubmitting(true);
    try {
      const res = await api.post('/api/anime/rankings/rate', {
        animeId: rateModalItem.id,
        score: Number(selectedRating)
      });
      if (res?.ok) {
        pushToast(t('rankings.ratingSuccess'), 'success');
        // The server answers with the real member stats (count + average) after saving the vote.
        const stats = res.stats || {};
        setItems((prev) =>
          prev.map((it) => {
            if (it.id === rateModalItem.id) {
              const votes = Number(stats.votes) || 0;
              return {
                ...it,
                communityScore: votes > 0 && stats.avgScore ? Number((stats.avgScore * 10).toFixed(1)) : null,
                votesCount: votes
              };
            }
            return it;
          })
        );
        setRateModalItem(null);
      }
    } catch (err) {
      // One vote per account, saved on the server (settings/ranking_votes).
      if (err?.status === 401) {
        setRateModalItem(null);
        pushToast(lang === 'ar' ? 'سجّل دخولك الأول عشان تقيّم' : 'Sign in to rate', 'info');
        onOpenAuth?.('login');
      } else if (err?.code === 'network') {
        pushToast(lang === 'ar' ? 'مفيش اتصال — جرّب تاني' : 'No connection — try again', 'error');
      } else {
        pushToast(lang === 'ar' ? 'التقييم ما اتحفظش — جرّب كمان شوية' : 'Your rating was not saved — try again later', 'error');
      }
    } finally {
      setRatingSubmitting(false);
    }
  };

  return (
    <section className="section" id="rankings-section" style={{ position: 'relative' }}>
      {/* Section Header */}
      <div className="section__head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBlockEnd: '0.35rem' }}>
            <span style={{ fontSize: '1.45rem' }}>🏆</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: 'linear-gradient(90deg, #eab308, #f59e0b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block'
              }}
            >
              Community Leaderboard
            </span>
          </div>
          <h2 className="section__title">{t('rankings.title')}</h2>
          <p className="section__sub">{t('rankings.sub')}</p>
        </div>

        {/* View Mode & Metric Toggles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          {/* Chart View Toggle */}
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('bar')}
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'bar' ? 'linear-gradient(135deg, #22d3ee, #8b5cf6)' : 'transparent',
                color: viewMode === 'bar' ? '#fff' : 'var(--ink-dim)'
              }}
            >
              📊 {t('rankings.viewBar')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('radar')}
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'radar' ? 'linear-gradient(135deg, #22d3ee, #8b5cf6)' : 'transparent',
                color: viewMode === 'radar' ? '#fff' : 'var(--ink-dim)'
              }}
            >
              🕸️ {t('rankings.viewRadar')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('area')}
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'area' ? 'linear-gradient(135deg, #22d3ee, #8b5cf6)' : 'transparent',
                color: viewMode === 'area' ? '#fff' : 'var(--ink-dim)'
              }}
            >
              📈 {t('rankings.viewArea')}
            </button>
          </div>

          {/* Metric Selector */}
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <button
              type="button"
              onClick={() => setMetric('score')}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                background: metric === 'score' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: metric === 'score' ? '#22d3ee' : 'var(--ink-dim)'
              }}
            >
              ⭐ {t('rankings.metricScore')}
            </button>
            <button
              type="button"
              onClick={() => setMetric('popularity')}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                background: metric === 'popularity' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: metric === 'popularity' ? '#22d3ee' : 'var(--ink-dim)'
              }}
            >
              🔥 {t('rankings.metricPopularity')}
            </button>
          </div>
        </div>
      </div>

      {/* Genre Filter Chips */}
      <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={() => setSelectedGenre('all')}
          style={{
            padding: '0.32rem 0.85rem',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: selectedGenre === 'all' ? '1px solid #22d3ee' : '1px solid rgba(255, 255, 255, 0.12)',
            background: selectedGenre === 'all' ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255, 255, 255, 0.04)',
            color: selectedGenre === 'all' ? '#22d3ee' : 'var(--ink-dim)',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {t('rankings.filterAll')}
        </button>
        {availableGenres.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setSelectedGenre(g)}
            style={{
              padding: '0.32rem 0.85rem',
              borderRadius: '999px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: selectedGenre.toLowerCase() === g.toLowerCase() ? '1px solid #22d3ee' : '1px solid rgba(255, 255, 255, 0.12)',
              background: selectedGenre.toLowerCase() === g.toLowerCase() ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: selectedGenre.toLowerCase() === g.toLowerCase() ? '#22d3ee' : 'var(--ink-dim)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonGrid count={6} height={220} />
      ) : error || items.length === 0 ? (
        <div className="glass" style={{ padding: '1.5rem' }}>
          <EmptyState icon="🏆" title={t('rankings.title')} sub={error || 'No ranking data available'}>
            <button type="button" className="btn btn--ghost" onClick={fetchRankings}>
              {t('common.retry')}
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Interactive Visual Chart Card */}
          <div
            className="glass"
            style={{
              padding: '1.25rem',
              marginBottom: '2rem',
              borderRadius: '18px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.08) 0%, rgba(10, 12, 22, 0.85) 75%)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>📊</span>
                <span style={{ fontWeight: 700, fontSize: '0.96rem', color: '#fff' }}>
                  {t('rankings.chartTitle')} — {metric === 'score' ? t('rankings.metricScore') : t('rankings.metricPopularity')}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
                Top {chartData.length} Anime
              </span>
            </div>

            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 25 }}>
                    <defs>
                      <linearGradient id="rankingBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                        <stop offset="60%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#f472b6" stopOpacity={0.4} />
                      </linearGradient>
                      <linearGradient id="goldBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#facc15" stopOpacity={1} />
                        <stop offset="100%" stopColor="#ca8a04" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="var(--ink-dim)"
                      tick={{ fill: 'var(--ink-dim)', fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="var(--ink-dim)"
                      tick={{ fill: 'var(--ink-dim)', fontSize: 11 }}
                      domain={metric === 'score' ? [70, 100] : [0, 'auto']}
                    />
                    <Tooltip content={<CustomTooltip lang={lang} />} />
                    <Bar
                      dataKey={metric === 'score' ? 'score' : 'popularity'}
                      radius={[6, 6, 0, 0]}
                      animationDuration={800}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${entry.id}`}
                          fill={index === 0 ? 'url(#goldBarGrad)' : 'url(#rankingBarGrad)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : viewMode === 'radar' ? (
                  <RadarChart data={chartData.slice(0, 6)} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="name" stroke="var(--ink-dim)" tick={{ fill: '#fff', fontSize: 11 }} />
                    <PolarRadiusAxis stroke="var(--ink-dim)" domain={[75, 100]} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#22d3ee"
                      fill="#8b5cf6"
                      fillOpacity={0.45}
                    />
                    <Tooltip content={<CustomTooltip lang={lang} />} />
                  </RadarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 25 }}>
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="name"
                      stroke="var(--ink-dim)"
                      tick={{ fill: 'var(--ink-dim)', fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="var(--ink-dim)"
                      tick={{ fill: 'var(--ink-dim)', fontSize: 11 }}
                      domain={metric === 'score' ? [70, 100] : [0, 'auto']}
                    />
                    <Tooltip content={<CustomTooltip lang={lang} />} />
                    <Area
                      type="monotone"
                      dataKey={metric === 'score' ? 'score' : 'popularity'}
                      stroke="#22d3ee"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#areaGradient)"
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Series Cards & Leaderboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {filteredItems.map((anime, idx) => {
              const rank = anime.rank || idx + 1;
              const isPodium = rank <= 3;
              const trophy = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
              const title = (lang === 'ar' && anime.titleArabic) ? anime.titleArabic : (anime.titleEnglish || anime.titleRomaji);

              return (
                <div
                  key={anime.id}
                  className="glass"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '16px',
                    padding: '1rem',
                    border: isPodium
                      ? rank === 1
                        ? '1px solid rgba(234, 179, 8, 0.4)'
                        : rank === 2
                        ? '1px solid rgba(148, 163, 184, 0.35)'
                        : '1px solid rgba(217, 119, 6, 0.35)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    background: rank === 1
                      ? 'linear-gradient(145deg, rgba(234, 179, 8, 0.06), rgba(10, 12, 22, 0.9))'
                      : 'rgba(255, 255, 255, 0.03)',
                    position: 'relative',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.85rem' }}>
                    {/* Poster + Rank Pill */}
                    <div style={{ position: 'relative', width: '84px', height: '118px', flexShrink: 0, borderRadius: '10px', overflow: 'hidden' }}>
                      <img onError={imgFallback}
                        src={anime.coverUrl}
                        alt={title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          insetInlineStart: '6px',
                          background: rank === 1 ? 'linear-gradient(135deg, #facc15, #ca8a04)' : rank === 2 ? '#94a3b8' : rank === 3 ? '#d97706' : 'rgba(0,0,0,0.75)',
                          color: rank <= 3 ? '#000' : '#fff',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        {trophy}
                      </div>
                    </div>

                    {/* Anime Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          margin: '0 0 0.35rem',
                          fontSize: '0.98rem',
                          fontWeight: 700,
                          color: '#fff',
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={title}
                      >
                        {title}
                      </h4>

                      {/* Community Score Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <span
                          style={{
                            background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.18), rgba(139, 92, 246, 0.18))',
                            border: '1px solid rgba(34, 211, 238, 0.35)',
                            color: '#22d3ee',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          ⭐ {anime.scoreTen != null ? anime.scoreTen : '—'}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--ink-dim)' }}>
                          / 10
                        </span>
                      </div>

                      {/* Votes & Episodes */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-dim)', marginBottom: '0.45rem' }}>
                        👥 {Number(anime.votesCount || 0).toLocaleString()} {t('rankings.votes')}
                        {anime.communityScore != null && ` · ★ ${(anime.communityScore / 10).toFixed(1)}`}
                        {anime.episodes ? ` · ${anime.episodes} ${t('common.episodes')}` : ''}
                      </div>

                      {/* Mini Rating Breakdown Visual Bar */}
                      {Array.isArray(anime.distribution) && anime.distribution.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            height: '5px',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            background: 'rgba(255,255,255,0.08)',
                            marginBottom: '0.5rem'
                          }}
                          title={`5★: ${anime.distribution[0]?.percent}% | 4★: ${anime.distribution[1]?.percent}% | 3★: ${anime.distribution[2]?.percent}%`}
                        >
                          <div style={{ width: `${anime.distribution[0]?.percent || 70}%`, background: '#22d3ee' }} />
                          <div style={{ width: `${anime.distribution[1]?.percent || 20}%`, background: '#8b5cf6' }} />
                          <div style={{ width: `${anime.distribution[2]?.percent || 10}%`, background: '#f472b6' }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Stream or Rate */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => navigate(`/browse?q=${encodeURIComponent(anime.titleEnglish || anime.titleRomaji || '')}`)}
                    >
                      ▶️ {t('common.watchNow')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', color: '#facc15' }}
                      onClick={() => {
                        if (!user) {
                          onOpenAuth?.('login');
                          return;
                        }
                        setRateModalItem(anime);
                        setSelectedRating(10);
                      }}
                    >
                      ⭐ {t('rankings.rateThis')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Community Rating Modal */}
      {rateModalItem && (
        <div
          className="modal-backdrop"
          onClick={() => setRateModalItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(4, 5, 12, 0.85)',
            backdropFilter: 'blur(10px)',
            padding: '1rem'
          }}
        >
          <div
            className="glass"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '1.75rem',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: '#0d101d',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
              direction: lang === 'ar' ? 'rtl' : 'ltr'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>⭐ {t('rankings.rateThis')}</h3>
              <button
                type="button"
                onClick={() => setRateModalItem(null)}
                style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', fontSize: '1.4rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.85rem', marginBottom: '1.25rem', alignItems: 'center' }}>
              {rateModalItem.coverUrl && (
                <img onError={imgFallback}
                  src={rateModalItem.coverUrl}
                  alt={rateModalItem.titleEnglish}
                  style={{ width: '50px', height: '72px', objectFit: 'cover', borderRadius: '8px' }}
                />
              )}
              <div>
                <strong style={{ fontSize: '1rem', color: '#fff' }}>
                  {(lang === 'ar' && rateModalItem.titleArabic) ? rateModalItem.titleArabic : (rateModalItem.titleEnglish || rateModalItem.titleRomaji)}
                </strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--cyan)', marginTop: '0.2rem' }}>
                  {rateModalItem.communityScore != null
                    ? `${lang === 'ar' ? 'متوسط الأعضاء' : 'Members’ average'}: ${(rateModalItem.communityScore / 10).toFixed(1)} / 10 (${rateModalItem.votesCount})`
                    : lang === 'ar'
                    ? 'لسه محدش من الأعضاء قيّمه'
                    : 'No member votes yet'}
                </div>
              </div>
            </div>

            <form onSubmit={handleRatingSubmit}>
              <label style={{ display: 'block', fontSize: '0.86rem', color: 'var(--ink-dim)', marginBottom: '0.5rem' }}>
                {t('rankings.yourRating')} (1 - 10): <span style={{ color: '#facc15', fontWeight: 800, fontSize: '1.1rem' }}>{selectedRating} ★</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={selectedRating}
                onChange={(e) => setSelectedRating(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '1.25rem', accentColor: '#22d3ee' }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setSelectedRating(star)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      border: selectedRating === star ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedRating >= star ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: selectedRating >= star ? '#facc15' : 'var(--ink-dim)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {star}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => setRateModalItem(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  disabled={ratingSubmitting}
                >
                  <span className="btn__shine" />
                  {ratingSubmitting ? t('common.loading') : t('rankings.submitRating')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
