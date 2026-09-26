# Moon Phase Visualizer

Open `index.html` via a local server (or your eventual host, e.g. GitHub Pages) —
opening it directly as a `file://` path can block the image textures in some browsers.

## images/

- `earth-equirectangular.jpg` — Earth sphere texture (already in place)
- `moon-surface.jpg` — lunar surface texture for the orbiting 3D moon (already in place)
- `moon-<slug>.webp` — real phase photos for the "moon from earth" picture-in-picture,
  named per `ORDERED_PHASE_SLUGS` in `index.html`. None are in place yet — until you
  add them, the picture-in-picture falls back to a live-rendered view automatically.
  Expected names:
  - `moon-new.webp`, `moon-full.webp`, `moon-first-quarter.webp`, `moon-last-quarter.webp`
  - `moon-waxing-crescent-1.webp` through `moon-waxing-crescent-4.webp`
  - `moon-waxing-gibbous-1.webp` through `moon-waxing-gibbous-4.webp`
  - `moon-waning-gibbous-1.webp` through `moon-waning-gibbous-4.webp`
  - `moon-waning-crescent-1.webp` through `moon-waning-crescent-4.webp`

  To add more interim images later, just add more slugs to the `ORDERED_PHASE_SLUGS`
  array in order — the orbit is divided evenly across however many entries it has.
