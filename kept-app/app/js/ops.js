/* ============================================================
   ops.js — the edits a person can make to a chapter
   A chapter is {photos:[{id,file,w,h,…}], pages:[{id,layout,photos:[ids],transition}], deleted:[files]}.
   Functions change the chapter in place and return true / a page index, or false / -1 if refused.
   Rule: when the photos on a page change, its layout is re-picked. Reordering keeps the layout.
   ============================================================ */

import { options, TEMPLATES, MAX_PHOTOS_PER_PAGE } from './layout.js';

export const photoMap = (ch) => new Map(ch.photos.map((p) => [p.id, p]));

export function pageAspects(ch, page) {
  const m = photoMap(ch);
  return page.photos.map((id) => {
    const p = m.get(id);
    return p.w / p.h;
  });
}

export const layoutOptions = (ch, page) => options(pageAspects(ch, page));

const relayout = (ch, page) => {
  page.layout = layoutOptions(ch, page)[0].id;
};

function nextPageId(ch) {
  let max = 0;
  for (const p of ch.pages) max = Math.max(max, parseInt(p.id.slice(2), 10) || 0);
  return 'pg' + String(max + 1).padStart(4, '0');
}

export function setLayout(ch, pi, id) {
  const page = ch.pages[pi];
  if (!page || !TEMPLATES[page.photos.length]?.[id]) return false;
  page.layout = id;
  return true;
}

/** Reorder a photo inside its page. */
export function movePhoto(ch, pi, from, to) {
  const list = ch.pages[pi]?.photos;
  if (!list || from < 0 || from >= list.length || to < 0 || to >= list.length) return false;
  const [id] = list.splice(from, 1);
  list.splice(to, 0, id);
  return true;
}

/** Move a photo onto another page. Returns the destination page's new index, or -1. */
export function movePhotoToPage(ch, pi, photoId, target) {
  const src = ch.pages[pi];
  const dst = ch.pages[target];
  if (!src || !dst || target === pi || !src.photos.includes(photoId)) return -1;
  if (dst.photos.length >= MAX_PHOTOS_PER_PAGE) return -1;
  src.photos.splice(src.photos.indexOf(photoId), 1);
  if (target > pi) dst.photos.unshift(photoId);
  else dst.photos.push(photoId);
  relayout(ch, dst);
  if (src.photos.length === 0) {
    ch.pages.splice(pi, 1);
    return target > pi ? target - 1 : target;
  }
  relayout(ch, src);
  return target;
}

/** Split one photo out onto a new page right after its page. Returns the new page index, or -1. */
export function photoToNewPage(ch, pi, photoId) {
  const src = ch.pages[pi];
  if (!src || src.photos.length < 2 || !src.photos.includes(photoId)) return -1;
  src.photos.splice(src.photos.indexOf(photoId), 1);
  relayout(ch, src);
  const page = { id: nextPageId(ch), layout: 'single', photos: [photoId], transition: 'slide' };
  ch.pages.splice(pi + 1, 0, page);
  return pi + 1;
}

/** Delete a photo from the book. Its file is queued for removal on save. */
export function deletePhoto(ch, photoId) {
  const pi = ch.pages.findIndex((p) => p.photos.includes(photoId));
  if (pi < 0) return -1;
  const page = ch.pages[pi];
  page.photos.splice(page.photos.indexOf(photoId), 1);
  const file = ch.photos.find((p) => p.id === photoId)?.file;
  ch.photos = ch.photos.filter((p) => p.id !== photoId);
  if (file) (ch.deleted ||= []).push(file);
  if (page.photos.length === 0) {
    ch.pages.splice(pi, 1);
    return Math.min(pi, ch.pages.length - 1);
  }
  relayout(ch, page);
  return pi;
}

export function movePage(ch, pi, delta) {
  const to = pi + delta;
  if (!ch.pages[pi] || to < 0 || to >= ch.pages.length) return -1;
  const [page] = ch.pages.splice(pi, 1);
  ch.pages.splice(to, 0, page);
  return to;
}
