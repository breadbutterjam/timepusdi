/* =================================================================
   CARD RENDERER
   A faithful port of buildCardSVG() from Trump Card Studio, reading
   from the studio's exported JSON shape instead of its in-memory rows.

   JSON shape it expects, per card:
     {
       id:       "sanjusamson",
       region:   "Sanju Samson",        -> the big name
       nickname: "chetta thala",        -> the small line under it
       images:   ["assets/.../x.webp"],
       stats: {
         matches: { label: "Matches", display: "191", value: 191 },
         ...                               ^ order here is render order
       },
       imageAdjustment: { scale: 1.12, x: -18, y: 40 }  -> optional
     }

   `imageAdjustment` is optional. When present it's used as-is (it's
   what Trump Card Studio exports when you've nudged/zoomed a photo).
   Cards without it fall back to js/config.js's IMAGE_ADJUSTMENTS map,
   then to a plain cover crop if neither is set.

   A deck's JSON can also carry its own "cardLayout" and/or
   "cardGeometry" at the top level, alongside "cards" — see
   resolveCardConfig() below. Any key it omits falls back to
   js/config.js's DEFAULT_CARD_LAYOUT / DEFAULT_CARD_GEOMETRY, so a
   deck only needs to state what's different about it.
   =================================================================*/

import {
  DEFAULT_CARD_GEOMETRY,
  DEFAULT_CARD_LAYOUT,
  IMAGE_ADJUSTMENTS,
  IMAGE_BASE
} from "./config.js";

/* --- resolving layout/geometry for a deck ------------------------- */

/**
 * Merges a deck's own "cardLayout" / "cardGeometry" (if present) over
 * the defaults from config.js, key by key — a deck only needs to
 * specify what's different. Call this once per loaded deck and reuse
 * the result for every card in it, rather than resolving per card.
 */
function resolveCardConfig(deck) {
  const layout = { ...DEFAULT_CARD_LAYOUT, ...(deck?.cardLayout || {}) };
  const geometry = { ...DEFAULT_CARD_GEOMETRY, ...(deck?.cardGeometry || {}) };

  // Guard the couple of values that break rendering if left invalid
  // rather than just looking a bit off.
  layout.statsColumns = layout.statsColumns === 2 ? 2 : 3;
  layout.statsRowHeight = Number(layout.statsRowHeight) || DEFAULT_CARD_LAYOUT.statsRowHeight;

  geometry.width = Number(geometry.width) || DEFAULT_CARD_GEOMETRY.width;
  geometry.height = Number(geometry.height) || DEFAULT_CARD_GEOMETRY.height;

  return { layout, geometry };
}

/* --- path helpers ------------------------------------------------ */

const ABSOLUTE = /^(data:|https?:|file:|blob:|\/)/i;

/**
 * Glue IMAGE_BASE (or the category's own override) onto the card's
 * relative image path. Absolute paths are left alone.
 */
function imagePath(card, category) {
  const raw = String(card?.images?.[0] || "").trim();
  if (!raw) return "";
  if (ABSOLUTE.test(raw)) return raw;

  const base = category?.imageBase ?? IMAGE_BASE ?? "";
  return (base + raw).replace(/\\/g, "/");
}

/* --- text helpers ------------------------------------------------ */

function escapeXML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps ordinal suffixes (1st, 2nd, 3rd...) in a raised, smaller
 * tspan so date-ish stat values read correctly.
 */
function valueMarkup(v) {
  const text = String(v);
  const re = /(\d+)(st|nd|rd|th)\b/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out += escapeXML(text.slice(last, m.index));
    out += escapeXML(m[1]);
    out += `<tspan style="font-size:0.6em;baseline-shift:super">${escapeXML(m[2])}</tspan>`;
    last = m.index + m[0].length;
  }
  out += escapeXML(text.slice(last));
  return out;
}

/**
 * Same approximation the studio uses to pick a title size. The width
 * factor is deliberately conservative.
 */
function fitTitleFont(name, maxSize, minSize, maxWidth) {
  const text = String(name || "").toUpperCase();
  for (let size = maxSize; size >= minSize; size -= 2) {
    const estimated = text.length * size * 0.54;
    if (estimated <= maxWidth) {
      return { size, lineOffset: size === 52 ? 39 : Math.round(size * 0.75) };
    }
  }
  return { size: minSize, lineOffset: Math.round(minSize * 0.75) };
}

