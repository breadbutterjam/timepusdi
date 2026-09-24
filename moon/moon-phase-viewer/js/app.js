/* =========================================================
   APP.JS
   UI logic. All astronomy lives in ephemeris.js / tithi-engine.js —
   this file just renders their output.
========================================================= */

/* ---------- Gujarati calendar naming (the one place hand-maintained
   data lives, by design — see the "Building the Moon Phase Viewer"
   README for why this stays a small hardcoded list rather than a
   full computed panchang). ---------- */

// 12 lunar months, in order. NOTE: does not yet handle adhik maas
// (leap month) — month naming will drift by one after the next
// adhik maas occurs (not for a few years as of writing). Revisit
// this when that approaches; see README "Known limitations".
const MONTH_NAMES = [
    "Chaitra", "Vaishakh", "Jyeshta", "Ashadh", "Shravan", "Bhadarvo",
    "Ashwin", "Kartik", "Magshar", "Posh", "Maha", "Fagan"
];

const TITHI_NAMES = [
    "Ekam", "Beej", "Trij", "Choth", "Pancham",
    "Chhath", "Satam", "Aatham", "Nom", "Dasham",
    "Ekadashi", "Baras", "Teras", "Chaudas", "Jam"
];
const PURNIMA_AMAS = ["Purnima", "Amas"];

// Anchor: a known Sud Ekam (tithi index 0) instant, and which of the
// 12 month names it corresponds to. Everything else is counted from
// here by the tithi engine. This exact timestamp is the real
// generated Jyeshta Sud Ekam 2026 — see data/tithi-data.json.
//
// IMPORTANT: this must be set to a sud-ekam AFTER the most recent
// adhik maas (leap month) and BEFORE the next one, or month names
// will be off by one (see MONTH_NAMES comment above). As of writing,
// the most recent adhik maas (Adhik Jyeshta) fell in May 2026, so
// this anchor is deliberately the *regular* Jyeshta right after it —
// not the earlier Chaitra, which would already be stale.
const ANCHOR_MS = Date.parse('2026-06-15T02:55:04Z');
const ANCHOR_MONTH_INDEX = 2; // Jyeshta

const DATA_URL = 'data/tithi-data.json';
const MOON_IMAGE_PROXY = 'https://timepusdi.vercel.app/api/moon';

let currentDate = new Date();
let renderToken = 0;
let detailInfo = null; // currently-displayed tithi info in the detail view

/* ---------- small helpers ---------- */

function dateOnly(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }

function mod(n, m) { return ((n % m) + m) % m; }

function monthNameFor(date) {
    const offset = TithiEngine.getMonthOffset(date, ANCHOR_MS);
    return MONTH_NAMES[mod(ANCHOR_MONTH_INDEX + offset, 12)];
}

function tithiLabel(tithiIndex, monthName) {
    const isShukla = tithiIndex < 15;
    const nameIdx = tithiIndex % 15;
    if (nameIdx === 14) {
        const special = isShukla ? PURNIMA_AMAS[0] : PURNIMA_AMAS[1];
        return { isShukla, short: special, full: `${monthName} ${special}` };
    }
    const name = TITHI_NAMES[nameIdx];
    return { isShukla, short: `${isShukla ? 'Sud' : 'Vad'} ${name}`, full: `${monthName} ${isShukla ? 'Sud' : 'Vad'} ${name}` };
}

function formatClockTime(date) {
    let h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatLongDate(date) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' });
}

function formatDetailDate(date) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = String(date.getDate()).padStart(2, '0');
    const mon = date.toLocaleDateString('en-US', { month: 'short' });
    return `${weekday}, ${day}-${mon}-${date.getFullYear()}`;
}

function phaseNameFromElongation(elong) {
    if (elong < 22.5 || elong >= 337.5) return "New Moon";
    if (elong < 67.5) return "Waxing Crescent";
    if (elong < 112.5) return "First Quarter";
    if (elong < 157.5) return "Waxing Gibbous";
    if (elong < 202.5) return "Full Moon";
    if (elong < 247.5) return "Waning Gibbous";
    if (elong < 292.5) return "Last Quarter";
    return "Waning Crescent";
}

/* Local placeholder image slice, same 28-slice scheme as before,
   now indexed off the real elongation fraction instead of a
   constant-rate age approximation. */
