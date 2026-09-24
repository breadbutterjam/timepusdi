/* =========================================================
   EPHEMERIS.JS
   Self-contained, dependency-free Sun & Moon geocentric ecliptic
   longitude calculator, and tithi (lunar-day) math built on top
   of it. No network calls, no external data — pure formula.

   SOURCE / ACCURACY
   Formulas: simplified modern lunar & solar theory as given in
   Meeus, "Astronomical Algorithms" (also reproduced in Fitzpatrick,
   "An Introduction to the Almagest, Ch. 5 & Ch. 8"). These are the
   "low precision" periodic-term versions (not the full ~60-term
   ELP2000/VSOP87 series) — small enough to hand-verify, accurate
   enough for tithi purposes:
     Sun longitude:  mean error 0.2', max error 0.7'  (1995-2006 CE)
     Moon longitude: mean error 5',  max error 14'    (1995-2006 CE)
   14' of longitude error near a tithi boundary (moon-sun relative
   rate ≈ 12.19°/day ≈ 0.508°/hr) translates to roughly ±1.5 minutes
   typical, a few minutes worst case — well inside the 15-60 minute
   tolerance this app targets for tithi transition times.

   Valid range: elements below are fit for 1800-2050 CE (per JPL,
   the ultimate source of the orbital elements). Good for decades
   in every direction from today.
========================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Node (generator script)
    } else {
        root.MoonEphemeris = factory(); // Browser (<script> tag)
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;

    // J2000.0 epoch = 12:00 UT, Jan 1 2000 = JD 2451545.0
    const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

    function normDeg(deg) {
        let d = deg % 360;
        if (d < 0) d += 360;
        return d;
    }

    // Fractional days (may be negative/fractional) since J2000.0
    function daysSinceJ2000(date) {
        return (date.getTime() - J2000_MS) / 86400000;
    }

    /* --- Sun: Keplerian orbit + equation of center ---
       Orbital elements at J2000 (Fitzpatrick, Table 30 / JPL):
       e=0.016711, n=0.98564735 deg/day, ntilde=0.98560025 deg/day,
       lambda0=280.458 deg, M0=357.588 deg. */
    function sunPosition(d) {
        const e = 0.016711;
        const n = 0.98564735;
        const nTilde = 0.98560025;
        const lamBar = normDeg(280.458 + n * d);
        const M = normDeg(357.588 + nTilde * d);
        const Mr = M * DEG2RAD;
        const qRad = 2 * e * Math.sin(Mr) + 1.25 * e * e * Math.sin(2 * Mr);
        const longitude = normDeg(lamBar + qRad * RAD2DEG);
        return { longitude: longitude, meanAnomaly: M };
    }

    /* --- Moon: mean elements + 5 largest perturbation terms ---
       (evection, variation, annual equation, reduction to ecliptic)
       Orbital elements at J2000 (Fitzpatrick, Table 35):
       e=0.054881, n=13.17639646, ntilde=13.06499295, Fdot=13.22935027
       (all deg/day), lambda0=218.322, M0=134.916, F0=93.284 deg. */
    function moonLongitude(d, sunLon, sunMeanAnomaly) {
        const e = 0.054881;
        const n = 13.17639646;
        const nTilde = 13.06499295;
        const nF = 13.22935027;

        const lamBar = normDeg(218.322 + n * d);
        const M = normDeg(134.916 + nTilde * d);
        const F = normDeg(93.284 + nF * d);
        const Mr = M * DEG2RAD;
        const Dtilde = normDeg(lamBar - sunLon); // mean elongation
        const Dr = Dtilde * DEG2RAD;

        const q1 = 2 * e * Math.sin(Mr) + 1.430 * e * e * Math.sin(2 * Mr);
        const q2 = 0.422 * e * Math.sin((2 * Dtilde - M) * DEG2RAD);
        const q3 = 0.211 * e * (Math.sin(2 * Dr) - 0.066 * Math.sin(Dr));
        const q4 = -0.051 * e * Math.sin(sunMeanAnomaly * DEG2RAD);
        const q5 = -0.038 * e * Math.sin(2 * F * DEG2RAD);

        const qSum = q1 + q2 + q3 + q4 + q5; // radians
        return normDeg(lamBar + qSum * RAD2DEG);
    }

    // Moon's geocentric elongation from the Sun, 0-360 deg.
    // 0 = new moon, 180 = full moon.
    function elongationDeg(date) {
        const d = daysSinceJ2000(date);
        const sun = sunPosition(d);
        const moon = moonLongitude(d, sun.longitude, sun.meanAnomaly);
        return normDeg(moon - sun.longitude);
    }

    // Illumination fraction 0-1 from elongation (standard cosine model;
    // treats elongation as the phase angle, which is accurate to well
    // under 1% since the Moon's distance variation has little effect
    // on the *fraction* illuminated as seen from Earth).
    function illuminationFraction(elongDeg) {
        return (1 - Math.cos(elongDeg * DEG2RAD)) / 2;
    }

    // Tithi index 0-29. 0-14 = Shukla (waxing) Ekam..Purnima,
    // 15-29 = Krishna (waning) Ekam..Amavasya.
    function tithiIndexFromElongation(elongDeg) {
        return Math.min(29, Math.floor(elongDeg / 12));
    }

    function tithiIndexAt(date) {
        return tithiIndexFromElongation(elongationDeg(date));
    }

    return {
        daysSinceJ2000: daysSinceJ2000,
        sunPosition: sunPosition,
        moonLongitude: moonLongitude,
        elongationDeg: elongationDeg,
        illuminationFraction: illuminationFraction,
        tithiIndexFromElongation: tithiIndexFromElongation,
        tithiIndexAt: tithiIndexAt,
        normDeg: normDeg
    };
});
