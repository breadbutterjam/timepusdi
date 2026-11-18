// Map style settings.
//
// "Light" and "Light (no labels)" use CARTO basemaps, which need a free key
// (https://www.carto.com/basemaps/apikey/). Like the Supabase publishable key
// it is visible in the page, so restrict each key to your site in CARTO's
// dashboard (the "Restrict to specific websites (Referer)" option).
//
// CARTO wants localhost / 127.0.0.1 on a key of their own, so there are two:
//   CARTO_KEY_SITE   restricted to your published address, e.g. yourname.github.io
//   CARTO_KEY_LOCAL  restricted to localhost and 127.0.0.1, for live-server testing
// Leave one empty and the Light options simply stay switched off there.
const CARTO_KEY_SITE = 'cb1_5bdy_2_b489695f8f93feed8d72e50c';
const CARTO_KEY_LOCAL = 'cb1_5bdy_1_6d3597a169ebe5a5c24025c4';
