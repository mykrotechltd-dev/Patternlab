"use client";

// Front bodice draft — direct port of the Adobe Illustrator ExtendScript
// algorithm (bust dart + waist dart + curved neckline/armhole/side-seam).
// Everything the tool needs — measurement math, curve construction, SVG
// export — lives in this one file by design, so it can be dropped into any
// React project as-is.
//
// Unlike the app's other block generators (src/lib/pattern/*), this is a
// faithful port of the source script rather than a simplified block, so a
// few of the script's own quirks are preserved on purpose — see the inline
// notes at dartExtensionFor() and CURVE_HANDLE below.

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type FitLevel = 0 | 1 | 2 | 3;

type Measurements = {
  bust: number;
  underbust: number;
  frontBodiceLength: number;
  shoulder: number;
  centreFrontLength: number;
  shoulderDepth: number;
  shoulderLength: number;
  bustSpan: number;
  bustDepth: number;
  backBodiceLength: number;
  waist: number;
  sideLength: number;
  arm: number;
  bustFit: FitLevel;
  shoulderFit: FitLevel;
  waistFit: FitLevel;
  scale: number; // "i" in the source script — points per inch, also the live zoom
};

const DEFAULTS: Measurements = {
  bust: 40,
  underbust: 33,
  frontBodiceLength: 17,
  shoulder: 15.5,
  centreFrontLength: 14,
  shoulderDepth: 0.75,
  shoulderLength: 5,
  bustSpan: 8,
  bustDepth: 11,
  backBodiceLength: 14,
  waist: 33,
  sideLength: 5,
  arm: 12,
  bustFit: 1,
  shoulderFit: 1,
  waistFit: 1,
  scale: 72,
};

// [bustEase, shoulderEase, bustSpanEase, waistEase] per fit level, in inches — verbatim from the source script.
type EaseRow = readonly [number, number, number, number];
const EASE_ARRAY: readonly [EaseRow, EaseRow, EaseRow, EaseRow] = [
  [0.75, -0.25, 0.75, 0.75],
  [0.25, 0, 0.25, 0.25],
  [-0.25, 0.25, -0.25, -0.25],
  [-0.75, 0.5, -0.75, -0.75],
];

const FIT_LABELS: { value: FitLevel; label: string }[] = [
  { value: 0, label: "Loose fit" },
  { value: 1, label: "Fitted" },
  { value: 2, label: "Little stretch" },
  { value: 3, label: "Very stretchy" },
];

// Bezier handle lengths at the neckline (E), bust dart (I), waist dart (N2)
// and side seam (K2) curves. The source script leaves these as fixed point
// values rather than scaling them by `i` — so they're kept fixed here too.
// Practical effect: dragging the Draft Scale slider doesn't just resize the
// draft, it also subtly changes how full each curve looks relative to the
// straight edges, exactly as the original algorithm would.
const CURVE_HANDLE = { neckline: 145, bustDart: 21, waistDart: 50, sideSeam: 245 };

// ---------------------------------------------------------------------------
// Geometry — direct port of the xpt/ypt math
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

function longestSide(a: number, b: number): number {
  return Math.hypot(a, b);
}

function shortSide(hypotenuse: number, b: number): number {
  return Math.sqrt(hypotenuse * hypotenuse - b * b);
}

function similarSideA(sideA: number, sideB: number, sideb: number): number {
  return (sideA * sideB) / sideb;
}

function armDepthFor(value: number): number {
  if (value <= 12) return 8.5;
  if (value <= 15) return 9;
  if (value <= 20) return 10;
  return 10.5;
}

// Thresholds (0–8) read as inch differences in the source script, but the
// script actually calls this with bust/waist already scaled by `i` — so for
// any realistic measurement this lands in the final "else" branch (1.5in).
// Preserved as-is for fidelity to the source rather than "fixed", since
// changing it would change the draft's proportions from what the script drew.
function dartExtensionFor(scaledBust: number, scaledWaist: number): number {
  const diff = scaledBust - scaledWaist;
  if (diff >= 0 && diff < 2) return 0.5;
  if (diff >= 2 && diff < 4) return 0.75;
  if (diff >= 4 && diff < 6) return 1;
  if (diff >= 6 && diff < 8) return 1.25;
  return 1.5;
}

type BodicePoints = {
  A: Pt; B: Pt; C: Pt; D: Pt; D2: Pt; E: Pt; E2: Pt;
  G: Pt; H: Pt; I: Pt; I2: Pt; J: Pt; K: Pt; K2: Pt; L: Pt; M: Pt; N: Pt; N2: Pt;
};

