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

- **Adhik maas (leap month) is not automated.** `js/app.js` hardcodes
  12 month names and counts forward from one fixed anchor date. This
  is correct until the *next* adhik maas occurs, after which month
  names will drift by one until you either (a) manually bump the
  anchor date past it (a 2-line change — see the comment above
  `ANCHOR_MS` in `js/app.js`), or (b) a future version automates
  detection. This was an explicit, deliberate scope cut for v1.
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

Tapping the moon photo opens a full-screen view of the **same day**
shown on the main screen — the ‹ › buttons there shift the day exactly
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
