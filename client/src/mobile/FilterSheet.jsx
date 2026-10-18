import React, { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet.jsx';

export const SORT_OPTIONS = [
  { id: 'series_fav_count_desc', ar: 'الأكثر شعبية', en: 'Populaires' },
  { id: 'best_mal_ranked', ar: 'الأعلى تقييماً', en: 'Mieux notés' },
  { id: 'series_date_created', ar: 'الأحدث', en: 'Récents' },
  { id: 'series_name_asc', ar: 'أبجدياً', en: 'A–Z' }
];

/** Number of filters that differ from the defaults (shown on the "Filter" button). */
export function activeFilterCount(value) {
  if (!value) return 0;
  return (
    (value.sort && value.sort !== SORT_OPTIONS[0].id ? 1 : 0) +
    (value.type?.id && value.type.id !== 'all' ? 1 : 0) +
    (value.state?.id && value.state.id !== 'all' ? 1 : 0) +
    (value.studio?.id && value.studio.id !== 'all' ? 1 : 0) +
    (value.genre?.id && value.genre.id !== 'all' ? 1 : 0)
  );
}

/**
 * Sort + filters of the search tab in one bottom sheet (instead of five rows of chips
 * above the results). Choices are a draft until "Show results" is tapped.
 * Other tabs pass their own `groups` ([{ key, title, items }]) and `defaults` (the manga tab:
 * server + type).
 */
export default function FilterSheet({ open, onClose, isRtl, value, onApply, types, states, studios, genres, groups, defaults }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
    // only re-sync when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = (o) => (o.label ? o.label : isRtl ? o.ar : o.en);
  const group = (title, items, key, isSort = false) => (
    <section className="bx-filter-group">
      <h4>{title}</h4>
      <div className="bx-filter-chips">
        {items.map((o) => {
          const active = isSort ? draft.sort === o.id : draft[key]?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={`bx-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => setDraft((d) => ({ ...d, [key]: isSort ? o.id : o }))}
            >
              {label(o)}
            </button>
          );
        })}
      </div>
    </section>
  );

  const reset = () =>
    setDraft(defaults || { sort: SORT_OPTIONS[0].id, type: types[0], state: states[0], studio: studios[0], genre: genres[0] });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isRtl ? 'فلترة' : 'Filtres'}
      closeLabel={isRtl ? 'إغلاق' : 'Close'}
      footer={
        <>
          <button type="button" className="bx-btn bx-btn-outline" onClick={reset}>
            {isRtl ? 'إعادة ضبط' : 'Réinitialiser'}
          </button>
          <button
            type="button"
            className="bx-btn bx-btn-primary"
            style={{ flex: 1 }}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {isRtl ? 'عرض النتائج' : 'Voir les résultats'}
          </button>
        </>
      }
    >
      {draft ? (
        groups ? (
          <>{groups.map((g) => <React.Fragment key={g.key}>{group(g.title, g.items, g.key)}</React.Fragment>)}</>
        ) : (
          <>
            {group(isRtl ? 'الترتيب' : 'Trier', SORT_OPTIONS, 'sort', true)}
            {group(isRtl ? 'النوع' : 'Type', types, 'type')}
            {group(isRtl ? 'الحالة' : 'Statut', states, 'state')}
            {group(isRtl ? 'التصنيف' : 'Genre', genres, 'genre')}
            {group(isRtl ? 'الاستوديو' : 'Studio', studios, 'studio')}
          </>
        )
      ) : null}
    </BottomSheet>
  );
}
