import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readExif, parseExifDate } from '../app/js/exif.js';
import { fit, options, TEMPLATES, layoutRects } from '../app/js/layout.js';
import { groupChapters, sortPhotos, splitAt, mergeWithPrev } from '../app/js/chapters.js';
import { makePages } from '../app/js/pages.js';
import * as ops from '../app/js/ops.js';

const buf = (f) => {
  const b = readFileSync(new URL('./fixtures/' + f, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

test('EXIF: reads time, orientation and GPS', () => {
  const e = readExif(buf('exif-sample.jpg'));
  assert.equal(e.orientation, 6);
  assert.equal(e.takenAt, Date.UTC(2026, 10, 2, 14, 5, 9));
  assert.ok(Math.abs(e.lat - (18 + 55 / 60 + 30 / 3600)) < 1e-6);
  assert.ok(Math.abs(e.lon - (72 + 49 / 60 + 30 / 3600)) < 1e-6);
});

test('EXIF: file without metadata gives an empty result', () => {
  assert.deepEqual(readExif(buf('no-exif.jpg')), {});
  assert.deepEqual(readExif(new ArrayBuffer(2)), {});
  assert.equal(parseExifDate('0000:00:00 00:00:00'), undefined);
});

/* ---- layout: the never-crop guarantee ---- */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const AR = [2 / 3, 3 / 4, 1, 4 / 3, 3 / 2, 16 / 9, 9 / 16];

test('layout: every template keeps every aspect ratio, stays in the page, and never overlaps', () => {
  const r = rng(7);
  const W = 1920;
  const H = 1080;
  for (let round = 0; round < 200; round++) {
    const n = 1 + Math.floor(r() * 4);
    const ars = Array.from({ length: n }, () => AR[Math.floor(r() * AR.length)]);
    for (const [name, tpl] of Object.entries(TEMPLATES[n])) {
      const res = fit(tpl, ars, W, H);
      assert.ok(res, `${n}/${name} should fit`);
      res.rects.forEach((q, i) => {
        assert.ok(Math.abs(q.w / q.h - ars[i]) < 1e-6, `${n}/${name} aspect ratio ${i}`);
        assert.ok(q.x >= -1e-6 && q.y >= -1e-6 && q.x + q.w <= W + 1e-6 && q.y + q.h <= H + 1e-6, `${n}/${name} inside page`);
      });
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = res.rects[i];
          const b = res.rects[j];
          const apart = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
          assert.ok(apart, `${n}/${name} photos ${i},${j} overlap`);
        }
      }
    }
  }
});

test('layout: also holds on a narrow window and a tall one', () => {
  for (const [W, H] of [[800, 1200], [1000, 400], [1366, 768]]) {
    const ars = [2 / 3, 3 / 2, 2 / 3];
    for (const tpl of Object.values(TEMPLATES[3])) {
      const res = fit(tpl, ars, W, H);
      res.rects.forEach((q, i) => {
        assert.ok(Math.abs(q.w / q.h - ars[i]) < 1e-6);
        assert.ok(q.x >= -1e-6 && q.y >= -1e-6 && q.x + q.w <= W + 1e-6 && q.y + q.h <= H + 1e-6);
      });
    }
  }
});

test('layout: options only list suitable templates, best first', () => {
  const o = options([3 / 2, 3 / 2]); // two landscapes: stacked fills a 16:9 page worse than side by side? either way best first
  assert.ok(o.length >= 1);
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].coverage >= o[i].coverage);
  const three = options([2 / 3, 2 / 3, 2 / 3]);
  assert.equal(three[0].id, 'row'); // three portraits belong side by side on a landscape page
  assert.equal(options([1, 1, 1, 1, 1]).length, 0);
  assert.equal(layoutRects('nope', [1, 1], 100, 100), null);
});

/* ---- chapters ---- */
const HOUR = 3.6e6;
function photosOver(days, perDay) {
  const out = [];
  let id = 0;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < perDay; k++) {
      out.push({ id: 'p' + ++id, name: `IMG_${id}.jpg`, takenAt: Date.UTC(2026, 10, 1 + d, 9) + k * 0.2 * HOUR, lat: 18 + d, lon: 72 + d });
    }
  }
  return out;
}

test('chapters: ~200 photos over 8 days become ~10 chapters, split at the day boundaries', () => {
  const photos = sortPhotos(photosOver(8, 25));
  const groups = groupChapters(photos);
  assert.equal(groups.reduce((s, g) => s + g.length, 0), 200);
  assert.ok(groups.length >= 8 && groups.length <= 12, 'got ' + groups.length);
  assert.ok(groups.every((g) => g.length >= 6));
  // no chapter straddles two days unless it must
  const straddling = groups.filter((g) => new Date(g[0].takenAt).getUTCDate() !== new Date(g[g.length - 1].takenAt).getUTCDate());
  assert.ok(straddling.length <= 1, 'straddling: ' + straddling.length);
});

test('chapters: a small set stays one chapter; empty gives none', () => {
  assert.equal(groupChapters(sortPhotos(photosOver(1, 8))).length, 1);
  assert.deepEqual(groupChapters([]), []);
});

test('chapters: photos without dates still group using file times', () => {
  const photos = sortPhotos(Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, name: 'a' + i, mtime: i < 20 ? i * 1000 : 9e9 + i * 1000 })));
  const groups = groupChapters(photos);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 20);
});

