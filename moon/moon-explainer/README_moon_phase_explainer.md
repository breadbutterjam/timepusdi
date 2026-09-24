# Moon Phases & Tithi Explorer

Landscape-only interactive tool. Drag the slider (0°–360° = one full new-moon-to-new-moon
cycle) to see the Moon travel around Earth, and watch the phase name + Gujarati tithi
update live.

## Running it
Just open `index.html` in a browser (double-click works — no server needed).
Portrait orientation shows a "rotate your device" message instead.

## Files
- `index.html` — markup
- `style.css` — all styling
- `script.js` — all logic (tithi/phase math, orbit geometry, moon rendering)
- `assets/sun.webp`, `assets/earth.webp` — real photos, extracted from your Figma export

## About the Moon graphic
You mentioned 20 real phase photos (4 fixed: `new-moon`, `first-quarter`, `full-moon`,
`last-quarter` + 16 sector frames: `waxing-crescent-1..4`, `waxing-gibbous-1..4`,
`waning-gibbous-1..4`, `waning-crescent-1..4`). Your Figma file only had one moon photo
embedded, so rather than ship 19 placeholders, `script.js` currently draws the Moon
procedurally — an accurate terminator-curve shape computed for the *exact* live angle,
not snapped to 20 frames. It still computes and labels all 20 names/keys internally
(see `getPhase()` in script.js) for the **Phase** text and for whichever image would be
active at any angle — that key is just not yet used to pick an image.

If you send over the real 20 `.webp` files (same names as above), I'll wire them in —
straightforward swap in `script.js`'s `render()` function.

## Notes
- Tithi math: 30 tithis × 12° each. Sud (Shukla) 1–15, Vad (Krishna) 1–15, with Purnima
  (15th Sud) and Amas (15th Vad) from your `PURNIMA_AMAS` array.
- "Angle difference" shown is the elongation (0–180°), not the raw 0–360° slider value.
- This is illustrative/idealized geometry, not live ephemeris data (per your note — the
  real-data version is a separate future tool).