function computeFrontBodicePoints(m: Measurements): BodicePoints {
  const i = m.scale;

  const bustEase = EASE_ARRAY[m.bustFit][0];
  const shoulderEase = EASE_ARRAY[m.shoulderFit][1];
  const bustSpanEase = EASE_ARRAY[m.bustFit][2];
  const waistEase = EASE_ARRAY[m.waistFit][3];

  const bEase = bustEase * i;
  const sEase = shoulderEase * i;
  const bSEase = bustSpanEase * i;
  const wEase = waistEase * i;

  const b = (m.bust / 4) * i + bEase;
  const fBL = m.frontBodiceLength * i;
  const s = (m.shoulder / 2) * i - sEase;
  const cFL = m.centreFrontLength * i;
  const sD = m.shoulderDepth * i;
  const shL = m.shoulderLength * i;
  const bS = (m.bustSpan / 2) * i + bSEase;
  const bD = m.bustDepth * i;
  const bBL = m.backBodiceLength * i;
  const w = (m.waist / 4) * i + wEase;
  const sL = m.sideLength * i;

  const aDepth = armDepthFor(m.arm) * i;

  const dPlacement = (m.bustSpan / 2) * i - 0.5 * i;
  const dPlacementExt = 0.1875 * i;

  // The source script's offsetX/offsetY were a pure canvas-placement
  // translation (added identically to every point) — dropped here since the
  // web canvas centers the draft itself instead.
  const A: Pt = { x: b, y: fBL };
  const B: Pt = { x: A.x, y: 0 };
  const C: Pt = { x: A.x - s, y: A.y };
  const D: Pt = { x: C.x, y: C.y - sD };
  const D2: Pt = { ...D };
  const E: Pt = { x: B.x, y: B.y + cFL };
  const E2: Pt = { ...E };

  const G: Pt = { x: C.x + shortSide(shL, sD), y: A.y };
  const H: Pt = { x: B.x - bS, y: A.y - bD };
  const I: Pt = { x: B.x - dPlacement, y: -dPlacementExt };
  const I2: Pt = { ...I };

  const slDepth1 = A.y - bBL;
  const slDepth2 = D.y - aDepth - sL;
  const dsl = (slDepth1 - slDepth2) / 2;
  const newSideLength = dsl + sL;
  const newSlDepth = slDepth1 + dsl;

  const J: Pt = { x: 0, y: newSlDepth };
  const K: Pt = { x: 0, y: newSlDepth + newSideLength };
  const K2: Pt = { ...K };

  const dartExt = dartExtensionFor(b, w) * i;

  const zsl = longestSide(newSideLength, dartExt);
  const z1 = zsl - newSideLength;
  const x1 = similarSideA(dartExt, z1, zsl);
  const y1 = similarSideA(newSideLength, z1, zsl);

  const L: Pt = { x: -dartExt + x1, y: J.y - y1 };

  const x2 = I.x - L.x;
  const y2 = L.y - I.y;
  const remnantWaist = w - dPlacement;
  const ptLtoPtI = longestSide(x2, y2);
  const x3 = similarSideA(x2, remnantWaist, ptLtoPtI);
  const y3 = similarSideA(y2, remnantWaist, ptLtoPtI);

  const M: Pt = { x: L.x + x3, y: L.y - y3 };

  const bDiff = bS - dPlacement;
  const verticalHtoI = H.y - I.y;
  const dartLegLength = longestSide(bDiff, verticalHtoI);
  const x4 = I.x - bDiff - M.x;
  const y4 = H.y - M.y;
  const z4 = longestSide(x4, y4);
  const x5 = similarSideA(x4, dartLegLength, z4);
  const y5 = similarSideA(y4, dartLegLength, z4);

  const N: Pt = { x: I.x - bDiff - x5, y: H.y - y5 };
  const N2: Pt = { ...N };

  return { A, B, C, D, D2, E, E2, G, H, I, I2, J, K, K2, L, M, N, N2 };
}

const fmt = (n: number) => n.toFixed(2);

