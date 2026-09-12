/* ============================================================
   SHEET DATA — local CSV files, one per module per year, sitting
   in a /data folder next to index.html in the repo.

   Naming convention: <year>_<Category>.csv — e.g. 2026_Trips.csv,
   2026_Cars.csv, 2026_Books.csv, 2026_Movies.csv. Match whatever
   you actually name the file to what's written here; these are
   plain relative paths, not magic.

   Workflow per update: edit the Google Sheet as usual → File →
   Download → CSV → save it into /data under the matching name →
   commit & push. The dashboard reads whatever's sitting in /data;
   it no longer talks to Google Sheets at all.

   Add a new "2027: '...'," line under each module as a new year's
   file shows up. Modules don't need to share the same years.
   ============================================================ */

const SHEET_CONFIG = {

  travel: {
    2026: 'data/2026_trips.csv',
    2025: 'data/2025_trips.csv',
    2024: 'data/2024_trips.csv',
    2023: 'data/2023_trips.csv',
    2022: 'data/2022_trips.csv',
    2021: 'data/2021_trips.csv',
    2020: 'data/2020_trips.csv',
    2019: 'data/2019_trips.csv',
    2018: 'data/2018_trips.csv',
  },

  cars: {
    2026: 'data/2026_cars.csv',
    2025: 'data/2025_cars.csv',
  },

  books: {
    2026: 'data/2026_books.csv',
  },

  movies: {
    2026: 'data/2026_movies.csv',
    2025: 'data/2025_movies.csv',
    2024: 'data/2024_movies.csv',
    2023: 'data/2023_movies.csv',
  },

  // Cities — cumulative (all-time), not year-keyed, so this stays a
  // plain path rather than a {year: url} object like the others above.
  // cities: 'data/2026_cities.csv',
   cities: {
  2026: 'data/2026_cities.csv',
  2025: 'data/2025_cities.csv',
},


};
