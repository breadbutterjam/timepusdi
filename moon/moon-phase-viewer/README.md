# Moon Phase Viewer

A single dark, mobile-first page showing today's (or any date's) Gujarati
tithi and real moon phase — no hardcoded calendar table, no server, no
API keys. Everything is computed from a small astronomical formula set
(see `js/ephemeris.js`) plus a pre-generated lookup table of exact tithi
boundary times (`data/tithi-data.json`), with the formula itself as a
live fallback for any date outside that table.

## What's in this folder

```
index.html            the whole UI (markup only)
style.css              styling
js/suncalc.js          vendored SunCalc (BSD-licensed) — sunrise time only
js/ephemeris.js        Sun + Moon position formulas (no deps, no network)
js/tithi-engine.js     loads data/tithi-data.json, binary-searches it,
                        falls back to live ephemeris.js for out-of-range dates
js/app.js              rendering, shared day nav, the detail view + settings
                        panel, the real moon-photo fetch chain — and the two
                        hand-maintained bits of data: MONTH_NAMES + ANCHOR,
                        and the Mumbai LOCATION used for sunrise
data/tithi-data.json   pre-generated tithi boundary times (currently
                        covers 2024-01-01 through 2033-12-31)
images/                optional local placeholder photos (see below) —
                        empty by default, app works fine without it
```

## Hosting on GitHub Pages

1. Push this whole folder to a repo (or a `docs/` subfolder, or a
   `gh-pages` branch — whatever GitHub Pages is pointed at).
2. In the repo's Settings → Pages, pick that branch/folder as the
   source.
3. Done — no build step, no `npm install`, nothing to configure.

## Testing locally

Don't just double-click `index.html`. Browsers block `fetch()` of local
files opened via `file://`, so `data/tithi-data.json` won't load (the
app *will* still work via the live-ephemeris fallback, but you won't be
testing the fast path). Serve it with any static server instead, e.g.:

```
python3 -m http.server 8000
# or: npx serve
```

then open `http://localhost:8000`.

## How the data flows

- `js/tithi-engine.js` loads `data/tithi-data.json` once on startup —
  a flat list of `{utc, tithi}` entries, one per exact tithi-boundary
  instant, covering a ~10 year window. Looking up "what tithi is it at
  date X" is a binary search against this list — no computation.
- If a requested date falls **outside** that window (data file gone
  stale, or someone navigates far into the future/past), the engine
  transparently falls back to computing the answer live from
  `ephemeris.js` instead. Nothing breaks, it's just a little slower
  (bisection over a few days instead of an array lookup) — the same
  fallback philosophy as the moon-photo proxy → local placeholder →
  CSS-drawn crescent chain that was already in this app.
- Tithi transition timestamps are precise to about 30 seconds
  (root-found, not sampled on a grid), on top of the underlying
  formula's own accuracy (~5' mean / ~14' max lunar longitude error,
  i.e. a few minutes of real-world timing error at the tithi boundary
  rate of motion — see the comment block at the top of
  `js/ephemeris.js` for the derivation and sourcing).

## Keeping the data fresh

`data/tithi-data.json` currently covers **2024–2033**. Regenerate it
periodically (a script for this lives in the separate `generator/`
delivery) and drop the new file in at the same path — no other changes
needed, since the app's binary search just works over whatever range
is in the file. You don't strictly have to — the live fallback covers
you either way — but regenerating keeps every date on the fast path.

## Known limitations (by design, for now)

- **Adhik maas (leap month) is calculated, with a manual override
  list.** `monthHasSankranti()` in `js/app.js` checks whether a given
  lunar month's span contains a sidereal (Lahiri ayanamsa) Sankranti —
  a month with none is, by definition, adhik. This method was
  independently cross-checked against a real panchang across
  2015-2035 and matched on every occurrence found. `ADHIK_MAAS` is
  checked *first*, before the calculation runs, so any year you've
  explicitly listed there is trusted outright — the calculation only
  decides years that aren't in that list. In practice this means the
  table never *needs* another entry again, but stays there as a
  one-line override for any specific year a trusted source disagrees
  with. `ayanamsaDeg()` / `siderealSunLongitude()` (in `js/ephemeris.js`)
  are the underlying sidereal-longitude functions this relies on,
  documented there with their sourcing.
  `buildMonthSequence()` walks every new moon in the loaded data file
  outward from `ANCHOR_MS` in both directions once at startup,
  correctly repeating an adhik month's index rather than advancing
  past it. An adhik occurrence outside `data/tithi-data.json`'s
  generated range has no effect until that range is widened (see
  "Keeping the data fresh" above) — dates outside the range fall back
  to plain, non-adhik-aware modular counting, same as every other
  out-of-range fallback in this app.
- **Optional local placeholder images**: if you want the instant
  placeholder shown before the real NASA photo loads to look more
  like an actual moon (rather than the CSS-drawn crescent), drop
  28 WebP files into `images/` named per the list in
  `js/app.js` (`ORDERED_PHASE_SLUGS`). Purely cosmetic, not required.
