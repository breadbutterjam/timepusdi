/* =========================================================
   SW.JS — service worker, offline support (PWA pass 2 of 2).

   STRATEGY: cache-first for everything same-origin (the app shell,
   tithi-data.json, locale files, icons) — check the cache, serve it
   if present, otherwise fetch from the network and cache the result
   for next time. The real-photo proxy (NASA imagery, a live, per-date
   external resource) is deliberately excluded entirely — every
   request to it passes straight through untouched, exactly as if this
   service worker didn't exist. That's intentional, not an oversight:
   this app already has a graceful fallback chain for when that photo
   is unavailable (local placeholder -> CSS-drawn crescent), online or
   off, so the service worker doesn't need to do anything special
   there — it would only add staleness risk for zero benefit.

   VERSIONING: bump CACHE_VERSION whenever any shipped file changes —
   especially data/tithi-data.json after regenerating it with a wider
   range, or any locale file — otherwise a returning user's cache would
   serve the OLD version indefinitely. This is a manual, deliberate
   step, matching how this project already gets updated (infrequent,
   manual regeneration) rather than a more complex
   stale-while-revalidate scheme.
========================================================= */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `moon-phase-viewer-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/suncalc.js',
    './js/ephemeris.js',
    './js/tithi-engine.js',
    './js/i18n.js',
    './js/app.js',
    './data/tithi-data.json',
    './locales/en.json',
    './locales/gu.json',
    './locales/hi.json',
    './locales/mr.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png'
];

// Never cache or intercept requests to the real-photo proxy — see the
// file-level comment above.
const NEVER_CACHE_HOST = 'timepusdi.vercel.app';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()) // take over immediately rather than waiting for every open tab to close
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim()) // apply to already-open tabs immediately too
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return; // only GETs are meaningful to cache

    const url = new URL(event.request.url);
    if (url.hostname === NEVER_CACHE_HOST) return; // real-photo proxy: always network, never intercepted
    if (url.origin !== self.location.origin) return; // any other cross-origin request: same policy

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            });
            // If this fetch fails (offline and not already cached),
            // the promise rejects naturally — same as if no service
            // worker were installed. Nothing further to do for a file
            // that was never fetched successfully in the first place.
        })
    );
});
