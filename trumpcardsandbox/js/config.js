/* =================================================================
   CONFIG
   This is the only file you need to edit day to day.
   =================================================================*/

/* -----------------------------------------------------------------
   1. WHERE THE CARD IMAGES LIVE
   -----------------------------------------------------------------
   Every card in the JSON carries a relative path, e.g.
       "images": ["assets/cards/ipl/SanjuSamson.webp"]

   IMAGE_BASE is glued to the front of that path.

   Examples:
     ""                              -> assets/cards/ipl/SanjuSamson.webp
     "../"                           -> ../assets/cards/ipl/SanjuSamson.webp
     "https://cdn.example.com/"      -> https://cdn.example.com/assets/...
     "/static/"                      -> /static/assets/cards/ipl/...

   Keep the trailing slash. A category can override this with its own
   `imageBase` (see below).

   Paths that are already absolute (http:, https:, data:, file:, blob:,
   or starting with "/") are used as-is and IMAGE_BASE is ignored.
------------------------------------------------------------------*/
const IMAGE_BASE = "";

/* -----------------------------------------------------------------
   2. THE CATEGORIES
   -----------------------------------------------------------------
   One entry per deck. `file` is the JSON exported from Trump Card
   Studio. `label` is optional — if omitted, the viewer uses the
   `categoryName` inside the JSON.

   `imageBase` is optional and overrides IMAGE_BASE for that deck.
------------------------------------------------------------------*/
const CATEGORIES = [
  {
    file: "data/iplcricketers.json",
    label: "IPL Cricketers"
    // imageBase: "https://cdn.example.com/ipl/"
  }, 
  {
    file: "data/tennis.json",
    label: "Tennis Players",
  }, 
  {
    file: "data/testcricketers.json",
    label: "Test Cricketers",
  }, 
  {
    file: "data/womencricket.json",
    label: "Women Cricketers",
  }, 
  {
    file: "data/wpl.json",
    label: "Women Premier League",
  }, 
  {
    file: "data/pm.json",
    label: "Prime Ministers of India",
  }

  // Add more decks here:
  // { file: "data/footballers.json", label: "Footballers" },
  // { file: "data/f1drivers.json",   label: "F1 Drivers", imageBase: "assets/f1/" }
];

/* -----------------------------------------------------------------
   3. CARD LAYOUT (default)
   -----------------------------------------------------------------
   These mirror the layout controls in Trump Card Studio, and apply
   to any deck that doesn't say otherwise.

   A deck's own JSON can override any of these per category — add a
   "cardLayout" object at the TOP LEVEL of the JSON, alongside
   "cards", with just the keys that differ:

     {
       "categoryId": "tennis",
       "categoryName": "Tennis Players",
       "cardLayout": { "statsColumns": 2 },
       "cards": [ ... ]
     }

   Keys the deck's JSON doesn't mention fall back to the defaults
   below — you only need to state what's different about that deck.
------------------------------------------------------------------*/
const DEFAULT_CARD_LAYOUT = {
  statsColumns: 3, // 2 or 3
  statsRowHeight: 100, // pixels between stat rows
  roundedCorners: false // true clips the card to a 30px radius
};

/* -----------------------------------------------------------------
   4. OPTIONAL: IMAGE FRAMING FALLBACK
   -----------------------------------------------------------------
   Newer exports from Trump Card Studio carry each photo's framing
   right in the JSON, as an "imageAdjustment" field on the card
   itself — so for those decks you don't need to touch this at all.

   This map is only a fallback, for cards / decks exported before
   that field existed. Keyed by card id, same shape as the exported
   field. If a card has its own "imageAdjustment" in the JSON, that
   always wins over an entry here.

   Leave empty and every photo without its own adjustment uses the
   default cover crop.

     scale: 1 = cover crop, >1 zooms in, <1 zooms out
     x / y: card pixels the photo moves right / down
------------------------------------------------------------------*/
const IMAGE_ADJUSTMENTS = {
  // "sanjusamson": { scale: 1.12, x: -18, y: 40 },
};

/* -----------------------------------------------------------------
   5. CARD GEOMETRY (default)
   -----------------------------------------------------------------
   Straight from Trump Card Studio. Applies to any deck that doesn't
   say otherwise.

   Same override mechanism as CARD LAYOUT above — a deck's JSON can
   carry its own top-level "cardGeometry" object with just the keys
   that differ:

     {
       "categoryId": "tennis",
       "cardGeometry": { "gutter": 12, "gridGap": 40 },
       "cards": [ ... ]
     }

   Change the numbers below only if you also changed them in the
   studio for decks that DON'T carry their own "cardGeometry" —
   otherwise the viewer will render those decks' cards off-spec.
------------------------------------------------------------------*/
const DEFAULT_CARD_GEOMETRY = {
  width: 620,
  height: 1000,
  gutter: 24, // left/right margin for all text
  gridGap: 24, // horizontal gap between stat columns
  blockGap: 36, // gap between title block, stats and card edge
  valueRowOffset: 68, // baseline offset of the value line inside a row
  titleHeight: 45, // line advance of the player name
  shortNameHeight: 42 // line advance of the nickname
};

export { IMAGE_BASE, CATEGORIES, DEFAULT_CARD_LAYOUT, IMAGE_ADJUSTMENTS, DEFAULT_CARD_GEOMETRY };
