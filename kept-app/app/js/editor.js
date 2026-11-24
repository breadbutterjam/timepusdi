/* ============================================================
   editor.js — tidy one chapter's pages
   Swap a layout, reorder photos, move a photo to another page, delete a photo,
   reorder pages, set the chapter's music. Nothing is written until Save.
   ============================================================ */

import { h, pct } from './dom.js';
import { layoutRects, MAX_PHOTOS_PER_PAGE } from './layout.js';
import * as ops from './ops.js';
import { urlFor, saveChapter, setMusic, removeMusic } from './store.js';
import { pickAudioFile } from './fs.js';

const PREVIEW = { w: 1600, h: 900 };

function pagePreview(ch, page) {
  const ars = ops.pageAspects(ch, page);
  const res = layoutRects(page.layout, ars, PREVIEW.w, PREVIEW.h);
  const pm = ops.photoMap(ch);
  const box = h('div', { class: 'page-prev' });
  for (const r of res?.rects ?? []) {
    const img = h('img', { alt: '', draggable: 'false' });
    Object.assign(img.style, {
      left: pct(r.x / PREVIEW.w),
      top: pct(r.y / PREVIEW.h),
      width: pct(r.w / PREVIEW.w),
      height: pct(r.h / PREVIEW.h),
    });
    urlFor(ch, pm.get(page.photos[r.i]).file).then((u) => (img.src = u));
    box.append(img);
  }
  return box;
}

function layoutMini(ars, id, selected, onPick) {
  const res = layoutRects(id, ars, PREVIEW.w, PREVIEW.h);
  const box = h('div', { class: 'mini-box' });
  for (const r of res.rects) {
    const d = h('i');
    Object.assign(d.style, {
      left: pct(r.x / PREVIEW.w),
      top: pct(r.y / PREVIEW.h),
      width: pct(r.w / PREVIEW.w),
      height: pct(r.h / PREVIEW.h),
    });
    box.append(d);
  }
  return h('button', { class: 'mini' + (selected ? ' on' : ''), title: id, 'aria-label': 'Layout ' + id, 'aria-pressed': String(selected), onClick: onPick }, box);
}

/**
 * @param {HTMLElement} root  @param {{chapters:object[]}} album  @param {number} ci chapter index
 * @param {{onBack:Function,onView:Function,onSwitch:Function}} nav
 */
