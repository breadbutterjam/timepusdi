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

// "Satellite" options use Esri's imagery and need a free ArcGIS API key
// (developers.arcgis.com > Content > developer credentials). Create it as a
// Public application key with only the Basemaps privilege, and restrict it to
// your site (https://YOURNAME.github.io) plus http://127.0.0.1:5500 and
// http://localhost:5500 for testing. One key serves both. Keys expire (up to a
// year), so note the date: the satellite option stops working after it.
const ARCGIS_API_KEY = 'AAPTapYDN0KFebtWt7aCjSVCong..-LezZ1LlSZrDB3Y5J3Ov-J3I1S6eRjUm_t8Mo4Hc2ELnpJ-EngiWus-aaduqqzSiUfG1gBqgTKiF72BOett9rTvpvvkBrmEftwqxTQJZKaSSkMmALh_n-KV_pc054EvgJic0NhL4iufNxISnSCMuxWf0thFJ4gUrQNhsZ4aEcNuQic2cuX-O0Hh1dSUbmfpVLX_6LwKGyyF278GNHolOtmjbUzqRAqVedzPigrulsn-Qow7dF_ebeNCCB3pby-Q.AT1_eOVvJbow';
