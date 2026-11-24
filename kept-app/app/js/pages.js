/* ============================================================
   pages.js — turn an ordered list of photos into pages of 2–4
   Chooses the split that fills pages best, then the best layout per page.
   ============================================================ */

import { options } from './layout.js';

/* ---- Tunable: small nudges toward three-up pages, and against lonely single pages ---- */
const SIZE_BONUS = { 1: -1, 2: 0, 3: 0.08, 4: 0.02 };

const pageId = (n) => 'pg' + String(n).padStart(4, '0');

/** @param {{id:string,w:number,h:number}[]} photos  @returns {{id,layout,photos:string[],transition:'slide'}[]} */
export function makePages(photos) {
  const n = photos.length;
  if (n === 0) return [];
  const ar = photos.map((p) => p.w / p.h);
  const cache = new Map();
  const group = (i, k) => {
    const key = i + ':' + k;
    if (!cache.has(key)) {
      const opts = options(ar.slice(i, i + k));
      cache.set(key, { layout: opts[0].id, score: opts[0].coverage + SIZE_BONUS[k] });
    }
    return cache.get(key);
  };

  // best[i] = best score for photos 0..i-1 (dynamic programming over group sizes 1–4)
  const best = new Array(n + 1).fill(-Infinity);
  const take = new Array(n + 1).fill(0);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let k = 1; k <= 4 && k <= i; k++) {
      const s = best[i - k] + group(i - k, k).score;
      if (s > best[i]) {
        best[i] = s;
        take[i] = k;
      }
    }
  }

  const sizes = [];
  for (let i = n; i > 0; i -= take[i]) sizes.unshift(take[i]);

  const pages = [];
  let at = 0;
  for (const k of sizes) {
    pages.push({
      id: pageId(pages.length + 1),
      layout: group(at, k).layout,
      photos: photos.slice(at, at + k).map((p) => p.id),
      transition: 'slide',
    });
    at += k;
  }
  return pages;
}
