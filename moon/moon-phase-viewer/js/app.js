/* =========================================================
   APP.JS
   UI logic. All astronomy lives in ephemeris.js / tithi-engine.js /
   suncalc.js — this file just renders their output.

   The main screen and the detail view (opened by tapping the moon)
   share ONE day pointer (currentDayStartMs). The ‹ › buttons in
   either screen move the same day and both re-render together —
   the detail view is an expanded view of the same day, not a
   separate browsing mode.
========================================================= */

/* ---------- Gujarati calendar naming (the one place hand-maintained
   data lives, by design — see the README for why this stays a small
   hardcoded list rather than a full computed panchang). ---------- */

// 12 lunar months, in order. These are lookup KEYS into the active
// locale file (locales/<lang>.json, under "months") — not display
// text themselves. Display text (English, Gujarati, Hindi, Marathi
// so far) lives entirely in the locale files; see js/i18n.js.
const MONTH_KEYS = [
    "chaitra", "vaishakh", "jyeshta", "ashadh", "shravan", "bhadarvo",
    "ashwin", "kartik", "magshar", "posh", "maha", "fagan"
];

// Adhik maas (leap month) occurrences: each one is a real extra lunar
// month inserted immediately BEFORE the regular occurrence of the
// named month — e.g. {year:2026, month:2} means an "Adhik Jyeshta"
// (index 2) appeared in 2026, directly preceding that year's regular
// Jyeshta. `year` is the Gregorian/IST year the adhik month's own
// Sud Ekam falls in. `month` is a MONTH_KEYS index (same convention
// used everywhere else in this file).
//
// This needs ~1 new entry roughly every 2-3 years to stay correct —
// add the next one as soon as it's known. Only entries that fall
// within data/tithi-data.json's generated range (see README) actually
// affect anything; see buildMonthSequence() below for how far that
// currently reaches, and monthNameFor()'s fallback for what happens
// outside it.
const ADHIK_MAAS = [
    { year: 2023, month: 4 }, // Adhik Shravan
    { year: 2026, month: 2 }  // Adhik Jyeshta
];

// 14 tithi lookup keys (same idea as MONTH_KEYS above). Purnima/Amas
// (the 15th tithi of each paksha) are handled separately — they're
// scalar keys ("purnima"/"amas" in the locale file), not part of this
// array — since they replace the counted name entirely rather than
// just translating it.
const TITHI_KEYS = [
    "ekam", "beej", "trij", "choth", "pancham",
    "chhath", "satam", "aatham", "nom", "dasham",
    "ekadashi", "baras", "teras", "chaudas"
];

// Anchor: a known Sud Ekam (tithi index 0) instant, and which of the
// 12 month names it corresponds to — the one fixed point the whole
// month sequence (see buildMonthSequence()) is built outward from in
// both directions. This exact timestamp is the real generated
// Jyeshta Sud Ekam 2026 — see data/tithi-data.json. Since adhik maas
// is now handled by actually walking the sequence (rather than plain
// modular counting), this no longer needs to sit on any particular
// side of an adhik occurrence — any verified {instant, index} pair
// works.
const ANCHOR_MS = Date.parse('2026-06-15T02:55:04Z');
const ANCHOR_MONTH_INDEX = 2; // Jyeshta

const DATA_URL = 'data/tithi-data.json';
const MOON_IMAGE_PROXY = 'https://timepusdi.vercel.app/api/moon';
const IST_TZ = 'Asia/Kolkata';
const DAY_MS = 86400000;

// Location for sunrise calculation. No picker yet — Mumbai only,
// hardcoded. (SunCalc, vendored in js/suncalc.js, does the math.)
const LOCATION = { lat: 19.0760, lng: 72.8777 };

const TITHI_MODE_KEY = 'moonPhaseViewer.tithiMode';
const SPLASH_HIDE_KEY = 'moonPhaseViewer.hideSplash';
const LANGUAGE_KEY = 'moonPhaseViewer.language';

// BCP-47 locale tag per supported language, used ONLY for display
// formatting (Gregorian weekday/month names via Intl) — never for the
// machine-readable <input type="date"> value, which always stays
// 'en-CA' regardless of language (see toISTDateInputValue).
const LOCALE_MAP = { en: 'en-US', gu: 'gu-IN', hi: 'hi-IN', mr: 'mr-IN' };
function displayLocale() { return LOCALE_MAP[I18n.getLanguage()] || 'en-US'; }

// Background photo prefetch: a bounded sliding window around whatever
// day is currently shown, not an unbounded chain. Every render call
// re-anchors this window on the current day, so navigating slides it
// rather than growing it — the edge that scrolls into view gets
// queued, everything already fetched is skipped (see
// prefetchedDayKeys), and nothing beyond these bounds is ever touched
// until the user actually navigates there.
const PREFETCH_DAYS_BACK = 3;
const PREFETCH_DAYS_FORWARD = 5;

/* ---------- IST-aware date/time helpers ---------- */

function istMidnightUtcMs(refDate) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const map = {};
    fmt.formatToParts(refDate).forEach(p => { map[p.type] = p.value; });
    return Date.UTC(+map.year, +map.month - 1, +map.day, 0, 0, 0) - 5.5 * 3600000;
}

