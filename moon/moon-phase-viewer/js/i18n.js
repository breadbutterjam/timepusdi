/* =========================================================
   I18N.JS
   Loads a locale JSON file (locales/<code>.json) and provides a
   simple t(path, params) lookup — dot-path keys, {placeholder}
   substitution for templated strings (e.g. "till {time}, {date}"),
   and a graceful fallback to English for any key a locale is
   missing (so a partial/incomplete translation never breaks the UI
   or shows a blank string).
========================================================= */
window.I18n = (function () {
    'use strict';

    const FALLBACK_LANG = 'en';
    let current = {};
    let fallback = {};
    let currentCode = FALLBACK_LANG;

    function getPath(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    // t('months.chaitra') -> "Chaitra" / "ચૈત્ર" / etc.
    // t('ui.tillTemplate', {time: '8:30pm', date: 'Thu 25-Sep-2026'})
    //   -> "till 8:30pm, Thu 25-Sep-2026" (or however the active
    //      locale has ordered/worded that template — word order is
    //      intentionally controlled by each locale file, not fixed
    //      by the calling code).
    function t(path, params) {
        let str = getPath(current, path);
        if (str === undefined) str = getPath(fallback, path);
        if (str === undefined) return path; // never crash or blank out — show the key itself as a last resort
        if (params) {
            for (const key in params) {
                str = str.split('{' + key + '}').join(params[key]);
            }
        }
        return str;
    }

    async function loadLocale(code) {
        const res = await fetch(`locales/${code}.json`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    // Always loads English first (as the fallback), then the
    // requested language on top of it if different. A failed/missing
    // locale file just leaves the app on English rather than breaking.
    async function init(code) {
        fallback = await loadLocale(FALLBACK_LANG);
        current = fallback;
        currentCode = FALLBACK_LANG;
        if (code && code !== FALLBACK_LANG) {
            try {
                current = await loadLocale(code);
                currentCode = code;
            } catch (e) {
                console.warn(`I18n: could not load locale "${code}", staying on English.`, e);
            }
        }
    }

    function setLanguage(code) {
        return init(code);
    }

    function getLanguage() {
        return currentCode;
    }

    return { init, setLanguage, getLanguage, t };
})();
