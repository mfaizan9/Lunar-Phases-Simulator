/* ===========================================================================
   Lunar Phase Simulator  --  behavioral HTML5 port
   Source of truth for behavior: decompiled ActionScript (AS1) of the Nebraska
   Astronomy Applet Project "Lunar Phase Simulator" (lunar_applet040).

   All physics constants, formulas and text are copied VERBATIM from the AS.
   Presentation follows the KL-UNL foundation + WCAG 2.1 AA (see ACCESSIBILITY.md).

   Architecture: one plain state object; one render() redraws every canvas and
   syncs the DOM + aria-live region after any action, so all views stay in sync.
   ========================================================================== */
'use strict';

/* ----------------------------------------------------------------------------
   VERBATIM CONSTANTS (from scripts/frame_1/DoAction.as)
   -------------------------------------------------------------------------- */
const SYNODIC_PERIOD = 29.5;   // synodic month, days           (synodicPeriod)
const Q_TOL = 5;               // quarter-phase name tolerance   (qTol)
const F_TOL = 12;              // full/new-phase name tolerance   (fTol)

const DEG = Math.PI / 180;
const HR2RAD = 0.2617993877991494;          // 2*pi/24  (hours -> radians)
const RAD2DEG = 57.29577951308232;

// Horizon-diagram fixed setup (from init()):
const LATITUDE = 41;           // sphere.setLatitude(41)  degrees
const SIDEREAL = 0;            // sphere.siderealTime = 0  (hours)
// View reset (from onReset): sphere.setThetaAndPhi(90, 17)
const VIEW_THETA0 = 90;
const VIEW_PHI0 = 17;
const MIN_PHI = 10;            // sphere.minViewerAltitude = 10
const MAX_PHI = 90;

// day/night sky alpha ranges (setSkyColor / init constants)
const NIGHT_BACK_INNER = 30, BACK_INNER_RANGE = 100 - 30;   // day 100
const NIGHT_BACK_OUTER = 20, BACK_OUTER_RANGE = 80 - 20;    // day 80

/* ----------------------------------------------------------------------------
   STATE  --  single source of truth
   -------------------------------------------------------------------------- */
const state = {
  time: 12,            // observer time-of-day, hours 0..24  (geometryDiagram.time)
  phase: 0,            // phase angle, degrees               (geometryDiagram.phase)
  theta: VIEW_THETA0,  // horizon view azimuth (degrees)
  phi: VIEW_PHI0,      // horizon view altitude/tilt (degrees)
  animRate: 0.0003,    // animationSpeedSlider.value
  animating: false,
  showAngle: false,
  showLandmark: false,
  showTicks: false,
  moonPhaseVisible: true,
  horizonVisible: true,
};

/* small helpers ----------------------------------------------------------- */
function mod(n, m) { return ((n % m) + m) % m; }

// sunRA() = 12 - time      (right ascension of the sun, hours)
function sunRA() { return 12 - state.time; }
// moon RA = sunRA + phase * (1/15)   (0.06666... = 1/15; degrees -> hours)
function moonRA() { return sunRA() + state.phase * (1 / 15); }

/* ----------------------------------------------------------------------------
   ASSETS  (exported bitmaps reused as-is; see CONVERSION_NOTES.md)
   -------------------------------------------------------------------------- */
const assets = { earth: null, sunRays: null, stickman: null, moonPhoto: null };
let assetsLeft = 4;
function loadAsset(key, src) {
  const img = new Image();
  img.onload = () => { assets[key] = img; if (--assetsLeft === 0) render(); };
  img.onerror = () => { if (--assetsLeft === 0) render(); };
  img.src = src;
}

/* ----------------------------------------------------------------------------
   DOM references
   -------------------------------------------------------------------------- */
let orbitCanvas, orbitCtx, phaseCanvas, phaseCtx, horizonCanvas, horizonCtx;
let elPctIllum, elTimeSinceNew, elLocalTime, elPhaseSelect, elOrbitDesc, elStatus;
let elMoonHandle, elEarthHandle, elRateSlider, elAnimToggle;

/* ===========================================================================
   PHASE NAME  (verbatim tolerance logic from timeAndPhaseChanged())
   ========================================================================= */
const PHASE_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Third Quarter', 'Waning Crescent'];

function phaseIndex(p) {
  p = mod(p, 360);
  if (p <= F_TOL) return 0;
  if (p <= 90 - Q_TOL) return 1;
  if (p <= 90 + Q_TOL) return 2;
  if (p <= 180 - F_TOL) return 3;
  if (p <= 180 + F_TOL) return 4;
  if (p <= 270 - Q_TOL) return 5;
  if (p <= 270 + Q_TOL) return 6;
  if (p <= 360 - F_TOL) return 7;
  return 0;
}
function phaseName(p) { return PHASE_NAMES[phaseIndex(p)]; }

/* ===========================================================================
   NUMERIC READOUTS  (formatting copied verbatim from the AS)
   ========================================================================= */
// updatePercentIlluminated(): round(500*(1-cos(phase))) tenths of a percent.
function percentIlluminatedText() {
  const v = Math.round(500 * (1 - Math.cos(state.phase * DEG)));
  const num = (v % 10 === 0) ? (v / 10).toFixed(1) : String(v / 10);
  return num + '% illuminated';
}
// numeric value + spoken form
function percentIlluminatedSpoken() {
  const v = Math.round(500 * (1 - Math.cos(state.phase * DEG)));
  const num = (v % 10 === 0) ? (v / 10).toFixed(1) : String(v / 10);
  return num + ' percent illuminated';
}

// updateTimeSinceNew(): days + hours since new moon.
function timeSinceNewParts() {
  const days = SYNODIC_PERIOD * (mod(state.phase, 360) / 360);
  const hours = (days - Math.floor(days)) * 24;
  return { days, hours };
}
function timeSinceNewText() {
  const { days, hours } = timeSinceNewParts();
  let s = '';
  if (days >= 1 && days < 2) s = '1 day, ';
  else if (days >= 2) s = Math.floor(days) + ' days, ';
  if (hours >= 1 && hours < 2) s += '1 hour';
  else s += Math.floor(hours) + ' hours';
  return s;
}

