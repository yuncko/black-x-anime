import React from 'react';
import BxIcon from './BxIcon.jsx';
import { TAB_ORDER } from './tabMotion.js';

const TABS = {
  home: { icon: 'home', fr: 'Accueil' },
  catalog: { icon: 'search', fr: 'Rechercher' },
  schedule: { icon: 'calendar', fr: 'Planning' },
  manga: { icon: 'book', fr: 'Manga' },
  community: { icon: 'message', fr: 'Communauté' }
};

/**
 * Nuvio floating pill navigation — 5 equal tabs in a centered glass pill
 * (backdrop blur 24px, radius 999). Selected item gets white pill bg.
 * Profile has no tab — opened from avatar in top bar.
 */
export default function MobileDock({ activeTab, hidden, isRtl, onSelect }) {
  const index = TAB_ORDER.indexOf(activeTab);
  return (
    <nav className={`nv-pill-nav${hidden ? ' is-hidden' : ''}`} aria-label="Navigation principale">
      <div className="nv-pill-nav-inner" role="tablist">
        {TAB_ORDER.map((id) => {
          const tab = TABS[id];
          const active = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className={`nv-pill-item${active ? ' is-active' : ''}`}
              aria-selected={active}
              aria-label={tab.fr}
              onClick={() => onSelect(id)}
            >
              <BxIcon name={tab.icon} size="1.22em" strokeWidth={active ? 2.3 : 1.9} />
              <span className="nv-pill-label">{tab.fr}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
