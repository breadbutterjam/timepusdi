# Trump Card Viewer

A standalone page for browsing trump card decks. Pick a category, pick a name, see the card. It renders the same SVG as Trump Card Studio, reading the JSON the studio exports.

## Files

```
index.html
css/styles.css     design tokens in :root, then layout
js/config.js       ← the only file you normally edit
js/card.js         the SVG builder (port of buildCardSVG)
js/app.js          category / chip / stage wiring
data/              drop your exported JSON here
```

## Running it

The page fetches JSON, so it needs http — opening `index.html` straight off disk will fail on CORS.

```bash
cd trump-card-viewer
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Pointing it at your images

Cards carry a relative path in the JSON:

```json
"images": ["assets/cards/ipl/SanjuSamson.webp"]
```

`IMAGE_BASE` in `js/config.js` is glued to the front of that:

```js
const IMAGE_BASE = ""; // assets/cards/ipl/SanjuSamson.webp
const IMAGE_BASE = "../"; // ../assets/cards/ipl/SanjuSamson.webp
const IMAGE_BASE = "https://cdn.example.com/"; // cdn copy
```

Keep the trailing slash. Paths that are already absolute (`http:`, `https:`, `data:`, or starting with `/`) ignore `IMAGE_BASE`.

A category can override it with its own `imageBase`, which is handy when decks live in different buckets.

## Adding a category

```js
const CATEGORIES = [
  { file: "data/iplcricketers.json", label: "IPL Cricketers" },
  { file: "data/footballers.json", label: "Footballers" },
  { file: "data/f1drivers.json", label: "F1 Drivers", imageBase: "assets/f1/" }
];
```

`label` is optional — without it the viewer falls back to `categoryName` inside the JSON.

## Matching your studio layout

`CARD_LAYOUT` mirrors the studio's layout controls:

```js
const CARD_LAYOUT = {
  statsColumns: 3,
  statsRowHeight: 100,
  roundedCorners: false
};
```

If you changed these in the studio before exporting, change them here too or the cards won't match.

## Photo framing

By default each photo gets a cover crop, same as a fresh row in the studio. If you nudged or zoomed a photo there and exported a draft, copy the values into `IMAGE_ADJUSTMENTS`, keyed by card id:

```js
const IMAGE_ADJUSTMENTS = {
  sanjusamson: { scale: 1.12, x: -18, y: 40 }
};
```

`scale` above 1 zooms in, `x` and `y` move the photo right and down in card pixels.

## What the JSON needs

```json
{
  "categoryId": "iplcricketers",
  "categoryName": "IPL Cricketers",
  "cards": [
    {
      "id": "sanjusamson",
      "region": "Sanju Samson",
      "nickname": "chetta thala",
      "images": ["assets/cards/ipl/SanjuSamson.webp"],
      "stats": {
        "matches": { "label": "Matches", "display": "191", "value": 191 }
      }
    }
  ]
}
```

`region` is the big name, `nickname` the line under it (leave it empty and the name drops down to fill the space). Stats render in key order, using `label` and `display` — the viewer never reformats `display`, so what you exported is what you see.