function formatClockTimeIST(date) {
    const fmt = new Intl.DateTimeFormat(displayLocale(), { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    return fmt.format(date).replace(' ', '').toLowerCase();
}

// 0-11, IST calendar month.
function istMonthIndexOf(date) {
    return +new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, month: 'numeric' }).format(date) - 1;
}

// Gregorian month name from the locale file (gregorianMonths, a plain
// 12-entry array indexed Jan=0..Dec=11) rather than Intl's own
// abbreviated-month data — Intl's SHORT form for these three
// languages turns out to be an awkward phonetic shortening (e.g.
// gu-IN gives "ઑક્ટો" for October) with no real native-language
// convention behind it, unlike weekday abbreviations, which Hindu
// calendars already have well-established native short forms for
// (tied to the days' planetary associations). The LONG form reads
// naturally in all of them, so that's what's used here — full month
// names, user-editable per language directly in locales/<lang>.json.
function gregorianMonthName(date) {
    return I18n.t('gregorianMonths.' + istMonthIndexOf(date));
}

// "Thursday, 24-October-2026"
function formatGregorianIST(date) {
    const fmt = new Intl.DateTimeFormat(displayLocale(), { timeZone: IST_TZ, weekday: 'long', day: '2-digit', year: 'numeric' });
    const map = {};
    fmt.formatToParts(date).forEach(p => { map[p.type] = p.value; });
    return `${map.weekday}, ${map.day}-${gregorianMonthName(date)}-${map.year}`;
}