// updateLocalTime(): 12-hour am/pm clock from time-of-day.
function localTimeText() {
  const t = mod(12 - sunRA(), 24);          // == mod(state.time, 24)
  // AS updateLocalTime(): if (_loc1_ < 12) am else pm
  const ampm = (t < 12) ? 'am' : 'pm';
  let h = Math.floor(t) % 12;
  if (h === 0) h = 12;
  const m = Math.floor(60 * (t % 1));
  const mm = (m < 10) ? '0' + m : String(m);
  return h + ':' + mm + ' ' + ampm;
}

/* elongation angle (deg, 0..180) shown when "show angle" is on. */
function elongationDeg() {
  let p = mod(state.phase, 360);
  if (p > 180) p = 360 - p;
  return p;
}

/* ===========================================================================
   CELESTIAL-SPHERE PROJECTION  (ported verbatim from CS Geometry.as)
   Builds the a / m / b matrices and projects points to screen + depth.
   ========================================================================= */
const M = {};   // holds a0..a8, m0..m8, b0..b8 and radius r

function buildMatrices(rPix) {
  const theta = mod(state.theta, 360) * DEG;
  let phiDeg = state.phi;
  if (phiDeg > MAX_PHI) phiDeg = MAX_PHI; else if (phiDeg < MIN_PHI) phiDeg = MIN_PHI;
  const phi = phiDeg * DEG;
  const lat = LATITUDE * DEG;
  const sT = mod(SIDEREAL, 24) * HR2RAD;
  const r = rPix;
  M.r = r; M.phi = phi;

  // doA
  const ct = Math.cos(theta), st = Math.sin(theta), cp = Math.cos(phi), sp = Math.sin(phi);
  M.a0 = -r * st;      M.a1 = r * ct;
  M.a3 = r * ct * sp;  M.a4 = r * st * sp;  M.a5 = -r * cp;
  M.a6 = r * ct * cp;  M.a7 = r * st * cp;  M.a8 = r * sp;

  // doM
  M.m2 = Math.cos(lat); M.m3 = Math.sin(sT); M.m4 = -Math.cos(sT); M.m8 = Math.sin(lat);
  M.m0 = M.m4 * M.m8; M.m1 = -M.m3 * M.m8; M.m6 = -M.m2 * M.m4; M.m7 = M.m2 * M.m3;

  // doB (celestial -> screen)
  M.b0 = M.a0 * M.m0 + M.a1 * M.m3;
  M.b1 = M.a0 * M.m1 + M.a1 * M.m4;
  M.b2 = M.a0 * M.m2;
  M.b3 = M.a3 * M.m0 + M.a4 * M.m3 + M.a5 * M.m6;
  M.b4 = M.a3 * M.m1 + M.a4 * M.m4 + M.a5 * M.m7;
  M.b5 = M.a3 * M.m2 + M.a5 * M.m8;
  M.b6 = M.a6 * M.m0 + M.a7 * M.m3 + M.a8 * M.m6;
  M.b7 = M.a6 * M.m1 + M.a7 * M.m4 + M.a8 * M.m7;
  M.b8 = M.a6 * M.m2 + M.a8 * M.m8;
}

// celestial (ra hours, dec deg) -> unit vector
function celVec(ra, dec) {
  const dr = dec * DEG, rr = ra * HR2RAD, cd = Math.cos(dr);
  return { x: cd * Math.cos(rr), y: cd * Math.sin(rr), z: Math.sin(dr) };
}
// horizon (az deg, alt deg) -> world unit vector  (parsePointInput)
function horVec(az, alt) {
  const ar = az * DEG, tr = alt * DEG, c = Math.cos(tr);
  return { x: c * Math.cos(ar), y: c * Math.sin(-ar), z: Math.sin(tr) };
}
// CtoSz
function ctoS(v) {
  return {
    x: v.x * M.b0 + v.y * M.b1 + v.z * M.b2,
    y: v.x * M.b3 + v.y * M.b4 + v.z * M.b5,
    z: v.x * M.b6 + v.y * M.b7 + v.z * M.b8,
  };
}
// WtoSz
function wtoS(v) {
  return {
    x: v.x * M.a0 + v.y * M.a1,
    y: v.x * M.a3 + v.y * M.a4 + v.z * M.a5,
    z: v.x * M.a6 + v.y * M.a7 + v.z * M.a8,
  };
}
// CtoMH altitude (deg) at fixed sTime/lat  -> used for day/night + up/down
function celestialAltitude(ra, dec) {
  const dr = dec * DEG, rr = ra * HR2RAD, lat = LATITUDE * DEG;
  const H = SIDEREAL * HR2RAD - rr;
  const s = Math.sin(dr) * Math.sin(lat) + Math.cos(dr) * Math.cos(H) * Math.cos(lat);
  return Math.asin(Math.max(-1, Math.min(1, s))) * RAD2DEG;
}

/* ===========================================================================
   RENDER  (canvas + DOM + aria-live), driven entirely by `state`.
   ========================================================================= */
function render() {
  // The AS geometryDiagram.time / .phase getters always return normalized
  // values (mod 24 / mod 360); keep our state canonical to match exactly.
  state.time = mod(state.time, 24);
  state.phase = mod(state.phase, 360);
  drawOrbit();
  drawMoonPhase();
  drawHorizon();
  syncReadouts();
}

/* ---------------------------------------------------------------------------
   ORBIT VIEW
   Earth (reused globe bitmap) at centre, moon on a radius-200 orbit, sunlight
   from the left. Night sides drawn as dark half-discs (GDShadowMask).
   ------------------------------------------------------------------------- */
const OCX = 400, OCY = 280, ORBIT_R = 200, EARTH_DIA = 70, MOON_R = 10;

function orbitMoonAngle() { return (180 - state.phase) * DEG; } // rawMoonAngle
function orbitEarthRot() { return mod(360 - 15 * state.time, 360); } // detailed earth _rotation