test('chapters: split and merge', () => {
  const g = [[1, 2, 3, 4], [5, 6]];
  assert.deepEqual(splitAt(g, 0, 2), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(splitAt(g, 0, 0), g);
  assert.deepEqual(mergeWithPrev(g, 1), [[1, 2, 3, 4, 5, 6]]);
  assert.deepEqual(mergeWithPrev(g, 0), g);
});

/* ---- pages ---- */
const mkPhotos = (ars) => ars.map((a, i) => ({ id: 'p' + (i + 1), w: Math.round(1000 * a), h: 1000 }));

test('pages: every photo appears exactly once, in order, 2–4 per page where possible', () => {
  const r = rng(3);
  const photos = mkPhotos(Array.from({ length: 23 }, () => AR[Math.floor(r() * AR.length)]));
  const pages = makePages(photos);
  assert.deepEqual(pages.flatMap((p) => p.photos), photos.map((p) => p.id));
  assert.ok(pages.every((p) => p.photos.length >= 1 && p.photos.length <= 4));
  assert.ok(pages.filter((p) => p.photos.length === 1).length <= 1);
  assert.equal(new Set(pages.map((p) => p.id)).size, pages.length);
  for (const p of pages) assert.ok(TEMPLATES[p.photos.length][p.layout], 'layout valid for count');
});

test('pages: one photo gives one single-photo page; none gives none', () => {
  assert.deepEqual(makePages(mkPhotos([1.5])).map((p) => [p.layout, p.photos.length]), [['single', 1]]);
  assert.deepEqual(makePages([]), []);
});

/* ---- edit operations ---- */
function chapter() {
  const photos = mkPhotos([2 / 3, 2 / 3, 3 / 2, 3 / 2, 2 / 3, 1]);
  return { photos, pages: makePages(photos), deleted: [] };
}
const all = (ch) => ch.pages.flatMap((p) => p.photos);

test('ops: reorder keeps the layout; swap layout only accepts valid names', () => {
  const ch = chapter();
  const pi = ch.pages.findIndex((p) => p.photos.length >= 2);
  const before = ch.pages[pi].layout;
  assert.ok(ops.movePhoto(ch, pi, 0, 1));
  assert.equal(ch.pages[pi].layout, before);
  assert.equal(ops.movePhoto(ch, pi, 0, 9), false);
  assert.equal(ops.setLayout(ch, pi, 'does-not-exist'), false);
  const opts = ops.layoutOptions(ch, ch.pages[pi]);
  assert.ok(ops.setLayout(ch, pi, opts[opts.length - 1].id));
});

test('ops: moving a photo to another page keeps every photo, re-picks layouts, drops empty pages', () => {
  const ch = chapter();
  const ids = all(ch).slice().sort();
  const pi = 0;
  const moved = ch.pages[pi].photos[0];
  const dest = ops.movePhotoToPage(ch, pi, moved, 1);
  if (dest >= 0) assert.ok(ch.pages[dest].photos.includes(moved));
  assert.deepEqual(all(ch).slice().sort(), ids);
  assert.ok(ch.pages.every((p) => p.photos.length >= 1 && p.photos.length <= 4));
  for (const p of ch.pages) assert.ok(TEMPLATES[p.photos.length][p.layout]);
});

test('ops: a page never gets a fifth photo', () => {
  const photos = mkPhotos([1, 1, 1, 1, 1, 1]);
  const ch = { photos, pages: [{ id: 'pg0001', layout: 'grid', photos: ['p1', 'p2', 'p3', 'p4'] }, { id: 'pg0002', layout: 'row', photos: ['p5', 'p6'] }], deleted: [] };
  assert.equal(ops.movePhotoToPage(ch, 1, 'p5', 0), -1);
  assert.equal(ch.pages[0].photos.length, 4);
});

test('ops: delete removes the photo and queues its file; an emptied page disappears', () => {
  const ch = chapter();
  ch.photos.forEach((p) => (p.file = `photos/${p.id}.jpg`));
  const last = ch.pages[ch.pages.length - 1];
  const solo = last.photos.length === 1 ? last.photos[0] : null;
  const target = solo ?? ch.pages[0].photos[0];
  const pagesBefore = ch.pages.length;
  ops.deletePhoto(ch, target);
  assert.ok(!all(ch).includes(target));
  assert.ok(!ch.photos.some((p) => p.id === target));
  assert.deepEqual(ch.deleted, [`photos/${target}.jpg`]);
  if (solo) assert.equal(ch.pages.length, pagesBefore - 1);
  for (const p of ch.pages) assert.ok(TEMPLATES[p.photos.length][p.layout]);
});

test('ops: photo to a new page, and moving pages', () => {
  const ch = chapter();
  const pi = ch.pages.findIndex((p) => p.photos.length >= 2);
  const id = ch.pages[pi].photos[1];
  const n = ops.photoToNewPage(ch, pi, id);
  assert.equal(n, pi + 1);
  assert.deepEqual(ch.pages[n].photos, [id]);
  assert.equal(new Set(ch.pages.map((p) => p.id)).size, ch.pages.length);
  const firstId = ch.pages[0].id;
  assert.equal(ops.movePage(ch, 0, 1), 1);
  assert.equal(ch.pages[1].id, firstId);
  assert.equal(ops.movePage(ch, 0, -1), -1);
});
