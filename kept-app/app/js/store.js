/* ============================================================
   store.js — an album on disk
   Album folder
     Chapter-01/  manifest.json · photos/ · pages/ · music/
     Chapter-02/  …
   Chapter order is the folder name order. Nothing here leaves the device.
   ============================================================ */

import { chapterDirNames, getFileAt, removeAt, writeFile, ensureDir } from './fs.js';
import { renderPageThumb } from './draw.js';
import { photoMap } from './ops.js';

export const FORMAT = 'kept-chapter';
export const FORMAT_VERSION = 1;

const pageSig = (p) => p.layout + '|' + p.photos.join(',');

/** Load every chapter's manifest. Chapters that can't be read are skipped. */
export async function openAlbum(root) {
  const chapters = [];
  for (const dirName of await chapterDirNames(root)) {
    try {
      const dir = await root.getDirectoryHandle(dirName);
      const m = JSON.parse(await (await getFileAt(dir, 'manifest.json')).text());
      if (m.format !== FORMAT) continue;
      chapters.push(hydrate(dirName, dir, m));
    } catch {
      /* skip */
    }
  }
  return { root, name: root.name, chapters };
}

/** Runtime fields (dir, deleted, _sigs) live on the chapter object but never in the manifest. */
export function hydrate(dirName, dir, m) {
  const ch = { ...m, dirName, dir, deleted: [], music: m.music ?? null };
  ch._sigs = Object.fromEntries(ch.pages.map((p) => [p.id, pageSig(p)]));
  ch._thumbs = ch.pages.map((p) => p.thumb).filter(Boolean);
  return ch;
}

export function manifestOf(ch) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: ch.dirName,
    name: ch.name,
    photos: ch.photos,
    pages: ch.pages,
    music: ch.music ?? null,
  };
}

export const readChapterFile = (ch, relPath) => getFileAt(ch.dir, relPath);

/* ---- Object URLs for display, kept to a fixed size so a big book doesn't pile up memory ---- */
const URL_LIMIT = 90;
const urls = new Map();
export async function urlFor(ch, relPath) {
  const key = ch.dirName + '/' + relPath;
  const hit = urls.get(key);
  if (hit) {
    urls.delete(key);
    urls.set(key, hit);
    return hit;
  }
  const url = URL.createObjectURL(await getFileAt(ch.dir, relPath));
  urls.set(key, url);
  while (urls.size > URL_LIMIT) {
    const [oldKey, oldUrl] = urls.entries().next().value;
    urls.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}
export function forgetUrl(ch, relPath) {
  const key = ch.dirName + '/' + relPath;
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
}

/** Save a chapter: rebuild thumbnails for changed pages, drop removed files, write the manifest. */
export async function saveChapter(ch, onProgress = () => {}) {
  const pagesDir = await ensureDir(ch.dir, 'pages');
  const stale = ch.pages.filter((p) => !p.thumb || ch._sigs[p.id] !== pageSig(p));

  const need = new Set(stale.flatMap((p) => p.photos));
  const pm = photoMap(ch);
  const bitmaps = new Map();
  try {
    let n = 0;
    for (const id of need) {
      const file = await getFileAt(ch.dir, pm.get(id).file);
      bitmaps.set(id, await createImageBitmap(file, { resizeWidth: 480 }));
    }
    for (const p of stale) {
      await writeFile(pagesDir, p.id + '.jpg', await renderPageThumb(ch, p, bitmaps));
      p.thumb = 'pages/' + p.id + '.jpg';
      forgetUrl(ch, p.thumb);
      onProgress({ done: ++n, total: stale.length });
    }
  } finally {
    for (const b of bitmaps.values()) b.close();
  }

  const live = new Set(ch.pages.map((p) => p.thumb));
  for (const old of ch._thumbs) if (!live.has(old)) await removeAt(ch.dir, old);
  for (const f of ch.deleted) {
    await removeAt(ch.dir, f);
    forgetUrl(ch, f);
  }

  await writeFile(ch.dir, 'manifest.json', JSON.stringify(manifestOf(ch), null, 2));
  ch._sigs = Object.fromEntries(ch.pages.map((p) => [p.id, pageSig(p)]));
  ch._thumbs = ch.pages.map((p) => p.thumb);
  ch.deleted = [];
}

/** One looping track per chapter, copied into the chapter's music folder. */
export async function setMusic(ch, file) {
  if (ch.music) ch.deleted.push(ch.music.file);
  const ext = (/\.[a-z0-9]+$/i.exec(file.name)?.[0] ?? '.mp3').toLowerCase();
  const dir = await ensureDir(ch.dir, 'music');
  const name = 'track' + ext;
  await writeFile(dir, name, file);
  forgetUrl(ch, 'music/' + name);
  ch.deleted = ch.deleted.filter((f) => f !== 'music/' + name);
  ch.music = { file: 'music/' + name, name: file.name };
}

export function removeMusic(ch) {
  if (ch.music) ch.deleted.push(ch.music.file);
  ch.music = null;
}
