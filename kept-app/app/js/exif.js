/* ============================================================
   exif.js — minimal JPEG EXIF reader (no dependencies)
   Reads: capture time, orientation, GPS position.
   Everything runs on the device. Input is the first ~256 KB of a file.
   ============================================================ */

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** @param {ArrayBuffer} buffer @returns {{takenAt?:number, orientation?:number, lat?:number, lon?:number}} */
export function readExif(buffer) {
  const dv = new DataView(buffer);
  if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 <= dv.byteLength) {
    const marker = dv.getUint16(off);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    const len = dv.getUint16(off + 2);
    // APP1 segment that starts with "Exif"
    if (marker === 0xffe1 && off + 10 <= dv.byteLength && dv.getUint32(off + 4) === 0x45786966) {
      try {
        return parseTiff(dv, off + 10);
      } catch {
        return {};
      }
    }
    off += 2 + len;
  }
  return {};
}

function parseTiff(dv, base) {
  const le = dv.getUint16(base) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le);
  const u32 = (o) => dv.getUint32(o, le);

  const readIfd = (rel) => {
    const start = base + rel;
    const count = u16(start);
    const tags = {};
    for (let i = 0; i < count; i++) {
      const e = start + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * n;
      tags[tag] = { type, count: n, valueAt: size <= 4 ? e + 8 : base + u32(e + 8) };
    }
    return tags;
  };
  const ascii = (t) => {
    let s = '';
    for (let i = 0; i < t.count - 1; i++) s += String.fromCharCode(dv.getUint8(t.valueAt + i));
    return s;
  };
  const rationals = (t) => {
    const out = [];
    for (let i = 0; i < t.count; i++) {
      const den = u32(t.valueAt + i * 8 + 4);
      out.push(den ? u32(t.valueAt + i * 8) / den : 0);
    }
    return out;
  };

  const out = {};
  const ifd0 = readIfd(u32(base + 4));
  if (ifd0[0x0112]) out.orientation = u16(ifd0[0x0112].valueAt);

  if (ifd0[0x8769]) {
    const exif = readIfd(u32(ifd0[0x8769].valueAt));
    const dt = exif[0x9003] || exif[0x9004];
    if (dt) out.takenAt = parseExifDate(ascii(dt));
  }
  if (out.takenAt === undefined && ifd0[0x0132]) out.takenAt = parseExifDate(ascii(ifd0[0x0132]));

  if (ifd0[0x8825]) {
    const gps = readIfd(u32(ifd0[0x8825].valueAt));
    if (gps[2] && gps[4]) {
      const [d1, m1, s1] = rationals(gps[2]);
      const [d2, m2, s2] = rationals(gps[4]);
      let lat = d1 + m1 / 60 + s1 / 3600;
      let lon = d2 + m2 / 60 + s2 / 3600;
      if (gps[1] && ascii(gps[1]).startsWith('S')) lat = -lat;
      if (gps[3] && ascii(gps[3]).startsWith('W')) lon = -lon;
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        out.lat = lat;
        out.lon = lon;
      }
    }
  }
  return out;
}

/** "2026:11:02 14:05:09" → ms. Camera local time is treated as if it were UTC so the
 *  gaps between photos stay correct without knowing the time zone. */
export function parseExifDate(s) {
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s);
  if (!m || m[1] === '0000') return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : undefined;
}