// "2026-09-24" — the exact string format <input type="date"> uses,
// so this doubles as both the display-sync value and (reversed, see
// parseISTDateInputValue) the read path when the user picks a date.
function toISTDateInputValue(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Reads an <input type="date"> value ("YYYY-MM-DD", no timezone of
// its own) as an IST calendar date, returning that day's IST-midnight
// UTC instant — consistent with istMidnightUtcMs() everywhere else.
function parseISTDateInputValue(value) {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 3600000;
}

// "Wed 07-October-2026" — used to disambiguate which day a clock time
// belongs to (a tithi ending "12:43am" could be today or tomorrow).
function formatCompactDateIST(date) {
    const fmt = new Intl.DateTimeFormat(displayLocale(), { timeZone: IST_TZ, weekday: 'short', day: '2-digit', year: 'numeric' });
    const map = {};
    fmt.formatToParts(date).forEach(p => { map[p.type] = p.value; });
    return `${map.weekday} ${map.day}-${gregorianMonthName(date)}-${map.year}`;
}

function formatLongDateIST(date) {
    return date.toLocaleDateString(displayLocale(), { timeZone: IST_TZ, month: 'long', day: 'numeric', weekday: 'long' });
}

function istYearOf(date) {
    return +new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric' }).format(date);
}

/* ---------- state ---------- */

let currentDayStartMs = istMidnightUtcMs(new Date());
let tithiMode = (function () {
    try {
        const stored = localStorage.getItem(TITHI_MODE_KEY);
        if (stored === 'sunrise' || stored === 'majority') return stored;
    } catch (e) { /* localStorage unavailable */ }
    return 'sunrise'; // default
})();
let currentMainTithiInfo = null; // the tithi shown for currentDayStartMs (see getMainTithiForDay)
let currentUpcoming = null; // { nextFullMoon, nextNewMoon } for currentDayStartMs — see renderAll
let renderToken = 0;

function storedLanguage() {
    try {
        const stored = localStorage.getItem(LANGUAGE_KEY);
        if (stored && LOCALE_MAP[stored]) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return 'en';
}

// Precomputed, adhik-maas-aware month sequence — one entry per new
// moon in the loaded data file, built once by buildMonthSequence()
// after TithiEngine finishes loading. See that function for how it's
// built; monthNameFor() below is just a lookup against this.
let monthSequence = []; // [{ms, index, isAdhik}, ...] sorted ascending

/* ---------- misc helpers ---------- */

function mod(n, m) { return ((n % m) + m) % m; }

// Does the Sun's SIDEREAL longitude (Lahiri) cross a 30deg sign
// boundary (a Sankranti) anywhere within [startMs, endMs)? A lunar
// month with NO Sankranti inside it is, by definition, adhik. Dense
// 6h sampling with a simple bucket-change check — safe here (unlike
// checking a single fixed angle elsewhere) since sidereal longitude
// moves smoothly forward ~0.98deg/day with no retrograde, and a lunar
// month (~29.5 days) never comes close to spanning a full 360deg
// revolution, so there's no wraparound ambiguity to guard against.
function monthHasSankranti(startMs, endMs) {
    const stepMs = 6 * 3600000;
    let prevSign = Math.floor(MoonEphemeris.siderealSunLongitude(new Date(startMs)) / 30);
    let t = startMs;
    while (t < endMs) {
        t = Math.min(t + stepMs, endMs);
        const sign = Math.floor(MoonEphemeris.siderealSunLongitude(new Date(t)) / 30);
        if (sign !== prevSign) return true;
        prevSign = sign;
    }
    return false;
}

// Walks every new moon in the loaded data file outward from ANCHOR_MS
// in both directions, assigning each one a month index and an adhik
// flag — so, unlike plain modular counting, an adhik occurrence
// correctly repeats the following month's index instead of silently
// shifting everything after it by one.
//
// Adhik detection itself is "manual table first, calculated fallback"
// (see isAdhikAtIndex): ADHIK_MAAS is checked first for an explicit,
// panchang-verified entry; anything not listed there is decided by
// actually checking that specific lunar month for a Sankranti. This
// has been cross-checked against a real panchang across 2015-2035 and
// matched on every occurrence, including both of the entries already
// in ADHIK_MAAS — so the table only needs to grow when a trusted
// source disagrees with the calculation, not on any fixed schedule.
//
// The sequencing rule itself is unchanged: an adhik month always
// takes the SAME index as the regular month immediately after it, and
// does not itself advance the running "last regular month" counter —
// only the regular occurrence does. Walking forward, that means
// deciding whether the next step's candidate index is adhik before
// accepting it as regular. Walking backward is the mirror image: from
// a regular month, check whether the new moon immediately before it
// is that same month's adhik twin; from an adhik month, the one
// before it is always the plain previous regular month.
function buildMonthSequence() {
    const newMoonDates = TithiEngine.getNewMoonDates();
    monthSequence = [];
    if (newMoonDates.length === 0) return;

    function isAdhikAtIndex(i, candidateIndex) {
        const year = istYearOf(newMoonDates[i]);
        if (ADHIK_MAAS.some(e => e.year === year && e.month === candidateIndex)) return true;
        const monthStartMs = newMoonDates[i].getTime();
        const monthEndMs = (i + 1 < newMoonDates.length) ? newMoonDates[i + 1].getTime() : monthStartMs + 31 * 86400000;
        return !monthHasSankranti(monthStartMs, monthEndMs);
    }

    let anchorPos = -1, bestDiff = Infinity;
    for (let i = 0; i < newMoonDates.length; i++) {
        const diff = Math.abs(newMoonDates[i].getTime() - ANCHOR_MS);
        if (diff < bestDiff) { bestDiff = diff; anchorPos = i; }
    }

    const seq = new Array(newMoonDates.length);
    seq[anchorPos] = { index: ANCHOR_MONTH_INDEX, isAdhik: false };

    let regIdx = ANCHOR_MONTH_INDEX;
    for (let i = anchorPos + 1; i < newMoonDates.length; i++) {
        const candidate = mod(regIdx + 1, 12);
        if (isAdhikAtIndex(i, candidate)) {
            seq[i] = { index: candidate, isAdhik: true }; // regIdx stays — next step re-tries the same candidate
        } else {
            seq[i] = { index: candidate, isAdhik: false };
            regIdx = candidate;
        }
    }

    let state = { index: ANCHOR_MONTH_INDEX, isAdhik: false };
    for (let i = anchorPos - 1; i >= 0; i--) {
        if (state.isAdhik) {
            seq[i] = { index: mod(state.index - 1, 12), isAdhik: false };
        } else {
            seq[i] = isAdhikAtIndex(i, state.index)
                ? { index: state.index, isAdhik: true }
                : { index: mod(state.index - 1, 12), isAdhik: false };
        }
        state = seq[i];
    }

    monthSequence = newMoonDates.map((d, i) => ({ ms: d.getTime(), index: seq[i].index, isAdhik: seq[i].isAdhik }));
}

// Last monthSequence entry at or before `ms`, or null if `ms` is
// before the first entry.
function monthSequenceEntryAt(ms) {
    let lo = 0, hi = monthSequence.length - 1, ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (monthSequence[mid].ms <= ms) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans === -1 ? null : monthSequence[ans];
}

function monthNameFor(date) {
    const range = TithiEngine.getDataRange();
    const ms = date.getTime();
    if (range && ms >= range.start && ms <= range.end && monthSequence.length > 0) {
        const entry = monthSequenceEntryAt(ms);
        if (entry) {
            const name = I18n.t('months.' + MONTH_KEYS[entry.index]);
            return entry.isAdhik ? `${I18n.t('adhik')} ${name}` : name;
        }
    }
    // Outside the generated data range (or sequence not built yet):
    // plain modular counting, same as before adhik-maas support was
    // added. Not adhik-aware — regenerate data/tithi-data.json with a
    // wider range (see generator/) for full correctness further out.
    const offset = TithiEngine.getMonthOffset(date, ANCHOR_MS);
    return I18n.t('months.' + MONTH_KEYS[mod(ANCHOR_MONTH_INDEX + offset, 12)]);
}

function tithiLabel(tithiIndex, monthName) {
    const isShukla = tithiIndex < 15;
    const nameIdx = tithiIndex % 15;
    if (nameIdx === 14) {
        const special = I18n.t(isShukla ? 'purnima' : 'amas');
        return { isShukla, short: special, full: `${monthName} ${special}` };
    }
    const name = I18n.t('tithis.' + TITHI_KEYS[nameIdx]);
    const paksha = I18n.t(isShukla ? 'sud' : 'vad');
    return { isShukla, short: `${paksha} ${name}`, full: `${monthName} ${paksha} ${name}` };
}

/* ---------- phase naming ----------
   New Moon / First Quarter / Full Moon / Last Quarter name the exact
   instants (elongation 0/90/180/270). Showing one of these as a
   *range* (as an 8-way bucket scheme would) makes it look like "full
   moon" lasts 3-4 days, which it doesn't. So: these 4 names are only
   used for whichever single day/tithi window actually contains that
   exact crossing; everything else gets one of the 4 continuous
   waxing/waning descriptions. */

function continuousPhaseName(elong) {
    if (elong < 90) return I18n.t('phases.waxingCrescent');
    if (elong < 180) return I18n.t('phases.waxingGibbous');
    if (elong < 270) return I18n.t('phases.waningGibbous');
    return I18n.t('phases.waningCrescent');
}

function crossesAngle(targetDeg, startMs, endMs) {
    function angDiff(elong) {
        let d = elong - targetDeg;
        d = ((d + 180) % 360 + 360) % 360 - 180;
        return d;
    }
    const stepMs = 3 * 3600000;
    let prev = angDiff(MoonEphemeris.elongationDeg(new Date(startMs)));
    if (Math.abs(prev) < 0.01) return true;
    let t = startMs;
    while (t < endMs) {
        t = Math.min(t + stepMs, endMs);
        const cur = angDiff(MoonEphemeris.elongationDeg(new Date(t)));
        if (Math.abs(cur) < 0.01) return true;
        // A real crossing of targetDeg shows up as a small, continuous
        // sign flip. A sign flip with a ~360deg jump instead is the
        // modulo wraparound at the *antipodal* point (targetDeg+180)
        // — not a real crossing — so it must be excluded explicitly.
        if ((prev < 0) !== (cur < 0) && Math.abs(cur - prev) < 180) return true;
        prev = cur;
    }
    return false;
}

const SPECIAL_ANGLES = [[0, "newMoon"], [90, "firstQuarter"], [180, "fullMoon"], [270, "lastQuarter"]];

function phaseNameForWindow(windowStartMs, windowEndMs, midInstant) {
    for (const [deg, key] of SPECIAL_ANGLES) {
        if (crossesAngle(deg, windowStartMs, windowEndMs)) return I18n.t('phases.' + key);
    }
    return continuousPhaseName(MoonEphemeris.elongationDeg(midInstant));
}

/* Local placeholder image slice, indexed off the real elongation
   fraction (28-slice scheme). */
const ORDERED_PHASE_SLUGS = [
    'new',
    'waxing-crescent-1', 'waxing-crescent-2', 'waxing-crescent-3',
    'waxing-crescent-4', 'waxing-crescent-5', 'waxing-crescent-6',
    'first-quarter',
    'waxing-gibbous-1', 'waxing-gibbous-2', 'waxing-gibbous-3',
    'waxing-gibbous-4', 'waxing-gibbous-5', 'waxing-gibbous-6',
    'full',
    'waning-gibbous-1', 'waning-gibbous-2', 'waning-gibbous-3',
    'waning-gibbous-4', 'waning-gibbous-5', 'waning-gibbous-6',
    'last-quarter',
    'waning-crescent-1', 'waning-crescent-2', 'waning-crescent-3',
    'waning-crescent-4', 'waning-crescent-5', 'waning-crescent-6'
];
function localPhaseImagePath(elong) {
    const fraction = elong / 360;
    const index = Math.round(fraction * ORDERED_PHASE_SLUGS.length) % ORDERED_PHASE_SLUGS.length;
    return `images/moon-${ORDERED_PHASE_SLUGS[index]}.webp`;
}

/* ---------- tithi-for-a-day: two selectable strategies ----------

   "majority": whichever tithi occupies the most time within the
   calendar day (existing logic — a scan, since most days touch at
   most 2 tithi boundaries).

   "sunrise": the tithi active at that day's Mumbai sunrise instant
   (the traditional panchang convention) — just a single lookup,
   no scanning needed. */

function getTithiForDay(dayStartMs, dayEndMs) {
    let t = dayStartMs, best = null, bestDuration = -1;
    for (let i = 0; i < 8; i++) { // safety cap; realistically 1-3 iterations
        const info = TithiEngine.getTithiInfo(new Date(t));
        const segEnd = (info.nextStart && info.nextStart.getTime() < dayEndMs) ? info.nextStart.getTime() : dayEndMs;
        const duration = segEnd - t;
        if (duration > bestDuration) { bestDuration = duration; best = info; }
        if (!info.nextStart || info.nextStart.getTime() >= dayEndMs) break;
        t = info.nextStart.getTime();
    }
    return best;
}

function getSunriseInstant(dayStartMs) {
    // IST noon as the reference instant handed to SunCalc — safely
    // mid-day so its solar-day resolution can't land on the wrong
    // side of a UTC date boundary.
    const ref = new Date(dayStartMs + 12 * 3600000);
    return SunCalc.getTimes(ref, LOCATION.lat, LOCATION.lng).sunrise;
}

function getMainTithiForDay(dayStartMs, dayEndMs, mode, sunriseInstant) {
    if (mode === 'majority') return getTithiForDay(dayStartMs, dayEndMs);
    return TithiEngine.getTithiInfo(sunriseInstant);
}

// The "till" line(s) for the detail view: always the main tithi's
// own end time, plus its date (shown for now to make it unambiguous
// whether "till 12:43am" means later tonight or the small hours of
// tomorrow — a sunrise-selected tithi very often ends after midnight).
// A second line names the *following* tithi only if that one also
// ends within the same calendar day.
function computeTillLines(mainTithiInfo, dayEndMs) {
    const lines = { line1: '', line2: '' };
    if (!mainTithiInfo.nextStart) return lines;

    lines.line1 = I18n.t('ui.tillTemplate', {
        time: formatClockTimeIST(mainTithiInfo.nextStart),
        date: formatCompactDateIST(mainTithiInfo.nextStart)
    });

    if (mainTithiInfo.nextStart.getTime() < dayEndMs) {
        const nextInfo = TithiEngine.getTithiInfo(mainTithiInfo.nextStart);
        if (nextInfo.nextStart && nextInfo.nextStart.getTime() < dayEndMs) {
            const nextMonthName = monthNameFor(nextInfo.start);
            const nextLabel = tithiLabel(nextInfo.tithi, nextMonthName);
            const till = I18n.t('ui.tillTemplate', {
                time: formatClockTimeIST(nextInfo.nextStart),
                date: formatCompactDateIST(nextInfo.nextStart)
            });
            lines.line2 = `${nextLabel.short} ${till}`;
        }
    }
    return lines;
}

/* ---------- moon photo (real imagery via proxy) ---------- */

const imageCache = {};
const CACHE_PREFIX = 'moonImg:';
function readCache(key) {
    if (imageCache[key]) return imageCache[key];
    try {
        // localStorage (not sessionStorage) so the URL cache survives
        // across reloads/visits too, not just this tab session.
        const stored = localStorage.getItem(CACHE_PREFIX + key);
        if (stored) { imageCache[key] = stored; return stored; }
    } catch (e) { /* localStorage unavailable */ }
    return null;
}
function writeCache(key, url) {
    imageCache[key] = url;
    try { localStorage.setItem(CACHE_PREFIX + key, url); } catch (e) { /* ignore */ }
}
// `lowPriority` is set for background prefetch calls (see below) so
// they never compete with the fetch for whatever day the user is
// actually looking at right now.
// The underlying NASA dataset the proxy serves from turns out to be a
// single real year's worth of hourly renders — a date outside that
// year silently clamps to the nearest edge frame instead of erroring
// (confirmed: requesting 2027-01-27 returned frame 8760 = the very
// last hour of 2026, phase 38.23%, instead of that date's real ~0%
// new-moon phase). Rather than hardcoding which year(s) are safe — a
// boundary this app can't independently confirm — every response is
// cross-checked against our own independently-computed illumination,
// using the `phase` field the proxy conveniently already returns. A
// wildly different value means the photo doesn't match the requested
// date, whatever the underlying reason, so it's rejected and the
// caller falls back to the CSS-drawn crescent (always phase-accurate,
// just not a real photo) instead of silently showing the wrong Moon.
const PHOTO_PHASE_TOLERANCE_PERCENT = 10;

async function fetchMoonImageUrl(date, { lowPriority = false } = {}) {
    const key = date.toISOString().slice(0, 13); // cache per hour
    const cached = readCache(key);
    if (cached) return cached;
    try {
        const res = await fetch(`${MOON_IMAGE_PROXY}?date=${date.toISOString()}`, lowPriority ? { priority: 'low' } : {});
        if (res.ok) {
            const data = await res.json();
            if (data && data.image) {
                if (typeof data.phase === 'number') {
                    const expected = MoonEphemeris.illuminationFraction(MoonEphemeris.elongationDeg(date)) * 100;
                    const diff = Math.abs(data.phase - expected);
                    if (diff > PHOTO_PHASE_TOLERANCE_PERCENT) {
                        console.warn(
                            `Moon photo proxy returned a mismatched phase for ${date.toISOString()} ` +
                            `(expected ~${expected.toFixed(1)}%, got ${data.phase}% — proxy's own reported ` +
                            `date was "${data.date}"). Discarding it in favour of the CSS-drawn crescent.`
                        );
                        return null;
                    }
                }
                writeCache(key, data.image);
                return data.image;
            }
        }
    } catch (e) { /* fall through to CSS moon */ }
    return null;
}
function updateCssMoon(elong, lightEl) {
    const fraction = elong / 360;
    if (fraction <= 0.5) {
        lightEl.style.width = (fraction * 2 * 100) + '%';
        lightEl.style.right = '0'; lightEl.style.left = 'auto';
    } else {
        lightEl.style.width = ((1 - fraction) * 2 * 100) + '%';
        lightEl.style.left = '0'; lightEl.style.right = 'auto';
    }
}

// Loads one moon photo and applies it to every {imgEl, cssEl, lightEl}
// target in `targets` (main screen + detail view share one fetch).
function loadMoonPhoto(date, elong, targets, token, tokenGetter) {
    const placeholder = localPhaseImagePath(elong);
    for (const { imgEl, cssEl, lightEl } of targets) {
        cssEl.classList.remove('active');
        imgEl.style.opacity = '1';
        imgEl.onload = () => { imgEl.style.display = 'block'; };
        imgEl.onerror = (function (imgEl, cssEl, lightEl) {
            return () => {
                if (token !== tokenGetter()) return;
                imgEl.style.display = 'none';
                cssEl.classList.add('active');
                updateCssMoon(elong, lightEl);
            };
        })(imgEl, cssEl, lightEl);
        imgEl.src = placeholder;
    }

    fetchMoonImageUrl(date).then(url => {
        if (!url || token !== tokenGetter()) return;
        const preload = new Image();
        preload.onload = () => {
            if (token !== tokenGetter()) return;
            for (const { imgEl, cssEl } of targets) {
                cssEl.classList.remove('active');
                imgEl.style.opacity = '0.4';
                imgEl.onerror = null;
                imgEl.onload = () => { imgEl.style.display = 'block'; imgEl.style.opacity = '1'; };
                imgEl.src = url;
            }
        };
        preload.src = url;
    });
}

/* ---------- unified render (main screen + detail view) ---------- */

// Everything needed to display (or prefetch) a given day: which tithi
// represents it (mode-aware), and the representative instant used for
// the phase name + photo. Shared by renderAll() and the background
// prefetcher below so the two can never disagree about what a given
// day actually looks like.
function computeDayDisplay(dayStartMs) {
    const dayEnd = dayStartMs + DAY_MS;
    const sunriseInstant = getSunriseInstant(dayStartMs);
    const mainTithiInfo = getMainTithiForDay(dayStartMs, dayEnd, tithiMode, sunriseInstant);
    const overlapStart = Math.max(mainTithiInfo.start.getTime(), dayStartMs);
    const overlapEnd = mainTithiInfo.nextStart ? Math.min(mainTithiInfo.nextStart.getTime(), dayEnd) : dayEnd;
    const representativeInstant = new Date((overlapStart + overlapEnd) / 2);
    return { dayStart: dayStartMs, dayEnd, sunriseInstant, mainTithiInfo, representativeInstant };
}

async function renderAll() {
    const token = ++renderToken;
    const dayStart = currentDayStartMs;

    const { dayEnd, sunriseInstant, mainTithiInfo, representativeInstant } = computeDayDisplay(dayStart);
    currentMainTithiInfo = mainTithiInfo;

    const monthName = monthNameFor(mainTithiInfo.start);
    const label = tithiLabel(mainTithiInfo.tithi, monthName);
    const gregText = formatGregorianIST(new Date(dayStart + 43200000));

    const elong = MoonEphemeris.elongationDeg(representativeInstant);
    const phaseName = phaseNameForWindow(dayStart, dayEnd, representativeInstant);

    // Search from the END of today (not the start) so that if today
    // itself is the full/new moon day, we correctly show the NEXT
    // occurrence rather than today's own date.
    const upcoming = TithiEngine.getUpcoming(new Date(dayEnd));
    currentUpcoming = upcoming;

    // ---- main screen ----
    document.getElementById('gujaratiDate').textContent = label.full;
    document.getElementById('phaseLine').textContent = phaseName;
    document.getElementById('tillLine').textContent = gregText;
    document.getElementById('datePickerMain').value = toISTDateInputValue(new Date(dayStart + 43200000));
    if (upcoming.nextFullMoon) document.getElementById('phase1Date').textContent = formatLongDateIST(upcoming.nextFullMoon);
    if (upcoming.nextNewMoon) document.getElementById('phase2Date').textContent = formatLongDateIST(upcoming.nextNewMoon);

    // "today" link — only shown once the viewed day differs from the
    // real current IST day. Computed fresh each render since "today"
    // itself moves forward as real time passes.
    const isToday = (dayStart === istMidnightUtcMs(new Date()));
    document.getElementById('todayLink').classList.toggle('visible', !isToday);
    document.getElementById('detailTodayLink').classList.toggle('visible', !isToday);

    // ---- detail view ----
    document.getElementById('detailDateLine').textContent = gregText;
    document.getElementById('datePickerDetail').value = toISTDateInputValue(new Date(dayStart + 43200000));
    document.getElementById('detailPhaseHeading').textContent = phaseName;
    document.getElementById('detailSunriseLine').textContent = I18n.t('ui.atSunriseTemplate', { time: formatClockTimeIST(sunriseInstant) });
    document.getElementById('detailTithiHeading').textContent = label.full;
    const tillLines = computeTillLines(mainTithiInfo, dayEnd);
    document.getElementById('detailTillLine1').textContent = tillLines.line1;
    document.getElementById('detailTillLine2').textContent = tillLines.line2;
    if (upcoming.nextFullMoon) document.getElementById('detailPhase1Date').textContent = formatLongDateIST(upcoming.nextFullMoon);
    if (upcoming.nextNewMoon) document.getElementById('detailPhase2Date').textContent = formatLongDateIST(upcoming.nextNewMoon);

    // ---- shared photo (fetched once, applied to both) ----
    loadMoonPhoto(
        representativeInstant, elong,
        [
            { imgEl: document.getElementById('moonImage'), cssEl: document.getElementById('moonCss'), lightEl: document.getElementById('moonLight') },
            { imgEl: document.getElementById('detailImage'), cssEl: document.getElementById('detailCss'), lightEl: document.getElementById('detailLight') }
        ],
        token, () => renderToken
    );

    // ---- background prefetch: nearby days + the two footer jump-targets ----
    schedulePrefetchWindow(dayStart);
    schedulePrefetchDates([upcoming.nextFullMoon, upcoming.nextNewMoon]);
}

/* ---------- background photo prefetch (bounded sliding window) ---------- */

let prefetchQueue = [];
let prefetchRunning = false;
const prefetchedDayKeys = new Set();

// Chrome/Android's Save-Data / connection-type signal. Not available
// everywhere (no Safari/Firefox support as of writing) — treated as
// "unknown, so don't assume it's fine to prefetch" only when present
// and actually indicating a constrained connection; absence of the
// API itself is not treated as a signal either way.
function isConstrainedConnection() {
    try {
        const c = navigator.connection;
        if (!c) return false;
        return !!c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType || '');
    } catch (e) { return false; }
}

// Re-anchors the prefetch window on `centerDayStartMs`. Called on
// every render, so navigating slides the window — newly-in-range days
// get queued, everything already fetched (tracked in
// prefetchedDayKeys) is skipped, and nothing outside
// [-PREFETCH_DAYS_BACK, +PREFETCH_DAYS_FORWARD] is touched until the
// user actually navigates there and this runs again with a new center.
function schedulePrefetchWindow(centerDayStartMs) {
    if (isConstrainedConnection()) return;
    for (let i = -PREFETCH_DAYS_BACK; i <= PREFETCH_DAYS_FORWARD; i++) {
        if (i === 0) continue; // today's own photo is already being loaded above
        queuePrefetchDay(centerDayStartMs + i * DAY_MS);
    }
    runPrefetchQueue();
}

// The main screen's two clickable footer rows ("next full moon" / "next
// new moon") are one tap away too, same as the sliding window's edges —
// so they get the same treatment. Crucially, these targets change as
// the user navigates (jumping to "next full moon" makes the date change
// to the *following* one), and since this runs on every render with
// whatever the freshly-recomputed dates are, each new target flows
// through the same tracked queue automatically — nothing special
// needed to "notice" the date changed, it's just a new dayStartMs key.
function schedulePrefetchDates(dates) {
    if (isConstrainedConnection()) return;
    for (const date of dates) {
        if (!date) continue;
        queuePrefetchDay(istMidnightUtcMs(date));
    }
    runPrefetchQueue();
}

function queuePrefetchDay(dayStartMs) {
    if (!prefetchedDayKeys.has(dayStartMs)) {
        prefetchedDayKeys.add(dayStartMs);
        prefetchQueue.push(dayStartMs);
    }
}

function runPrefetchQueue() {
    if (prefetchRunning || prefetchQueue.length === 0) return;
    prefetchRunning = true;
    const runNext = async () => {
        const dayStartMs = prefetchQueue.shift();
        if (dayStartMs !== undefined) await prefetchOneDay(dayStartMs);
        prefetchRunning = false;
        if (prefetchQueue.length > 0) runPrefetchQueue();
    };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(runNext, { timeout: 2000 });
    } else {
        setTimeout(runNext, 300);
    }
}

async function prefetchOneDay(dayStartMs) {
    try {
        const { representativeInstant } = computeDayDisplay(dayStartMs);
        const url = await fetchMoonImageUrl(representativeInstant, { lowPriority: true });
        if (url) {
            const img = new Image();
            img.fetchPriority = 'low'; // no-op where unsupported
            img.src = url; // warms the browser's own HTTP image cache
        }
    } catch (e) { /* best-effort background work; never surface errors for this */ }
}

function shiftDate(days) {
    currentDayStartMs += days * DAY_MS;
    renderAll();
}

// Jumps the whole app (main screen + detail view) to whatever
// calendar day `date` falls on — used by the "next full/new moon"
// rows in the main screen's bottom-text section.
function jumpToDate(date) {
    if (!date) return;
    currentDayStartMs = istMidnightUtcMs(date);
    renderAll();
}

function jumpToToday() {
    currentDayStartMs = istMidnightUtcMs(new Date());
    renderAll();
}

// Used by the date-picker inputs — the value is already a resolved
// IST-midnight instant (see parseISTDateInputValue), not a Date to
// re-derive one from.
function jumpToDayStart(dayStartMs) {
    currentDayStartMs = dayStartMs;
    renderAll();
}

/* ---------- detail view + settings panel ---------- */

function openDetailView() {
    if (!currentMainTithiInfo) return;
    document.getElementById('detailView').classList.add('active');
}
function closeDetailView() {
    document.getElementById('detailView').classList.remove('active');
    closeSettings();
}
function openSettings() {
    document.getElementById('modeSunrise').checked = (tithiMode === 'sunrise');
    document.getElementById('modeMajority').checked = (tithiMode === 'majority');
    const langRadio = document.querySelector(`input[name="language"][value="${I18n.getLanguage()}"]`);
    if (langRadio) langRadio.checked = true;
    document.getElementById('settingsPanel').classList.add('active');
}
function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('active');
}

