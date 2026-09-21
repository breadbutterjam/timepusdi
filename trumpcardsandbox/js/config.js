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
    label: "IPL Cricketers",
    // imageBase: "assets/cards/ipl/"
  }, 
{
    file: "data/tennis.json",
    label: "Tennis Players",
    // imageBase: "assets/cards/tennis/"
  }, 
  {
    file: "data/testcricketers.json",
    label: "Test Cricketers",
    // imageBase: "assets/cards/ipl/"
  }, 
  {
    file: "data/womencricket.json",
    label: "Women Cricketers",
  }
  // Add more decks here:
  // { file: "data/footballers.json", label: "Footballers" },
  // { file: "data/f1drivers.json",   label: "F1 Drivers", imageBase: "assets/f1/" }
];

/* -----------------------------------------------------------------
   3. CARD LAYOUT
   -----------------------------------------------------------------
   These mirror the layout controls in Trump Card Studio. Change them
   here only if you changed them there — otherwise the viewer will
   render cards that don't match your exports.
------------------------------------------------------------------*/
const CARD_LAYOUT = {
  statsColumns: 3, // 2 or 3
  statsRowHeight: 100, // pixels between stat rows
  roundedCorners: false // true clips the card to a 30px radius
};

/* -----------------------------------------------------------------
   4. OPTIONAL: IMAGE FRAMING
   -----------------------------------------------------------------
   Studio lets you nudge and zoom each photo. If you exported a studio
   draft (the "adjustments" block), drop the values in here keyed by
   card id and the viewer will reproduce the same crop.

   Leave empty and every photo uses the default cover crop.

     scale: 1 = cover crop, >1 zooms in, <1 zooms out
     x / y: card pixels the photo moves right / down
------------------------------------------------------------------*/
const IMAGE_ADJUSTMENTS = {
  // "sanjusamson": { scale: 1.12, x: -18, y: 40 },
};

/* -----------------------------------------------------------------
   5. FIXED CARD GEOMETRY
   -----------------------------------------------------------------
   Straight from Trump Card Studio. Don't touch unless the studio
   constants change too.
------------------------------------------------------------------*/
const CARD_GEOMETRY = {
  width: 620,
  height: 1000,
  gutter: 24, // left/right margin for all text
  gridGap: 24, // horizontal gap between stat columns
  blockGap: 36, // gap between title block, stats and card edge
  valueRowOffset: 68, // baseline offset of the value line inside a row
  titleHeight: 45, // line advance of the player name
  shortNameHeight: 42 // line advance of the nickname
};

export { IMAGE_BASE, CATEGORIES, CARD_LAYOUT, IMAGE_ADJUSTMENTS, CARD_GEOMETRY };