function drawOrbit() {
  const ctx = orbitCtx;
  ctx.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, orbitCanvas.width, orbitCanvas.height);

  // sunlight arrows + "sunlight" label (reused bitmap), fixed at left
  if (assets.sunRays) {
    const w = 88, h = 318;
    ctx.drawImage(assets.sunRays, OCX - ORBIT_R - 118, OCY - h / 2, w, h);
  }

  // orbit circle (code-drawn geometry)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(OCX, OCY, ORBIT_R, 0, 2 * Math.PI);
  ctx.stroke();

  const ma = orbitMoonAngle();
  const mx = OCX + ORBIT_R * Math.cos(ma);
  const my = OCY + ORBIT_R * Math.sin(ma);

  // ---- elongation angle overlay (drawn under bodies) ----
  if (state.showAngle) drawElongationOrbit(ctx, mx, my);

  // ---- time tickmarks around the earth ----
  if (state.showTicks) drawTimeTicks(ctx);

  // ---- Earth: rotating globe bitmap + fixed night shadow ----
  drawEarth(ctx);

  // ---- Moon on the orbit: grey disc + night shadow (+ optional landmark) ----
  drawOrbitMoon(ctx, mx, my);

  // focus indicators for the keyboard-draggable proxies
  if (document.activeElement === elMoonHandle) focusRing(ctx, mx, my, MOON_R + 6);
  if (document.activeElement === elEarthHandle) focusRing(ctx, OCX, OCY, EARTH_DIA / 2 + 6);
}

