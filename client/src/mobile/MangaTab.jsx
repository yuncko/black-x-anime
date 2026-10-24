import React from 'react';
import MangaPageImage from './MangaPageImage.jsx';
import BxIcon from './BxIcon.jsx';
import { haptic } from './haptics.js';
import { SkeletonGrid, SkeletonList } from './Skeleton.jsx';
import PosterCard from './PosterCard.jsx';
import { mangaServerLabel } from './bxServers.js';

/**
 * MangaTab: moved out of MobileApkApp.jsx unchanged (2026-10-17 split). It only renders —
 * the state and the actions stay in MobileApkApp and come in as props.
 */
export default function MangaTab({
  activeMangaChapter,
  autoScrollSpeed,
  currentPageIdx,
  dataSaver,
  displayedMangaChapters,
  dualPageSpread,
  handleBookmarkCurrentPanel,
  handleCycleReadingBgm,
  handleLoadMoreManga,
  handleOpenManga,
  handleReadMangaChapter,
  handleSaveChapterOffline,
  handleToggleSpeakText,
  isRtl,
  loadingMoreManga,
  mangaActiveServer,
  mangaChAsc,
  mangaChSearch,
  mangaChapters,
  mangaChaptersError,
  mangaChaptersLoading,
  mangaFilterCount,
  mangaFilterSummary,
  mangaFilterType,
  mangaHistory,
  mangaList,
  mangaLoading,
  mangaPage,
  mangaPages,
  mangaPagesError,
  mangaPagesLoading,
  mangaPopularTitles,
  mangaQuery,
  mangaReaderContainerRef,
  mangaServers,
  mangaSource,
  offlineChapters,
  pageCls,
  prefetchedChapterRef,
  readProgressPct,
  readerEyeFilter,
  readerHudVisible,
  readerMode,
  readerSettingsOpen,
  readerZoom,
  readingBgmMode,
  savingOfflineChapter,
  seamlessStitch,
  selectedManga,
  setActiveMangaChapter,
  setAutoScrollSpeed,
  setCurrentPageIdx,
  setDualPageSpread,
  setFilterSheetOpen,
  setMangaChAsc,
  setMangaChSearch,
  setMangaQuery,
  setReadProgressPct,
  setReaderEyeFilter,
  setReaderHudVisible,
  setReaderMode,
  setReaderSettingsOpen,
  setReaderTouchPaused,
  setReaderZoom,
  setSeamlessStitch,
  setSelectedManga,
  setVolumeKeyScroll,
  showToast,
  ttsSpeaking,
  visibleMangaHistory,
  volumeKeyScroll
}) {
  return (
    <main className={activeMangaChapter ? undefined : `${pageCls} bx-manga-page`} style={{ padding: activeMangaChapter ? '0' : '0.85rem 1rem' }}>
      {activeMangaChapter ? (
        <div
          ref={mangaReaderContainerRef}
          className="bx-reader"
          onTouchStart={() => setReaderTouchPaused(true)}
          onTouchEnd={() => setReaderTouchPaused(false)}
          onScroll={(e) => {
            const el = e.currentTarget;
            const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
            const pct = Math.min(100, Math.max(0, Math.round((el.scrollTop / maxScroll) * 100)));
            setReadProgressPct(pct);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9500,
            background: '#000000',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 0,
            margin: 0
          }}
        >
          {/* Floating Auto-Hiding Pro Manga/Webtoon Reader Control Bar (Tap page once to toggle HUD) */}
          {readerHudVisible && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9600,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.42rem',
                padding: '0.65rem 0.8rem',
                background: 'rgba(0, 0, 0, 0.92)',
                borderBottom: '1px solid rgba(255,255,255,0.16)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <button
                  type="button"
                  className="bx-icon-btn bx-icon-btn-sm"
                  aria-label={isRtl ? 'رجوع للفصول' : 'Back to chapters'}
                  onClick={() => {
                    setAutoScrollSpeed(0);
                    setActiveMangaChapter(null);
                  }}
                >
                  <BxIcon name={isRtl ? 'arrow-right' : 'arrow-left'} />
                </button>

                {/* Quick Chapter Jump Dropdown */}
                <select
                  value={activeMangaChapter.id}
                  onChange={(e) => {
                    const target = mangaChapters.find((c) => c.id === e.target.value);
                    if (target) handleReadMangaChapter(target);
                  }}
                  aria-label={isRtl ? 'اختار الفصل' : 'Choose chapter'}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: '40px',
                    padding: '0 0.6rem',
                    borderRadius: '12px',
                    background: '#000',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontWeight: 600,
                    fontSize: '0.8125rem'
                  }}
                >
                  {mangaChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isRtl ? `الفصل ${c.chapter}` : `Ch. ${c.chapter}`}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="bx-icon-btn bx-icon-btn-sm"
                  aria-label={isRtl ? 'احفظ اللوحة دي' : 'Save this panel'}
                  onClick={handleBookmarkCurrentPanel}
                >
                  <BxIcon name="bookmark" />
                </button>

                <button
                  type="button"
                  className={`bx-icon-btn bx-icon-btn-sm${readerSettingsOpen ? ' is-on' : ''}`}
                  aria-label={isRtl ? 'إعدادات القراءة' : 'Reader settings'}
                  aria-expanded={readerSettingsOpen}
                  onClick={() => setReaderSettingsOpen((v) => !v)}
                >
                  <BxIcon name="settings" />
                </button>
              </div>

              {/* Clean Collapsible Reader Studio Drawer (Opens only when الإعدادات is tapped) */}
              {readerSettingsOpen && (
                <div
                  style={{
                    marginTop: '0.35rem',
                    padding: '0.65rem',
                    borderRadius: '12px',
                    background: '#09090d',
                    border: '1px solid rgba(255,255,255,0.18)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '0.4rem'
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCycleReadingBgm}
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: readingBgmMode !== 'off' ? '#ffffff' : 'rgba(255,255,255,0.1)',
                      color: readingBgmMode !== 'off' ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <BxIcon name="headphones" className="bx-ico-lead" />
                    {isRtl
                      ? `موسيقى: ${readingBgmMode === 'drone' ? 'هادية' : readingBgmMode === 'rain' ? 'مطر' : readingBgmMode === 'battle' ? 'حماس' : 'مقفولة'}`
                      : `Music: ${readingBgmMode === 'drone' ? 'calm' : readingBgmMode === 'rain' ? 'rain' : readingBgmMode === 'battle' ? 'epic' : 'off'}`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setReaderMode((m) => (m === 'webtoon' ? 'page' : 'webtoon'))}
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {readerMode === 'webtoon' ? <><BxIcon name="scroll" className="bx-ico-lead" />{isRtl ? 'عرض طولي' : 'Vertical'}</> : <><BxIcon name="file" className="bx-ico-lead" />{isRtl ? 'صفحة صفحة' : 'Pages'}</>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setReaderZoom((z) => (z === 100 ? 125 : z === 125 ? 150 : z === 150 ? 200 : 100))}
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: readerZoom > 100 ? '#ffffff' : 'rgba(255,255,255,0.1)',
                      color: readerZoom > 100 ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <BxIcon name="search" className="bx-ico-lead" />تكبير: {readerZoom}%
                  </button>

                  {readerMode === 'page' && (
                    <button
                      type="button"
                      onClick={() => setDualPageSpread((d) => !d)}
                      style={{
                        padding: '0.42rem 0.6rem',
                        borderRadius: '8px',
                        background: dualPageSpread ? '#ffffff' : 'rgba(255,255,255,0.1)',
                        color: dualPageSpread ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="book" className="bx-ico-lead" />{dualPageSpread ? 'عرض: صفحتين' : 'عرض: صفحة واحدة'}
                    </button>
                  )}

                  {readerMode === 'webtoon' && (
                    <button
                      type="button"
                      onClick={() => {
                        const speeds = [0, 0.5, 1, 2, 3.5, 5];
                        const next = speeds[(speeds.indexOf(autoScrollSpeed) + 1) % speeds.length];
                        setAutoScrollSpeed(next);
                      }}
                      style={{
                        padding: '0.42rem 0.6rem',
                        borderRadius: '8px',
                        background: autoScrollSpeed > 0 ? '#ffffff' : 'rgba(255,255,255,0.1)',
                        color: autoScrollSpeed > 0 ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="arrow-down" className="bx-ico-lead" />{autoScrollSpeed === 0 ? 'تمرير تلقائي: إيقاف' : `تمرير تلقائي: ${autoScrollSpeed}x`}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setVolumeKeyScroll((v) => !v)}
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: volumeKeyScroll ? '#ffffff' : 'rgba(255,255,255,0.1)',
                      color: volumeKeyScroll ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <BxIcon name="volume" className="bx-ico-lead" />أزرار الصوت: {volumeKeyScroll ? 'تمرير' : 'صوت'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setReaderEyeFilter((f) => (f === 'normal' ? 'warm' : f === 'warm' ? 'contrast' : 'normal'))
                    }
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: readerEyeFilter !== 'normal' ? '#ffffff' : 'rgba(255,255,255,0.1)',
                      color: readerEyeFilter !== 'normal' ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {readerEyeFilter === 'normal'
                      ? <><BxIcon name="eye" className="bx-ico-lead" />{"ألوان أصلية"}</>
                      : readerEyeFilter === 'warm'
                      ? <><BxIcon name="moon" className="bx-ico-lead" />{"حماية العين"}</>
                      : <><BxIcon name="zap" className="bx-ico-lead" />{"تباين فائق"}</>}
                  </button>

                  {readerMode === 'webtoon' && (
                    <button
                      type="button"
                      onClick={() => setSeamlessStitch((s) => !s)}
                      style={{
                        padding: '0.42rem 0.6rem',
                        borderRadius: '8px',
                        background: seamlessStitch ? '#ffffff' : 'rgba(255,255,255,0.1)',
                        color: seamlessStitch ? '#000000' : '#ffffff',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <BxIcon name="scissors" className="bx-ico-lead" />دمج الشرائح: {seamlessStitch ? 'مفعل' : 'عادي'}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={savingOfflineChapter}
                    onClick={handleSaveChapterOffline}
                    style={{
                      padding: '0.42rem 0.6rem',
                      borderRadius: '8px',
                      background: offlineChapters.some((x) => x.id === activeMangaChapter.id)
                        ? '#ffffff'
                        : 'rgba(255,255,255,0.12)',
                      color: offlineChapters.some((x) => x.id === activeMangaChapter.id) ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.22)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {savingOfflineChapter
                      ? <><BxIcon name="loader" />{"..."}</>
                      : offlineChapters.some((x) => x.id === activeMangaChapter.id)
                      ? <><BxIcon name="check" className="bx-ico-lead" />{"محفوظ بدون نت"}</>
                      : <><BxIcon name="download" className="bx-ico-lead" />{"حفظ الفصل بدون نت"}</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {mangaPagesLoading ? (
            <div style={{ textAlign: 'center', padding: '6rem 1.5rem', color: 'rgba(255,255,255,0.6)' }}>
              {isRtl ? <><BxIcon name="loader" className="bx-ico-lead" />{"بيحمّل صفحات الفصل..."}</> : <><BxIcon name="loader" className="bx-ico-lead" />{"Loading fullscreen chapter pages..."}</>}
            </div>
          ) : mangaPages.length === 0 ? (
            <div
              style={{
                minHeight: '70vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.8rem',
                padding: '2rem 1.4rem',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.78)',
                fontSize: '0.9375rem',
                fontWeight: 600,
                lineHeight: 1.6
              }}
            >
              <div>
                {mangaPagesError === 'network'
                  ? isRtl
                    ? 'تعذّر الاتصال بسيرفرات Hearbor — تأكد من الإنترنت ثم أعد المحاولة.'
                    : 'Could not reach the Hearbor servers — check your connection and retry.'
                  : isRtl
                    ? `مفيش صفحات للفصل ده على ${mangaServerLabel(activeMangaChapter?.server || mangaActiveServer)} دلوقتي — جرّب سيرفر تاني`
                    : `No pages for this chapter on ${mangaServerLabel(activeMangaChapter?.server || mangaActiveServer)} right now — try another server on the title page.`}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeMangaChapter) return;
                    delete prefetchedChapterRef.current[activeMangaChapter.id];
                    handleReadMangaChapter(activeMangaChapter);
                  }}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '999px',
                    background: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? <><BxIcon name="retry" className="bx-ico-lead" />{"إعادة المحاولة"}</> : <><BxIcon name="retry" className="bx-ico-lead" />{"Retry"}</>}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMangaChapter(null)}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? <><BxIcon name="arrow-right" className="bx-ico-lead" />{"قائمة الفصول والسيرفرات"}</> : <><BxIcon name="arrow-left" className="bx-ico-lead" />{"Chapters & servers"}</>}
                </button>
              </div>
            </div>
          ) : readerMode === 'page' && mangaPages.length > 0 ? (
            <div style={{ textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div
                onDoubleClick={() => {
                  const nextZ = readerZoom === 100 ? 200 : 100;
                  setReaderZoom(nextZ);
                  showToast(nextZ === 200 ? 'تكبير اللوحة 200%' : 'الحجم الطبيعي 100%', 'search');
                }}
                style={{
                  overflowX: 'auto',
                  display: dualPageSpread ? 'grid' : 'block',
                  gridTemplateColumns: dualPageSpread ? '1fr 1fr' : 'none',
                  gap: '2px',
                  alignItems: 'center'
                }}
              >
                <MangaPageImage
                  isRtl={isRtl}
                  loading="eager"
                  src={mangaPages[currentPageIdx]}
                  alt={isRtl ? `الصفحة ${currentPageIdx + 1}` : `Page ${currentPageIdx + 1}`}
                  onClick={() => {
                    if (currentPageIdx + (dualPageSpread ? 2 : 1) < mangaPages.length)
                      setCurrentPageIdx((p) => p + (dualPageSpread ? 2 : 1));
                    else setReaderHudVisible((v) => !v);
                  }}
                  style={{
                    width: `${readerZoom}%`,
                    maxWidth: readerZoom === 100 ? '100%' : 'none',
                    height: 'auto',
                    display: 'block',
                    margin: '0 auto',
                    cursor: 'pointer',
                    filter:
                      readerEyeFilter === 'warm'
                        ? 'sepia(0.24) brightness(0.92)'
                        : readerEyeFilter === 'contrast'
                        ? 'contrast(1.16) saturate(1.12)'
                        : 'none'
                  }}
                />
                {dualPageSpread && mangaPages[currentPageIdx + 1] && (
                  <MangaPageImage
                    isRtl={isRtl}
                    loading="eager"
                    src={mangaPages[currentPageIdx + 1]}
                    alt={isRtl ? `الصفحة ${currentPageIdx + 2}` : `Page ${currentPageIdx + 2}`}
                    onClick={() => {
                      if (currentPageIdx + 2 < mangaPages.length) setCurrentPageIdx((p) => p + 2);
                      else setReaderHudVisible((v) => !v);
                    }}
                    style={{
                      width: `${readerZoom}%`,
                      maxWidth: readerZoom === 100 ? '100%' : 'none',
                      height: 'auto',
                      display: 'block',
                      margin: '0 auto',
                      cursor: 'pointer',
                      filter:
                        readerEyeFilter === 'warm'
                          ? 'sepia(0.24) brightness(0.92)'
                          : readerEyeFilter === 'contrast'
                          ? 'contrast(1.16) saturate(1.12)'
                          : 'none'
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 0.75rem' }}>
                <button
                  type="button"
                  disabled={currentPageIdx === 0}
                  onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? <><BxIcon name="arrow-right" className="bx-ico-lead" />{"الصفحة السابقة"}</> : <><BxIcon name="arrow-left" className="bx-ico-lead" />{"Prev Page"}</>}
                </button>
                <span style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                  {currentPageIdx + 1} / {mangaPages.length}
                </span>
                <button
                  type="button"
                  disabled={currentPageIdx + 1 >= mangaPages.length}
                  onClick={() => setCurrentPageIdx((p) => Math.min(mangaPages.length - 1, p + 1))}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#000',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? <>{"الصفحة التالية"}<BxIcon name="arrow-left" className="bx-ico-trail" /></> : <>{"Next Page"}<BxIcon name="arrow-right" className="bx-ico-trail" /></>}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setReaderHudVisible((v) => !v)}
              onDoubleClick={() => {
                const nextZ = readerZoom === 100 ? 200 : 100;
                setReaderZoom(nextZ);
                showToast(nextZ === 200 ? 'تكبير اللوحة 200%' : 'الحجم الطبيعي 100%', 'search');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                width: '100vw',
                overflowX: 'auto',
                lineHeight: 0,
                fontSize: '0.75rem'
              }}
            >
              {mangaPages.map((pg, idx) => (
                <MangaPageImage
                  key={`${idx}-${pg}`}
                  isRtl={isRtl}
                  src={pg}
                  alt={isRtl ? `الصفحة ${idx + 1}` : `Page ${idx + 1}`}
                  loading="lazy"
                      decoding="async"
                  style={{
                    width: `${readerZoom}%`,
                    maxWidth: readerZoom === 100 ? '100vw' : 'none',
                    height: 'auto',
                    display: 'block',
                    margin: seamlessStitch && idx > 0 ? '-1px auto 0' : '0 auto',
                    filter:
                      readerEyeFilter === 'warm'
                        ? 'sepia(0.24) brightness(0.92)'
                        : readerEyeFilter === 'contrast'
                        ? 'contrast(1.16) saturate(1.12)'
                        : 'none'
                  }}
                />
              ))}
            </div>
          )}

          {/* Micro Progress Bar & Reading ETA Indicator at Bottom of Reader */}
          {!mangaPagesLoading && mangaPages.length > 0 && (
            <>
              <div
                style={{
                  position: 'fixed',
                  bottom: '10px',
                  left: '12px',
                  zIndex: 9650,
                  padding: '0.22rem 0.6rem',
                  borderRadius: '999px',
                  background: 'rgba(0,0,0,0.82)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  pointerEvents: 'none'
                }}
              >
                {(() => {
                  const pct =
                    readerMode === 'page'
                      ? Math.round(((currentPageIdx + 1) / Math.max(1, mangaPages.length)) * 100)
                      : readProgressPct;
                  const remMin = Math.max(
                    1,
                    Math.ceil(((100 - pct) / 100) * Math.max(2, Math.round(mangaPages.length * 0.18)))
                  );
                  return isRtl
                    ? `${pct}% • متبقي ~${pct >= 98 ? 0 : remMin} د`
                    : `${pct}% • ~${pct >= 98 ? 0 : remMin}m left`;
                })()}
              </div>
              <div
                style={{
                  position: 'fixed',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: 'rgba(255,255,255,0.14)',
                  zIndex: 9650,
                  pointerEvents: 'none'
                }}
              >
                <div
                  style={{
                    width: `${
                      readerMode === 'page'
                        ? Math.round(((currentPageIdx + 1) / Math.max(1, mangaPages.length)) * 100)
                        : readProgressPct
                    }%`,
                    height: '100%',
                    background: '#ffffff',
                    transition: 'width 0.15s ease-out'
                  }}
                />
              </div>
            </>
          )}

          {/* Bottom Next / Previous Chapter Navigation Bar */}
          {!mangaPagesLoading && mangaChapters.length > 1 && (
            <div style={{ display: 'flex', gap: '0.6rem', padding: '1rem 0.75rem 2.5rem', background: '#000' }}>
              {(() => {
                const idx = mangaChapters.findIndex((c) => c.id === activeMangaChapter.id);
                const prevCh = idx > 0 ? mangaChapters[idx - 1] : null;
                const nextCh = idx !== -1 && idx + 1 < mangaChapters.length ? mangaChapters[idx + 1] : null;
                return (
                  <>
                    {prevCh && (
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          handleReadMangaChapter(prevCh);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="skip-back" className="bx-ico-lead" />{isRtl ? `الفصل ${prevCh.chapter}` : `Ch. ${prevCh.chapter}`}
                      </button>
                    )}
                    {nextCh && (
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          handleReadMangaChapter(nextCh);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          borderRadius: '12px',
                          background: '#ffffff',
                          border: 'none',
                          color: '#000',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          cursor: 'pointer'
                        }}
                      >
                        <BxIcon name="skip-forward" className="bx-ico-lead" />{isRtl ? `الفصل ${nextCh.chapter}` : `Ch. ${nextCh.chapter}`}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      ) : selectedManga ? (
        <div className="bx-page">
          {/* ==================== v12.0 SLOTH-UI & SOLO LEVELING LUXURY MANGA SERIES HUB ==================== */}
          <div
            style={{
              position: 'relative',
              borderRadius: '18px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.16)',
              marginBottom: '1rem',
              background: '#08080c',
              boxShadow: '0 22px 55px rgba(0,0,0,0.92)'
            }}
          >
            {/* Top Ambient Blurred Backdrop Banner */}
            <div style={{ position: 'relative', height: '165px', overflow: 'hidden' }}>
              <img
                src={selectedManga.poster?.large || selectedManga.poster_uri}
                alt={selectedManga.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'blur(22px) brightness(0.32)',
                  transform: 'scale(1.2)'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, #08080c 100%)'
                }}
              />

              {/* Top Floating Circular Back Button & [X] Original Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedManga(null)}
                  style={{
                    background: 'rgba(14,14,20,0.82)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.24)',
                    borderRadius: '999px',
                    padding: '0.42rem 0.9rem',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {isRtl ? <><BxIcon name="arrow-right" className="bx-ico-lead" />{"مكتبة المانجا"}</> : <><BxIcon name="arrow-left" className="bx-ico-lead" />{"Manga Library"}</>}
                </button>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.38rem', padding: '0.28rem 0.7rem', borderRadius: '999px', background: 'rgba(14,14,20,0.82)', border: '1px solid rgba(255,255,255,0.22)' }}>
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      color: '#000000',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    X
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    {mangaActiveServer ? mangaServerLabel(mangaActiveServer) : selectedManga.sourceLabel || 'Hearbor MANGA'}
                  </span>
                </div>
              </div>
            </div>

            {/* Solo Leveling Floating Cover Art overlapping the Dark Sheet */}
            <div style={{ position: 'relative', zIndex: 2, padding: '0 1.1rem 1.15rem', marginTop: '-92px', textAlign: 'center' }}>
              <div
                style={{
                  width: '136px',
                  height: '194px',
                  margin: '0 auto 0.75rem',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.38)',
                  boxShadow: '0 18px 42px rgba(0,0,0,0.92)'
                }}
              >
                <img
                  src={selectedManga.poster?.large || selectedManga.poster_uri}
                  alt={selectedManga.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <h2 style={{ margin: '0 0 0.32rem', fontSize: '1.375rem', fontWeight: 800, lineHeight: 1.25 }}>
                {selectedManga.name}
              </h2>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={{ padding: '0.18rem 0.65rem', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700 }}>
                  {selectedManga.type || (isRtl ? 'مانجا / مانهوا' : 'Manga / Manhwa')}
                </span>
                {selectedManga.rate && (
                  <span style={{ padding: '0.18rem 0.65rem', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700 }}>
                    <BxIcon name="star" className="bx-ico-lead" />{selectedManga.rate}
                  </span>
                )}
              </div>

              {/* 4-Column Manga Micro-Stats Strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.35rem',
                  padding: '0.6rem 0.4rem',
                  marginBottom: '0.8rem',
                  borderRadius: '18px',
                  background: '#0d0d13',
                  border: '1px solid rgba(255,255,255,0.12)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{mangaChaptersLoading ? '…' : mangaChapters.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{isRtl ? 'فصل متاح' : 'Chapters'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{selectedManga.rate ? <><BxIcon name="star" className="bx-ico-lead" />{selectedManga.rate}</> : '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{isRtl ? 'التقييم' : 'Rating'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    {selectedManga.status === 'completed'
                      ? isRtl
                        ? 'مكتمل'
                        : 'Completed'
                      : selectedManga.status === 'ongoing'
                        ? isRtl
                          ? 'مستمر'
                          : 'Ongoing'
                        : '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{isRtl ? 'الحالة' : 'Status'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{mangaActiveServer ? mangaServerLabel(mangaActiveServer).replace('Hearbor ', 'BX ') : '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{isRtl ? 'السيرفر' : 'Server'}</div>
                </div>
              </div>

              {/* Servers for this title: the same list the website library modal shows */}
              {mangaServers.length > 0 && (
                <div style={{ marginBottom: '0.85rem', textAlign: isRtl ? 'right' : 'left' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '0.4rem' }}>
                    <BxIcon name="satellite" className="bx-ico-lead" />{isRtl ? 'سيرفرات العمل ده:' : 'Servers for this title:'}
                  </div>
                  <div className="bx-mob-scroll" style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
                    {mangaServers.map((srv) => {
                      const active = srv.id === mangaActiveServer;
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          disabled={mangaChaptersLoading}
                          onClick={() => {
                            if (!active) handleOpenManga(selectedManga, srv.id);
                          }}
                          style={{
                            padding: '0.38rem 0.8rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            background: active ? '#ffffff' : 'rgba(255,255,255,0.06)',
                            color: active ? '#000000' : '#ffffff',
                            border: active ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.16)'
                          }}
                        >
                          {isRtl ? srv.ar : srv.en}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Synopsis Box with Audio Narrator (Matches MANGARA & Solo Leveling Description Box) */}
              <div
                style={{
                  textAlign: isRtl ? 'right' : 'left',
                  padding: '0.75rem 0.85rem',
                  borderRadius: '18px',
                  background: '#0d0d13',
                  border: '1px solid rgba(255,255,255,0.1)',
                  marginBottom: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    <BxIcon name="book" className="bx-ico-lead" />{isRtl ? 'القصة' : 'Description'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleSpeakText(
                        selectedManga.story_ar || selectedManga.story?.ar || selectedManga.story_en || selectedManga.name
                      )
                    }
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      background: ttsSpeaking ? '#ffffff' : 'rgba(255,255,255,0.12)',
                      color: ttsSpeaking ? '#000000' : '#ffffff',
                      border: '1px solid rgba(255,255,255,0.22)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {ttsSpeaking ? (isRtl ? <><BxIcon name="mute" className="bx-ico-lead" />{"إيقاف"}</> : <><BxIcon name="mute" className="bx-ico-lead" />{"Stop"}</>) : isRtl ? <><BxIcon name="volume" className="bx-ico-lead" />{"استماع"}</> : <><BxIcon name="volume" className="bx-ico-lead" />{"Listen"}</>}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.76)', lineHeight: 1.55 }}>
                  {(selectedManga.story_ar || selectedManga.story?.ar || selectedManga.story_en || (isRtl ? 'عمل مانهوا ومانجا حصري مترجم بالكامل بجودة عالية عبر سيرفرات Hearbor.' : 'Exclusive translated Manga & Manhwa series on Hearbor.')).slice(0, 280)}
                </p>
              </div>

              {/* SlothUI Full-Width Pill Primary Read CTA Button */}
              {mangaChapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const savedHist = mangaHistory.find((mh) => mh.mangaId === selectedManga.objectID);
                    const targetCh =
                      (savedHist && mangaChapters.find((c) => c.id === savedHist.chapterId || String(c.chapter) === String(savedHist.chapter))) ||
                      mangaChapters[mangaChapters.length - 1] ||
                      mangaChapters[0];
                    if (targetCh) handleReadMangaChapter(targetCh);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.82rem 1rem',
                    borderRadius: '999px',
                    border: 'none',
                    background: '#ffffff',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 10px 28px rgba(255,255,255,0.2)',
                    cursor: 'pointer'
                  }}
                >
                  <span><BxIcon name="book" /></span>
                  <span>
                    {(() => {
                      const savedHist = mangaHistory.find((mh) => mh.mangaId === selectedManga.objectID);
                      if (savedHist) {
                        return isRtl
                          ? `متابعة القراءة — الفصل ${savedHist.chapter}`
                          : `Continue Reading — Chapter ${savedHist.chapter}`;
                      }
                      const firstCh = mangaChapters[mangaChapters.length - 1] || mangaChapters[0];
                      return isRtl
                        ? `ابدأ القراءة الآن — الفصل ${firstCh?.chapter || 1}`
                        : `Read Now — Chapter ${firstCh?.chapter || 1}`;
                    })()}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Highlighted "1 New Chapter / أحدث فصل متاح" Quick Banner Card (Matches 19 Tian Reference UI) */}
          {mangaChapters.length > 0 && (
            <div
              onClick={() => handleReadMangaChapter(mangaChapters[0])}
              style={{
                padding: '0.8rem 0.95rem',
                borderRadius: '18px',
                background: 'rgba(255,255,255,0.08)',
                border: '1.5px solid rgba(255,255,255,0.28)',
                marginBottom: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
                  <BxIcon name="flame" className="bx-ico-lead" />{isRtl ? 'أحدث فصل' : 'Latest Chapter Available'}
                </div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                  <BxIcon name="book" className="bx-ico-lead" />{isRtl ? `الفصل ${mangaChapters[0].chapter}` : `Chapter ${mangaChapters[0].chapter}`}
                </div>
              </div>
              <span
                style={{
                  padding: '0.38rem 0.85rem',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#000000',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}
              >
                {isRtl ? <>{"اقرأ الفصل"}<BxIcon name="arrow-left" className="bx-ico-trail" /></> : <>{"Read"}<BxIcon name="arrow-right" className="bx-ico-trail" /></>}
              </span>
            </div>
          )}

          {/* Chapter Search & Sort Controls */}
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', marginBottom: '0.65rem' }}>
            <input
              type="search"
              value={mangaChSearch}
              onChange={(e) => setMangaChSearch(e.target.value)}
              placeholder={isRtl ? 'ابحث برقم الفصل...' : 'Search chapter #...'}
              style={{
                flex: 1,
                padding: '0.56rem 0.9rem',
                borderRadius: '999px',
                background: '#0d0d12',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setMangaChAsc((v) => !v)}
              style={{
                padding: '0.56rem 0.85rem',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                cursor: 'pointer'
              }}
            >
              {mangaChAsc ? (isRtl ? <><BxIcon name="arrow-up" className="bx-ico-lead" />{"الأقدم أولاً"}</> : <><BxIcon name="arrow-up" className="bx-ico-lead" />{"Oldest"}</>) : isRtl ? <><BxIcon name="download" className="bx-ico-lead" />{"الأحدث أولاً"}</> : <><BxIcon name="download" className="bx-ico-lead" />{"Newest"}</>}
            </button>
          </div>

          {/* MANGARA Table Header Row: Chapter Name <-> Status */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.35rem 0.5rem',
              marginBottom: '0.45rem',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.68)'
            }}
          >
            <span><BxIcon name="book" className="bx-ico-lead" />{isRtl ? `قائمة الفصول (${displayedMangaChapters.length})` : `Chapter Name (${displayedMangaChapters.length})`}</span>
            <span>{isRtl ? 'الحالة / القراءة' : 'Status'}</span>
          </div>

          {mangaChaptersLoading ? (
            <SkeletonList count={6} thumbWidth={56} thumbHeight={56} padding="0" />
          ) : mangaChapters.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '1.4rem 1rem',
                borderRadius: '18px',
                background: '#0c0c11',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.75)',
                fontSize: '0.9375rem',
                fontWeight: 600,
                lineHeight: 1.6
              }}
            >
              <div style={{ marginBottom: '0.7rem' }}>
                {mangaChaptersError === 'network'
                  ? isRtl
                    ? 'تعذّر الاتصال بسيرفرات Hearbor — تأكد من الإنترنت ثم أعد المحاولة.'
                    : 'Could not reach the Hearbor servers — check your connection and retry.'
                  : mangaChaptersError === 'not_found'
                    ? isRtl
                      ? 'لم نجد هذا العمل على سيرفرات Hearbor — ابحث عنه بالاسم من مكتبة المانجا.'
                      : 'This title was not found on the Hearbor servers — search for it in the library.'
                    : isRtl
                      ? 'مفيش فصول على السيرفر ده دلوقتي — جرّب سيرفر تاني من فوق.'
                      : 'No chapters on this server right now — try another server above.'}
              </div>
              <button
                type="button"
                onClick={() => handleOpenManga(selectedManga, mangaActiveServer)}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {isRtl ? <><BxIcon name="retry" className="bx-ico-lead" />{"إعادة المحاولة"}</> : <><BxIcon name="retry" className="bx-ico-lead" />{"Retry"}</>}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {displayedMangaChapters.map((ch) => {
                const isRead = mangaHistory.some(
                  (mh) => mh.mangaId === selectedManga.objectID && String(mh.chapter) === String(ch.chapter)
                );
                const isOffline = offlineChapters.some((x) => x.id === ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleReadMangaChapter(ch)}
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: '18px',
                      background: isRead ? 'rgba(255,255,255,0.04)' : '#0c0c11',
                      border: isRead ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      textAlign: 'start',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: isRead ? 'rgba(255,255,255,0.12)' : '#ffffff',
                          color: isRead ? '#ffffff' : '#000000',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}
                      >
                        {isRead ? <BxIcon name="check" /> : <BxIcon name="book" />}
                      </span>
                      <span>
                        {isRtl ? `الفصل ${ch.chapter}` : `Chapter ${ch.chapter}`}
                        {ch.title && !/^(?:الفصل|Chapter)\s*[\d.]+\s*$/i.test(String(ch.title).trim())
                          ? ` — ${String(ch.title).replace(/^(?:الفصل|Chapter)\s*[\d.]+\s*[-—–:]\s*/i, '')}`
                          : ''}
                      </span>
                    </span>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        background: isOffline ? '#ffffff' : 'rgba(255,255,255,0.08)',
                        color: isOffline ? '#000000' : 'rgba(255,255,255,0.78)',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}
                    >
                      {isOffline ? <><BxIcon name="download" className="bx-ico-lead" />{"بدون نت"}</> : isRead ? (isRtl ? 'مقروء' : 'Read') : isRtl ? <>{"قراءة"}<BxIcon name="chevron-right" className="bx-ico-trail bx-ico-dir" /></> : <>{"Read"}<BxIcon name="chevron-right" className="bx-ico-trail bx-ico-dir" /></>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ==================== v12.0 SLOTH-UI & MANGARA MANGA DISCOVERY STUDIO ==================== */}
          {/* Top Rounded Pill Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              background: '#111116',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '999px',
              padding: '0.68rem 1.05rem',
              marginBottom: '0.7rem'
            }}
          >
            <span><BxIcon name="search" /></span>
            <input
              type="search"
              value={mangaQuery}
              onChange={(e) => setMangaQuery(e.target.value)}
              placeholder={isRtl ? 'ابحث في سيرفرات المانجا والمانهوا (مثال: Solo Leveling)...' : 'Search the manga & manhwa servers...'}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '0.8125rem',
                fontWeight: 700
              }}
            />
            {mangaQuery && (
              <button
                type="button"
                onClick={() => setMangaQuery('')}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.9375rem', cursor: 'pointer' }}
              >
                <BxIcon name="close" />
              </button>
            )}
          </div>

          {/* Quick searches: the most popular manga on AniList right now (real, cached a day) */}
          {mangaPopularTitles.length > 0 && (
            <div className="bx-manga-popular">
              <span className="bx-manga-popular-label">{isRtl ? 'الأشهر على AniList' : 'Popular on AniList'}</span>
              <div className="bx-row bx-mob-scroll bx-chip-row">
                {mangaPopularTitles.map((tag) => {
                  const active = mangaQuery.toLowerCase() === tag.toLowerCase();
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`bx-chip bx-chip-sm${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => setMangaQuery(active ? '' : tag)}
                      dir="auto"
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SlothUI & MANGARA Featured Spotlight Hero Banner ("New Release! / Trending Today") */}
          {!mangaLoading && mangaList.length > 0 && !mangaQuery && (
            <div
              onClick={() => handleOpenManga(mangaList[0])}
              style={{
                position: 'relative',
                width: '100%',
                height: '225px',
                borderRadius: '18px',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.2)',
                boxShadow: '0 18px 44px rgba(0,0,0,0.9)',
                marginBottom: '1rem',
                cursor: 'pointer'
              }}
            >
              <img
                src={mangaList[0].poster?.large || mangaList[0].poster_uri}
                alt={mangaList[0].name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center 22%',
                  filter: 'brightness(0.68) contrast(1.12)'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.18) 35%, rgba(0,0,0,0.95) 100%)'
                }}
              />

              {/* Top-Right Star Rating Pill */}
              {mangaList[0].rate && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '14px',
                    padding: '0.24rem 0.62rem',
                    borderRadius: '999px',
                    background: 'rgba(10,10,15,0.82)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}
                >
                  <BxIcon name="star" className="bx-ico-lead" />{mangaList[0].rate}
                </div>
              )}

              {/* Bottom Title + 50/50 Dual SlothUI Pill Buttons */}
              <div style={{ position: 'absolute', bottom: '14px', left: '14px', right: '14px' }}>
                <h2
                  style={{
                    margin: '0 0 0.55rem',
                    fontSize: '1.375rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: '0 4px 16px #000'
                  }}
                >
                  {mangaList[0].name}
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenManga(mangaList[0]);
                    }}
                    style={{
                      padding: '0.58rem 0.8rem',
                      borderRadius: '999px',
                      background: '#ffffff',
                      color: '#000000',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    <BxIcon name="book" className="bx-ico-lead" />{isRtl ? 'اقرأ الآن' : 'Read Now'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenManga(mangaList[0]);
                    }}
                    style={{
                      padding: '0.58rem 0.8rem',
                      borderRadius: '999px',
                      background: 'rgba(22,22,30,0.85)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.24)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    <BxIcon name="info" className="bx-ico-lead" />{isRtl ? 'الفصول والقصة' : 'Chapters'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Continue Reading Progress Strip inside Manga Tab (Matches Reference UI 3 "Continue reading") */}
          {visibleMangaHistory.length > 0 && !mangaQuery && (
            <div style={{ marginBottom: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                  <BxIcon name="book" className="bx-ico-lead" />{isRtl ? 'كمّل قراءة' : 'Continue Reading'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                  {visibleMangaHistory.length} {isRtl ? 'عمل' : 'Series'}
                </span>
              </div>
              <div className="bx-mob-scroll" style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {visibleMangaHistory.slice(0, 8).map((mh, idx) => (
                  <div
                    key={`mhist-${idx}`}
                    onClick={() => handleOpenManga(mh)}
                    style={{
                      minWidth: '175px',
                      maxWidth: '175px',
                      padding: '0.5rem',
                      borderRadius: '18px',
                      background: '#0c0c12',
                      border: '1px solid rgba(255,255,255,0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      cursor: 'pointer'
                    }}
                  >
                    <img
                      src={mh.poster_uri}
                      alt={mh.name}
                      style={{ width: '44px', height: '62px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {mh.name}
                      </div>
                      {mh.lastChapter || mh.chapter ? (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.68)', fontWeight: 600, marginTop: '2px' }}>
                          {isRtl ? `الفصل ${mh.lastChapter || mh.chapter}` : `Ch. ${mh.lastChapter || mh.chapter}`}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Server + type in one filter sheet (was two rows of chips) */}
          <div className="bx-search-tools bx-manga-tools">
            <button
              type="button"
              className={`bx-chip${mangaFilterCount ? ' is-active' : ''}`}
              onClick={() => {
                haptic('tap');
                setFilterSheetOpen(true);
              }}
            >
              <BxIcon name="sliders" size="1.05em" />
              {isRtl ? 'فلترة' : 'Filters'}
              {mangaFilterCount ? ` · ${mangaFilterCount}` : ''}
            </button>
            <span className="bx-search-count bx-ellipsis">{mangaFilterSummary}</span>
          </div>

          {mangaLoading ? (
            <SkeletonGrid count={9} columns={3} padding="0" />
          ) : (
            <>
              {/* Horizontal "Latest Updates" Compact Row Strip (Matches Reference UI 1 Left Screen) */}
              {!mangaQuery && mangaList.length > 4 && (
                <div style={{ marginBottom: '1.05rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                      <BxIcon name="zap" className="bx-ico-lead" />{isRtl ? 'مختارات من سيرفرات Hearbor' : 'Picks from the Hearbor servers'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mangaList.slice(1, 4).map((m) => (
                      <div
                        key={`latest-row-${m.objectID}`}
                        onClick={() => handleOpenManga(m)}
                        style={{
                          padding: '0.55rem 0.7rem',
                          borderRadius: '18px',
                          background: '#0b0b10',
                          border: '1px solid rgba(255,255,255,0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.7rem',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0, flex: 1 }}>
                          <img
                            src={m.poster?.large || m.poster_uri}
                            alt={m.name}
                            loading="lazy"
                      decoding="async"
                            style={{ width: '52px', height: '70px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div dir="auto" style={{ fontWeight: 700, fontSize: '0.9375rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: isRtl ? 'right' : 'left' }}>
                              {m.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                              {m.rate ? (
                                <span style={{ color: '#ffffff', direction: 'ltr' }}>
                                  <BxIcon name="star" className="bx-ico-lead" filled />
                                  {m.rate}
                                </span>
                              ) : null}
                              {m.type ? <span>{m.type}</span> : null}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            color: '#000000',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            flexShrink: 0
                          }}
                        >
                          <BxIcon name="book" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mangaList.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: 'rgba(255,255,255,0.68)',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    lineHeight: 1.6
                  }}
                >
                  {mangaSource === 'bx4' && !mangaQuery.trim()
                    ? isRtl
                      ? <><BxIcon name="search" className="bx-ico-lead" />{"سيرفر Hearbor 4 للبحث فقط — اكتب اسم العمل في خانة البحث."}</>
                      : <><BxIcon name="search" className="bx-ico-lead" />{"Hearbor 4 is search-only — type a title in the search box."}</>
                    : isRtl
                      ? 'مفيش نتايج على السيرفر ده دلوقتي — جرّب سيرفر تاني من فوق.'
                      : 'No results on this server right now — try another server above.'}
                </div>
              )}

              {/* 3-column manga grid: cover, title, the real rating only */}
              <div className="bx-grid bx-stagger">
                {mangaList
                  .filter((m) => {
                    if (mangaFilterType === 'MANHWA') return String(m.type || '').includes('مانهوا');
                    if (mangaFilterType === 'MANGA') return String(m.type || '').includes('مانجا');
                    return true;
                  })
                  .map((m) => (
                    <PosterCard
                      key={m.objectID}
                      item={{ objectID: `manga-${m.objectID}`, titleEn: m.name, poster: m.poster?.large || m.poster_uri, rating: m.rate || '' }}
                      dataSaver={dataSaver}
                      onOpen={() => handleOpenManga(m)}
                    />
                  ))}
              </div>

              {mangaList.length > 0 && !mangaQuery.trim() && mangaSource !== 'bx4' && (
                <button
                  type="button"
                  onClick={handleLoadMoreManga}
                  disabled={loadingMoreManga}
                  style={{
                    width: '100%',
                    marginTop: '1.1rem',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: '#ffffff',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer'
                  }}
                >
                  {loadingMoreManga
                    ? isRtl
                      ? <><BxIcon name="loader" className="bx-ico-lead" />{"بيحمّل..."}</>
                      : <><BxIcon name="loader" className="bx-ico-lead" />{"Loading more..."}</>
                    : isRtl
                    ? <><BxIcon name="plus" className="bx-ico-lead" />{"عرض المزيد من مكتبة المانجا والمانهوا (صفحة "}{mangaPage + 1}{")"}</>
                    : <><BxIcon name="plus" className="bx-ico-lead" />{"Load More Manga & Manhwa (Page "}{mangaPage + 1}{")"}</>}
                </button>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
