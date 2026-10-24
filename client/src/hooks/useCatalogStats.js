import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Real catalog size from GET /api/stream/stats (Hearbor 1's search index).
 * One request per page load, shared by every label that shows the count.
 * Labels must hide the number while it is unknown: never show a guess.
 */
let statsPromise = null;
let animeTotalCache = null;

function loadAnimeTotal() {
  if (!statsPromise) {
    statsPromise = api
      .get('/api/stream/stats')
      .then((data) => {
        const total = Number(data?.animeTotal);
        animeTotalCache = Number.isFinite(total) && total > 0 ? total : null;
        return animeTotalCache;
      })
      .catch(() => {
        statsPromise = null; // let the next mount retry
        return null;
      });
  }
  return statsPromise;
}

/** Number of anime in the catalog, or null while unknown. */
export function useAnimeCatalogTotal() {
  const [total, setTotal] = useState(animeTotalCache);
  useEffect(() => {
    let alive = true;
    loadAnimeTotal().then((value) => {
      if (alive) setTotal(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return total;
}

/** Same digit style the site already uses for counts, e.g. 6,973. */
export function formatCount(value) {
  return Number(value).toLocaleString('en-US');
}