function textEl(x, y, text, cls, size, fill, extra = "") {
  return `<text x="${x}" y="${y}" class="${cls}" font-size="${size}px" fill="${fill}" style="${extra}">${text}</text>`;
}

function colWidth(columns, geometry) {
  const { width, gutter, gridGap } = geometry;
  return (width - gutter * 2 - gridGap * (columns - 1)) / columns;
}

/* --- intrinsic image size (only needed when framing is adjusted) -- */

const sizeCache = new Map();

function getIntrinsicSize(href, geometry) {
  if (sizeCache.has(href)) return sizeCache.get(href);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: geometry.width, height: geometry.height });
    img.src = href;
  });

  sizeCache.set(href, promise);
  return promise;
}

/* --- the photo layer --------------------------------------------- */

/**
 * No adjustment means a plain cover crop, which SVG gives us for free
 * with preserveAspectRatio="slice" — no need to measure the file.
 */
function coverImageLayer(href, geometry) {
  const { width, height } = geometry;
  return (
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#000"/>` +
    `<image href="${escapeXML(href)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
  );
}

/**
 * With an adjustment we transform the *source* crop rather than the
 * already-cropped card image, so zooming out reveals pixels the cover
 * crop hid, and the viewport may run past the source to show black.
 */
function adjustedImageLayer(href, adjustment, imageSize, geometry) {
  const { width: CARD_W, height: CARD_H } = geometry;

  const scale = Number(adjustment.scale || 1);
  const ax = Number(adjustment.x || 0);
  const ay = Number(adjustment.y || 0);

  const iw = Number(imageSize?.width || CARD_W);
  const ih = Number(imageSize?.height || CARD_H);

  const cardAspect = CARD_W / CARD_H;
  const sourceAspect = iw / ih;

  let baseVW, baseVH;
  if (sourceAspect > cardAspect) {
    baseVH = ih;
    baseVW = ih * cardAspect;
  } else {
    baseVW = iw;
    baseVH = iw / cardAspect;
  }

  const vw = baseVW / scale;
  const vh = baseVH / scale;

  // +x moves the image right, +y moves it down
  const centreX = iw / 2 - ax * (vw / CARD_W);
  const centreY = ih / 2 - ay * (vh / CARD_H);

  const vx = centreX - vw / 2;
  const vy = centreY - vh / 2;

  return (
    `<svg x="0" y="0" width="${CARD_W}" height="${CARD_H}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#000"/>` +
    `<image href="${escapeXML(href)}" x="0" y="0" width="${iw}" height="${ih}" preserveAspectRatio="none"/>` +
    `</svg>`
  );
}

/* --- the card ----------------------------------------------------- */

/**
 * Returns an SVG string for one card.
 *
 * `cardConfig` is optional — the { layout, geometry } shape returned
 * by resolveCardConfig(). Pass the deck's own resolved config so
 * per-deck overrides apply; omit it and the raw config.js defaults
 * are used as-is.
 *
 * Async only because adjusted framing needs the photo's real size.
 */
async function buildCardSVG(card, category, cardConfig) {
  const layout = cardConfig?.layout || DEFAULT_CARD_LAYOUT;
  const geometry = cardConfig?.geometry || DEFAULT_CARD_GEOMETRY;

  const {
    width: CARD_W,
    height: CARD_H,
    gutter,
    gridGap,
    blockGap,
    valueRowOffset,
    titleHeight,
    shortNameHeight
  } = geometry;

  const href = imagePath(card, category);
  // A card's own "imageAdjustment" (as exported by the studio) wins;
  // js/config.js's IMAGE_ADJUSTMENTS is only a fallback for decks
  // exported before that field existed.
  const adjustment = card?.imageAdjustment || IMAGE_ADJUSTMENTS[card?.id];
  const isAdjusted =
    adjustment && !(Number(adjustment.scale ?? 1) === 1 && !adjustment.x && !adjustment.y);

  const safeName = escapeXML(String(card.region || "").toUpperCase());
  const shortName = escapeXML(String(card.nickname || "").toUpperCase());
  const hasShortName = String(card.nickname || "").trim() !== "";

  const left = gutter;

  // Stat order comes straight from key order in the JSON.
  const statLayout = Object.entries(card.stats || {}).map(([key, stat]) => ({
    key,
    label: stat?.label ?? key,
    display: stat?.display ?? ""
  }));

  const columns = layout.statsColumns;
  const rowHeight = layout.statsRowHeight;
  const colW = colWidth(columns, geometry);
  const rows = Math.max(1, Math.ceil(statLayout.length / columns));

  // The stats block is bottom-anchored: it ends blockGap above the
  // card's lower edge and grows upward as rows are added.
  const statsTop = CARD_H - blockGap - valueRowOffset - (rows - 1) * rowHeight;

  // Name + nickname form one title unit with zero gap between them.
  // blockGap sits between that unit and the first stat row.
  const shortTop = statsTop - blockGap - shortNameHeight;
  const titleTop = hasShortName ? shortTop - titleHeight : statsTop - blockGap - titleHeight;

  const titleFont = fitTitleFont(card.region, 52, 40, CARD_W - left * 2);

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">`
  );

  out.push(`<style>
    .title,.short{font-family:"Alan Sans",Arial,sans-serif;font-weight:700}
    .label{font-family:Inter,Arial,sans-serif;font-weight:400}
    .value{font-family:Inter,Arial,sans-serif;font-weight:700}
  </style>`);

  if (layout.roundedCorners) {
    out.push(
      `<defs><clipPath id="cardClip"><rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" rx="30"/></clipPath></defs>`
    );
    out.push(`<g clip-path="url(#cardClip)">`);
  }

  if (href) {
    if (isAdjusted) {
      const imageSize = await getIntrinsicSize(href, geometry);
      out.push(adjustedImageLayer(href, adjustment, imageSize, geometry));
    } else {
      out.push(coverImageLayer(href, geometry));
    }
  } else {
    out.push(`<rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" fill="#111"/>`);
  }

  // Two overlapping fades. Positioned as fractions of card height
  // (tuned against the 620x1000 reference) rather than fixed pixels,
  // so a deck with a different "height" keeps the same visual
  // balance instead of the gradient landing in the wrong place.
  const g1y1 = CARD_H * 0.45986;
  const g1y2 = CARD_H * 0.9722;
  const g2y1 = CARD_H * 0.857915;
  const g2y2 = CARD_H * 0.999567;

  out.push(`<defs>
    <linearGradient id="bottomGradient1" x1="0" y1="${g1y1}" x2="0" y2="${g1y2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.27409" stop-color="#000000" stop-opacity="0.75"/>
      <stop offset="0.644307" stop-color="#000000" stop-opacity="1"/>
      <stop offset="1" stop-color="#000000" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="bottomGradient2" x1="0" y1="${g2y1}" x2="0" y2="${g2y2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.237603" stop-color="#000000" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#000000" stop-opacity="1"/>
    </linearGradient>
  </defs>`);
  out.push(`<rect x="0" y="${g1y1}" width="${CARD_W}" height="${CARD_H - g1y1}" fill="url(#bottomGradient1)"/>`);
  out.push(`<rect x="0" y="${g2y1}" width="${CARD_W}" height="${CARD_H - g2y1}" fill="url(#bottomGradient2)"/>`);

  if (layout.roundedCorners) out.push(`</g>`);

  out.push(
    textEl(
      left,
      titleTop + titleFont.lineOffset,
      safeName,
      "title",
      titleFont.size,
      "#FFFFFF",
      "paint-order:stroke;stroke:#000;stroke-width:2px;stroke-linejoin:round"
    )
  );

  if (hasShortName) {
    out.push(
      textEl(
        left,
        shortTop + 31,
        shortName,
        "short",
        32,
        "#FFFFFF",
        "paint-order:stroke;stroke:#000;stroke-width:1.5px;stroke-linejoin:round"
      )
    );
  }

  for (let i = 0; i < statLayout.length; i++) {
    const { label, display } = statLayout[i];

    const row = Math.floor(i / columns);
    const col = i % columns;

    const x = left + col * (colW + gridGap);
    const y = statsTop + row * rowHeight;

    const value = String(display).trim() === "" ? "—" : display;

    out.push(textEl(x, y + 29, escapeXML(label), "label", 24, "#FFFFFF"));
    out.push(textEl(x, y + valueRowOffset, valueMarkup(value), "value", 32, "#FFFFFF"));
  }

  out.push(`</svg>`);
  return out.join("");
}

export { buildCardSVG, imagePath, resolveCardConfig };
