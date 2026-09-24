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
js/ephemeris.js        Sun + Moon position formulas (no deps, no network)
js/tithi-engine.js     loads data/tithi-data.json, binary-searches it,
                        falls back to live ephemeris.js for out-of-range dates
js/app.js              rendering, date nav, the tithi-nav detail view,
                        the real moon-photo fetch chain — and the ONE
                        hand-maintained bit of data: MONTH_NAMES + ANCHOR
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

## The detail view

Tapping the moon photo opens a full-screen view that navigates
**tithi-by-tithi** (not day-by-day) via the ‹ › buttons — e.g. tapping
› from "Bhadarvo Sud Baras" jumps straight to the start of "Bhadarvo
Sud Teras", whenever that instant actually falls, rather than stepping
a fixed 24 hours. This is separate, deliberately, from the main
screen's day-based ‹ › navigation.