// The five open path segments the source script draws (myLine1..myLine5),
// split exactly where the script splits them — the gaps between segments
// are the bust dart (E→B→I, then I2→H→N) and waist dart (K→L→N2, then D2→K2)
// wedges: real cut lines, not a rendering bug.
function buildPathSegments(p: BodicePoints) {
  const necklineToShoulder =
    `M ${fmt(p.D.x)},${fmt(p.D.y)} L ${fmt(p.G.x)},${fmt(p.G.y)} ` +
    `C ${fmt(p.G.x)},${fmt(p.G.y)} ${fmt(p.E.x - CURVE_HANDLE.neckline)},${fmt(p.E.y)} ${fmt(p.E.x)},${fmt(p.E.y)}`;

  const shoulderToBustDartUpper =
    `M ${fmt(p.E2.x)},${fmt(p.E2.y)} L ${fmt(p.B.x)},${fmt(p.B.y)} ` +
    `C ${fmt(p.B.x)},${fmt(p.B.y)} ${fmt(p.I.x + CURVE_HANDLE.bustDart)},${fmt(p.I.y + CURVE_HANDLE.bustDart)} ${fmt(p.I.x)},${fmt(p.I.y)}`;

  const bustDartLowerToUnderarm =
    `M ${fmt(p.I2.x)},${fmt(p.I2.y)} L ${fmt(p.H.x)},${fmt(p.H.y)} L ${fmt(p.N.x)},${fmt(p.N.y)}`;

  const hemToWaistDartToUnderarm =
    `M ${fmt(p.K.x)},${fmt(p.K.y)} L ${fmt(p.L.x)},${fmt(p.L.y)} ` +
    `C ${fmt(p.L.x)},${fmt(p.L.y)} ${fmt(p.N2.x - CURVE_HANDLE.waistDart)},${fmt(p.N2.y + CURVE_HANDLE.waistDart)} ${fmt(p.N2.x)},${fmt(p.N2.y)}`;

  const sideSeamCurve =
    `M ${fmt(p.D2.x)},${fmt(p.D2.y)} ` +
    `C ${fmt(p.D2.x)},${fmt(p.D2.y)} ${fmt(p.K2.x + CURVE_HANDLE.sideSeam)},${fmt(p.K2.y)} ${fmt(p.K2.x)},${fmt(p.K2.y)}`;

  return [necklineToShoulder, shoulderToBustDartUpper, bustDartLowerToUnderarm, hemToWaistDartToUnderarm, sideSeamCurve];
}

// Labeled construction points shown on the canvas — the unique on-outline
// points only (duplicates like D2/E2/I2/K2/N2 sit on top of D/E/I/K/N).
function labeledPoints(p: BodicePoints): { label: string; pt: Pt }[] {
  return [
    { label: "B", pt: p.B },
    { label: "D", pt: p.D },
    { label: "E", pt: p.E },
    { label: "G", pt: p.G },
    { label: "H", pt: p.H },
    { label: "I", pt: p.I },
    { label: "K", pt: p.K },
    { label: "L", pt: p.L },
    { label: "N", pt: p.N },
  ];
}