- **Location is fixed to Mumbai.** No picker yet; `LOCATION` in
  `js/app.js` is a hardcoded `{lat, lng}`. Adding a picker (same shape
  as the `LOCATIONS` table in the sunrise/sunset utility this was
  built alongside) is a natural next step but out of scope for now.
- **Midnight-tithi is not implemented as a third mode** — only sunrise
  and majority-hours exist today. Skipped deliberately to keep the
  settings panel to one clear choice for now.

## The detail view

Tapping the **tithi name** opens a full-screen view of the **same
day** shown on the main screen — the ‹ › buttons there shift the day exactly
like the main screen's do (both are backed by one shared day pointer),
not a separate tithi-by-tithi browsing mode. It adds what the compact
main screen leaves out: the exact end time of the shown tithi, and
(when a second tithi also ends before midnight the same day) that
tithi's name and end time too.

## Which tithi represents a day: two selectable strategies

A calendar day can contain a tithi boundary partway through it, so
"which tithi is today" needs a rule. A gear icon in the detail view
opens a small settings panel with two:

- **Tithi at sunrise** (default) — the traditional panchang
  convention: whichever tithi is active at that day's sunrise. Sunrise
  is computed for **Mumbai only** for now (hardcoded lat/lng in
  `js/app.js`'s `LOCATION` constant — no location picker yet) via a
  vendored copy of [SunCalc](https://github.com/mourner/suncalc)
  (`js/suncalc.js`), matched to what's used elsewhere for this kind of
  calculation.
- **Tithi with max hours** — whichever tithi occupies the most of the
  24-hour calendar day (a plain majority vote, no sunrise involved).

The choice is saved (`localStorage`) and applies to both the main
screen and the detail view — there's one "tithi for today" per day,
not a different one per screen.

## Full-screen overlays stay within the 420px column

`.detail-view`, `.help-view`, `.splash-view`, and `.settings-panel`
are all width-constrained and centered the same way `.card` is,
rather than plain `position:fixed; inset:0` (full viewport). On
anything wider than 420px, an element spanning the whole viewport
puts a `right:16px`-style icon offset at the true screen edge, while
`.card`'s icons sit 16px from the edge of its own centered 420px
column — same CSS rule, visibly different screen position. Keep this
in mind if you add another full-screen overlay later: match this
pattern (`position:fixed; top:0; bottom:0; left:50%;
transform:translateX(-50%); width:100%; max-width:420px;`) rather than
`inset:0`, or icons inside it will appear to "jump" relative to
everything else when opened.

## Settings and help icons

Both the ⚙ (settings) and ⓘ (info) icons appear on **both** the main
screen and the detail view now — same two actions, reachable from
wherever you happen to be, rather than split one-per-screen. The
settings panel (`#settingsPanel`) lives at the body level in
`index.html`, not nested inside the detail view, specifically so it
can be opened independently from either screen.

The ⓘ icon opens a full-screen overlay with four collapsible sections:
**Quick tips** (the same two orientation points as the first-run
splash, plus a button to re-show it), **How this works** (a
plain-language explanation of the calculation and the two
tithi-selection modes), **Sources** (what the astronomy, sunrise, and
Moon-photo data are actually based on), and **Explore more** (links
out to a few other real moon-phase tools). All copy lives directly in
`index.html` inside `#helpView` — it's static content, not generated,
so edit it there.

## Language / i18n

All user-facing calendar vocabulary and core UI labels live in
`locales/<code>.json` (`en`, `gu`, `hi`, `mr` so far), loaded by
`js/i18n.js`. `app.js` never has display text hardcoded for this
content — it looks keys up via `I18n.t('months.chaitra')`,
`I18n.t('ui.today')`, etc. A missing key in a locale falls back to
English automatically (never a blank or a crash), so a partial
translation is always safe to ship. Templated strings (e.g. "till
{time}, {date}") use `{placeholder}` substitution, and — importantly —
**each locale controls word order**, not just word choice: Gujarati/
Hindi/Marathi are postpositional, so e.g. Gujarati's `tillTemplate` is
`"{time} સુધી, {date}"` (time first, postposition after), not a
word-for-word reordering of the English template.

Gregorian weekday names (and the digits/year) come from `Intl`'s own
locale data via `LOCALE_MAP` in `js/app.js` — free, no translation
needed there, and it reads naturally as-is. **Gregorian month names
are different**: they're a plain 12-entry `gregorianMonths` array in
each locale file (full names — "ઑક્ટોબર", not an abbreviation),
looked up directly rather than asking `Intl` for them. That's
deliberate: `Intl`'s *abbreviated* month form for these three
languages turns out to be an awkward phonetic shortening with no real
native convention behind it (unlike weekdays, which Hindu calendars
already have well-established native short forms for), so this sidesteps
that entirely by using the long form, which does read naturally, and
keeps it in a plain editable array rather than at the mercy of
whatever a given browser's ICU data happens to produce. Edit
`gregorianMonths` directly in the locale file to change it — no code
changes needed.

One quirk worth knowing: Marathi's ICU locale data defaults to
Devanagari digits (२६-ऑक्टोबर-२०२६-style) while Hindi and Gujarati
default to Western digits for the same date — authentic `Intl`
behavior, not a bug, but inconsistent across languages if that matters
to you; forcing `-u-nu-latn` (or `-u-nu-deva` everywhere) in
`LOCALE_MAP` would standardize it.

The language picker lives in the settings panel, alongside the
tithi-mode choice, reachable from either screen (see "Settings and
help icons" above), and persists via `localStorage`
(`moonPhaseViewer.language`).

**What's translated**: month names, tithi names, Purnima/Amas,
Sud/Vad/Adhik, the four exact + four continuous Moon phase names, and
the core dynamic UI (today, next full/new moon, till-lines, sunrise
line, settings panel). **What's not** (still English-only): the splash
screen's two tips and the entire info/help overlay — both are static
prose in `index.html` rather than JS-rendered, and translating
paragraph-length explanatory text is a bigger, lower-priority task
than the structured calendar vocabulary. A natural next step if this
gets revisited.

**Confidence levels, calibrated for validation** (same spirit as the
adhik maas table — check these against a trusted source before fully
trusting them):
- **High confidence**: month and tithi names, Sud/Vad/Adhik/Purnima/
  Amas. These are standard, ubiquitous panchang vocabulary. One
  deliberate choice worth knowing: Gujarati uses the vernacular forms
  this app's English names were already approximating (ભાદરવો, માગશર,
  પોષ, ફાગણ — matching "Bhadarvo", "Magshar", "Posh", "Fagan"), while
  Hindi and Marathi use the formal Sanskrit-derived forms those
  traditions actually use in their own panchangs (भाद्रपद, मार्गशीर्ष,
  पौष, फाल्गुन) — a direct transliteration of the Gujarati vernacular
  names into Devanagari would look foreign to Hindi/Marathi readers,
  since that's not what their own calendars call these months.
- **Lower confidence**: the four continuous phase names (Waxing/
  Waning Crescent/Gibbous) are descriptive translations, not
  standardized vocabulary the way calendar terms are — worth a native
  speaker's review before relying on them.

## First-run splash

A one-time overlay (`#splashView`) explains the two non-obvious
interactions — tapping the tithi name opens the detail view, tapping
the date opens a date picker — the first time the app loads. Checking
"Don't show this again" before dismissing it sets a `localStorage`
flag (`moonPhaseViewer.hideSplash`) so it won't auto-show on future
loads; it stays reachable anytime via the "Show welcome screen again"
button in the info overlay's Quick tips section, which never touches
that stored flag itself — only the checkbox does.

## Moon photo phase validation

The proxy's underlying NASA imagery turns out to be a single real
year of hourly renders (2026, confirmed by a clamped response for a
2027 date returning frame `8760` — exactly 24×365 — instead of an
error). Rather than hardcode a year boundary, `fetchMoonImageUrl` in
`js/app.js` cross-checks the `phase` percentage the proxy's response
already includes against this app's own independently-computed
illumination for that date. A response more than
`PHOTO_PHASE_TOLERANCE_PERCENT` (10 percentage points) off gets
discarded — logged to the console for debugging, not shown to the
user — and the caller falls back to the CSS-drawn crescent, which is
always phase-accurate even without a real photo. This self-corrects
regardless of *why* a given date's photo is wrong (clamping, a dataset
gap, anything else), rather than only covering the one boundary we
happened to observe.

## Background photo prefetch

Once the current day's photo loads, `js/app.js` quietly prefetches a
bounded window of nearby days in the background — `PREFETCH_DAYS_BACK`
(3) and `PREFETCH_DAYS_FORWARD` (5), both easy to tune at the top of
the file. It's a genuinely bounded window, not an unbounded chain:
every render re-anchors it on the current day, so navigating *slides*
the window (only the newly-exposed edge day gets fetched) rather than
growing it, and nothing outside that range is touched until you
actually navigate there. The two footer rows ("next full moon" / "next
new moon") get the same treatment as one-tap-away targets — and since
*those* target dates themselves change as you navigate (jumping to
"next full moon" makes the next full moon a month later), each newly
computed target flows through the same tracked queue on every render,
so it just keeps quietly staying one step ahead. Fetches are issued at
low priority (`fetch(..., {priority:'low'})` / `img.fetchPriority`,
both no-ops on browsers that don't support them) so they never compete
with whatever photo you're actually looking at, and the whole thing is
skipped for anyone on Chrome/Android's Save-Data mode or a detected
slow connection. The resolved photo URLs are cached in `localStorage`
(upgraded from `sessionStorage`), so they also survive across reloads
and later visits, not just the current tab session.