// Labels that are set once (not per-render, unlike the main tithi/date
// display) but still need to follow the selected language — applied
// on boot and again every time the language changes.
function applyStaticTranslations() {
    document.getElementById('todayLink').textContent = I18n.t('ui.today');
    document.getElementById('detailTodayLink').textContent = I18n.t('ui.today');
    document.getElementById('phase1Label').textContent = I18n.t('ui.nextFullMoon');
    document.getElementById('phase2Label').textContent = I18n.t('ui.nextNewMoon');
    document.getElementById('detailPhase1Label').textContent = I18n.t('ui.nextFullMoon');
    document.getElementById('detailPhase2Label').textContent = I18n.t('ui.nextNewMoon');
    document.getElementById('settingsTitleTithi').textContent = I18n.t('ui.settingsTitleTithi');
    document.getElementById('sunriseModeLabel').textContent = I18n.t('ui.sunriseMode');
    document.getElementById('sunriseModeDesc').textContent = I18n.t('ui.sunriseModeDesc');
    document.getElementById('majorityModeLabel').textContent = I18n.t('ui.majorityMode');
    document.getElementById('majorityModeDesc').textContent = I18n.t('ui.majorityModeDesc');
    document.getElementById('settingsTitleLang').textContent = I18n.t('ui.settingsTitleLang');
    document.getElementById('settingsDoneBtn').textContent = I18n.t('ui.done');
}

