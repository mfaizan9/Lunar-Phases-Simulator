# Accessibility Notes — Lunar Phase Simulator

Target: WCAG 2.1 AA (AAA where reasonable). Human screen-reader QA with **NVDA
(Windows)** and **VoiceOver (macOS/iOS)** is still required before release; the
notes below describe what was built in.

## Structure & landmarks
* One `<h1>` — the simulation title — is rendered by the `<kl-unl-masthead>`
  component. The sim adds only `<h2>` panel headings (Orbit View, Moon Phase,
  Horizon Diagram, Animation and Time Controls, Diagram Options); no heading
  levels are skipped.
* `<main>` wraps the layout; each panel is a `<section>` labelled by its heading.
* `<html lang="en">` is implied by the KL-UNL page shell; every form control has a
  real `<label>` or `<fieldset>/<legend>`.

## Text alternatives for the canvases
The three `<canvas>` elements are visual only; the accessible information is in
the DOM:
* **Orbit canvas** — `role="application"` with a continuously-updated text
  description (`#orbit-desc`) stating the phase name, percent illuminated, time
  since new moon, local time, and whether the sun and moon are above or below the
  horizon.
* **Moon Phase canvas** — `role="img"` plus the adjacent `% illuminated` and
  `time since new moon` readouts.
* **Horizon canvas** — `role="img"`; its state (moon/sun above or below the
  horizon, local time) is spoken through the live region and the orbit
  description.

## Live region (units always spoken)
A single `aria-live="polite"` region (`#sr-status`) announces meaningful changes
**on commit** (drag release, button press, phase selection, reset, animation
start/stop), never on every animation tick. Announcements always include the
quantity name **and** its unit — e.g. *"First Quarter, 50.0 percent illuminated,
7 days, 9 hours since new moon. Observer's local time 12:00 pm. Moon is above the
horizon."*

## The two draggable objects — pointer AND keyboard
Both canvas-draggable objects have an equivalent focusable proxy (`role="slider"`)
and are operable two ways:

* **Tab to focus** — Tab reaches the moon handle and the earth handle; a visible
  dashed focus ring is painted on the canvas around the focused object.
* **Click/tap to focus** — clicking the moon or earth on the canvas also moves
  focus to its proxy (so the arrow keys work immediately, no Tab needed).

| Object | Left / Down | Right / Up | Page Up / Down | Home / End |
|---|---|---|---|---|
| **Moon** (phase) | −1° | +1° | ±15° | New Moon (0°) / Full (180°) |
| **Earth** (time) | −1 h | +1 h | ±3 h | midnight (0) / noon (12) |

The **Horizon Diagram** is rotatable (matching the original's drag-to-rotate
sphere). Tab to it — or click/tap it — then rotate: Left/Right turn the view
(azimuth ±5°), Up/Down tilt it (altitude ±5°, clamped to 10°–90°), Page Up/Down
tilt by ±15°, and **Home** resets the view. The new orientation is announced with
units (azimuth and tilt in degrees) plus whether the sun and moon are up. A visible
focus ring is drawn around the sphere while it is focused.

`aria-valuetext` speaks the full value with units — the moon handle says e.g.
*"First Quarter, phase angle 90 degrees, 50.0 percent illuminated"*; the earth
handle says *"Observer time 6:00 pm"*. Tab always moves away normally (no trap),
and canvas pointer handlers do not swallow focus or key events.

## Sliders and other controls
* The **animation rate** control is a native `<input type="range">`, so it gets
  full keyboard support for free (arrows, Page Up/Down, Home/End). Its
  `aria-valuetext` is unit-complete: *"Animation rate 0.30 days per second"*.
* Named-phase selection is a native `<select>` (disabled while animating, matching
  the original's combo blocker). Day/hour/minute steps and the show/hide and
  start/pause actions are native `<button>`s. All targets meet the ≥44 px
  (2.75 rem) minimum.

## Color & contrast — never color alone
* Palette comes from the KL-UNL CSS custom properties; body text is ≥ 4.5:1.
* State is never encoded by color alone: the moon phase is named in text and the
  `% illuminated` value; "above/below the horizon" is stated in words; the
  elongation angle is both drawn and read as a number in degrees; the show/hide
  buttons carry text labels and `aria-pressed`.
* The physically meaningful sky color (day blue ↔ night navy) and the yellow
  sun / grey moon are supplemented by the spoken description, so no information
  depends on perceiving those colors.

## Zoom, reflow, responsiveness
* Body type is ≥ 1.125 rem and sized in rem/em, so it tracks the browser font
  setting. Layout is relative-unit / grid based with no fixed-px text heights, so
  it reflows without clipping at 200% zoom and down to phone-portrait widths
  (single column, no horizontal scroll — verified at 375 px).
* Canvases keep their internal coordinate systems and are scaled by CSS with
  preserved aspect ratio; pointer coordinates are mapped back through the scale so
  hit-testing and drag math stay exact at any display size. `touch-action: none`
  on the orbit canvas prevents the page scrolling while dragging on touch.

## Motion
* All continuous motion (the animation) has a working **Pause** — the same
  start/pause button (WCAG 2.2.2). Nothing flashes.
* `prefers-reduced-motion: reduce` replaces the continuous loop with a discrete
  "advance one day" per press, and disables incidental CSS transitions.

## Known limitations / notes
* **Canvas-painted text.** The elongation-angle number and the N/E/S/W and time
  labels are painted on the canvas (they scale with it and cannot be zoomed by the
  browser independently). Their information is duplicated in the DOM / live region
  (elongation degrees in the description; up/down and local time in text), so no
  audio-only or zoom user loses information. Moving them into HTML overlays is a
  possible future refinement.
* **No MathJax.** There is no displayed mathematics in this simulator and the
  foundation ships no MathJax; see CONVERSION_NOTES.md item 1. Numeric readouts
  are plain text with units spoken.
* Human NVDA + VoiceOver testing is still required to confirm announcement order,
  no duplication, and that each control reads a clear name + value + unit.
