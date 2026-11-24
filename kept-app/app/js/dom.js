/* ============================================================
   dom.js — tiny element builder so views stay readable
   h('button', {class:'primary', onClick: fn}, 'Save')
   ============================================================ */

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.length > 2 && k.startsWith('on') && k[2] === k[2].toUpperCase()) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const px = (n) => Math.round(n * 100) / 100 + 'px';
export const pct = (n) => Math.round(n * 10000) / 100 + '%';
