/* =========================================================
   VERSION.JS
   Single source of truth for the app's version string — read by both
   sw.js (service worker cache versioning, via importScripts) and
   app.js (displayed in the info panel), so the two can never drift
   out of sync with each other.

   Bump this whenever shipping a change that should invalidate old
   service-worker caches (see sw.js's CACHE_VERSION comment) — any
   distinct string works; the format itself is just for your own
   bookkeeping, not parsed or compared by anything here.
========================================================= */
const APP_VERSION = 'v1.27';
