/* ============================================================
   viewer.js — fullscreen book viewer
   Arrow keys or corner buttons turn pages with a slide.
   A button opens the thumbnail strip. Mute is in the corner when a chapter has music.
   ============================================================ */

import { h, px, pct } from './dom.js';
import { layoutRects, options } from './layout.js';
import { photoMap, pageAspects } from './ops.js';
import { urlFor } from './store.js';
import { MusicPlayer } from './music.js';

/* ---- Tunable ---- */
const SLIDE_MS = 450;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @param {{chapters:object[]}} album  @param {{chapter?:number,page?:number}} start */
export function openViewer(album, start = {}, onClose = () => {}) {
  const seq = [];
  album.chapters.forEach((ch, ci) => ch.pages.forEach((_, pi) => seq.push({ ci, pi })));
  if (!seq.length) return;

  let idx = Math.max(0, seq.findIndex((s) => s.ci === (start.chapter ?? 0) && s.pi === (start.page ?? 0)));
  let current = null;
  let token = 0;
  let closed = false;
  const music = new MusicPlayer();

  const stage = h('div', { class: 'stage' });
  const strip = h('div', { class: 'strip', 'aria-hidden': 'true' });
  const btnPrev = h('button', { class: 'vbtn', 'aria-label': 'Previous page', onClick: () => go(-1) }, '‹');
  const btnNext = h('button', { class: 'vbtn', 'aria-label': 'Next page', onClick: () => go(1) }, '›');
  const btnClose = h('button', { class: 'vbtn', 'aria-label': 'Close', onClick: () => close() }, '✕');
  const btnPages = h('button', { class: 'vbtn', 'aria-label': 'Show pages', onClick: () => toggleStrip() }, '▦');
  const btnMute = h('button', { class: 'vbtn', 'aria-label': 'Sound on or off', onClick: () => muteToggle() }, '♪');
  const root = h(
    'div',
    { class: 'viewer', role: 'dialog', 'aria-label': 'Book viewer' },
    stage,
    h('div', { class: 'corner tl' }, btnPages),
    h('div', { class: 'corner tr' }, btnClose),
    h('div', { class: 'corner bl' }, btnMute),
    h('div', { class: 'corner br' }, btnPrev, btnNext),
    strip,
  );

  /* ---- drawing a page ---- */
  async function buildLayer(i) {
    const { ci, pi } = seq[i];
    const ch = album.chapters[ci];
    const page = ch.pages[pi];
    const pm = photoMap(ch);
    const ars = pageAspects(ch, page);
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const res = layoutRects(page.layout, ars, W, H) ?? layoutRects(options(ars)[0].id, ars, W, H);
    const layer = h('div', { class: 'layer' });
    const imgs = await Promise.all(
      res.rects.map(async (r) => {
        const photo = pm.get(page.photos[r.i]);
        const img = h('img', { class: 'photo', alt: '', draggable: 'false' });
        Object.assign(img.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
        img.src = await urlFor(ch, photo.file);
        layer.append(img);
        return img;
      }),
    );
    await Promise.all(imgs.map((im) => im.decode().catch(() => {})));
    return layer;
  }

  async function show(dir) {
    const mine = ++token;
    const layer = await buildLayer(idx);
    if (mine !== token || closed) return;
    const old = current;
    for (const l of stage.querySelectorAll('.layer')) if (l !== old) l.remove();
    current = layer;
    const animate = old && dir !== 0 && !reducedMotion();
    if (animate) layer.style.transform = `translateX(${dir * 100}%)`;
    stage.append(layer);
    if (animate) {
      layer.getBoundingClientRect();
      const ease = `transform ${SLIDE_MS}ms cubic-bezier(.4,0,.2,1)`;
      layer.style.transition = ease;
      old.style.transition = ease;
      layer.style.transform = 'translateX(0)';
      old.style.transform = `translateX(${-dir * 100}%)`;
      setTimeout(() => old.remove(), SLIDE_MS + 40);
    } else if (old) {
      old.remove();
    }
    updateChrome();
    music.setChapter(album.chapters[seq[idx].ci]);
    preload(idx + 1);
    preload(idx - 1);
  }

  function preload(i) {
    if (i < 0 || i >= seq.length) return;
    const { ci, pi } = seq[i];
    const ch = album.chapters[ci];
    const pm = photoMap(ch);
    for (const id of ch.pages[pi].photos) urlFor(ch, pm.get(id).file);
  }

  function updateChrome() {
    btnPrev.disabled = idx === 0;
    btnNext.disabled = idx === seq.length - 1;
    const hasMusic = !!album.chapters[seq[idx].ci].music || music.active;
    btnMute.hidden = !hasMusic;
    btnMute.textContent = music.muted ? '♪̸' : '♪';
    btnMute.setAttribute('aria-pressed', String(music.muted));
    markStrip();
  }

  function go(delta) {
    const next = Math.min(seq.length - 1, Math.max(0, idx + delta));
    if (next === idx) return;
    idx = next;
    show(delta);
  }

  function jump(i) {
    if (i === idx) return;
    const dir = i > idx ? 1 : -1;
    idx = i;
    show(dir);
  }

  function muteToggle() {
    music.toggleMute();
    updateChrome();
  }

  /* ---- thumbnail strip: one thumbnail per page, chapter covers marked ---- */
  let stripBuilt = false;
  function buildStrip() {
    stripBuilt = true;
    const row = h('div', { class: 'strip-row' });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const { ci, pi } = seq[+e.target.dataset.i];
          const ch = album.chapters[ci];
          const t = ch.pages[pi].thumb;
          if (t) urlFor(ch, t).then((u) => (e.target.querySelector('img').src = u));
        }
      },
      { root: row, rootMargin: '300px' },
    );
    seq.forEach((s, i) => {
      const cover = s.pi === 0;
      const b = h(
        'button',
        { class: 'thumb' + (cover ? ' cover' : ''), 'data-i': i, 'aria-label': `Page ${i + 1}`, onClick: () => jump(i) },
        h('img', { alt: '' }),
      );
      row.append(b);
      io.observe(b);
    });
    strip.append(row);
  }

  function markStrip() {
    if (!stripBuilt) return;
    for (const b of strip.querySelectorAll('.thumb')) b.classList.toggle('now', +b.dataset.i === idx);
  }

  function toggleStrip(force) {
    const open = force ?? !strip.classList.contains('open');
    if (open && !stripBuilt) buildStrip();
    strip.classList.toggle('open', open);
    strip.setAttribute('aria-hidden', String(!open));
    if (open) {
      markStrip();
      strip.querySelector('.thumb.now')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }

  /* ---- input ---- */
  function onKey(e) {
    music.resume();
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        go(1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        go(-1);
        break;
      case 'Home':
        jump(0);
        break;
      case 'End':
        jump(seq.length - 1);
        break;
      case 's':
      case 'S':
        toggleStrip();
        break;
      case 'm':
      case 'M':
        muteToggle();
        break;
      case 'Escape':
        if (strip.classList.contains('open')) toggleStrip(false);
        else close();
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  const onResize = () => show(0);
  const onFullscreen = () => {
    if (!document.fullscreenElement) close();
  };

  function close() {
    if (closed) return;
    closed = true;
    token++;
    music.stop();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreen);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.remove();
    onClose();
  }

  root.addEventListener('pointerdown', () => music.resume());
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  document.body.append(root);
  root.requestFullscreen?.().then(() => document.addEventListener('fullscreenchange', onFullscreen)).catch(() => {});
  btnClose.focus({ preventScroll: true });
  show(0);

  return { close, go, jump, get index() { return idx; }, music };
}

export { pct };
