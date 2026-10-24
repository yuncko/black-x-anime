import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { sendNativeDeviceNotification } from '../utils/deviceNotifications.js';
import { pushToast } from '../hooks/hooks.js';

export default function NotificationBell() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const wrapRef = useRef(null);

  const [items, setItems] = useState(() => [
    {
      id: 'n-shards',
      cat: 'reward',
      icon: '💎',
      titleAr: 'مكافأة الشظايا السوداء اليومية جاهزة!',
      titleEn: 'Daily Black Shards Bonus Ready!',
      bodyAr: 'لديك +350 شظية سوداء مجانية بانتظارك في متجر الزخارف والألقاب الحية.',
      bodyEn: 'Claim +350 free Black Shards in the Live Ornament & Title Shop.',
      timeAr: 'الآن',
      timeEn: 'Just now',
      to: '/profile?tab=shop',
      unread: true
    },
    {
      id: 'n-manga',
      cat: 'manga',
      icon: '📖',
      titleAr: 'فصل مانجا جديد متوفر الآن على Hearbor',
      titleEn: 'New Manga Chapter Live on Hearbor',
      bodyAr: 'تم تحديث فصول جديدة عالية الدقة باللغة العربية داخل المكتبة الموحدة.',
      bodyEn: 'New Arabic high-res chapters are now available in the unified Library.',
      timeAr: 'منذ 10 د',
      timeEn: '10m ago',
      to: '/browse',
      unread: true
    },
    {
      id: 'n-comm',
      cat: 'community',
      icon: '💬',
      titleAr: 'تفاعل جديد في مجتمع Hearbor',
      titleEn: 'New Interaction in Hearbor Community',
      bodyAr: 'أعجب الأعضاء بمنشورك الأخير وتركوا تعليقات صوتية وميمز جديدة.',
      bodyEn: 'Members reacted to your latest post and left voice notes & memes.',
      timeAr: 'منذ 25 د',
      timeEn: '25m ago',
      to: '/community',
      unread: true
    },
    {
      id: 'n-wrapped',
      cat: 'reward',
      icon: '📈',
      titleAr: 'بطاقة ملخصك العالمي (Hearbor Wrapped 2026)',
      titleEn: 'Your 2026 Hearbor Wrapped Card is Ready',
      bodyAr: 'شاهد وحمّل بطاقة إحصائياتك السنوية كصورة PNG وشاركها مع أصدقائك.',
      bodyEn: 'View and download your HD PNG stats card and share it with friends.',
      timeAr: 'منذ ساعة',
      timeEn: '1h ago',
      to: '/profile?tab=wrapped',
      unread: false
    }
  ]);

  useEffect(() => {
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/api/tracking/notifications')
      .then((res) => {
        if (Array.isArray(res?.notifications) && res.notifications.length > 0) {
          const apiMapped = res.notifications.slice(0, 6).map((n, idx) => ({
            id: `api-${n.id || idx}`,
            cat: 'manga',
            icon: '🔔',
            titleAr: n.title || 'إشعار جديد',
            titleEn: n.title || 'New Notification',
            bodyAr: n.message || '',
            bodyEn: n.message || '',
            timeAr: 'حديثاً',
            timeEn: 'Recently',
            to: '/browse',
            unread: !n.is_read
          }));
          setItems((prev) => [...apiMapped, ...prev]);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const onNewEpAlert = (e) => {
      const d = e.detail;
      if (!d) return;
      setItems((prev) => [
        {
          id: d.id || `ep-${Date.now()}`,
          cat: 'manga',
          icon: '🎬',
          titleAr: d.title,
          titleEn: d.title,
          bodyAr: d.body,
          bodyEn: d.body,
          timeAr: 'الآن',
          timeEn: 'Just now',
          to: d.url || '/trending',
          unread: true
        },
        ...prev
      ]);
    };
    window.addEventListener('blackx:new-episode-alert', onNewEpAlert);
    return () => window.removeEventListener('blackx:new-episode-alert', onNewEpAlert);
  }, []);

  const unreadCount = items.filter((i) => i.unread).length;
  const filtered = items.filter((i) => filter === 'all' || i.cat === filter);

  const markAllRead = () => {
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={lang === 'ar' ? 'مركز الإشعارات' : 'Notifications'}
        style={{
          position: 'relative',
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          background: open ? 'rgba(34, 211, 238, 0.18)' : 'rgba(255, 255, 255, 0.06)',
          border: open ? '1px solid var(--cyan)' : '1px solid rgba(255, 255, 255, 0.14)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.05rem',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-3px',
              insetInlineEnd: '-3px',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, #ef4444, #ec4899)',
              color: '#fff',
              fontSize: '0.68rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.7)'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            insetInlineEnd: 0,
            width: 'min(360px, 90vw)',
            borderRadius: '20px',
            padding: '1rem',
            background: 'rgba(8, 11, 22, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
            zIndex: 120
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong style={{ fontSize: '0.96rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>🔔</span>
              {lang === 'ar' ? 'مركز الإشعارات الفوري' : 'Live Notification Center'}
            </strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--cyan)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✓ {lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', ar: 'الكل', en: 'All' },
              { id: 'manga', ar: '📖 الفصول والحلقات', en: '📖 Episodes' },
              { id: 'community', ar: '💬 المجتمع', en: '💬 Social' },
              { id: 'reward', ar: '💎 المكافآت', en: '💎 Rewards' }
            ].map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setFilter(tb.id)}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '999px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  border: filter === tb.id ? '1px solid var(--cyan)' : '1px solid rgba(255,255,255,0.1)',
                  background: filter === tb.id ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
                  color: filter === tb.id ? 'var(--cyan)' : '#cbd5e1',
                  cursor: 'pointer'
                }}
              >
                {lang === 'ar' ? tb.ar : tb.en}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={async () => {
              const ok = await sendNativeDeviceNotification({
                title: lang === 'ar' ? '🎬 إشعارات حلقات Hearbor مفعّلة!' : '🎬 Hearbor Episode Alerts Active!',
                body:
                  lang === 'ar'
                    ? 'ستصلك إشعارات الحلقات الجديدة مباشرة على شاشة هاتفك أو جهاز الكمبيوتر فور نزولها.'
                    : 'New anime episode alerts will now appear directly on your phone or computer!',
                url: '/trending'
              });
              if (ok) {
                pushToast(
                  lang === 'ar'
                    ? '📲 تم تفعيل وإرسال إشعار حي على هاتفك / جهاز الكمبيوتر بنجاح!'
                    : '📲 Sent native device notification successfully!',
                  'success'
                );
              } else {
                pushToast(
                  lang === 'ar'
                    ? '🔔 يرجى السماح بإشعارات المتصفح لتصلك تنبيهات الحلقات على جهازك.'
                    : '🔔 Please allow browser notifications in your browser settings.',
                  'info'
                );
              }
            }}
            style={{
              width: '100%',
              marginBottom: '0.65rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.22))',
              border: '1px solid rgba(34, 211, 238, 0.45)',
              color: '#fff',
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            📲 {lang === 'ar' ? 'تفعيل وتجربة إشعارات الهاتف والكمبيوتر' : 'Enable & Test Phone/PC Notifications'}
          </button>

          <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, unread: false } : it)));
                  setOpen(false);
                  if (n.to) navigate(n.to);
                }}
                style={{
                  textAlign: 'start',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '14px',
                  background: n.unread ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  border: n.unread ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid rgba(255, 255, 255, 0.07)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '0.65rem',
                  alignItems: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{n.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <span>{lang === 'ar' ? n.titleAr : n.titleEn}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                      {lang === 'ar' ? n.timeAr : n.timeEn}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-dim)', lineHeight: 1.45 }}>
                    {lang === 'ar' ? n.bodyAr : n.bodyEn}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
