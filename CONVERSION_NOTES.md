# Conversion Notes — Lunar Phase Simulator (Flash AS1 → HTML5)

## Behavior model (one paragraph)

The simulator ties together three views of the same instant. A **state** of two
numbers drives everything: `phase` (the moon's phase angle in degrees, 0 = new)
and `time` (the observer's local time of day in hours). The **Orbit View** shows
the moon on a radius-200 orbit around the earth with sunlight coming from the
left; the moon's orbital angle is `rawMoonAngle = (180 − phase)°` and the earth's
rotation encodes the time of day. Dragging the moon changes `phase`; dragging the
earth changes `time`. The **Moon Phase** panel shows the moon as seen from earth:
a full-moon photograph with a code-drawn terminator mask whose curvature is
`cos(phase)`. The **Horizon Diagram** shows the observer's sky for a mid-northern
latitude (41°): the sun is a celestial object at right ascension `12 − time` and
the moon at `sunRA + phase/15` (hours), both at declination 0; each is projected
onto a tilted celestial sphere so it rises and sets as time and phase change.
Animation advances `time` and `phase` together at a rate set by a logarithmic
slider; day/hour/minute buttons step them by fixed increments; a Reset restores
the initial state.

## AS → HTML5 mapping

| ActionScript (source of truth) | HTML5 port |
|---|---|
| `synodicPeriod = 29.5`, `qTol = 5`, `fTol = 12` | same constants (`simulation.js`) |
| `sunRA() = 12 - time` | `sunRA()` |
| `sphere.moon.ra = sunRA() + phase * 0.06666…` | `moonRA() = sunRA() + phase/15` |
| `updatePercentIlluminated()` `round(500*(1-cos(phase)))` | `percentIlluminatedText()` — same rounding/format |
| `updateTimeSinceNew()` days + hours | `timeSinceNewText()` — same "N days, M hours" wording |
| `updateLocalTime()` 12-hour am/pm | `localTimeText()` — same am/pm rule (`t<12 → am`) |
| phase-name tolerance ladder in `timeAndPhaseChanged()` | `phaseIndex()` / `phaseName()` — verbatim thresholds |
| `GeometryDiagram` earth `_rotation = 360 - 15*time` | `orbitEarthRot()` |
| `GDMoon` `rawMoonAngle`, drag offset/`onPhaseChanged` | orbit moon draw + `orbitPointerDown/Move` (moon) |
| `GDEarthDetailed` drag `_rotation`/`onTimeChanged` | orbit earth drag (`orbitPointer*`, earth) |
| `moonPhaseSymbol.updateMask()` (curveTo terminator) | `drawMoonPhase()` — term arrays + `quadraticCurveTo`, verbatim |
| `CelestialSphere` doA/doM/doB, CtoSz/WtoSz, CtoMH | `buildMatrices`, `ctoS`, `wtoS`, `celestialAltitude` — verbatim |
| `CSCircles` w-matrix projection | `circleV()` + `drawGreatCircle()` (sampled) |
| `setSkyColor()` sun-altitude → sky alpha | `skyFactor()` day/night blend |
| `onEnterFrameFunc()` `getTimer()` rate math | `startAnimation()` RAF loop, `performance.now()` |
| `goDay/Hour/MinuteForward/Back()` | `goStep()` — same increments |
| `onReset()` | `onReset()` — same initial values, wired to masthead `sim-reset` |
| Title / Reset / Help / About (Title Bar, Help, About sprites) | replaced by `<kl-unl-masthead>` (not ported) |
| FUIComponent sliders / combo / checkboxes / push buttons | native `<input type=range>` / `<select>` / `<input type=checkbox>` / `<button>` |
| Language panel (en/nl/el/tr/sl) | English only (KL-UNL pipeline is English); other strings preserved in source |

## Reused assets vs. code-drawn

Reused **as-is** from the JPEXS export, copied to `assets/`:

* `moon-photo.jpg` — the moon photograph (`images/100.jpg`), used in the Moon
  Phase panel. This is the one true bitmap and is never redrawn.
* `earth.png` — the detailed earth globe (sprite render of symbol 65,
  `GDEarthDetailed`), cropped to the 99×99 globe disc. Rotated for time-of-day.
* `sun-rays.png` — the "sunlight" label + arrows (symbol 77, `GDSunRays`),
  which is fixed (its `setDraggable(false)` means the sun direction never moves).
* `stickman.png` — the observer figure (symbol 92).

Code-drawn (genuine runtime geometry with no exported file — orbits, discs,
masks, dots, arcs, gradients): the orbit circle; the earth/moon **night-side
shadows** (`GDShadowMask`, a half-disc); the small orbit moon disc; the moon
terminator mask; the horizon sphere, sky gradient, green horizon plane, sun/moon
dots, reference great circles, elongation arc, and direction labels.

## Deviations from the original

1. **Mathematics / MathJax.** This simulator displays **no mathematical
   equations, formulas, or variable notation** — only plain numeric readouts
   (a percentage, a day/hour count, a clock time, and an angle in degrees). The
   KL-UNL foundation ships **no MathJax include** (there is no MathJax file in
   `foundation/` and no demo referencing one), and hard rule 5 forbids a CDN.
   Accordingly no MathJax is loaded; `klunlInitEqn` is redefined as a no-op. The
   degree readout uses the `°` glyph visually with a units-complete spoken form
   ("… degrees") in the live region / `aria-valuetext`. If the pipeline later
   ships a local MathJax, the elongation readout could be typeset via
   `klunlShowEquation`.

2. **REQUIRED repair to the shared `contents.json`.** The foundation's
   `contents.json` as delivered is **invalid JSON** and causes
   `fetch().json()` in the masthead to throw for *every* sim (not just this one),
   leaving the masthead blank. Two defect classes were present, both pre-existing
   and unrelated to this sim's new entry:
   * raw control characters (unescaped newlines/tab) inside string values in the
     `ce_hc`, `fusion` region, `lightcurve`, and one other entry;
   * unescaped `"` inside `href="…"` attributes in the `renaissancePtolemaic`
     and Venus-phases entries.
   The **copied** `html5/foundation/contents.json` was minimally repaired so it
   parses (control chars → a space; stray inner `"` → `\"`), in addition to
   adding this sim's `lunarphasesimulator` entry (alphabetical). The original
   foundation source was left untouched. **This defect should be fixed upstream**
   in the shared foundation file; the same repair is needed there for any sim's
   masthead to load.

3. **Languages.** The original bundles Dutch, Greek, Turkish and Slovenian
   translations. The KL-UNL pipeline is English-only, so only English strings are
   used (verbatim). No behavior depends on language selection.

4. **Horizon rendering approach.** The original's celestial-sphere renderer uses
   an elaborate MovieClip depth-sort + duplicated-mask pipeline to composite
   front/back hemispheres. The port keeps the **exact projection math**
   (doA/doM/doB, CtoSz/WtoSz, CtoMH — verbatim) but composites with an equivalent
   canvas layer order (sky → ground ellipse → reference circles → depth-sorted
   sun/moon → observer). Object positions, day/night, up/down and front/back are
   therefore identical to the source; the multi-gradient "glass sphere" sheen is
   approximated (a Goal-C visual detail). The source's `setMouseBehavior("simple
   drag")` sphere rotation is ported: the horizon view can be dragged (and, per the
   accessibility rules, rotated with the keyboard) — `updateSimpleDragging`'s
   `theta`/`phi` math is reproduced verbatim, with `phi` clamped to the source's
   `[minViewerAltitude 10°, 90°]` range; Reset returns it to θ=90°, φ=17°. The
   horizon plane projects to an axis-aligned ellipse (vertical radius `HR·sin φ`)
   for *any* `theta` — rotation only moves the labels/bodies around it — so the
   under-horizon hemisphere is filled dark first and the sky is painted only in the
   upper lens above the ellipse (no sky colour ever appears below the horizon).

5. **Time tickmark labels.** The original draws sunrise/noon/sunset/midnight tick
   labels from the `GDTimeTicks` sprite (whose text was white-on-white in the
   export and not legible). They are code-drawn here at the fixed sun-relative
   positions (noon = subsolar/left, midnight = anti-solar/right, sunrise = top,
   sunset = bottom).

6. **Reduced motion.** Under `prefers-reduced-motion: reduce`, "start animation"
   advances one day per press (a discrete, visible change) instead of running the
   continuous loop. The normal animation always has a working Pause (the same
   button), satisfying WCAG 2.2.2.
