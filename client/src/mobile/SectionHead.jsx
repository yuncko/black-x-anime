import React from 'react';
import BxIcon from './BxIcon.jsx';

/** Nuvio shelf header: title left, circular view-all arrow right (#1A1A1A, muted). */
export default function SectionHead({ title, onMore, isRtl, moreLabel }) {
  return (
    <div className="bx-section-head nv-shelf-head">
      <h2 className="bx-section-title nv-shelf-title">{title}</h2>
      {onMore ? (
        <button type="button" className="nv-view-all" onClick={onMore} aria-label={moreLabel || (isRtl ? 'Voir tout' : 'View all')}>
          <BxIcon name="chevron-right" size="1em" />
        </button>
      ) : null}
    </div>
  );
}