function drawEarth(ctx) {
  const r = EARTH_DIA / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(OCX, OCY, r, 0, 2 * Math.PI); ctx.clip();
  if (assets.earth) {
    ctx.translate(OCX, OCY);
    ctx.rotate(orbitEarthRot() * DEG);
    ctx.drawImage(assets.earth, -r, -r, EARTH_DIA, EARTH_DIA);
  } else {
    ctx.fillStyle = '#2a6cc0'; ctx.beginPath();
    ctx.arc(OCX, OCY, r, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.restore();
  // night side = half away from the sun (sun is to the left -> right half dark)
  ctx.save();
  ctx.beginPath(); ctx.arc(OCX, OCY, r, 0, 2 * Math.PI); ctx.clip();
  ctx.fillStyle = 'rgba(6,8,20,0.74)';
  ctx.fillRect(OCX, OCY - r, r + 1, EARTH_DIA);
  ctx.restore();
}

function drawOrbitMoon(ctx, mx, my) {
  ctx.save();
  ctx.beginPath(); ctx.arc(mx, my, MOON_R, 0, 2 * Math.PI); ctx.clip();
  ctx.fillStyle = '#b9b9b9';
  ctx.beginPath(); ctx.arc(mx, my, MOON_R, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(6,8,20,0.8)';
  ctx.fillRect(mx, my - MOON_R, MOON_R + 1, 2 * MOON_R); // right (night) half
  ctx.restore();
  // lunar landmark: marker on the moon's earth-facing side
  if (state.showLandmark) {
    const toEarth = Math.atan2(OCY - my, OCX - mx);
    const lx = mx + MOON_R * Math.cos(toEarth), ly = my + MOON_R * Math.sin(toEarth);
    ctx.fillStyle = '#ff45c0';
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(mx, my, MOON_R, 0, 2 * Math.PI); ctx.stroke();
}

function drawElongationOrbit(ctx, mx, my) {
  const yellow = '#ffde64';
  ctx.strokeStyle = yellow; ctx.lineWidth = 2;
  // earth -> sun direction (left) and earth -> moon
  ctx.beginPath(); ctx.moveTo(OCX, OCY); ctx.lineTo(OCX - ORBIT_R, OCY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OCX, OCY); ctx.lineTo(mx, my); ctx.stroke();
  // arc between the two directions (shorter side), radius ~ half orbit
  const aR = 46;
  const sunAng = Math.PI;              // pointing left (-x)
  const moonAng = orbitMoonAngle();
  let d = moonAng - sunAng;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest signed diff
  ctx.beginPath();
  ctx.arc(OCX, OCY, aR, sunAng, sunAng + d, d < 0);
  ctx.stroke();
  // label
  const midAng = sunAng + d / 2;
  const lx = OCX + (aR + 24) * Math.cos(midAng), ly = OCY + (aR + 24) * Math.sin(midAng);
  ctx.fillStyle = yellow;
  ctx.font = '600 18px Sans-Serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(elongationDeg().toFixed(1) + '°', lx, ly);
}

function drawTimeTicks(ctx) {
  // Labels fixed relative to the sun (sun at left). noon = subsolar (left),
  // midnight = anti-solar (right), sunrise = top, sunset = bottom.
  const r = EARTH_DIA / 2;
  const ticks = [
    { a: Math.PI, t: 'noon' },
    { a: -Math.PI / 2, t: 'sunrise' },
    { a: 0, t: 'midnight' },
    { a: Math.PI / 2, t: 'sunset' },
  ];
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.font = '13px Sans-Serif';
  ctx.textBaseline = 'middle';
  for (const k of ticks) {
    const x1 = OCX + (r + 2) * Math.cos(k.a), y1 = OCY + (r + 2) * Math.sin(k.a);
    const x2 = OCX + (r + 12) * Math.cos(k.a), y2 = OCY + (r + 12) * Math.sin(k.a);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const lx = OCX + (r + 16) * Math.cos(k.a), ly = OCY + (r + 16) * Math.sin(k.a);
    ctx.textAlign = (k.a === 0) ? 'left' : (Math.abs(k.a) === Math.PI ? 'right' : 'center');
    ctx.fillText(k.t, lx, ly);
  }
}

function focusRing(ctx, x, y, r) {
  ctx.save();
  ctx.strokeStyle = '#ffbc00'; ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------------------
   MOON PHASE VIEW
   Reused moon photograph + code-drawn terminator mask (moonPhaseSymbol
   updateMask() ported verbatim, curveTo -> quadraticCurveTo).
   ------------------------------------------------------------------------- */
const MP_RADIUS = 95, MP_MARGIN = 10, MP_N = 5, MP_DARK_ALPHA = 0.70;
const mpAP = [], mpCP = [];
(function initMoonTerms() {
  const step = Math.PI / (MP_N - 1);
  const sec = 1 / Math.cos(step / 2);
  for (let i = 0; i < MP_N; i++) {
    const a = i * step;
    mpAP[i] = { x: MP_RADIUS * Math.sin(a), y: MP_RADIUS * Math.cos(a) };
    if (i !== 0) {
      const c = step / 2 + (i - 1) * step;
      mpCP[i] = { x: MP_RADIUS * sec * Math.sin(c), y: MP_RADIUS * sec * Math.cos(c) };
    } else mpCP[i] = null;
  }
})();

function drawMoonPhase() {
  const ctx = phaseCtx, cx = 100, cy = 100;
  ctx.clearRect(0, 0, 200, 200);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 200, 200);

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, MP_RADIUS, 0, 2 * Math.PI); ctx.clip();
  if (assets.moonPhoto) {
    ctx.drawImage(assets.moonPhoto, cx - MP_RADIUS, cy - MP_RADIUS, MP_RADIUS * 2, MP_RADIUS * 2);
  } else {
    ctx.fillStyle = '#c9c9c9';
    ctx.beginPath(); ctx.arc(cx, cy, MP_RADIUS, 0, 2 * Math.PI); ctx.fill();
  }

  // ---- terminator mask (updateMask) ----
  const phaseR = mod(state.phase, 360) * DEG;
  const sign = (phaseR < Math.PI) ? -1 : 1;
  const edge = MP_RADIUS + MP_MARGIN;
  const c7 = Math.cos(mod(phaseR, Math.PI));
  ctx.beginPath();
  ctx.moveTo(cx + 0, cy + MP_RADIUS);
  ctx.lineTo(cx + 0, cy + edge);
  ctx.lineTo(cx + sign * edge, cy + edge);
  ctx.lineTo(cx + sign * edge, cy - edge);
  ctx.lineTo(cx + 0, cy - edge);
  ctx.lineTo(cx + 0, cy - MP_RADIUS);
  for (let i = 1; i < MP_N; i++) {
    const ctrlX = mpCP[i].x * c7, ctrlY = -mpCP[i].y;
    const endX = mpAP[i].x * c7, endY = -mpAP[i].y;
    ctx.quadraticCurveTo(cx + ctrlX, cy + ctrlY, cx + endX, cy + endY);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,' + MP_DARK_ALPHA + ')';
  ctx.fill();

  // lunar landmark on the near side
  if (state.showLandmark) {
    ctx.fillStyle = '#ff45c0';
    ctx.beginPath(); ctx.arc(cx - 26, cy - 6, 5, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(120,120,120,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, MP_RADIUS, 0, 2 * Math.PI); ctx.stroke();
}

/* ---------------------------------------------------------------------------
   HORIZON DIAGRAM
   External view of the (translucent) celestial sphere for a mid-northern
   observer. Positions come from the ported projection; day/night, up/down and
   front/back ordering are all derived from the matrices.
   ------------------------------------------------------------------------- */
const HR = 120, HCX = 140, HCY = 140;

function skyFactor() {
  // setSkyColor(): sun.alt/10 + 0.5, clamped 0..1
  let f = celestialAltitude(sunRA(), 0) / 10 + 0.5;
  return Math.max(0, Math.min(1, f));
}

function drawHorizon() {
  const ctx = horizonCtx;
  buildMatrices(HR);
  ctx.clearRect(0, 0, horizonCanvas.width, horizonCanvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, horizonCanvas.width, horizonCanvas.height);

  ctx.save();
  ctx.beginPath(); ctx.arc(HCX, HCY, HR, 0, 2 * Math.PI); ctx.clip();

  const f = skyFactor();
  // sky colours blend day (bright blue) <-> night (dark navy)
  const dayTop = [132, 207, 255], nightTop = [12, 16, 46];
  const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const top = mix(nightTop, dayTop);
  const bot = mix([4, 6, 24], [90, 150, 210]);

  // The horizon plane (alt = 0 disc) projects to an axis-aligned ellipse
  // centred on the sphere, touching the circle at N (left) and S (right):
  //   horizontal radius = HR, vertical radius = HR * sin(view tilt phi).
  const ry = HR * Math.sin(state.phi * DEG);

  // 1. UNDER-horizon hemisphere: fill the whole disc dark first (no sky colour
  //    ever shows below the horizon plane).
  const belowG = ctx.createRadialGradient(HCX, HCY, 4, HCX, HCY, HR);
  belowG.addColorStop(0, '#333333');
  belowG.addColorStop(1, '#111111');
  ctx.fillStyle = belowG;
  ctx.beginPath(); ctx.arc(HCX, HCY, HR, 0, 2 * Math.PI); ctx.fill();

  // 2. SKY: paint only the upper lens, above the horizon ellipse
  //    (circle top arc  left -> top -> right, then ellipse top arc back).
  const g = ctx.createLinearGradient(0, HCY - HR, 0, HCY);
  g.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
  g.addColorStop(1, `rgb(${bot[0]},${bot[1]},${bot[2]})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  const SEG = 48;
  for (let i = 0; i <= SEG; i++) {              // circle top arc: PI -> 2PI
    const t = Math.PI + (i / SEG) * Math.PI;
    const x = HCX + HR * Math.cos(t), y = HCY + HR * Math.sin(t);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  for (let i = 0; i <= SEG; i++) {              // ellipse top arc: 2PI -> PI (back)
    const u = 2 * Math.PI - (i / SEG) * Math.PI;
    ctx.lineTo(HCX + HR * Math.cos(u), HCY + ry * Math.sin(u));
  }
  ctx.closePath(); ctx.fill();

  // 3. the horizon plane itself (green ground disc, the full ellipse)
  const gg = ctx.createRadialGradient(HCX, HCY, 4, HCX, HCY, HR);
  gg.addColorStop(0, '#4bb84b');
  gg.addColorStop(1, '#1f7a1f');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.ellipse(HCX, HCY, HR, ry, 0, 0, 2 * Math.PI);
  ctx.fill();

  // 3. reference circles (celestial equator + meridians), faint
  drawGreatCircle(ctx, circleV(0, 0, 0, true), 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.18)', 1);
  drawGreatCircle(ctx, circleV(0, 0, 90, false), 'rgba(230,230,230,0.35)', 'rgba(230,230,230,0.12)', 1);
  drawGreatCircle(ctx, circleV(90, 0, 90, false), 'rgba(230,230,230,0.35)', 'rgba(230,230,230,0.12)', 1);

  // 4. sun & moon (sorted back-to-front by screen depth)
  const bodies = [
    { s: ctoS(celVec(sunRA(), 0)), alt: celestialAltitude(sunRA(), 0), color: '#ffd21a', r: 7, name: 'sun' },
    { s: ctoS(celVec(moonRA(), 0)), alt: celestialAltitude(moonRA(), 0), color: '#c9c9c9', r: 7, name: 'moon' },
  ].sort((p, q) => p.s.z - q.s.z);

  // elongation arc on the sphere (sun<->moon) when show angle is on
  if (state.showAngle) drawElongationHorizon(ctx);

  for (const b of bodies) {
    const x = HCX + b.s.x, y = HCY + b.s.y;
    ctx.globalAlpha = (b.alt < 0) ? 0.34 : (b.s.z < 0 ? 0.6 : 1);
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, 2 * Math.PI); ctx.stroke();
  }

  // 5. observer (stickman) standing at the centre of the horizon plane
  if (assets.stickman) {
    const sw = 12, sh = 26;
    ctx.drawImage(assets.stickman, HCX - sw / 2, HCY - sh + 3, sw, sh);
  } else {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(HCX, HCY - 14, 3, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(HCX, HCY - 11); ctx.lineTo(HCX, HCY); ctx.stroke();
  }

  ctx.restore();

  // 6. cardinal direction labels on the horizon ring (outside the clip)
  drawDirLabels(ctx);
  // (No canvas-drawn focus ring: keyboard focus uses the standard blue
  //  :focus-visible outline from the foundation CSS; mouse focus shows nothing.)
}

// circle parameter vectors: computeW then combine with a (horizon) or b (celestial)
function circleV(azOrRa, altOrDec, tiltDeg, celestial) {
  let beta, lambda, tilt;
  tilt = Math.max(0, Math.min(180, tiltDeg)) * DEG;
  lambda = Math.max(-90, Math.min(90, altOrDec)) * DEG;
  if (celestial) beta = mod(azOrRa, 24) * HR2RAD;        // ra hours
  else beta = mod(-azOrRa, 360) * DEG;                   // az deg
  const st = Math.sin(tilt), ct = Math.cos(tilt);
  const sb = Math.sin(beta), cb = Math.cos(beta);
  const cl = Math.cos(lambda), sl = Math.sin(lambda);
  const w = {
    w0: cl * cb, w1: -cl * sb * ct, w2: sl * sb * st,
    w3: cl * sb, w4: cl * cb * ct, w5: -sl * cb * st,
    w7: cl * st, w8: sl * ct,
  };
  const m = celestial
    ? { p0: M.b0, p1: M.b1, p2: M.b2, p3: M.b3, p4: M.b4, p5: M.b5, p6: M.b6, p7: M.b7, p8: M.b8 }
    : { p0: M.a0, p1: M.a1, p2: 0, p3: M.a3, p4: M.a4, p5: M.a5, p6: M.a6, p7: M.a7, p8: M.a8 };
  // v = p . w  (matching CS Circles update())
  if (celestial) {
    return {
      v0: m.p0 * w.w0 + m.p1 * w.w3,
      v1: m.p0 * w.w1 + m.p1 * w.w4 + m.p2 * w.w7,
      v2: m.p0 * w.w2 + m.p1 * w.w5 + m.p2 * w.w8,
      v3: m.p3 * w.w0 + m.p4 * w.w3,
      v4: m.p3 * w.w1 + m.p4 * w.w4 + m.p5 * w.w7,
      v5: m.p3 * w.w2 + m.p4 * w.w5 + m.p5 * w.w8,
      v6: m.p6 * w.w0 + m.p7 * w.w3,
      v7: m.p6 * w.w1 + m.p7 * w.w4 + m.p8 * w.w7,
      v8: m.p6 * w.w2 + m.p7 * w.w5 + m.p8 * w.w8,
    };
  }
  return {
    v0: m.p0 * w.w0 + m.p1 * w.w3,
    v1: m.p0 * w.w1 + m.p1 * w.w4,
    v2: m.p0 * w.w2 + m.p1 * w.w5,
    v3: m.p3 * w.w0 + m.p4 * w.w3,
    v4: m.p3 * w.w1 + m.p4 * w.w4 + m.p5 * w.w7,
    v5: m.p3 * w.w2 + m.p4 * w.w5 + m.p5 * w.w8,
    v6: m.p6 * w.w0 + m.p7 * w.w3,
    v7: m.p6 * w.w1 + m.p7 * w.w4 + m.p8 * w.w7,
    v8: m.p6 * w.w2 + m.p7 * w.w5 + m.p8 * w.w8,
  };
}

function drawGreatCircle(ctx, v, frontColor, backColor, width) {
  ctx.lineWidth = width;
  let started = false, prevFront = null;
  for (let i = 0; i <= 128; i++) {
    const g = (i / 128) * 2 * Math.PI, c = Math.cos(g), s = Math.sin(g);
    const x = HCX + v.v0 * c + v.v1 * s + v.v2;
    const y = HCY + v.v3 * c + v.v4 * s + v.v5;
    const z = v.v6 * c + v.v7 * s + v.v8;
    const front = z >= 0;
    if (!started || front !== prevFront) {
      if (started) ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.strokeStyle = front ? frontColor : backColor;
      started = true; prevFront = front;
    } else ctx.lineTo(x, y);
  }
  if (started) ctx.stroke();
}

function drawElongationHorizon(ctx) {
  // great-circle arc between sun and moon (shorter arc), in yellow
  const A = celVec(sunRA(), 0), B = celVec(moonRA(), 0);
  const dot = Math.max(-1, Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z));
  const ang = Math.acos(dot);
  if (ang < 1e-4) return;
  const sinA = Math.sin(ang);
  ctx.lineWidth = 2;
  const N = 60;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s0 = Math.sin((1 - t) * ang) / sinA, s1 = Math.sin(t * ang) / sinA;
    const v = { x: A.x * s0 + B.x * s1, y: A.y * s0 + B.y * s1, z: A.z * s0 + B.z * s1 };
    pts.push(ctoS(v));
  }
  let started = false, prevFront = null;
  for (const s of pts) {
    const front = s.z >= 0;
    if (!started || front !== prevFront) {
      if (started) ctx.stroke();
      ctx.beginPath(); ctx.moveTo(HCX + s.x, HCY + s.y);
      ctx.strokeStyle = front ? '#ffde64' : 'rgba(255,222,100,0.45)';
      started = true; prevFront = front;
    } else ctx.lineTo(HCX + s.x, HCY + s.y);
  }
  if (started) ctx.stroke();
}

function drawDirLabels(ctx) {
  const labels = [
    { az: 0, t: 'N' }, { az: 90, t: 'E' }, { az: 180, t: 'S' }, { az: 270, t: 'W' },
  ];
  ctx.font = '600 14px Sans-Serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of labels) {
    const s = wtoS(horVec(l.az, 0));
    // push label slightly outward from centre
    const len = Math.hypot(s.x, s.y) || 1;
    const x = HCX + s.x * 1.12, y = HCY + s.y * 1.12 - (s.y * 0.0) ;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    ctx.strokeText(l.t, x, y);
    ctx.fillText(l.t, x, y);
  }
}

/* ---------------------------------------------------------------------------
   READOUTS + live region
   ------------------------------------------------------------------------- */
function syncReadouts() {
  elPctIllum.textContent = percentIlluminatedText();
  elTimeSinceNew.textContent = timeSinceNewText();
  elLocalTime.textContent = localTimeText();

  // keep the phase <select> reflecting the current phase name (setSelectedIndex)
  const idx = phaseIndex(state.phase);
  if (elPhaseSelect.selectedIndex !== idx) elPhaseSelect.selectedIndex = idx;

  // draggable-proxy accessible values (quantity + number + unit)
  elMoonHandle.setAttribute('aria-valuenow', mod(state.phase, 360).toFixed(0));
  elMoonHandle.setAttribute('aria-valuetext',
    `${phaseName(state.phase)}, phase angle ${mod(state.phase, 360).toFixed(0)} degrees, ${percentIlluminatedSpoken()}`);
  const t = mod(state.time, 24);
  elEarthHandle.setAttribute('aria-valuenow', t.toFixed(2));
  elEarthHandle.setAttribute('aria-valuetext', `Observer time ${localTimeSpoken()}`);

  // continuously-updated diagram description for audio-only users
  elOrbitDesc.textContent = orbitDescription();
}

function localTimeSpoken() {
  // "6:00 pm" -> "6:00 p m" reads fine; keep the visible form.
  return localTimeText();
}

function orbitDescription() {
  const moonUp = celestialAltitude(moonRA(), 0) > 0;
  const sunUp = celestialAltitude(sunRA(), 0) > 0;
  let s = `${phaseName(state.phase)}. ${percentIlluminatedSpoken()}. `;
  s += `${timeSinceNewText()} since new moon. `;
  s += `Observer's local time ${localTimeText()}. `;
  s += `The moon is ${moonUp ? 'above' : 'below'} the horizon and the sun is ${sunUp ? 'above' : 'below'} the horizon.`;
  if (state.showAngle) s += ` Sun–moon elongation angle ${elongationDeg().toFixed(1)} degrees.`;
  return s;
}

function announce(msg) { elStatus.textContent = msg; }
function announceState(prefix) {
  const moonUp = celestialAltitude(moonRA(), 0) > 0;
  let s = (prefix ? prefix + ' ' : '') +
    `${phaseName(state.phase)}, ${percentIlluminatedSpoken()}, ${timeSinceNewText()} since new moon. ` +
    `Observer's local time ${localTimeText()}. Moon is ${moonUp ? 'above' : 'below'} the horizon.`;
  announce(s);
}

/* ===========================================================================
   BEHAVIOR: time / phase changes  (mirrors the AS handler set)
   ========================================================================= */
function timeAndPhaseChanged() { render(); }

function goStep(kind, dir) {
  // goDay/Hour/Minute Forward/Back  (verbatim increments)
  if (kind === 'day') { state.time += 24 * dir; state.phase += dir * 360 / SYNODIC_PERIOD; }
  else if (kind === 'hour') { state.time += dir; state.phase += dir * 360 / (24 * SYNODIC_PERIOD); }
  else { state.time += dir * (1 / 60); state.phase += dir * 360 / (1440 * SYNODIC_PERIOD); }
  render();
  announceState(kind === 'day' ? 'One day.' : kind === 'hour' ? 'One hour.' : 'One minute.');
}

/* ---- animation loop: getTimer()->performance.now(), same rate math ------ */
let rafId = null, timeLast = 0;
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function startAnimation() {
  if (state.animating) return;
  state.animating = true;
  elAnimToggle.textContent = 'pause animation';
  elPhaseSelect.disabled = true;                 // comboBlocker._visible = true
  if (prefersReducedMotion()) {
    // reduced motion: no continuous animation -- advance one day per press
    // (a discrete, visible phase change) instead, then stop.
    state.time += 24;
    state.phase += 360 / SYNODIC_PERIOD;
    render();
    stopAnimation();
    announceState('Reduced motion: advanced one day.');
    return;
  }
  timeLast = performance.now();
  const frame = (now) => {
    if (!state.animating) return;
    const dt = now - timeLast;                    // elapsed wall-clock ms
    const step = state.animRate * dt;             // animationSpeedSlider.value * (t - timeLast)
    state.time += step * 24;
    state.phase += step / SYNODIC_PERIOD * 360;
    timeLast = now;
    render();
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  announce('Animation started.');
}
function stopAnimation() {
  if (!state.animating && rafId === null) { elAnimToggle.textContent = 'start animation'; return; }
  state.animating = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  elAnimToggle.textContent = 'start animation';
  elPhaseSelect.disabled = false;
}
function toggleAnimation() {
  if (state.animating) { stopAnimation(); announce('Animation paused.'); }
  else startAnimation();
}

/* ---- reset (wired to masthead 'sim-reset'): exact initial state --------- */
function onReset() {
  stopAnimation();
  state.time = 12;                 // geometryDiagram.setTime(12)
  state.phase = 0;                 // geometryDiagram.setPhase(0)
  state.animRate = 0.0003;         // animationSpeedSlider.value = 0.0003
  state.theta = VIEW_THETA0;       // sphere.setThetaAndPhi(90,17)
  state.phi = VIEW_PHI0;
  state.showAngle = false;
  state.showLandmark = false;
  state.showTicks = false;
  state.moonPhaseVisible = true;
  state.horizonVisible = true;

  document.getElementById('opt-angle').checked = false;
  document.getElementById('opt-landmark').checked = false;
  document.getElementById('opt-ticks').checked = false;
  elRateSlider.value = rateToSlider(state.animRate);
  updateRateAria();
  setPanelVisible('phase', true);
  setPanelVisible('horizon', true);

  render();
  announceState('Reset.');
}

/* ===========================================================================
   INPUT: pointer drag + full keyboard for the two draggable canvas objects
   ========================================================================= */
// map canvas CSS pixels -> internal stage coordinates (canvas keeps its own res)
function toStage(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  return { x: (evt.clientX - rect.left) * sx, y: (evt.clientY - rect.top) * sy };
}

let dragTarget = null, dragOffset = 0;
function orbitPointerDown(evt) {
  const p = toStage(orbitCanvas, evt);
  const ma = orbitMoonAngle();
  const mx = OCX + ORBIT_R * Math.cos(ma), my = OCY + ORBIT_R * Math.sin(ma);
  const dMoon = Math.hypot(p.x - mx, p.y - my);
  const dEarth = Math.hypot(p.x - OCX, p.y - OCY);

  if (dMoon <= MOON_R + 14 && dMoon <= dEarth) {
    dragTarget = 'moon';
    elMoonHandle.focus();
    // offset = rawMoonAngle - atan2(ymouse,xmouse)   (GDMoon.onPress)
    dragOffset = ma - Math.atan2(p.y - OCY, p.x - OCX);
    stopAnimation();
  } else if (dEarth <= EARTH_DIA / 2 + 10) {
    dragTarget = 'earth';
    elEarthHandle.focus();
    // offset = deg(atan2(ymouse,xmouse)) - _rotation   (GDEarthDetailed.onPress)
    dragOffset = RAD2DEG * Math.atan2(p.y - OCY, p.x - OCX) - orbitEarthRot();
    stopAnimation();
  } else return;

  orbitCanvas.setPointerCapture(evt.pointerId);
  evt.preventDefault();
}
function orbitPointerMove(evt) {
  if (!dragTarget) return;
  const p = toStage(orbitCanvas, evt);
  if (dragTarget === 'moon') {
    const raw = Math.atan2(p.y - OCY, p.x - OCX) + dragOffset;  // rawMoonAngle
    state.phase = mod(180 - RAD2DEG * raw, 360);                 // getPhase
  } else {
    const rot = RAD2DEG * Math.atan2(p.y - OCY, p.x - OCX) - dragOffset; // _rotation
    state.time = mod(360 - rot, 360) / 15;                      // getTime
  }
  render();
  evt.preventDefault();
}
function orbitPointerUp(evt) {
  if (!dragTarget) return;
  const was = dragTarget;
  dragTarget = null;
  try { orbitCanvas.releasePointerCapture(evt.pointerId); } catch (e) {}
  announceState(was === 'moon' ? 'Moon moved.' : 'Time changed.');
}

/* keyboard: focus the proxy, then arrow keys move/rotate (same state) */
function moonKey(e) {
  let step = 0;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step = 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step = -1;
  else if (e.key === 'PageUp') step = 15;
  else if (e.key === 'PageDown') step = -15;
  else if (e.key === 'Home') { setPhaseAbs(0); e.preventDefault(); return; }
  else if (e.key === 'End') { setPhaseAbs(180); e.preventDefault(); return; }
  else return;
  stopAnimation();
  state.phase = mod(state.phase + step, 360);
  render();
  announceState(null);
  e.preventDefault();
}
function earthKey(e) {
  let step = 0; // hours
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step = 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step = -1;
  else if (e.key === 'PageUp') step = 3;
  else if (e.key === 'PageDown') step = -3;
  else if (e.key === 'Home') { state.time = 0; render(); announceState(null); e.preventDefault(); return; }
  else if (e.key === 'End') { state.time = 12; render(); announceState(null); e.preventDefault(); return; }
  else return;
  stopAnimation();
  state.time = mod(state.time + step, 24);
  render();
  announceState(null);
  e.preventDefault();
}
function setPhaseAbs(p) {
  stopAnimation();
  state.phase = mod(p, 360);
  render();
  announceState(null);
}

/* ---- Horizon view rotation: pointer drag + keyboard --------------------- */
// Ported from CS Mouse startSimpleDragging / updateSimpleDragging:
//   new theta = deg(dragTheta - (xmouse - dragX)/r)
//   new phi   = deg(dragPhi   + (ymouse - dragY)/r)
// (xmouse/ymouse are relative to the sphere centre, r = radius). The projection
// reads state.theta/phi, so this rotates the view without changing how the
// hemispheres are shaded.
let hzDrag = false, hzStartTheta = 0, hzStartPhi = 0, hzDragX = 0, hzDragY = 0;
function clampPhi(p) { return Math.max(MIN_PHI, Math.min(MAX_PHI, p)); }

function horizonPointerDown(evt) {
  const p = toStage(horizonCanvas, evt);
  hzDrag = true;
  hzStartTheta = state.theta; hzStartPhi = state.phi;
  hzDragX = p.x - HCX; hzDragY = p.y - HCY;
  horizonCanvas.focus();
  try { horizonCanvas.setPointerCapture(evt.pointerId); } catch (e) {}
  evt.preventDefault();
}
function horizonPointerMove(evt) {
  if (!hzDrag) return;
  const p = toStage(horizonCanvas, evt);
  const dx = (p.x - HCX) - hzDragX, dy = (p.y - HCY) - hzDragY;
  state.theta = mod(hzStartTheta - dx / HR * RAD2DEG, 360);
  state.phi = clampPhi(hzStartPhi + dy / HR * RAD2DEG);
  render();
  evt.preventDefault();
}
function horizonPointerUp(evt) {
  if (!hzDrag) return;
  hzDrag = false;
  try { horizonCanvas.releasePointerCapture(evt.pointerId); } catch (e) {}
  announceHorizon('View rotated.');
}

function horizonKey(e) {
  const step = 5, big = 15;
  let dT = 0, dP = 0;
  if (e.key === 'ArrowLeft') dT = -step;
  else if (e.key === 'ArrowRight') dT = step;
  else if (e.key === 'ArrowUp') dP = step;
  else if (e.key === 'ArrowDown') dP = -step;
  else if (e.key === 'PageUp') dP = big;
  else if (e.key === 'PageDown') dP = -big;
  else if (e.key === 'Home') {
    state.theta = VIEW_THETA0; state.phi = VIEW_PHI0;
    render(); announceHorizon('View reset.'); e.preventDefault(); return;
  } else return;
  state.theta = mod(state.theta + dT, 360);
  state.phi = clampPhi(state.phi + dP);
  render();
  announceHorizon(null);
  e.preventDefault();
}

function announceHorizon(prefix) {
  const az = mod(360 - state.theta, 360);   // viewerAzimuth
  const alt = state.phi;                     // viewerAltitude
  const moonUp = celestialAltitude(moonRA(), 0) > 0;
  const sunUp = celestialAltitude(sunRA(), 0) > 0;
  announce((prefix ? prefix + ' ' : '') +
    `Sky view facing azimuth ${az.toFixed(0)} degrees, tilted ${alt.toFixed(0)} degrees above the horizon. ` +
    `Moon is ${moonUp ? 'above' : 'below'} the horizon; sun is ${sunUp ? 'above' : 'below'} the horizon.`);
}

/* ===========================================================================
   ANIMATION-RATE SLIDER  (logarithmic 0.00007..0.002, verbatim range)
   ========================================================================= */
const RATE_MIN = 0.00007, RATE_MAX = 0.002;
function sliderToRate(pos) { // pos 0..1000
  const t = pos / 1000;
  return RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, t);
}
function rateToSlider(rate) {
  const t = Math.log(rate / RATE_MIN) / Math.log(RATE_MAX / RATE_MIN);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}
function updateRateAria() {
  const daysPerSec = state.animRate * 1000;   // value * 24000 hours/s = value*1000 days/s
  elRateSlider.setAttribute('aria-valuetext',
    'Animation rate ' + daysPerSec.toFixed(2) + ' days per second');
}

/* ===========================================================================
   PANEL SHOW / HIDE  (toggleMoonPhaseVisible / toggleHorizonDiagramVisible)
   ========================================================================= */
function setPanelVisible(which, visible) {
  if (which === 'phase') {
    state.moonPhaseVisible = visible;
    document.getElementById('phase-body').classList.toggle('lps-hidden', !visible);
    const btn = document.getElementById('phase-hide');
    btn.textContent = visible ? 'hide' : 'show';
    btn.setAttribute('aria-pressed', String(!visible));
  } else {
    state.horizonVisible = visible;
    document.getElementById('horizon-body').classList.toggle('lps-hidden', !visible);
    const btn = document.getElementById('horizon-hide');
    btn.textContent = visible ? 'hide' : 'show';
    btn.setAttribute('aria-pressed', String(!visible));
  }
}

/* ===========================================================================
   WIRE UP
   ========================================================================= */
function init() {
  orbitCanvas = document.getElementById('orbit-canvas');
  orbitCtx = orbitCanvas.getContext('2d');
  phaseCanvas = document.getElementById('phase-canvas');
  phaseCtx = phaseCanvas.getContext('2d');
  horizonCanvas = document.getElementById('horizon-canvas');
  horizonCtx = horizonCanvas.getContext('2d');

  elPctIllum = document.getElementById('pct-illum');
  elTimeSinceNew = document.getElementById('time-since-new');
  elLocalTime = document.getElementById('local-time');
  elPhaseSelect = document.getElementById('phase-select');
  elOrbitDesc = document.getElementById('orbit-desc');
  elStatus = document.getElementById('sr-status');
  elMoonHandle = document.getElementById('moon-handle');
  elEarthHandle = document.getElementById('earth-handle');
  elRateSlider = document.getElementById('rate-slider');
  elAnimToggle = document.getElementById('anim-toggle');

  // controls
  elAnimToggle.addEventListener('click', toggleAnimation);
  elRateSlider.addEventListener('input', () => {
    state.animRate = sliderToRate(Number(elRateSlider.value));
    updateRateAria();
    if (state.animating) timeLast = performance.now();
  });
  elRateSlider.addEventListener('change', () =>
    announce('Animation rate ' + (state.animRate * 1000).toFixed(2) + ' days per second.'));

  document.querySelectorAll('.lps-step').forEach((b) =>
    b.addEventListener('click', () => goStep(b.dataset.step, Number(b.dataset.dir))));

  elPhaseSelect.addEventListener('change', () => {
    if (state.animating) return;                 // phaseComboBoxChanged guard
    setPhaseAbs(Number(elPhaseSelect.value));
    announceState('Phase set.');
  });

  document.getElementById('opt-angle').addEventListener('change', (e) => {
    state.showAngle = e.target.checked; render();
    announce(state.showAngle ? 'Show angle on. Elongation ' + elongationDeg().toFixed(1) + ' degrees.' : 'Show angle off.');
  });
  document.getElementById('opt-landmark').addEventListener('change', (e) => {
    state.showLandmark = e.target.checked; render();
    announce(state.showLandmark ? 'Lunar landmark shown.' : 'Lunar landmark hidden.');
  });
  document.getElementById('opt-ticks').addEventListener('change', (e) => {
    state.showTicks = e.target.checked; render();
    announce(state.showTicks ? 'Time tickmarks shown.' : 'Time tickmarks hidden.');
  });

  document.getElementById('phase-hide').addEventListener('click', () =>
    setPanelVisible('phase', !state.moonPhaseVisible));
  document.getElementById('horizon-hide').addEventListener('click', () =>
    setPanelVisible('horizon', !state.horizonVisible));

  // draggable canvas objects: pointer + keyboard
  orbitCanvas.addEventListener('pointerdown', orbitPointerDown);
  orbitCanvas.addEventListener('pointermove', orbitPointerMove);
  orbitCanvas.addEventListener('pointerup', orbitPointerUp);
  orbitCanvas.addEventListener('pointercancel', orbitPointerUp);
  elMoonHandle.addEventListener('keydown', moonKey);
  elEarthHandle.addEventListener('keydown', earthKey);
  elMoonHandle.addEventListener('focus', render);
  elMoonHandle.addEventListener('blur', render);
  elEarthHandle.addEventListener('focus', render);
  elEarthHandle.addEventListener('blur', render);

  // rotatable horizon view: pointer drag + keyboard
  horizonCanvas.addEventListener('pointerdown', horizonPointerDown);
  horizonCanvas.addEventListener('pointermove', horizonPointerMove);
  horizonCanvas.addEventListener('pointerup', horizonPointerUp);
  horizonCanvas.addEventListener('pointercancel', horizonPointerUp);
  horizonCanvas.addEventListener('keydown', horizonKey);
  horizonCanvas.addEventListener('focus', render);
  horizonCanvas.addEventListener('blur', render);

  // masthead Reset event
  document.addEventListener('sim-reset', onReset);

  // KL-UNL equation hook (no displayed mathematics in this sim; see notes)
  window.klunlInitEqn = function () {};

  elRateSlider.value = rateToSlider(state.animRate);
  updateRateAria();

  loadAsset('earth', 'assets/earth.png');
  loadAsset('sunRays', 'assets/sun-rays.png');
  loadAsset('stickman', 'assets/stickman.png');
  loadAsset('moonPhoto', 'assets/moon-photo.jpg');

  render();   // initial paint (redraws again as assets arrive)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