/* ---------- boot ---------- */

// Detail view is entered via the tithi name only now — tapping the
// moon photo itself no longer navigates anywhere (it's becoming a
// content-display area, see README "Known limitations" for what's
// planned there next).
document.getElementById('gujaratiDate').addEventListener('click', openDetailView);
document.getElementById('gujaratiDate').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailView(); }
});
document.getElementById('detailClose').addEventListener('click', closeDetailView);
document.getElementById('detailSettingsBtn').addEventListener('click', openSettings);
document.getElementById('mainSettingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsDoneBtn').addEventListener('click', closeSettings);
document.getElementById('prevDayBtn').addEventListener('click', () => shiftDate(-1));
document.getElementById('nextDayBtn').addEventListener('click', () => shiftDate(1));
document.getElementById('detailPrevBtn').addEventListener('click', () => shiftDate(-1));
document.getElementById('detailNextBtn').addEventListener('click', () => shiftDate(1));

function bindJumpRow(el, getDate) {
    el.addEventListener('click', () => jumpToDate(getDate()));
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToDate(getDate()); }
    });
}
bindJumpRow(document.getElementById('phase1Row'), () => currentUpcoming && currentUpcoming.nextFullMoon);
bindJumpRow(document.getElementById('phase2Row'), () => currentUpcoming && currentUpcoming.nextNewMoon);

