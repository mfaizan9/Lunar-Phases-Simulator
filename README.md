# Lunar Phase Simulator (HTML5)

An accessible HTML5 rebuild of the Nebraska Astronomy Applet Project (NAAP)
**Lunar Phase Simulator**, built on the shared KL-UNL foundation.

## ⚠️ It must be served over HTTP — double-clicking `index.html` will not work

Opening `index.html` directly from the file system (a `file://` URL) shows an
**empty or broken masthead** (no title, no Reset / Help / About).

**Why:** the KL-UNL masthead component (`foundation/kl-unl-masthead.js`) loads its
title and Help/About text with `fetch('foundation/contents.json')`. Browsers block
`fetch()` of local files under `file://` for security (the same-origin policy), so
the fetch fails and the masthead never populates. Served over HTTP the fetch
succeeds and everything loads normally.

## How to run locally

Run one of these from **inside the `html5/` folder**, then open the printed URL:

```bash
# Python 3
python3 -m http.server 8123      # then open  http://localhost:8123/

# Node
npx serve                        # or:  npx http-server

# VS Code
# install the "Live Server" extension and click "Go Live"
```

Because you serve from inside `html5/`, the simulation is at the **server root** —
the URL is `http://localhost:8123/`, not `.../html5/index.html`.

## Production

When deployed to the cloud host (served over HTTP/HTTPS) it just works. The
`file://` limitation only affects local double-clicking.

## Files

```
html5/
  index.html          KL-UNL scaffold: .app-shell + <kl-unl-masthead> + panels
  foundation/         KL-UNL foundation, copied unchanged (see CONVERSION_NOTES
                      for the one required repair to the shared contents.json)
  styles/styles.css   sim-specific styles only (kl-unl.css holds shared style)
  simulation.js       all simulation logic (ported ActionScript behavior)
  assets/             reused exported bitmaps (earth globe, moon photo, sunlight
                      arrows, stickman)
  CONVERSION_NOTES.md  behavior model + AS→HTML5 mapping + deviations
  ACCESSIBILITY.md     WCAG affordances, ARIA, keyboard map, color notes
```

## Using it

* **Drag the moon** around its orbit to change the phase; **drag the earth** to
  change the observer's time of day. Both are also fully keyboard operable — Tab
  to them, then use the arrow keys (see ACCESSIBILITY.md).
* The **Animation and Time Controls** panel animates time, sets the animation
  rate, and steps the simulation by a day / hour / minute.
* The **Moon Phase** dropdown jumps to a named phase (disabled while animating).
* **Diagram Options** toggle the elongation angle, the lunar landmark, and the
  time tickmarks.
* **Reset** (in the masthead) returns everything to the initial state.
