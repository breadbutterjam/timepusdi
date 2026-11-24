/* ============================================================
   chapters.js — group photos into chapters from date and place
   Photos are {id, name, takenAt, mtime, lat, lon}. All pure functions.
   ============================================================ */

/* ---- Tunable ---- */
export const TARGET_CHAPTER_SIZE = 20;
export const MIN_CHAPTER_SIZE = 6;
/* 10 km of travel counts the same as 1 hour of waiting */
const KM_PER_HOUR_EQUIVALENT = 10;

const timeOf = (p) => p.takenAt ?? p.mtime ?? 0;

export function sortPhotos(photos) {
  return photos
    .slice()
    .sort((p, q) => timeOf(p) - timeOf(q) || String(p.name).localeCompare(String(q.name), undefined, { numeric: true }));
}

export function distKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** @param {object[]} photos already sorted. @returns {object[][]} chapters of photos */
export function groupChapters(photos, { target = TARGET_CHAPTER_SIZE, min = MIN_CHAPTER_SIZE } = {}) {
  const n = photos.length;
  if (n === 0) return [];
  let k = Math.max(1, Math.round(n / target));
  if (n < 2 * min) k = 1;

  const candidates = [];
  for (let i = 0; i < n - 1; i++) {
    const gapHours = Math.abs(timeOf(photos[i + 1]) - timeOf(photos[i])) / 3.6e6;
    const a = photos[i];
    const b = photos[i + 1];
    const km = a.lat != null && b.lat != null ? distKm(a, b) : 0;
    candidates.push({ i, score: gapHours + km / KM_PER_HOUR_EQUIVALENT });
  }
  candidates.sort((p, q) => q.score - p.score || p.i - q.i);

  const cuts = [];
  const sizesOk = (list) => {
    const sorted = list.slice().sort((p, q) => p - q);
    let prev = -1;
    for (const c of sorted) {
      if (c - prev < min) return false;
      prev = c;
    }
    return n - 1 - prev >= min;
  };
  for (const cand of candidates) {
    if (cuts.length >= k - 1) break;
    if (sizesOk([...cuts, cand.i])) cuts.push(cand.i);
  }
  cuts.sort((p, q) => p - q);

  const groups = [];
  let start = 0;
  for (const c of cuts) {
    groups.push(photos.slice(start, c + 1));
    start = c + 1;
  }
  groups.push(photos.slice(start));
  return groups;
}

/** Start a new chapter at position `pos` (1…len-1) of chapter `g`. */
export function splitAt(groups, g, pos) {
  const grp = groups[g];
  if (!grp || pos < 1 || pos >= grp.length) return groups;
  return [...groups.slice(0, g), grp.slice(0, pos), grp.slice(pos), ...groups.slice(g + 1)];
}

/** Merge chapter `g` into the one before it. */
export function mergeWithPrev(groups, g) {
  if (g < 1 || g >= groups.length) return groups;
  return [...groups.slice(0, g - 1), [...groups[g - 1], ...groups[g]], ...groups.slice(g + 1)];
}
