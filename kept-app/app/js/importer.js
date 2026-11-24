/* ============================================================
   importer.js — from a folder of photos to chapter folders
   scan():  read dates and places, make small previews        (read only)
   build(): write 1080p copies, pages, thumbnails, manifests  (into the album folder)
   ============================================================ */

import { readExif } from './exif.js';
import { walk, ensureDir, writeFile, chapterDirNames, chapterDirName } from './fs.js';
import { makePreview, makeCopy, renderPageThumb, IMAGE_EXT, HEIC_EXT } from './draw.js';
import { makePages } from './pages.js';
import { FORMAT, FORMAT_VERSION } from './store.js';

const pad4 = (n) => String(n).padStart(4, '0');

/** @returns {{photos: object[], skipped: {heic:number, unreadable:number}}} */
export async function scan(sourceDir, onProgress = () => {}) {
  const entries = [];
  const skipped = { heic: 0, unreadable: 0 };
  for await (const e of walk(sourceDir)) {
    if (IMAGE_EXT.test(e.name)) entries.push(e);
    else if (HEIC_EXT.test(e.name)) skipped.heic++;
  }

  const photos = [];
  let done = 0;
  for (const e of entries) {
    try {
      const file = await e.handle.getFile();
      const exif = /\.jpe?g$/i.test(e.name) ? readExif(await file.slice(0, 262144).arrayBuffer()) : {};
      const preview = await makePreview(file);
      photos.push({
        id: 's' + pad4(photos.length + 1),
        name: e.name,
        file,
        mtime: file.lastModified,
        takenAt: exif.takenAt,
        lat: exif.lat,
        lon: exif.lon,
        w: preview.w,
        h: preview.h,
        previewUrl: URL.createObjectURL(preview.blob),
      });
    } catch {
      skipped.unreadable++;
    }
    onProgress({ done: ++done, total: entries.length, label: 'Reading photos' });
  }
  return { photos, skipped };
}

export function releasePreviews(photos) {
  for (const p of photos) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
}

/** Next free chapter number in an album folder (so a new trip continues the book). */
export async function nextChapterNumber(root) {
  const names = await chapterDirNames(root);
  return names.length ? parseInt(names[names.length - 1].slice(8), 10) + 1 : 1;
}

/** @param {object[][]} groups chapters of scanned photos @returns {string[]} the chapter folder names written */
export async function build(root, groups, onProgress = () => {}) {
  const total = groups.reduce((s, g) => s + g.length, 0);
  let done = 0;
  let number = await nextChapterNumber(root);
  const written = [];

  for (const group of groups) {
    const dirName = chapterDirName(number);
    const dir = await ensureDir(root, dirName);
    const photosDir = await ensureDir(dir, 'photos');
    const pagesDir = await ensureDir(dir, 'pages');

    const photos = [];
    const bitmaps = new Map();
    try {
      for (const src of group) {
        const id = 'p' + pad4(photos.length + 1);
        const copy = await makeCopy(src.file);
        await writeFile(photosDir, id + '.jpg', copy.blob);
        bitmaps.set(id, copy.small);
        photos.push({
          id,
          file: 'photos/' + id + '.jpg',
          w: copy.w,
          h: copy.h,
          takenAt: src.takenAt ?? null,
          lat: src.lat ?? null,
          lon: src.lon ?? null,
          source: src.name,
        });
        onProgress({ done: ++done, total, label: `Chapter ${number}: making copies` });
      }

      const chapter = { photos, pages: makePages(photos) };
      for (const page of chapter.pages) {
        await writeFile(pagesDir, page.id + '.jpg', await renderPageThumb(chapter, page, bitmaps));
        page.thumb = 'pages/' + page.id + '.jpg';
      }

      const manifest = { format: FORMAT, version: FORMAT_VERSION, id: dirName, name: 'Chapter ' + number, photos, pages: chapter.pages, music: null };
      await writeFile(dir, 'manifest.json', JSON.stringify(manifest, null, 2));
    } finally {
      for (const b of bitmaps.values()) b.close();
    }
    written.push(dirName);
    number++;
  }
  return written;
}
