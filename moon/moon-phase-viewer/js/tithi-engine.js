/* =========================================================
   TITHI-ENGINE.JS
   Loads the pre-generated data/tithi-data.json (a list of exact
   tithi-boundary instants) and answers "what tithi is active at
   date X, and when does it change?" via binary search — no
   computation needed for dates inside the generated range.

   If a requested date falls OUTSIDE the generated range (data file
   not regenerated in a while, or someone browses far into the
   future/past), this transparently falls back to live-computing
   the answer with ephemeris.js — same fallback philosophy as the
   moon-photo proxy -> local placeholder -> CSS chain already in
   this app. Nothing breaks, it just gets a little slower.

   Depends on: window.MoonEphemeris (ephemeris.js), loaded first.
========================================================= */
window.TithiEngine = (function () {
    'use strict';

    let transitions = null; // sorted array of {utc: ISOString, tithi: 0-29}
    let transitionMs = null; // parallel array of numeric timestamps (perf)
    let sudEkamIndices = null; // indices into `transitions` where tithi===0
    let dataRange = null; // {start: ms, end: ms}
    let loadPromise = null;

    async function init(dataUrl) {
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            try {
                const res = await fetch(dataUrl);
                if (!res.ok) throw new Error('fetch failed: ' + res.status);
                const json = await res.json();
                transitions = json.transitions;
                transitionMs = transitions.map(t => Date.parse(t.utc));
                sudEkamIndices = [];
                for (let i = 0; i < transitions.length; i++) {
                    if (transitions[i].tithi === 0) sudEkamIndices.push(i);
                }
                dataRange = {
                    start: transitionMs[0],
                    end: transitionMs[transitionMs.length - 1]
                };
                return true;
            } catch (e) {
                console.warn('TithiEngine: could not load static data, will compute live for every request.', e);
                transitions = [];
                transitionMs = [];
                sudEkamIndices = [];
                dataRange = { start: Infinity, end: -Infinity }; // forces live fallback always
                return false;
            }
        })();
        return loadPromise;
    }

    // Last index i such that transitionMs[i] <= targetMs. -1 if none.
    function lastIndexAtOrBefore(targetMs) {
        let lo = 0, hi = transitionMs.length - 1, ans = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (transitionMs[mid] <= targetMs) { ans = mid; lo = mid + 1; }
            else { hi = mid - 1; }
        }
        return ans;
    }

    function withinDataRange(ms) {
        return transitions && transitions.length > 0 && ms >= dataRange.start && ms <= dataRange.end;
    }

    /* ---------- Live fallback (only used outside the data range) ---------- */

    function liveTithiInfo(date) {
        const E = window.MoonEphemeris;
        const targetMs = date.getTime();
        const cur = E.tithiIndexAt(date);

        // Search backward in 6h steps for the start-of-tithi boundary.
        let lo = targetMs, hi = targetMs;
        let t = targetMs;
        while (E.tithiIndexAt(new Date(t)) === cur) { hi = t; t -= 6 * 3600000; }
        lo = t;
        while (hi - lo > 30000) {
            const mid = Math.floor((lo + hi) / 2);
            if (E.tithiIndexAt(new Date(mid)) === cur) hi = mid; else lo = mid;
        }
        const start = new Date(hi);

        // Search forward for the end-of-tithi boundary.
        lo = targetMs; hi = targetMs; t = targetMs;
        while (E.tithiIndexAt(new Date(t)) === cur) { lo = t; t += 6 * 3600000; }
        hi = t;
        while (hi - lo > 30000) {
            const mid = Math.floor((lo + hi) / 2);
            if (E.tithiIndexAt(new Date(mid)) === cur) lo = mid; else hi = mid;
        }
        const nextStart = new Date(hi);
        const nextTithi = E.tithiIndexAt(new Date(hi.getTime ? hi.getTime() + 1 : hi + 1));

        return { tithi: cur, start: start, nextStart: nextStart, nextTithi: E.tithiIndexAt(new Date(nextStart.getTime() + 60000)) };
    }

    function liveNextOccurrence(fromDate, targetTithi) {
        const E = window.MoonEphemeris;
        let t = fromDate.getTime();
        let cur = E.tithiIndexAt(new Date(t));
        // Step forward a day at a time until we cross into targetTithi, then bisect.
        for (let i = 0; i < 400; i++) { // 400 days safety cap
            const tPrev = t;
            t += 86400000;
            const next = E.tithiIndexAt(new Date(t));
            if (cur !== targetTithi && next === targetTithi) {
                let lo = tPrev, hi = t;
                while (hi - lo > 30000) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (E.tithiIndexAt(new Date(mid)) === targetTithi) hi = mid; else lo = mid;
                }
                return new Date(hi);
            }
            cur = next;
        }
        return null;
    }

    /* ---------- Public API ---------- */

    // Returns { tithi, start, nextStart, nextTithi } for the tithi active at `date`.
    function getTithiInfo(date) {
        const ms = date.getTime();
        if (withinDataRange(ms)) {
            const i = lastIndexAtOrBefore(ms);
            const entry = transitions[i];
            const nextEntry = transitions[i + 1] || null;
            return {
                tithi: entry.tithi,
                start: new Date(transitionMs[i]),
                nextStart: nextEntry ? new Date(transitionMs[i + 1]) : null,
                nextTithi: nextEntry ? nextEntry.tithi : null
            };
        }
        return liveTithiInfo(date);
    }

    // Next occurrence of new moon (tithi 0) and full moon (tithi 15) after `date`.
    function getUpcoming(date) {
        const ms = date.getTime();
        const result = {};
        for (const target of [0, 15]) {
            if (withinDataRange(ms)) {
                let i = lastIndexAtOrBefore(ms) + 1;
                while (i < transitions.length && transitions[i].tithi !== target) i++;
                if (i < transitions.length) {
                    result[target] = new Date(transitionMs[i]);
                    continue;
                }
            }
            result[target] = liveNextOccurrence(date, target);
        }
        return { nextNewMoon: result[0], nextFullMoon: result[15] };
    }

    // Month index (integer, no mod applied) relative to a known anchor
    // sud-ekam (tithi===0) transition. anchorUtcMs identifies which
    // sud-ekam transition is month 0; the caller mods the result into
    // their own 12-name array. Falls back to a day-count approximation
    // (days / synodic month, rounded) outside the data range or if the
    // anchor itself isn't a recognized sud-ekam in the loaded data.
    function getMonthOffset(date, anchorUtcMs) {
        const ms = date.getTime();
        if (transitions && sudEkamIndices.length > 0 && ms >= dataRange.start) {
            // Find anchor's position among sud-ekam transitions.
            let anchorPos = -1, bestDiff = Infinity;
            for (let k = 0; k < sudEkamIndices.length; k++) {
                const diff = Math.abs(transitionMs[sudEkamIndices[k]] - anchorUtcMs);
                if (diff < bestDiff) { bestDiff = diff; anchorPos = k; }
            }
            // Find current month's sud-ekam (last one <= date), or -1 if
            // date is before the first sud-ekam in the data.
            let curPos = -1;
            for (let k = 0; k < sudEkamIndices.length; k++) {
                if (transitionMs[sudEkamIndices[k]] <= ms) curPos = k; else break;
            }
            if (curPos >= 0 && anchorPos >= 0 && ms <= dataRange.end) {
                return curPos - anchorPos;
            }
        }
        // Fallback: approximate by whole synodic months elapsed.
        const SYNODIC = 29.530588853;
        const days = (ms - anchorUtcMs) / 86400000;
        return Math.round(days / SYNODIC);
    }

    return {
        init: init,
        getTithiInfo: getTithiInfo,
        getUpcoming: getUpcoming,
        getMonthOffset: getMonthOffset,
        isDataLoaded: () => !!transitions && transitions.length > 0
    };
})();
