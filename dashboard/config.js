/* ============================================================
   SHEET LINKS — paste your "Publish to web → CSV" links below.
   Each is safe to fill in independently; leave any as-is
   (don't delete the PASTE_ text) and the dashboard will just
   keep showing sample data for that module/year until you add it.

   Travel, Cars, Books, and Movies are all keyed by year now —
   add a new "2027: '...'," line under each module as a new
   year's sheet/tab comes online. You don't need every module
   to have the same years; each is independent.
   ============================================================ */

const SHEET_CONFIG = {

  travel: {
    2026: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4qTWpFhmacNm3_ZM5XrUPN_FxCCsNpnktrKRjpJvb0k7ficxtLdgeAX-6VZ9wILlHsunueQoloOrN/pub?gid=873914344&single=true&output=csv', //2026 - All (Summary)
    2025: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-v488Y0Pu9gNGwv54ql2SZu8Z045AkXW6SZzvkj7AbExFn_9I6AJL53qEbFcxPoOYZKsJ0lCUNfpV/pub?gid=126427389&single=true&output=csv', //2025 - All (Summary)
  },

  cars: {
    2026: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4qTWpFhmacNm3_ZM5XrUPN_FxCCsNpnktrKRjpJvb0k7ficxtLdgeAX-6VZ9wILlHsunueQoloOrN/pub?gid=936665693&single=true&output=csv',
  },

  books: {
    2026: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4qTWpFhmacNm3_ZM5XrUPN_FxCCsNpnktrKRjpJvb0k7ficxtLdgeAX-6VZ9wILlHsunueQoloOrN/pub?gid=1629520258&single=true&output=csv',
  },

  movies: {
    2026: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT4qTWpFhmacNm3_ZM5XrUPN_FxCCsNpnktrKRjpJvb0k7ficxtLdgeAX-6VZ9wILlHsunueQoloOrN/pub?gid=1070149965&single=true&output=csv',
  },

  // Cities — hold off on this one for now, see chat notes on
  // tidying the sheet's header row first. Not year-keyed yet.
  cities: 'PASTE_CITIES_CSV_LINK_HERE',

};
