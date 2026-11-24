/* ============================================================
   app.js — screens and the steps between them
   Home → (pick photos → read → confirm chapters → pick album folder → build) → Book → Edit / View
   ============================================================ */

import { h } from './dom.js';
import { supported, pickDirectory, rememberAlbum, recallAlbum, ensurePermission } from './fs.js';
import { scan, build, releasePreviews, nextChapterNumber } from './importer.js';
import { sortPhotos, groupChapters, splitAt, mergeWithPrev } from './chapters.js';
import { openAlbum, urlFor } from './store.js';
import { renderEditor } from './editor.js';
import { openViewer } from './viewer.js';

const app = document.getElementById('app');
let album = null;
let editor = null;

function show(...nodes) {
  editor?.dispose?.();
  editor = null;
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

const dateLabel = (p) =>
  p.takenAt != null
    ? new Date(p.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : new Date(p.mtime).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/* ---------------- small screens ---------------- */

function notice(message, onOk, okLabel = 'Back') {
  show(h('main', { class: 'center' }, h('p', { class: 'lede' }, message), h('button', { class: 'primary', onClick: onOk }, okLabel)));
}

function progressScreen(title) {
  const bar = h('progress', { max: '1', value: '0' });
  const label = h('p', { class: 'muted' }, ' ');
  show(h('main', { class: 'center' }, h('h2', null, title), bar, label, h('p', { class: 'fine' }, 'Everything stays on this computer.')));
  return ({ done, total, label: text }) => {
    bar.max = total || 1;
    bar.value = done;
    label.textContent = `${text ? text + ' · ' : ''}${done} of ${total}`;
  };
}

/* ---------------- home ---------------- */

async function home() {
  if (!supported()) {
    notice('Kept needs Chrome or Edge on a computer, because only they can read and write a folder you choose.', home, 'Try again');
    return;
  }
  const last = await recallAlbum();
  show(
    h(
      'main',
      { class: 'home' },
      h('p', { class: 'eyebrow' }, 'Early version'),
      h('h1', null, 'Kept'),
      h('p', { class: 'lede' }, 'Photo books that stay on your computer. Every photo shown whole, nothing uploaded.'),
      h(
        'ol',
        { class: 'steps' },
        h('li', null, h('strong', null, 'Choose your photos folder.'), ' This is the folder your pictures are already in. Kept only reads it and never changes your originals.'),
        h('li', null, h('strong', null, 'Check the chapters.'), ' A chapter is a group of photos from the same day or place. Split or merge them if Kept got it wrong.'),
        h('li', null, h('strong', null, 'Choose a book folder.'), ' Pick a new, empty folder. Kept saves your book there, and you can open it again any time.'),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', onClick: () => create(null) }, 'Make a book from photos'),
        h('button', { class: 'ghost', onClick: openBook }, 'Open a saved book'),
        last ? h('button', { class: 'ghost', onClick: () => reopen(last) }, `Reopen “${last.name}”`) : null,
      ),
      h('p', { class: 'fine' }, 'Chrome will ask permission each time it opens a folder. Choose Allow, View files or Save changes. Your photos never leave your device.'),
      h('p', { class: 'fine' }, h('a', { href: '../guide/' }, 'Step-by-step setup guide'), ' · ', h('a', { href: '../' }, 'About Kept')),
    ),
  );
}

/* ---------------- make a book ---------------- */

async function create(destRoot) {
  const source = await pickDirectory('read');
  if (!source) return;
  const update = progressScreen('Reading your photos');
  let result;
  try {
    result = await scan(source, update);
  } catch (e) {
    notice('Something went wrong reading that folder: ' + (e?.message || e), () => (album ? albumView() : home()));
    return;
  }
  if (!result.photos.length) {
    notice('No JPEG, PNG or WebP photos were found in that folder.' + (result.skipped.heic ? ` ${plural(result.skipped.heic, 'HEIC photo')} were skipped. Save them as JPEG first.` : ''), () => (album ? albumView() : home()));
    return;
  }
  const photos = sortPhotos(result.photos);
  const start = destRoot ? await nextChapterNumber(destRoot) : 1;
  confirmChapters({ photos, groups: groupChapters(photos), skipped: result.skipped, destRoot, start });
}

function confirmChapters(state) {
  const { groups, skipped, destRoot, start } = state;
  const total = state.photos.length;

  const chapter = (group, g) =>
    h(
      'section',
      { class: 'chapter' },
      h(
        'header',
        { class: 'row between' },
        h('div', null, h('h3', null, 'Chapter ' + (start + g)), h('p', { class: 'muted' }, `${plural(group.length, 'photo')} · ${dateLabel(group[0])}${dateLabel(group[0]) === dateLabel(group[group.length - 1]) ? '' : ' to ' + dateLabel(group[group.length - 1])}`)),
        g > 0
          ? h('button', { class: 'ghost', onClick: () => ((state.groups = mergeWithPrev(state.groups, g)), confirmChapters(state)) }, 'Merge with previous chapter')
          : null,
      ),
      h(
        'div',
        { class: 'cthumbs' },
        group.map((p, i) =>
          h(
            'div',
            { class: 'ct' },
            i > 0 ? h('button', { class: 'cut', title: 'Start a new chapter at this photo', onClick: () => ((state.groups = splitAt(state.groups, g, i)), confirmChapters(state)) }, 'Split here') : null,
            h('img', { src: p.previewUrl, alt: '', loading: 'lazy' }),
          ),
        ),
      ),
    );

  show(
    h(
      'main',
      { class: 'wide' },
      h('h2', null, 'Confirm the chapters'),
      h('p', { class: 'lede' }, `${plural(total, 'photo')} grouped into ${plural(groups.length, 'chapter')}. A chapter is a set of photos from the same day or place. Hover over a photo to split a chapter there, or merge a chapter into the one before it. Pages are made after you confirm.`),
      skipped.heic || skipped.unreadable
        ? h('p', { class: 'note' }, [skipped.heic ? `${plural(skipped.heic, 'HEIC photo')} skipped. Save them as JPEG to include them. ` : '', skipped.unreadable ? `${plural(skipped.unreadable, 'file')} could not be read.` : ''])
        : null,
      destRoot
        ? null
        : h('p', { class: 'note' }, 'Next, Chrome will ask you to pick a folder to save the book in. Choose a new, empty folder, not the folder your photos are in.'),
      groups.map(chapter),
      h(
        'footer',
        { class: 'sticky-actions' },
        h('button', { class: 'ghost', onClick: () => (releasePreviews(state.photos), album ? albumView() : home()) }, 'Cancel'),
        h('button', { class: 'primary', onClick: () => proceed(state) }, destRoot ? `Add to “${destRoot.name}”` : 'Next: choose a folder for the book'),
      ),
    ),
  );
}

async function proceed(state) {
  let root = state.destRoot;
  if (!root) {
    root = await pickDirectory('readwrite');
    if (!root) return;
  }
  const update = progressScreen('Making your book');
  try {
    await build(root, state.groups, update);
  } catch (e) {
    notice('The book could not be written: ' + (e?.message || e), home);
    return;
  }
  releasePreviews(state.photos);
  await loadAlbum(root);
}

/* ---------------- open a book ---------------- */

async function openBook() {
  const root = await pickDirectory('readwrite');
  if (root) await loadAlbum(root);
}

async function reopen(handle) {
  if (await ensurePermission(handle)) await loadAlbum(handle);
}

async function loadAlbum(root) {
  album = await openAlbum(root);
  if (!album.chapters.length) {
    notice('That folder has no Kept chapters in it yet.', home);
    return;
  }
  rememberAlbum(root);
  albumView();
}

/* ---------------- the book ---------------- */

function albumView() {
  const pages = album.chapters.reduce((s, c) => s + c.pages.length, 0);
  const photos = album.chapters.reduce((s, c) => s + c.photos.length, 0);
  const row = (ch, ci) => {
    const cover = h('img', { alt: '' });
    if (ch.pages[0]?.thumb) urlFor(ch, ch.pages[0].thumb).then((u) => (cover.src = u));
    return h(
      'li',
      { class: 'brow' },
      h('div', { class: 'cover' }, cover),
      h('div', { class: 'grow' }, h('h3', null, ch.name), h('p', { class: 'muted' }, `${plural(ch.pages.length, 'page')} · ${plural(ch.photos.length, 'photo')}${ch.music ? ' · ♪ ' + ch.music.name : ''}`)),
      h('button', { class: 'ghost', onClick: () => view(ci, 0) }, 'View'),
      h('button', { class: 'ghost', onClick: () => edit(ci) }, 'Edit'),
    );
  };
  show(
    h(
      'main',
      { class: 'wide' },
      h(
        'header',
        { class: 'row between wrap' },
        h('div', null, h('h2', null, album.name), h('p', { class: 'muted' }, `${plural(album.chapters.length, 'chapter')} · ${plural(pages, 'page')} · ${plural(photos, 'photo')}`)),
        h('div', { class: 'row wrap' }, h('button', { class: 'primary', onClick: () => view(0, 0) }, 'View the book'), h('button', { class: 'ghost', onClick: () => create(album.root) }, 'Add more photos'), h('button', { class: 'ghost', onClick: home }, 'Close book')),
      ),
      h('ul', { class: 'blist' }, album.chapters.map(row)),
    ),
  );
}

function view(ci, pi, returnTo = albumView) {
  openViewer(album, { chapter: ci, page: pi }, returnTo);
}

function edit(ci) {
  editor = renderEditor(app, album, ci, {
    onBack: albumView,
    onSwitch: edit,
    onView: (c, p) => view(c, p, () => edit(c)),
  });
}

home();
