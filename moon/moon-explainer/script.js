(function(){

  "use strict";

  // ---- Gujarati tithi names (1st-14th of each paksha) ----
  const TITHI_NAMES = [
    "Ekam", "Beej", "Trij", "Choth", "Pancham",
    "Chhath", "Satam", "Aatham", "Nom", "Dasham",
    "Ekadashi", "Baras", "Teras", "Chaudas"
  ];
  const PURNIMA_AMAS = ["Purnima", "Amas"]; // [15th of Sud, 15th of Vad]

  const SECTION_META = [
    { key: "waxing-crescent", label: "Waxing Crescent" }, // 0-90
    { key: "waxing-gibbous",  label: "Waxing Gibbous"  }, // 90-180
    { key: "waning-gibbous",  label: "Waning Gibbous"  }, // 180-270
    { key: "waning-crescent", label: "Waning Crescent" }  // 270-360
  ];
  const FIXED_META = {
    0:   { key: "new-moon",      label: "New Moon" },
    90:  { key: "first-quarter", label: "First Quarter" },
    180: { key: "full-moon",     label: "Full Moon" },
    270: { key: "last-quarter",  label: "Last Quarter" }
  };

  function norm(a){ return ((a % 360) + 360) % 360; }

  function getTithi(angle){
    if (angle === 0 || angle === 360) return { paksha: "Vad", name: PURNIMA_AMAS[1] };
    if (angle === 180) return { paksha: "Sud", name: PURNIMA_AMAS[0] };
    const idx = Math.floor(angle / 12) % 30;
    const paksha = idx < 15 ? "Sud" : "Vad";
    const pos = idx % 15;
    const name = pos < 14 ? TITHI_NAMES[pos] : (paksha === "Sud" ? PURNIMA_AMAS[0] : PURNIMA_AMAS[1]);
    return { paksha, name };
  }

  function getPhase(angle){
    if (FIXED_META[angle]) return FIXED_META[angle];
    const section = Math.floor(angle / 90);
    const local = angle - section * 90;
    const sub = Math.min(4, Math.max(1, Math.ceil(local / 22.5)));
    const meta = SECTION_META[section];
    return { key: meta.key + "-" + sub, label: meta.label };
  }

  // ---- Procedural moon silhouette (astronomically accurate terminator) ----
  function moonPath(r, angleDeg){
    const theta = norm(angleDeg) * Math.PI / 180;
    const k = Math.cos(theta);
    const rx = Math.abs(k) * r;
    let sweep1, sweep2;
    if (theta <= Math.PI){
      sweep1 = k >= 0 ? 1 : 0;
      sweep2 = 0;
    } else {
      sweep1 = k >= 0 ? 0 : 1;
      sweep2 = 1;
    }
    return "M 0 " + (-r) + " A " + rx.toFixed(2) + " " + r + " 0 0 " + sweep1 + " 0 " + r +
           " A " + r + " " + r + " 0 0 " + sweep2 + " 0 " + (-r) + " Z";
  }

  // ---- Orbit geometry ----
  const CX = 300, CY = 170, R = 128, MOON_R = 20;
  function moonPos(angleDeg){
    const thetaScreen = norm(angleDeg + 180) * Math.PI / 180;
    return {
      x: CX + R * Math.cos(thetaScreen),
      y: CY + R * Math.sin(thetaScreen)
    };
  }

  // ---- DOM refs ----
  const slider = document.getElementById("phase-slider");
  const moonGroup = document.getElementById("moon-group");
  const moonLitPath = document.getElementById("moon-lit");
  const moonLine = document.getElementById("moon-line");
  const angleText = document.getElementById("angle-text");
  const valAngle = document.getElementById("val-angle");
  const valPhase = document.getElementById("val-phase");
  const valTithi = document.getElementById("val-tithi");

  function render(angle){
    angle = norm(angle);
    const pos = moonPos(angle);

    moonGroup.setAttribute("transform", "translate(" + pos.x.toFixed(2) + "," + pos.y.toFixed(2) + ")");
    moonLitPath.setAttribute("d", moonPath(MOON_R, angle));

    moonLine.setAttribute("x2", pos.x.toFixed(2));
    moonLine.setAttribute("y2", pos.y.toFixed(2));

    const elongation = angle <= 180 ? angle : 360 - angle;
    const midX = CX + (pos.x - CX) * 0.42;
    const midY = CY + (pos.y - CY) * 0.42 - 8;
    angleText.setAttribute("x", midX.toFixed(1));
    angleText.setAttribute("y", midY.toFixed(1));
    angleText.textContent = Math.round(elongation) + "\u00B0";

    const phase = getPhase(angle);
    const tithi = getTithi(angle);

    valAngle.textContent = Math.round(elongation) + "\u00B0";
    valPhase.textContent = phase.label;
    valTithi.textContent = tithi.paksha + " " + tithi.name;
  }

  slider.addEventListener("input", function(){
    render(parseFloat(slider.value));
  });

  render(0);
})();
