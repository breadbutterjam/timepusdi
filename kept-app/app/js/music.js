/* ============================================================
   music.js — one looping track per chapter, crossfaded between chapters
   Music comes from the album folder (the person's own files).
   ============================================================ */

import { readChapterFile } from './store.js';

/* ---- Tunable ---- */
const FADE_MS = 1200;
const VOLUME = 0.85;

function fade(audio, from, to, ms, done) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

export class MusicPlayer {
  constructor() {
    this.current = null; // {audio, url}
    this.key = null;
    this.muted = false;
    this.token = 0;
    this.fading = new Set();
  }

  get active() {
    return !!this.current;
  }

  async setChapter(ch) {
    const key = ch.music ? ch.dirName + '/' + ch.music.file : null;
    if (key === this.key) return;
    this.key = key;
    const token = ++this.token;

    const old = this.current;
    this.current = null;
    if (old) this.#fadeOut(old);
    if (!key) return;

    try {
      const url = URL.createObjectURL(await readChapterFile(ch, ch.music.file));
      if (token !== this.token) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0;
      audio.muted = this.muted;
      this.current = { audio, url };
      await audio.play();
      fade(audio, 0, VOLUME, FADE_MS);
    } catch {
      /* the browser may block sound until the next click or key press; resume() retries */
    }
  }

  /** Called on any key press or click, in case the browser held back the first play(). */
  resume() {
    const a = this.current?.audio;
    if (a && a.paused) a.play().then(() => fade(a, a.volume, VOLUME, 600)).catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.current) this.current.audio.muted = this.muted;
    for (const t of this.fading) t.audio.muted = this.muted;
    return this.muted;
  }

  stop() {
    this.token++;
    this.key = null;
    const old = this.current;
    this.current = null;
    if (old) this.#fadeOut(old);
  }

  #fadeOut(track) {
    this.fading.add(track);
    fade(track.audio, track.audio.volume, 0, FADE_MS, () => {
      track.audio.pause();
      URL.revokeObjectURL(track.url);
      this.fading.delete(track);
    });
  }
}