const ORDERED_PHASE_SLUGS = [
    'new',
    'waxing-crescent-1', 'waxing-crescent-2', 'waxing-crescent-3',
    'waxing-crescent-4',
    'first-quarter',
    'waxing-gibbous-1', 'waxing-gibbous-2', 'waxing-gibbous-3',
    'waxing-gibbous-4',
    'full',
    'waning-gibbous-1', 'waning-gibbous-2', 'waning-gibbous-3',
    'waning-gibbous-4',
    'last-quarter',
    'waning-crescent-1', 'waning-crescent-2', 'waning-crescent-3',
    'waning-crescent-4'
];
function localPhaseImagePath(elong) {
    const fraction = elong / 360;
    const index = Math.round(fraction * ORDERED_PHASE_SLUGS.length) % ORDERED_PHASE_SLUGS.length;
    return `images/moon-${ORDERED_PHASE_SLUGS[index]}.webp`;
}

/* ---------- moon photo (real imagery via proxy, same chain as before) ---------- */

const imageCache = {};
const CACHE_PREFIX = 'moonImg:';
function readCache(key) {
    if (imageCache[key]) return imageCache[key];
    try {
        const stored = sessionStorage.getItem(CACHE_PREFIX + key);
        if (stored) { imageCache[key] = stored; return stored; }
    } catch (e) { /* sessionStorage unavailable */ }
    return null;
}
function writeCache(key, url) {
    imageCache[key] = url;
    try { sessionStorage.setItem(CACHE_PREFIX + key, url); } catch (e) { /* ignore */ }
}
async function fetchMoonImageUrl(date) {
    const key = date.toISOString().slice(0, 13); // cache per hour
    const cached = readCache(key);
    if (cached) return cached;
    try {
        const res = await fetch(`${MOON_IMAGE_PROXY}?date=${date.toISOString()}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.image) { writeCache(key, data.image); return data.image; }
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

// Loads a moon photo into imgEl (placeholder first, then real photo),
// with CSS-crescent fallback if both image sources fail. Shared by
// the main screen and the detail view. `token` guards against a
// slow response landing after the user has already navigated away.
function loadMoonPhoto(date, elong, imgEl, cssEl, cssLightEl, token, tokenGetter) {
    cssEl.classList.remove('active');
    imgEl.style.opacity = '1';
    imgEl.onload = () => { imgEl.style.display = 'block'; };
    imgEl.onerror = () => {
        if (token !== tokenGetter()) return;
        imgEl.style.display = 'none';
        cssEl.classList.add('active');
        updateCssMoon(elong, cssLightEl);
    };
    imgEl.src = localPhaseImagePath(elong);

    fetchMoonImageUrl(date).then(url => {
        if (!url || token !== tokenGetter()) return;
        const preload = new Image();
        preload.onload = () => {
            if (token !== tokenGetter()) return;
            cssEl.classList.remove('active');
            imgEl.style.opacity = '0.4';
            imgEl.onerror = null;
            imgEl.onload = () => { imgEl.style.display = 'block'; imgEl.style.opacity = '1'; };
            imgEl.src = url;
        };
        preload.src = url;
    });
}

/* ---------- main screen render ---------- */

async function render(date) {
    const token = ++renderToken;
    const tithiInfo = TithiEngine.getTithiInfo(date);
    const monthName = monthNameFor(tithiInfo.start);
    const label = tithiLabel(tithiInfo.tithi, monthName);

    document.getElementById('gujaratiDate').textContent = label.full;

    // "till 8:30pm, Sud Teras after that"
    const tillEl = document.getElementById('tillLine');
    if (tithiInfo.nextStart && tithiInfo.nextTithi !== null) {
        const nextMonthName = monthNameFor(tithiInfo.nextStart);
        const nextLabel = tithiLabel(tithiInfo.nextTithi, nextMonthName);
        tillEl.textContent = `till ${formatClockTime(tithiInfo.nextStart)}, ${nextLabel.short} after that`;
    } else {
        tillEl.textContent = '';
    }

    const upcoming = TithiEngine.getUpcoming(date);
    if (upcoming.nextFullMoon) {
        document.getElementById('phase1Label').textContent = 'next full moon';
        document.getElementById('phase1Date').textContent = formatLongDate(upcoming.nextFullMoon);
    }
    if (upcoming.nextNewMoon) {
        document.getElementById('phase2Label').textContent = 'next new moon';
        document.getElementById('phase2Date').textContent = formatLongDate(upcoming.nextNewMoon);
    }

    const elong = MoonEphemeris.elongationDeg(date);
    const illum = Math.round(MoonEphemeris.illuminationFraction(elong) * 1000) / 10;
    document.getElementById('phaseLine').textContent = `${phaseNameFromElongation(elong)} ${illum}%`;

    const today = dateOnly(new Date());
    const compareDate = dateOnly(date);
    document.getElementById('todayLabel').textContent =
        (compareDate.getTime() === today.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    loadMoonPhoto(
        date, elong,
        document.getElementById('moonImage'),
        document.getElementById('moonCss'),
        document.getElementById('moonLight'),
        token, () => renderToken
    );
}

function shiftDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    render(currentDate);
}

/* ---------- detail view (tap the moon; tithi-by-tithi nav) ---------- */

let detailRenderToken = 0;

function renderDetail(tithiInfo) {
    detailInfo = tithiInfo;
    const token = ++detailRenderToken;
    const monthName = monthNameFor(tithiInfo.start);
    const label = tithiLabel(tithiInfo.tithi, monthName);

    document.getElementById('detailTitle').textContent = label.full;

    let subtitle;
    if (tithiInfo.tithi === 15) subtitle = 'Full moon';
    else if (tithiInfo.tithi === 0) subtitle = 'New moon';
    else {
        // Phase name at the midpoint of this tithi's span.
        const mid = tithiInfo.nextStart
            ? new Date((tithiInfo.start.getTime() + tithiInfo.nextStart.getTime()) / 2)
            : tithiInfo.start;
        subtitle = phaseNameFromElongation(MoonEphemeris.elongationDeg(mid));
    }
    document.getElementById('detailSubtitle').textContent = subtitle;
    document.getElementById('detailDate').textContent = formatDetailDate(tithiInfo.start);

    const upcoming = TithiEngine.getUpcoming(tithiInfo.start);
    if (upcoming.nextFullMoon) {
        document.getElementById('detailPhase1Label').textContent = 'next full moon';
        document.getElementById('detailPhase1Date').textContent = formatLongDate(upcoming.nextFullMoon);
    }
    if (upcoming.nextNewMoon) {
        document.getElementById('detailPhase2Label').textContent = 'next new moon';
        document.getElementById('detailPhase2Date').textContent = formatLongDate(upcoming.nextNewMoon);
    }

    // Photo for a representative instant within this tithi (a couple
    // hours after it starts, so we're solidly inside it).
    const photoMoment = new Date(tithiInfo.start.getTime() + 2 * 3600000);
    const elong = MoonEphemeris.elongationDeg(photoMoment);
    loadMoonPhoto(
        photoMoment, elong,
        document.getElementById('detailImage'),
        document.getElementById('detailCss'),
        document.getElementById('detailLight'),
        token, () => detailRenderToken
    );
}

function openDetailView() {
    const moonImage = document.getElementById('moonImage');
    if (moonImage.style.display === 'none' || !moonImage.src) return; // nothing loaded yet
    document.getElementById('detailView').classList.add('active');
    renderDetail(TithiEngine.getTithiInfo(currentDate));
}
function closeDetailView() {
    document.getElementById('detailView').classList.remove('active');
}
function detailPrev() {
    if (!detailInfo) return;
    renderDetail(TithiEngine.getTithiInfo(new Date(detailInfo.start.getTime() - 1)));
}
function detailNext() {
    if (!detailInfo || !detailInfo.nextStart) return;
    renderDetail(TithiEngine.getTithiInfo(new Date(detailInfo.nextStart.getTime())));
}

/* ---------- boot ---------- */

document.getElementById('moonWrap').addEventListener('click', openDetailView);
document.getElementById('detailClose').addEventListener('click', closeDetailView);
document.getElementById('detailPrevBtn').addEventListener('click', detailPrev);
document.getElementById('detailNextBtn').addEventListener('click', detailNext);
document.getElementById('prevDayBtn').addEventListener('click', () => shiftDate(-1));
document.getElementById('nextDayBtn').addEventListener('click', () => shiftDate(1));

TithiEngine.init(DATA_URL).finally(() => render(currentDate));