function bindTodayLink(el) {
    el.addEventListener('click', jumpToToday);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToToday(); }
    });
}
bindTodayLink(document.getElementById('todayLink'));
bindTodayLink(document.getElementById('detailTodayLink'));

/* ---------- date picker (tap the date to jump straight to one) ---------- */

function bindDatePicker(fieldEl, inputEl) {
    inputEl.addEventListener('change', () => {
        if (!inputEl.value) return;
        jumpToDayStart(parseISTDateInputValue(inputEl.value));
    });
    // The transparent input already opens its own picker on click/tap
    // in every browser that supports <input type="date">; this just
    // gives Chromium browsers a slightly snappier response when the
    // click lands on the wrapper rather than precisely on the input.
    fieldEl.addEventListener('click', () => {
        try { inputEl.showPicker(); } catch (e) { /* unsupported — native click handling still works */ }
    });
}
bindDatePicker(document.getElementById('mainDateField'), document.getElementById('datePickerMain'));
bindDatePicker(document.getElementById('detailDateField'), document.getElementById('datePickerDetail'));

/* ---------- help / info overlay ---------- */

function openHelp() {
    document.getElementById('helpView').classList.add('active');
}
document.getElementById('helpBtn').addEventListener('click', openHelp);
document.getElementById('detailHelpBtn').addEventListener('click', openHelp);
document.getElementById('helpClose').addEventListener('click', () => {
    document.getElementById('helpView').classList.remove('active');
});
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        const acc = header.closest('.accordion');
        const nowOpen = acc.classList.toggle('open');
        header.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    });
});

