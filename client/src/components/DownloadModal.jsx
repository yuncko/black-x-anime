import { imgFallback } from '../hooks/hooks.js';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { resolveUserVipTier } from './VipPlansAndDevCodes.jsx';
import { downloadQualityTier, unknownQualityLabel } from '../utils/downloadQuality.js';
import { api } from '../api.js';
import { pushToast } from '../hooks/hooks.js';

const pickDownloadUrl = (source) => source?.downloadUrl || source?.url || source?.directUrl || null;

function absoluteDownloadUrl(url) {
  try {
    return typeof window === 'undefined' ? url : new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function localDownloadEndpoint(url) {
  try {
    if (typeof window === 'undefined') return null;
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname === '/api/stream/download'
      ? `${parsed.pathname}${parsed.search}`
      : null;
  } catch {
    return null;
  }
}

/**
 * DownloadModal
 * Comprehensive multi-source episode downloader:
 * - Direct verified MP4 files (MP4Upload, MediaFire direct) with measured sizes
 * - Cloud storage hosts (Workupload, Mega, Gofile, Mediafire)
 * - Alternative external source mirrors (GateAnime, Anime4Up, OkAnime)
 * - Safe proxy pipeline bypassing 403 Forbidden on direct downloads & copied links
 */
export function DownloadModal({
  isOpen,
  onClose,
  slug,
  episode,
  title,
  showPoster,
  entries = [],
  resolved = {},
  downloads = [],
  resolvedDownloads = {},
  onResolveDownload,
  onResolveStreaming
}) {
  const { t, lang, formatNumber } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const vipTier = resolveUserVipTier(user);
  const isVip = vipTier === 'vip_basic' || vipTier === 'vip_monarch';

  const [loadingSources, setLoadingSources] = useState(false);
  const [sourcesData, setSourcesData] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Eagerly fetch and resolve all multi-source download options when opened
  useEffect(() => {
    if (!isOpen || !slug || !episode) return;
    let active = true;
    setSourcesData(null);
    setResolvingId(null);
    setLoadingSources(true);

    api.get(`/api/stream/download-sources/${slug}/${episode}`)
      .then((data) => {
        if (active) {
          setSourcesData(data);
        }
      })
      .catch((err) => {
        console.warn('download-sources note:', err.message);
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });

    return () => { active = false; };
  }, [isOpen, slug, episode]);

  // Build proxy download URL for direct streams to bypass 403 Forbidden
  const getDirectDownloadEndpoint = useCallback((directUrl, quality = '') => {
    if (!directUrl) return '';
    const existingEndpoint = localDownloadEndpoint(directUrl);
    if (existingEndpoint) return existingEndpoint;
    const cleanTitle = (title || slug || 'Anime').replace(/[^a-zA-Z0-9_\u0600-\u06FF\s-]/g, '').trim();
    const filename = `${cleanTitle}_Ep${episode}${quality ? `_${quality}` : ''}.mp4`;
    return `/api/stream/download?url=${encodeURIComponent(directUrl)}&filename=${encodeURIComponent(filename)}`;
  }, [title, slug, episode]);

  const getFullDirectDownloadUrl = useCallback((directUrl, quality = '') => {
    const endpoint = getDirectDownloadEndpoint(directUrl, quality);
    if (!endpoint) return '';
    return `${window.location.origin}${endpoint}`;
  }, [getDirectDownloadEndpoint]);

  const handleDownloadDirectFile = (directUrl, quality = '') => {
    if (!directUrl) return;
    const downloadEndpoint = getDirectDownloadEndpoint(directUrl, quality);
    const cleanTitle = (title || slug || 'Anime').replace(/[^a-zA-Z0-9_\u0600-\u06FF\s-]/g, '').trim();
    const filename = `${cleanTitle}_Ep${episode}${quality ? `_${quality}` : ''}.mp4`;

    const link = document.createElement('a');
    link.href = downloadEndpoint;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    pushToast(lang === 'ar' ? 'بدأ تحميل الحلقة إلى جهازك...' : 'Download started...', 'success');
  };

  const handleCopy = (url, id) => {
    if (!url) return;
    const copyUrl = absoluteDownloadUrl(url);
    navigator.clipboard?.writeText(copyUrl).catch?.(() => {});
    setCopiedId(id);
    pushToast(t('watch.linkCopied'), 'success');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const displayList = useMemo(() => {
    const candidates = [...(sourcesData?.cloudHosts || []), ...(downloads || [])];
    const byId = new Map();
    candidates.forEach((item, idx) => {
      const key = item.id || item.url || item.downloadUrl || item.directUrl || `server-${idx}`;
      const previous = byId.get(key) || {};
      byId.set(key, {
        ...previous,
        ...item,
        url: item.url || item.downloadUrl || previous.url || previous.downloadUrl || null,
        directUrl: item.directUrl || previous.directUrl || previous.downloadUrl || null
      });
    });

    const seenUrls = new Set();
    return [...byId.values()]
      .filter((item) => {
        const url = item.directUrl || item.url || item.downloadUrl;
        if (!url) return true;
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      })
      .map((item) => {
        const res = resolvedDownloads[item.id] || {};
        // Only the quality the server reported; none = «جودة غير معروفة», free (never a guessed FHD/HD).
        const rawQual = String(item.quality || '').trim();
        return {
          id: item.id,
          server: item.server || 'Server',
          quality: rawQual,
          isFhd: downloadQualityTier(rawQual) === 'fhd',
          url: item.url || item.downloadUrl || res.downloadUrl || res.url || res.directUrl || null,
          directUrl: item.directUrl || res.directUrl || res.downloadUrl || res.url || null
        };
      });
  }, [sourcesData, downloads, resolvedDownloads]);

  const promptVipForFhd = () => {
    pushToast(
      lang === 'ar'
        ? '👑 التحميل بجودة FHD 1080p حصري لمشتركي VIP فقط! يمكنك التحميل بجودة HD مجاناً أو الترقية إلى VIP الآن.'
        : '👑 FHD 1080p downloads are exclusive to VIP members! Download in HD for free or upgrade to VIP.',
      'info'
    );
    onClose?.();
    navigate('/profile?tab=referrals');
  };

  const handleOpenServer = async (item) => {
    if (item.isFhd && !isVip) {
      promptVipForFhd();
      return;
    }
    let url = item.url || item.directUrl;
    let pendingWindow = null;
    if (!url && onResolveDownload) {
      pendingWindow = window.open('about:blank', '_blank');
      if (pendingWindow) pendingWindow.opener = null;
      setResolvingId(item.id);
      try {
        const res = await onResolveDownload(item);
        url = pickDownloadUrl(res);
      } catch {
        pushToast(lang === 'ar' ? 'تعذر جلب رابط السيرفر حالياً' : 'Failed to fetch server link', 'error');
      } finally {
        setResolvingId(null);
      }
    }
    if (url) {
      if (pendingWindow && !pendingWindow.closed) pendingWindow.location.replace(absoluteDownloadUrl(url));
      else if (!pendingWindow) window.open(url, '_blank', 'noopener,noreferrer');
      else handleCopy(url, item.id);
    } else {
      pendingWindow?.close();
      pushToast(lang === 'ar' ? 'لا يتوفر رابط لهذا السيرفر حالياً' : 'No link is available for this server right now', 'error');
    }
  };

  const handleCopyServer = async (item) => {
    if (item.isFhd && !isVip) {
      promptVipForFhd();
      return;
    }
    let url = item.url || item.directUrl;
    if (!url && onResolveDownload) {
      setResolvingId(item.id);
      try {
        const res = await onResolveDownload(item);
        url = pickDownloadUrl(res);
      } catch {}
      setResolvingId(null);
    }
    if (url) {
      handleCopy(url, item.id);
    } else {
      pushToast(lang === 'ar' ? 'جارٍ فحص الرابط...' : 'Resolving link...', 'info');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 13, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        className="glass modal reveal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '24px',
          padding: '1.75rem',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {showPoster && (
              <img onError={imgFallback}
                src={showPoster}
                alt={title}
                style={{ width: '52px', height: '70px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255, 255, 255, 0.15)' }}
              />
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="badge badge--cat" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', color: '#fff', fontWeight: 800 }}>
                  ⚡ {lang === 'ar' ? 'سيرفرات تحميل الأنمي الرسمية' : 'Anime Source Downloads'}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-dim)' }}>
                  {title}
                </span>
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0.25rem 0 0' }}>
                📥 {t('watch.downloadTitle', { n: formatNumber(episode) })}
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--ink-dim)' }}>
                {lang === 'ar' ? 'روابط التحميل الرسمية المقدمة من سيرفرات Hearbor مباشرة' : 'Official download servers provided directly by Hearbor'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBlock: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loadingSources && displayList.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>📡</div>
              <strong style={{ fontSize: '1rem', display: 'block', color: 'var(--cyan)' }}>
                {lang === 'ar' ? 'جارٍ جلب روابط التحميل من سيرفرات Hearbor…' : 'Fetching download links from Hearbor servers…'}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--ink-dim)' }}>
                {lang === 'ar' ? 'يتم فحص وتحضير سيرفرات التحميل المتاحة' : 'Verifying available download servers'}
              </span>
            </div>
          )}

          {/* Section: Anime Source Download Links */}
          {displayList.length > 0 && (
            <div>
              <div style={{ marginBottom: '0.85rem' }}>
                <strong style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🌐</span> {lang === 'ar' ? 'سيرفرات التحميل الرسمية المتاحة (Hearbor)' : 'Official Download Servers (Hearbor)'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
                  {lang === 'ar' ? 'اختر السيرفر المفضل للتحميل بجودة عالية وبشكل مباشر' : 'Choose your preferred server to download in full quality'}
                </span>
              </div>

              {/* VIP FHD Notice Banner */}
              <div
                style={{
                  marginBottom: '0.9rem',
                  padding: '0.7rem 1rem',
                  borderRadius: '12px',
                  background: isVip ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                  border: isVip ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isVip ? '#34d399' : '#fde047' }}>
                  {isVip
                    ? (lang === 'ar' ? '👑 عضويتك VIP مفعّلة: سيرفرات التحميل بجودة FHD 1080p مفتوحة بالكامل لك!' : '👑 VIP Active: All FHD 1080p downloads are unlocked!')
                    : (lang === 'ar' ? '🔒 التحميل بجودة FHD 1080p حصري لمشتركي VIP فقط (التحميل بجودة HD متاح مجاناً).' : '🔒 FHD 1080p downloads are exclusive to VIP members (HD is free).')}
                </span>
                {!isVip && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={promptVipForFhd}
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#090d16', fontWeight: 900 }}
                  >
                    👑 {lang === 'ar' ? 'فتح تحميل FHD الآن' : 'Unlock FHD VIP'}
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.65rem' }}>
                {displayList.map((item, idx) => {
                  const isResolving = resolvingId === item.id;
                  const lockedFhd = item.isFhd && !isVip;
                  return (
                    <div
                      key={`cloud-${idx}-${item.id}`}
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: item.isFhd ? '1px solid rgba(234, 179, 8, 0.45)' : '1px solid rgba(255, 255, 255, 0.09)',
                        borderRadius: '12px',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>
                          {item.isFhd ? '👑' : '🖥️'} {item.server.toUpperCase()}
                        </span>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.72rem',
                            background: item.isFhd ? 'rgba(234, 179, 8, 0.22)' : 'rgba(34, 211, 238, 0.18)',
                            color: item.isFhd ? '#fde047' : '#22d3ee',
                            fontWeight: 900
                          }}
                        >
                          {item.isFhd
                            ? `${item.quality} • VIP 👑`
                            : `${item.quality || unknownQualityLabel(lang)} • ${lang === 'ar' ? 'مجاني' : 'Free'}`}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto' }}>
                        {item.directUrl && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => {
                              if (lockedFhd) {
                                promptVipForFhd();
                                return;
                              }
                              handleDownloadDirectFile(item.directUrl, item.quality);
                            }}
                            style={{
                              background: lockedFhd
                                ? 'linear-gradient(135deg, #f59e0b, #b45309)'
                                : 'linear-gradient(135deg, #06b6d4, #0284c7)',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '0.8rem',
                              padding: '0.4rem 0.65rem'
                            }}
                            title={lang === 'ar' ? 'تحميل مباشر للملف بدون إعلانات' : 'Direct MP4 Download'}
                          >
                            {lockedFhd ? '🔒 VIP FHD' : `⬇ ${lang === 'ar' ? 'تحميل مباشر' : 'Direct'}`}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => handleOpenServer(item)}
                          disabled={isResolving}
                          style={{
                            flex: 1,
                            fontSize: '0.82rem',
                            padding: '0.4rem 0.65rem',
                            background: lockedFhd ? 'rgba(245, 158, 11, 0.22)' : undefined,
                            border: lockedFhd ? '1px solid #f59e0b' : undefined,
                            color: lockedFhd ? '#fde047' : undefined
                          }}
                        >
                          {lockedFhd
                            ? (lang === 'ar' ? '🔒 حصري لمشتركي VIP' : '🔒 VIP Exclusive')
                            : `🌐 ${isResolving ? (lang === 'ar' ? 'جارٍ التجهيز…' : 'Resolving…') : (lang === 'ar' ? 'فتح صفحة التحميل' : 'Open Page')}`}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleCopyServer(item)}
                          disabled={isResolving}
                          title={lang === 'ar' ? 'نسخ رابط السيرفر' : 'Copy link'}
                          style={{ padding: '0.4rem 0.6rem' }}
                        >
                          {lockedFhd ? '🔒' : copiedId === item.id ? '✓' : '🔗'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loadingSources && displayList.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--ink-dim)' }}>
              {lang === 'ar' ? 'لا توجد روابط تحميل متاحة لهذه الحلقة حالياً من مصدر الأنمي.' : 'No download links available for this episode from the anime source.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem', marginTop: 'auto' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-dim)' }}>
            💡 {lang === 'ar' ? 'اضغط «تحميل مباشر» للحفظ الفوري، أو «نسخ الرابط» للاستخدام في أي تطبيق تحميل.' : 'Click "Download" to save directly, or "Copy" for external download managers.'}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DownloadModal;
