/* ============================================================
   layout.js — the never-crop layout engine
   A template is a tree: a number is a photo slot, ['h', …] is a row,
   ['v', …] is a column. Every photo keeps its own aspect ratio, so
   nothing is ever cropped. Rows share a height, columns share a width.
   Template names are what the manifest stores.
   ============================================================ */

/* ---- Tunable look (fractions of the page height) ---- */
export const PAGE_PADDING = 0.06;
export const PHOTO_GAP = 0.035;
/* A template is offered only if it fills at least this share of the best one */
export const APPLICABLE_RATIO = 0.72;

export const TEMPLATES = {
  1: { single: ['h', 0] },
  2: {
    row: ['h', 0, 1],
    stack: ['v', 0, 1],
  },
  3: {
    row: ['h', 0, 1, 2],
    'left-big': ['h', 0, ['v', 1, 2]],
    'right-big': ['h', ['v', 0, 1], 2],
    'top-big': ['v', 0, ['h', 1, 2]],
    'bottom-big': ['v', ['h', 0, 1], 2],
    stack: ['v', 0, 1, 2],
  },
  4: {
    row: ['h', 0, 1, 2, 3],
    grid: ['v', ['h', 0, 1], ['h', 2, 3]],
    'left-big': ['h', 0, ['v', 1, 2, 3]],
    'top-big': ['v', 0, ['h', 1, 2, 3]],
    columns: ['h', ['v', 0, 1], ['v', 2, 3]],
  },
};

export const MAX_PHOTOS_PER_PAGE = 4;

const sum = (xs) => xs.reduce((s, x) => s + x, 0);

/* Width of a node is always a + b·height, so a whole tree solves in closed form. */
function affine(node, ar, gap) {
  if (typeof node === 'number') return { a: ar[node], b: 0 };
  const [kind, ...kids] = node;
  const parts = kids.map((k) => affine(k, ar, gap));
  const gaps = (kids.length - 1) * gap;
  if (kind === 'h') return { a: sum(parts.map((p) => p.a)), b: sum(parts.map((p) => p.b)) + gaps };
  const S = sum(parts.map((p) => 1 / p.a));
  return { a: 1 / S, b: (sum(parts.map((p) => p.b / p.a)) - gaps) / S };
}

function place(node, ar, gap, x, y, H, out) {
  if (typeof node === 'number') {
    out.push({ i: node, x, y, w: ar[node] * H, h: H });
    return;
  }
  const [kind, ...kids] = node;
  const parts = kids.map((k) => affine(k, ar, gap));
  const me = affine(node, ar, gap);
  const W = me.a * H + me.b;
  if (kind === 'h') {
    let cx = x;
    kids.forEach((k, n) => {
      place(k, ar, gap, cx, y, H, out);
      cx += parts[n].a * H + parts[n].b + gap;
    });
  } else {
    let cy = y;
    kids.forEach((k, n) => {
      const h = (W - parts[n].b) / parts[n].a;
      place(k, ar, gap, x, cy, h, out);
      cy += h + gap;
    });
  }
}

/** Fit a template into a page of the given pixel size.
 *  @returns {{rects:{i:number,x:number,y:number,w:number,h:number}[], coverage:number}|null} */
export function fit(template, ars, width, height) {
  const pad = PAGE_PADDING * height;
  const gap = PHOTO_GAP * height;
  const availW = width - 2 * pad;
  const availH = height - 2 * pad;
  const { a, b } = affine(template, ars, gap);
  const H = Math.min(availH, (availW - b) / a);
  if (!(H > 0) || !Number.isFinite(H)) return null;
  const totalW = a * H + b;
  const rects = [];
  place(template, ars, gap, pad + (availW - totalW) / 2, pad + (availH - H) / 2, H, rects);
  rects.sort((p, q) => p.i - q.i);
  const area = sum(rects.map((r) => r.w * r.h));
  return { rects, coverage: area / (width * height) };
}

/** Layouts that suit this set of aspect ratios, best first. Reference page is 16:9. */
export function options(ars, width = 1920, height = 1080) {
  const set = TEMPLATES[ars.length];
  if (!set) return [];
  const scored = Object.entries(set)
    .map(([id, tpl]) => ({ id, coverage: fit(tpl, ars, width, height)?.coverage ?? 0 }))
    .sort((p, q) => q.coverage - p.coverage);
  const best = scored[0].coverage;
  return scored.filter((s, n) => n === 0 || s.coverage >= best * APPLICABLE_RATIO);
}

export function layoutRects(layoutId, ars, width, height) {
  const tpl = TEMPLATES[ars.length]?.[layoutId];
  if (tpl === undefined) return null;
  return fit(tpl, ars, width, height);
}