document.querySelectorAll('input[name="tithiMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        tithiMode = e.target.value;
        try { localStorage.setItem(TITHI_MODE_KEY, tithiMode); } catch (e2) { /* ignore */ }
        renderAll();
    });
});

document.querySelectorAll('input[name="language"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
        await I18n.setLanguage(e.target.value);
        try { localStorage.setItem(LANGUAGE_KEY, e.target.value); } catch (e2) { /* ignore */ }
        // Month/tithi NAMING sequence (buildMonthSequence) is purely
        // numeric (index + adhik flag) and language-independent, so it
        // doesn't need rebuilding — only re-displaying.
        applyStaticTranslations();
        renderAll();
    });
});

/* ---------- first-run splash ---------- */

function shouldShowSplashOnBoot() {
    try { return localStorage.getItem(SPLASH_HIDE_KEY) !== 'true'; } catch (e) { return true; }
}
function openSplash() {
    document.getElementById('splashView').classList.add('active');
}
function closeSplash() {
    const dontShow = document.getElementById('splashDontShow').checked;
    if (dontShow) {
        try { localStorage.setItem(SPLASH_HIDE_KEY, 'true'); } catch (e) { /* ignore */ }
    }
    document.getElementById('splashView').classList.remove('active');
}
document.getElementById('splashDoneBtn').addEventListener('click', closeSplash);

// Reachable on demand from the info overlay's "Quick tips" section —
// showing it again never touches the stored "don't show again" flag,
// only actually checking the box and pressing "Got it" does.
document.getElementById('showSplashAgainBtn').addEventListener('click', () => {
    document.getElementById('splashDontShow').checked = false;
    openSplash();
});

if (shouldShowSplashOnBoot()) openSplash();

Promise.all([
    TithiEngine.init(DATA_URL),
    I18n.init(storedLanguage())
]).finally(() => {
    buildMonthSequence();
    applyStaticTranslations();
    renderAll();
});
