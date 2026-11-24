/* ============================================================
   draw.js — image work done in the browser, on the device
   ============================================================ */

import { layoutRects, options } from './layout.js';
import { pageAspects, photoMap } from './ops.js';

/* ---- Tunable output quality ---- */
export const COPY_MAX_EDGE = 1920; // "1080p": long edge of the stored copy
export const COPY_QUALITY = 0.88;
export const THUMB_SIZE = { w: 320, h: 180, quality: 0.8 };

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
export const HEIC_EXT = /\.(heic|heif)$/i;

const whiteCanvas = (w, h) => {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  return { c, g };
};

/** Small preview for the chapter-confirm screen. Returns the original's size too. */
export async function makePreview(file, edge = 220) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width: w, height: h } = bmp;
  const s = Math.min(1, edge / Math.max(w, h));
  const { c, g } = whiteCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { w, h, blob: await c.convertToBlob({ type: 'image/jpeg', quality: 0.72 }) };
}

/** The stored copy (orientation baked in, metadata dropped) plus a small bitmap for page thumbnails. */
export async function makeCopy(file, { maxEdge = COPY_MAX_EDGE, quality = COPY_QUALITY, smallEdge = 480 } = {}) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const hgt = Math.max(1, Math.round(bmp.height * s));
  const { c, g } = whiteCanvas(w, hgt);
  g.drawImage(bmp, 0, 0, w, hgt);
  bmp.close();
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
  const k = Math.min(1, smallEdge / Math.max(w, hgt));
  const small = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(hgt * k)));
  const sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, 0, 0, small.width, small.height);
  return { blob, w, h: hgt, small: small.transferToImageBitmap() };
}

/** Render one page as a small JPEG for the thumbnail strip. */
export async function renderPageThumb(chapter, page, bitmaps) {
  const { w, h, quality } = THUMB_SIZE;
  const ars = pageAspects(chapter, page);
  const res = layoutRects(page.layout, ars, w, h) ?? layoutRects(options(ars)[0].id, ars, w, h);
  const { c, g } = whiteCanvas(w, h);
  for (const r of res.rects) {
    const bmp = bitmaps.get(page.photos[r.i]);
    if (bmp) g.drawImage(bmp, r.x, r.y, r.w, r.h);
  }
  return c.convertToBlob({ type: 'image/jpeg', quality });
}

export { photoMap };