export function renderEditor(root, album, ci, nav) {
  const ch = album.chapters[ci];
  let sel = 0;
  let dirty = false;
  let busy = '';

  const warn = (e) => {
    if (dirty) e.preventDefault();
  };
  window.addEventListener('beforeunload', warn);
  const dispose = () => window.removeEventListener('beforeunload', warn);

  const leave = (fn) => () => {
    if (dirty && !window.confirm('You have unsaved changes to this chapter. Leave without saving?')) return;
    dispose();
    fn();
  };

  const touch = (nextSel) => {
    if (nextSel === -1 || nextSel === false) return; // the edit was refused
    dirty = true;
    if (typeof nextSel === 'number') sel = nextSel;
    sel = Math.max(0, Math.min(sel, ch.pages.length - 1));
    render();
  };

  async function save() {
    busy = 'Saving…';
    render();
    try {
      await saveChapter(ch, ({ done, total }) => {
        busy = `Saving… ${done} of ${total} page thumbnails`;
        render();
      });
      dirty = false;
      busy = '';
    } catch (e) {
      busy = '';
      window.alert('Could not save this chapter: ' + (e?.message || e));
    }
    render();
  }

  async function addMusic() {
    const file = await pickAudioFile();
    if (!file) return;
    busy = 'Copying music…';
    render();
    try {
      await setMusic(ch, file);
      dirty = true;
    } catch (e) {
      window.alert('Could not add that music: ' + (e?.message || e));
    }
    busy = '';
    render();
  }

  function pageCard(page, pi) {
    return h(
      'button',
      { class: 'card' + (pi === sel ? ' on' : ''), 'aria-label': `Page ${pi + 1}`, 'aria-pressed': String(pi === sel), onClick: () => ((sel = pi), render()) },
      pagePreview(ch, page),
      h('span', { class: 'num' }, pi + 1),
    );
  }

  function panel() {
    const page = ch.pages[sel];
    if (!page) return h('p', { class: 'muted' }, 'This chapter has no pages.');
    const pm = ops.photoMap(ch);
    const ars = ops.pageAspects(ch, page);
    const opts = ops.layoutOptions(ch, page);
    const canPrev = sel > 0 && ch.pages[sel - 1].photos.length < MAX_PHOTOS_PER_PAGE;
    const canNext = sel < ch.pages.length - 1 && ch.pages[sel + 1].photos.length < MAX_PHOTOS_PER_PAGE;

    return h(
      'div',
      { class: 'panel' },
      h(
        'div',
        { class: 'row between' },
        h('h3', null, `Page ${sel + 1} of ${ch.pages.length}`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'ghost', disabled: sel === 0, onClick: () => touch(ops.movePage(ch, sel, -1)) }, 'Move earlier'),
          h('button', { class: 'ghost', disabled: sel === ch.pages.length - 1, onClick: () => touch(ops.movePage(ch, sel, 1)) }, 'Move later'),
        ),
      ),
      h('h4', null, 'Layout'),
      h(
        'div',
        { class: 'minis' },
        opts.map((o) => layoutMini(ars, o.id, o.id === page.layout, () => ops.setLayout(ch, sel, o.id) && touch())),
      ),
      opts.length < 2 ? h('p', { class: 'muted' }, 'Only one layout suits these photos.') : null,
      h('h4', null, 'Photos'),
      h(
        'div',
        { class: 'photos' },
        page.photos.map((id, n) => {
          const photo = pm.get(id);
          const img = h('img', { alt: '' });
          urlFor(ch, photo.file).then((u) => (img.src = u));
          return h(
            'div',
            { class: 'ph' },
            h('div', { class: 'ph-img' }, img),
            h(
              'div',
              { class: 'ph-actions' },
              h('button', { class: 'ghost', disabled: n === 0, 'aria-label': 'Move left', onClick: () => ops.movePhoto(ch, sel, n, n - 1) && touch() }, '←'),
              h('button', { class: 'ghost', disabled: n === page.photos.length - 1, 'aria-label': 'Move right', onClick: () => ops.movePhoto(ch, sel, n, n + 1) && touch() }, '→'),
              h('button', { class: 'ghost', disabled: !canPrev, onClick: () => touch(ops.movePhotoToPage(ch, sel, id, sel - 1)) }, 'To previous page'),
              h('button', { class: 'ghost', disabled: !canNext, onClick: () => touch(ops.movePhotoToPage(ch, sel, id, sel + 1)) }, 'To next page'),
              h('button', { class: 'ghost', disabled: page.photos.length < 2, onClick: () => touch(ops.photoToNewPage(ch, sel, id)) }, 'To its own page'),
              h(
                'button',
                {
                  class: 'danger',
                  onClick: () => {
                    if (window.confirm('Delete this photo from the book? The copy in this chapter is removed when you save. Your original is not touched.')) touch(ops.deletePhoto(ch, id));
                  },
                },
                'Delete',
              ),
            ),
          );
        }),
      ),
    );
  }

  function render() {
    root.replaceChildren(
      h(
        'div',
        { class: 'editor' },
        h(
          'header',
          { class: 'bar' },
          h('button', { class: 'ghost', onClick: leave(nav.onBack) }, '← Back to book'),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'ghost', 'aria-label': 'Previous chapter', disabled: ci === 0, onClick: leave(() => nav.onSwitch(ci - 1)) }, '‹'),
            h('strong', null, ch.name),
            h('button', { class: 'ghost', 'aria-label': 'Next chapter', disabled: ci === album.chapters.length - 1, onClick: leave(() => nav.onSwitch(ci + 1)) }, '›'),
          ),
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'muted status' }, busy || (dirty ? 'Unsaved changes' : 'Saved')),
            ch.music
              ? h('span', { class: 'chip' }, '♪ ' + ch.music.name, h('button', { class: 'link', onClick: () => { removeMusic(ch); touch(); } }, 'Remove'))
              : h('button', { class: 'ghost', disabled: !!busy, onClick: addMusic }, 'Add music'),
            h('button', { class: 'ghost', disabled: !!busy, onClick: leave(() => nav.onView(ci, sel)) }, 'View'),
            h('button', { class: 'primary', disabled: !dirty || !!busy, onClick: save }, 'Save'),
          ),
        ),
        h(
          'div',
          { class: 'cols' },
          h('div', { class: 'grid' }, ch.pages.map(pageCard)),
          panel(),
        ),
      ),
    );
  }

  render();
  return { dispose };
}
