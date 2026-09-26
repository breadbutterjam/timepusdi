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
const IST_TZ = 'Asia/Kolkata';
const DAY_MS = 86400000;

// Location for sunrise calculation. No picker yet — Mumbai only,
// hardcoded. (SunCalc, vendored in js/suncalc.js, does the math.)
const LOCATION = { lat: 19.0760, lng: 72.8777 };

const TITHI_MODE_KEY = 'moonPhaseViewer.tithiMode';

/* ---------- IST-aware date/time helpers ---------- */

function istMidnightUtcMs(refDate) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const map = {};
    fmt.formatToParts(refDate).forEach(p => { map[p.type] = p.value; });
    return Date.UTC(+map.year, +map.month - 1, +map.day, 0, 0, 0) - 5.5 * 3600000;
}

function formatClockTimeIST(date) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    return fmt.format(date).replace(' ', '').toLowerCase();
}

// "Thursday, 24-Sep-2026"
function formatGregorianIST(date) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    const map = {};
    fmt.formatToParts(date).forEach(p => { map[p.type] = p.value; });
    return `${map.weekday}, ${map.day}-${map.month}-${map.year}`;
}

// "Wed 07-Oct-2026" — used to disambiguate which day a clock time
// belongs to (a tithi ending "12:43am" could be today or tomorrow).
function formatCompactDateIST(date) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const map = {};
    fmt.formatToParts(date).forEach(p => { map[p.type] = p.value; });
    return `${map.weekday} ${map.day}-${map.month}-${map.year}`;
}

function formatLongDateIST(date) {
    return date.toLocaleDateString('en-US', { timeZone: IST_TZ, month: 'long', day: 'numeric', weekday: 'long' });
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

/* ---------- misc helpers ---------- */

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

/* ---------- phase naming ----------
   New Moon / First Quarter / Full Moon / Last Quarter name the exact
   instants (elongation 0/90/180/270). Showing one of these as a
   *range* (as an 8-way bucket scheme would) makes it look like "full
   moon" lasts 3-4 days, which it doesn't. So: these 4 names are only
   used for whichever single day/tithi window actually contains that
   exact crossing; everything else gets one of the 4 continuous
   waxing/waning descriptions. */

function continuousPhaseName(elong) {
    if (elong < 90) return "Waxing Crescent";
    if (elong < 180) return "Waxing Gibbous";
    if (elong < 270) return "Waning Gibbous";
    return "Waning Crescent";
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

const SPECIAL_ANGLES = [[0, "New Moon"], [90, "First Quarter"], [180, "Full Moon"], [270, "Last Quarter"]];

function phaseNameForWindow(windowStartMs, windowEndMs, midInstant) {
    for (const [deg, name] of SPECIAL_ANGLES) {
        if (crossesAngle(deg, windowStartMs, windowEndMs)) return name;
    }
    return continuousPhaseName(MoonEphemeris.elongationDeg(midInstant));
}

/* Local placeholder image slice, indexed off the real elongation
   fraction (28-slice scheme). */
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

    lines.line1 = `till ${formatClockTimeIST(mainTithiInfo.nextStart)}, ${formatCompactDateIST(mainTithiInfo.nextStart)}`;

    if (mainTithiInfo.nextStart.getTime() < dayEndMs) {
        const nextInfo = TithiEngine.getTithiInfo(mainTithiInfo.nextStart);
        if (nextInfo.nextStart && nextInfo.nextStart.getTime() < dayEndMs) {
            const nextMonthName = monthNameFor(nextInfo.start);
            const nextLabel = tithiLabel(nextInfo.tithi, nextMonthName);
            lines.line2 = `${nextLabel.short} till ${formatClockTimeIST(nextInfo.nextStart)}, ${formatCompactDateIST(nextInfo.nextStart)}`;
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

async function renderAll() {
    const token = ++renderToken;
    const dayStart = currentDayStartMs;
    const dayEnd = dayStart + DAY_MS;

    const sunriseInstant = getSunriseInstant(dayStart);
    const mainTithiInfo = getMainTithiForDay(dayStart, dayEnd, tithiMode, sunriseInstant);
    currentMainTithiInfo = mainTithiInfo;

    const monthName = monthNameFor(mainTithiInfo.start);
    const label = tithiLabel(mainTithiInfo.tithi, monthName);
    const gregText = formatGregorianIST(new Date(dayStart + 43200000));

    // Representative instant: midpoint of however much of the shown
    // tithi actually falls within today — used for phase name + photo.
    const overlapStart = Math.max(mainTithiInfo.start.getTime(), dayStart);
    const overlapEnd = mainTithiInfo.nextStart ? Math.min(mainTithiInfo.nextStart.getTime(), dayEnd) : dayEnd;
    const representativeInstant = new Date((overlapStart + overlapEnd) / 2);
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
    document.getElementById('detailPhaseHeading').textContent = phaseName;
    document.getElementById('detailSunriseLine').textContent = `at sunrise ${formatClockTimeIST(sunriseInstant)}`;
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
    document.getElementById('settingsPanel').classList.add('active');
}
function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('active');
}

/* ---------- boot ---------- */

document.getElementById('moonWrap').addEventListener('click', openDetailView);
document.getElementById('detailClose').addEventListener('click', closeDetailView);
document.getElementById('detailSettingsBtn').addEventListener('click', openSettings);
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

/* ---------- help / info overlay ---------- */

document.getElementById('helpBtn').addEventListener('click', () => {
    document.getElementById('helpView').classList.add('active');
});
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

TithiEngine.init(DATA_URL).finally(() => renderAll());
