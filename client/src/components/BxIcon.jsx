import React from 'react';

/**
 * Pure Monochrome Liquid Glass SVG Vector Icon Pack for Hearbor Website
 * Zero OS emojis — adapts automatically to currentColor (#000000 or #ffffff).
 */
export default function BxIcon({ name, size = 18, active = false, style }) {
  const s = Number(size) || 18;
  const sw = active ? '2.3' : '1.9';
  const fillSoft = active ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';

  switch (name) {
    case 'home':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M3.5 10.2L12 3.2l8.5 7V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8.8z" fill={active ? 'currentColor' : fillSoft} />
          <path d="M9.5 21v-6a2.5 2.5 0 0 1 5 0v6" stroke={active ? '#ffffff' : 'currentColor'} strokeWidth="2" />
        </svg>
      );
    case 'search':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="11" cy="11" r="7" fill={fillSoft} />
          <path d="M8.5 8.8A3.5 3.5 0 0 1 11 7.5" strokeWidth="1.6" opacity="0.75" />
          <line x1="16.2" y1="16.2" x2="21" y2="21" strokeWidth="2.4" />
        </svg>
      );
    case 'schedule':
    case 'calendar':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" fill={fillSoft} />
          <line x1="8" y1="2.8" x2="8" y2="6.2" strokeWidth="2.2" />
          <line x1="16" y1="2.8" x2="16" y2="6.2" strokeWidth="2.2" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <circle cx="8.5" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="13.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="17" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'manga':
    case 'book':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path
            d="M2.5 5.5A3.5 3.5 0 0 1 6 4h4.5a2 2 0 0 1 1.5.7A2 2 0 0 1 13.5 4H18a3.5 3.5 0 0 1 3.5 1.5v13A2.5 2.5 0 0 0 18 17h-4.5a1.5 1.5 0 0 0-1.5 1.5A1.5 1.5 0 0 0 10.5 17H6a2.5 2.5 0 0 0-3.5 1.5v-13z"
            fill={fillSoft}
          />
          <line x1="12" y1="5" x2="12" y2="18.5" />
          <line x1="6" y1="8.5" x2="9.5" y2="8.5" strokeWidth="1.6" />
          <line x1="6" y1="11.5" x2="9.5" y2="11.5" strokeWidth="1.6" />
          <line x1="14.5" y1="8.5" x2="18" y2="8.5" strokeWidth="1.6" />
          <line x1="14.5" y1="11.5" x2="18" y2="11.5" strokeWidth="1.6" />
        </svg>
      );
    case 'community':
    case 'spark':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="11.5" r="7.5" fill={fillSoft} />
          <path
            d="M12 6.8l1.45 3.25 3.25 1.45-3.25 1.45L12 16.2l-1.45-3.25-3.25-1.45 3.25-1.45L12 6.8z"
            fill="currentColor"
            stroke="none"
          />
          <path d="M7.5 20.5h9" strokeWidth="2.1" />
        </svg>
      );
    case 'profile':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="8.2" r="3.6" fill={active ? 'currentColor' : fillSoft} />
          <path d="M5 19.5c0-3.4 3.1-5.8 7-5.8s7 2.4 7 5.8" fill={active ? 'currentColor' : fillSoft} />
        </svg>
      );
    case 'anime':
    case 'tv':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <rect x="2.5" y="5" width="19" height="13.5" rx="3" fill={fillSoft} />
          <polygon points="10,9 15.5,11.8 10,14.5" fill="currentColor" stroke="none" />
          <line x1="8" y1="21" x2="16" y2="21" strokeWidth="2.1" />
        </svg>
      );
    case 'bolt':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <polygon points="13 2 4 14 11.5 14 10.5 22 20 10 12.5 10 13 2" />
        </svg>
      );
    case 'flame':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path
            d="M12 2.5c1.5 3.2 4.8 5.2 4.8 9.5a5.8 5.8 0 0 1-11.6 0c0-2.6 1.4-4.8 3-6.3.3 1.6 1.4 2.6 2.2 2.8-.4-2.1.3-4.2 1.6-6z"
            fill={fillSoft}
          />
          <path d="M12 14c1 1 1.6 1.8 1.6 3a1.8 1.8 0 0 1-3.6 0c0-1 .7-2 2-3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'crown':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M3 18h18l-2-11-5 4-2-6-2 6-5-4-2 11z" fill={fillSoft} />
          <line x1="4" y1="21" x2="20" y2="21" strokeWidth="2.2" />
        </svg>
      );
    case 'bell':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill={fillSoft} />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'globe':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="12" r="9" fill={fillSoft} />
          <line x1="3" y1="12" x2="21" y2="12" />
          <path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18" />
        </svg>
      );
    case 'play':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={style}>
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
      );
    case 'info':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <circle cx="12" cy="8.2" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'plus':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={style}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'check':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'close':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" style={style}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'expand':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      );
    default:
      return null;
  }
}
