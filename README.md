# Patternlab

A standalone pattern-drafting playground — parametric skirt, bodice, trouser
and sleeve block generators with a live SVG preview and `.svg` export.
Extracted from [AtelierHQ](https://github.com/mykrotechltd-dev/AtelierHQ)'s
pattern-making module; runs entirely client-side, no backend required.

## Run it

```bash
npm install
npm run dev
```

Then open:

- `/lab` — full darted front bodice block (bust dart, waist dart, curved
  neckline/armhole/side seam), ported from an Adobe Illustrator ExtendScript
  drafting algorithm. Every measurement is a live input; grouped into
  circumferences, vertical lengths, and fit adjustments, plus a draft-scale
  slider.
- `/blocks` — the simpler skirt (basic / semi-circle / full-circle) and
  bodice torso blocks, with seam allowance and zoom controls.

## Structure

- `src/lib/pattern/` — pure geometry: measurement → SVG path math for each
  block, plus shared helpers (`geometry.ts`, `svgExport.ts`).
- `src/components/patterns/` — the interactive React components.
- `docs/bodice-block-sheet.html` — reference drafting sheet.
