/* =========================================================
   api/moon.js

   Serves a NASA SVS "Dial-A-Moon" frame image URL + illumination
   percentage for an arbitrary date/time.

   WHY THIS DOESN'T CALL https://svs.gsfc.nasa.gov/api/dialamoon/<date>
   ----------------------------------------------------------------
   That convenience endpoint is what NASA's own interactive "Dial-A-
   Moon" widget uses, and its historical-year behavior isn't publicly
   documented. Every other project that consumes this same dataset
   (e.g. the PyPI `moon` package) maintains its own explicit
   year -> visualization-ID table rather than relying on any such
   endpoint — so this does the same: look up the year directly, build
   the exact frame URL ourselves (verified against real NASA responses
   across several different years), and compute the illumination
   percentage locally instead of trusting a server response for it.
   This makes every year in YEAR_TO_SVS_ID equally reliable, past or
   present, rather than only whatever year NASA's widget currently
   points at.

   MAINTENANCE: once a year (NASA typically publishes the next year's
   dataset around November-December), check
   https://svs.gsfc.nasa.gov/gallery/moonphase/ for the new year's
   "North Up" visualization ID and add it to YEAR_TO_SVS_ID below.
   Requests for a year not in the table return a clear 404 — the
   calling app is expected to fall back gracefully (this app's
   frontend already does, via a CSS-drawn crescent).
========================================================= */

// Year -> NASA SVS "Moon Phase and Libration" (North Up) visualization ID.
// Source: https://svs.gsfc.nasa.gov/gallery/moonphase/
const YEAR_TO_SVS_ID = {
    2011: 3810,
    2012: 3894,
    2013: 4000,
    2014: 4118,
    2015: 4236,
    2016: 4404,
    2017: 4537,
    2018: 4604,
    2019: 4442,
    2020: 4768,
    2021: 4874,
    2022: 4955,
    2023: 5048,
    2024: 5187,
    2025: 5415,
    2026: 5587
};

/* ---------- Sun & Moon position (vendored from this project's own
   js/ephemeris.js — kept in sync manually; see that file for the
   full derivation notes and accuracy figures). Only what's needed to
   compute an illumination percentage locally. ---------- */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

function normDeg(deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
}
function daysSinceJ2000(date) { return (date.getTime() - J2000_MS) / 86400000; }

function sunPosition(d) {
    const e = 0.016711, n = 0.98564735, nTilde = 0.98560025;
    const lamBar = normDeg(280.458 + n * d);
    const M = normDeg(357.588 + nTilde * d);
    const Mr = M * DEG2RAD;
    const qRad = 2 * e * Math.sin(Mr) + 1.25 * e * e * Math.sin(2 * Mr);
    return { longitude: normDeg(lamBar + qRad * RAD2DEG), meanAnomaly: M };
}

function moonLongitude(d, sunLon, sunMeanAnomaly) {
    const e = 0.054881, n = 13.17639646, nTilde = 13.06499295, nF = 13.22935027;
    const lamBar = normDeg(218.322 + n * d);
    const M = normDeg(134.916 + nTilde * d);
    const F = normDeg(93.284 + nF * d);
    const Mr = M * DEG2RAD;
    const Dtilde = normDeg(lamBar - sunLon);
    const Dr = Dtilde * DEG2RAD;
    const q1 = 2 * e * Math.sin(Mr) + 1.430 * e * e * Math.sin(2 * Mr);
    const q2 = 0.422 * e * Math.sin((2 * Dtilde - M) * DEG2RAD);
    const q3 = 0.211 * e * (Math.sin(2 * Dr) - 0.066 * Math.sin(Dr));
    const q4 = -0.051 * e * Math.sin(sunMeanAnomaly * DEG2RAD);
    const q5 = -0.038 * e * Math.sin(2 * F * DEG2RAD);
    return normDeg(lamBar + (q1 + q2 + q3 + q4 + q5) * RAD2DEG);
}

function elongationDeg(date) {
    const d = daysSinceJ2000(date);
    const sun = sunPosition(d);
    const moon = moonLongitude(d, sun.longitude, sun.meanAnomaly);
    return normDeg(moon - sun.longitude);
}

function illuminationPercent(date) {
    const elong = elongationDeg(date);
    return Math.round((1 - Math.cos(elong * DEG2RAD)) / 2 * 1000) / 10; // one decimal place
}

/* ---------- frame URL construction ---------- */

// Confirmed pattern (cross-checked against real NASA responses for
// multiple different years):
//   .../vis/a000000/a00{hundredBucket}/a00{id}/frames/730x730_1x1_30p/moon.{frame}.jpg
// frame = hour-of-year, 1-indexed from Jan 1 00:00:00 UTC.
function frameInfoForDate(date) {
    const year = date.getUTCFullYear();
    const id = YEAR_TO_SVS_ID[year];
    if (!id) return null;

    const yearStartMs = Date.UTC(year, 0, 1, 0, 0, 0);
    const nextYearStartMs = Date.UTC(year + 1, 0, 1, 0, 0, 0);
    const totalHours = Math.round((nextYearStartMs - yearStartMs) / 3600000); // 8760 or 8784

    const hourIndex = Math.floor((date.getTime() - yearStartMs) / 3600000); // 0-based
    // Clamp defensively within THIS year's own frame count (should
    // never trigger given the year check above, but avoids ever
    // requesting frame 0 or an out-of-bounds frame on an edge case).
    const frame = Math.min(Math.max(hourIndex + 1, 1), totalHours);

    const idStr = String(id).padStart(4, '0');
    const bucketStr = String(Math.floor(id / 100) * 100).padStart(4, '0');
    const frameStr = String(frame).padStart(4, '0');

    return {
        frame,
        url: `https://svs.gsfc.nasa.gov/vis/a000000/a00${bucketStr}/a00${idStr}/frames/730x730_1x1_30p/moon.${frameStr}.jpg`
    };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    try {
        let { date } = req.query;
        if (!date) date = new Date().toISOString();
        const d = new Date(date);

        if (isNaN(d.getTime())) {
            return res.status(400).json({ error: "Invalid date" });
        }

        const info = frameInfoForDate(d);
        if (!info) {
            return res.status(404).json({
                error: `No Moon imagery dataset for year ${d.getUTCFullYear()}. ` +
                    `Known years: ${Object.keys(YEAR_TO_SVS_ID).join(', ')}.`
            });
        }

        return res.status(200).json({
            image: info.url,
            phase: illuminationPercent(d),
            date: d.toISOString(),
            frame: String(info.frame)
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch moon data" });
    }
}