function boundingBox(p: BodicePoints) {
  const extentPoints: Pt[] = [
    p.D, p.G, p.E, { x: p.E.x - CURVE_HANDLE.neckline, y: p.E.y },
    p.B, p.I, { x: p.I.x + CURVE_HANDLE.bustDart, y: p.I.y + CURVE_HANDLE.bustDart },
    p.H, p.N, p.K, p.L,
    { x: p.N2.x - CURVE_HANDLE.waistDart, y: p.N2.y + CURVE_HANDLE.waistDart },
    p.N2, p.D2, { x: p.K2.x + CURVE_HANDLE.sideSeam, y: p.K2.y }, p.K2,
  ];
  const xs = extentPoints.map((pt) => pt.x);
  const ys = extentPoints.map((pt) => pt.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function standaloneSvg(paths: string[], bbox: { minX: number; maxX: number; minY: number; maxY: number }): string {
  const pad = 16;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const width = bbox.maxX - bbox.minX + pad * 2;
  const height = bbox.maxY - bbox.minY + pad * 2;
  const pathTags = paths.map((d) => `  <path d="${d}" stroke="#1E2A47" stroke-width="2" fill="none" stroke-linecap="round" />`).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}pt" height="${fmt(height)}pt" viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}">\n` +
    `  <title>Front Bodice Block</title>\n${pathTags}\n</svg>\n`
  );
}

// ---------------------------------------------------------------------------
// Form field primitives
// ---------------------------------------------------------------------------

function NumberField({
  label, value, min, max, step = 0.25, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-brand-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm text-brand-900 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      />
      {hint && <span className="mt-0.5 block text-[11px] text-brand-400">{hint}</span>}
    </label>
  );
}

function FitSelect({ label, value, onChange }: { label: string; value: FitLevel; onChange: (v: FitLevel) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-brand-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as FitLevel)}
        className="mt-1 w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm text-brand-900 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {FIT_LABELS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </label>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-serif text-sm font-semibold text-brand-800">{title}</legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function FrontBodiceDashboard() {
  const [m, setM] = useState<Measurements>(DEFAULTS);
  const [showPoints, setShowPoints] = useState(true);

  const set = <K extends keyof Measurements>(key: K, value: Measurements[K]) =>
    setM((prev) => ({ ...prev, [key]: value }));

  const points = useMemo(() => computeFrontBodicePoints(m), [m]);
  const paths = useMemo(() => buildPathSegments(points), [points]);
  const bbox = useMemo(() => boundingBox(points), [points]);

  const pad = 16;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const width = bbox.maxX - bbox.minX + pad * 2;
  const height = bbox.maxY - bbox.minY + pad * 2;

  function handleExport() {
    const svgString = standaloneSvg(paths, bbox);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "front-bodice-block.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 bg-cream p-6 lg:grid-cols-[300px_1fr]">
      {/* Sidebar */}
      <div className="space-y-6 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-serif text-lg font-semibold text-brand-900">Front Bodice Draft</h2>
          <p className="mt-1 text-xs text-brand-400">Adjust measurements to redraft the block in real time.</p>
        </div>

        <FieldGroup title="Primary circumferences">
          <NumberField label="Bust" value={m.bust} min={28} max={54} onChange={(v) => set("bust", v)} />
          <NumberField label="Underbust" value={m.underbust} min={24} max={48} onChange={(v) => set("underbust", v)} hint="Not used by this draft yet" />
          <NumberField label="Bust span" value={m.bustSpan} min={5} max={13} onChange={(v) => set("bustSpan", v)} />
          <NumberField label="Waist" value={m.waist} min={22} max={48} onChange={(v) => set("waist", v)} />
        </FieldGroup>

        <FieldGroup title="Vertical lengths">
          <NumberField label="Front bodice length" value={m.frontBodiceLength} min={12} max={22} onChange={(v) => set("frontBodiceLength", v)} />
          <NumberField label="Centre front length" value={m.centreFrontLength} min={8} max={18} onChange={(v) => set("centreFrontLength", v)} />
          <NumberField label="Back bodice length" value={m.backBodiceLength} min={10} max={20} onChange={(v) => set("backBodiceLength", v)} />
          <NumberField label="Side length" value={m.sideLength} min={2} max={10} onChange={(v) => set("sideLength", v)} />
          <NumberField label="Bust depth" value={m.bustDepth} min={6} max={15} onChange={(v) => set("bustDepth", v)} />
          <NumberField label="Arm (armhole depth)" value={m.arm} min={8} max={20} onChange={(v) => set("arm", v)} />
          <NumberField label="Shoulder" value={m.shoulder} min={10} max={20} onChange={(v) => set("shoulder", v)} />
          <NumberField label="Shoulder length" value={m.shoulderLength} min={3} max={8} onChange={(v) => set("shoulderLength", v)} />
          <NumberField label="Shoulder depth" value={m.shoulderDepth} min={0.25} max={2} step={0.05} onChange={(v) => set("shoulderDepth", v)} />
        </FieldGroup>

        <FieldGroup title="Fit adjustments">
          <FitSelect label="Bust fit" value={m.bustFit} onChange={(v) => set("bustFit", v)} />
          <FitSelect label="Shoulder fit" value={m.shoulderFit} onChange={(v) => set("shoulderFit", v)} />
          <FitSelect label="Waist fit" value={m.waistFit} onChange={(v) => set("waistFit", v)} />
        </FieldGroup>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-500">Draft scale (i)</span>
            <span className="text-xs text-brand-400">{m.scale}pt/in</span>
          </div>
          <input
            type="range"
            min={50}
            max={95}
            step={1}
            value={m.scale}
            onChange={(e) => set("scale", Number(e.target.value))}
            className="mt-1 w-full accent-accent-500"
          />
          <p className="mt-1 text-[11px] text-brand-400">Also acts as zoom — the draft is drawn at true scale, so a bigger number draws bigger.</p>
        </div>

        <label className="flex items-center gap-2 text-xs text-brand-600">
          <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} className="accent-accent-500" />
          Show construction points
        </label>

        <button
          type="button"
          onClick={handleExport}
          className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600"
        >
          Export pattern (.svg)
        </button>
      </div>

      {/* Canvas */}
      <div className="flex h-[640px] items-center justify-center overflow-auto rounded-2xl border border-brand-100 bg-cream-50 p-6">
        <svg width={width} height={height} viewBox={`${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}`}>
          {paths.map((d, idx) => (
            <path key={idx} d={d} stroke="#1E2A47" strokeWidth={2} fill="none" strokeLinecap="round" />
          ))}
          {showPoints &&
            labeledPoints(points).map(({ label, pt }) => (
              <g key={label}>
                <circle cx={pt.x} cy={pt.y} r={4} fill="#C67C4E" />
                <text x={pt.x + 7} y={pt.y - 7} fontSize={13} fill="#1E2A47" fontFamily="ui-sans-serif, system-ui, sans-serif">
                  {label}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
}
