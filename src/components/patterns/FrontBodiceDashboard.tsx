"use client";

// Front & back bodice draft — v3, direct port of two Adobe Illustrator
// ExtendScript algorithms. The front block follows the "Lety Antony"
// methodology named in its own source docblock (NewFront-bodice.jsx); the
// back block is a ported, updated construction script (NewBack_bodice.jsx)
// whose own header describes it as derived from/modified against a classic
// industry construction method — that's the source file's own attribution,
// not this file's branding. This revision replaces the entire front-bodice
// point set/curve construction and makes two precise formula changes to the
// back bodice (across-back ease, explicit armhole curve handles) — see the
// function-level comments below for exactly what changed and why.
//
// Everything the tool needs — measurement math, curve construction, SVG
// export — lives in this one file by design, so it can be dropped into any
// React project as-is.

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Measurements = {
  // Shared between both blocks
  bust: number;
  waist: number;
  bustSpan: number;
  shoulderWidth: number;
  shoulderDrop: number;
  // The back script's own comment says this field name was "renamed from
  // shoulderLength to unify naming across Front & Back" — both scripts'
  // sample values already agree (5.0in), so this is one shared field rather
  // than two separately-tracked ones.
  shoulderSeamLength: number;
  // Both scripts take this as a plain input rather than deriving it, so one
  // shared field satisfies both.
  sideSeamLength: number;
  backBodiceLength: number;

  // Front-only
  frontBodiceLength: number;
  centerFrontLength: number;
  bustDepth: number;
  acrossChestWidth: number;

  // Back-only
  // The back script's own comment says this "should be backBodiceLength -
  // 0.5" — kept as a plain literal default here (like every other field in
  // this file) rather than a live derived default.
  centerBackLength: number;
  acrossBackWidthProvided: boolean;
  acrossBackWidth: number; // only read when acrossBackWidthProvided
  hasShoulderDart: boolean;
  hasSwaybackContour: boolean;
};

// Defaults are the new source scripts' own sample values, verbatim (both
// scripts' sample measurement objects already agree on every shared field).
const DEFAULTS: Measurements = {
  bust: 42.0,
  waist: 32.0,
  bustSpan: 8.0,
  shoulderWidth: 15.0,
  shoulderDrop: 0.75,
  shoulderSeamLength: 5.0,
  sideSeamLength: 6.5,
  backBodiceLength: 15.0,
  frontBodiceLength: 18.0,
  centerFrontLength: 14.5,
  bustDepth: 10.5,
  acrossChestWidth: 13.5,
  centerBackLength: 14.5,
  acrossBackWidthProvided: true,
  acrossBackWidth: 14.0,
  hasShoulderDart: true,
  hasSwaybackContour: true,
};

// 1in = 72pt — fixed unit conversion in the source scripts, not a live
// "scale" parameter like the previous algorithm's `i`. Zoom is a separate,
// purely visual control below (see ZoomableSvg).
const PT = 72;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleBetween(a: Pt, b: Pt): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointAtAngle(origin: Pt, angle: number, dist: number): Pt {
  return { x: origin.x + dist * Math.cos(angle), y: origin.y + dist * Math.sin(angle) };
}

// Pythagoras — the other leg of a right triangle given the hypotenuse and one leg.
function shortSide(hypotenuse: number, leg: number): number {
  return Math.sqrt(hypotenuse * hypotenuse - leg * leg);
}

const fmt = (n: number) => n.toFixed(2);

type BBox = { minX: number; maxX: number; minY: number; maxY: number };

function bboxOfPoints(points: Pt[]): BBox {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function bboxSize(bbox: BBox, pad: number) {
  return { width: bbox.maxX - bbox.minX + pad * 2, height: bbox.maxY - bbox.minY + pad * 2 };
}

const CANVAS_PAD = 16;

function viewBoxOf(bbox: BBox) {
  const minX = bbox.minX - CANVAS_PAD;
  const minY = bbox.minY - CANVAS_PAD;
  const { width, height } = bboxSize(bbox, CANVAS_PAD);
  return { minX, minY, width, height, viewBox: `${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}` };
}

// Both source scripts inherit Illustrator's scripting coordinate system —
// Y-up (larger Y is higher on the page; both scripts' own point formulas
// subtract a length to move "down" the page, e.g. front's `B = A.y -
// frontBodiceLength` for the waist). SVG is Y-down, so this flips every
// point once, here, for display — confirmed necessary by rendering both
// blocks unflipped first and finding them upside down (see the front/back
// dashboard's git history for the screenshots that established this for the
// v1 algorithm; the same subtract-to-go-down pattern here behaves identically).
function flip(pt: Pt): Pt {
  return { x: pt.x, y: -pt.y };
}

// Flips every Pt-valued field of a record — used for curve-handle objects
// (frontCurveHandles/backCurveHandles) the same way flip() is used for named
// points. IMPORTANT: curve handles must be computed from RAW (unflipped)
// points, in the source scripts' own Y-up coordinate space, and THEN flipped
// via this helper — not computed by re-applying the same formula directly to
// already-flipped points. Several of the source scripts' own handle formulas
// are of the form `anchor.y ± k * Math.abs(anchor.y - other.y)`, and
// whether that reads as "toward other" or "away from other" depends on which
// of anchor/other is numerically larger — a relationship that *reverses*
// under negation even though the visual (on-screen) direction it encodes
// does not. Reapplying the formula to flipped points silently flips that
// direction, producing a self-intersecting loop at the shared point instead
// of a smooth curve (caught empirically by screenshotting the armhole at
// point I on the front block and point R on the back block, both of which
// showed a visible kinked loop before this was fixed). Computing handles in
// the same raw space as their anchors, then flipping the whole handle
// point exactly like any other point, sidesteps the issue entirely.
function flipRecord<T extends Record<string, Pt>>(rec: T): T {
  const entries = Object.entries(rec) as [string, Pt][];
  return Object.fromEntries(entries.map(([key, pt]) => [key, flip(pt)])) as T;
}

// ---------------------------------------------------------------------------
// Front bodice — direct port of NewFront-bodice.jsx ("Lety Antony" method)
// ---------------------------------------------------------------------------

type FrontBodicePoints = {
  A: Pt; B: Pt; C: Pt; D: Pt; F: Pt; G: Pt; H: Pt; I: Pt;
  J: Pt; J1: Pt; K: Pt; L: Pt; M: Pt; N: Pt; P: Pt;
};

function computeFrontBodicePoints(m: Measurements): FrontBodicePoints {
  // Unlike computeBackBodicePoints, this source script does NOT pre-scale
  // the whole measurements object to points up front — it keeps every field
  // of `m` in raw inches and multiplies by PT individually, inline, at each
  // point of use. Ported term-for-term: the armhole-ease tier check below
  // compares `m.bust` directly against raw inch thresholds (40, 50) — do not
  // "clean this up" into a pre-scaled m, that would silently double-scale
  // several formulas here.

  // A: High Point Shoulder / CF top origin. Source script places this at an
  // absolute Illustrator-canvas coordinate ([600,700]) — dropped in favor of
  // [0,0], a pure translation, since every other point is relative to A.
  const A: Pt = { x: 0, y: 0 };

  // B: Center Front waist corner.
  const B: Pt = { x: A.x, y: A.y - m.frontBodiceLength * PT };

  // C: Center Front neck pit.
  const C: Pt = { x: A.x, y: B.y + m.centerFrontLength * PT };

  // Neck width, derived geometrically from shoulder width, shoulder seam
  // length and shoulder drop — right triangle with the shoulder seam as the
  // hypotenuse and shoulder drop as one leg (shortSide() gives the other).
  // Falls back to a standard 2.75in neck width if the inputs don't form a
  // valid triangle (seam shorter than drop, producing NaN) or would produce
  // a non-positive width.
  let neckWidth = m.shoulderWidth / 2 - shortSide(m.shoulderSeamLength, m.shoulderDrop);
  if (Number.isNaN(neckWidth) || neckWidth <= 0) {
    neckWidth = 2.75; // Fallback standard neck width (source script's own fallback)
  }

  // F: Side neck / HPS corner, along the shoulder-top line through A.
  const F: Pt = { x: A.x - neckWidth * PT, y: A.y };

  // D: Top outer shoulder reference (not drawn — G is the true shoulder tip).
  const D: Pt = { x: A.x - (m.shoulderWidth / 2) * PT, y: A.y };

  // G: True outer shoulder tip, dropped from D by the shoulder-drop allowance.
  const G: Pt = { x: D.x, y: D.y - m.shoulderDrop * PT };

  // H: Bust apex.
  const H: Pt = { x: A.x - (m.bustSpan / 2) * PT, y: A.y - m.bustDepth * PT };

  // Underarm point K. Armhole ease steps up with bust size — tiers compare
  // the RAW unscaled inch value of bust, matching the source script exactly.
  let armholeEase: number;
  if (m.bust >= 50.0) armholeEase = 2.5;
  else if (m.bust >= 40.0) armholeEase = 2.0;
  else armholeEase = 1.5;

  const armholeDepth = (m.bust / 6 + armholeEase) * PT;
  const totalVerticalDrop = m.shoulderDrop * PT + armholeDepth;
  const K: Pt = { x: A.x - (m.bust / 4) * PT, y: A.y - totalVerticalDrop };

  // I: Across-chest pitch point, vertically centered between the neck pit
  // and the underarm point, pulled in slightly by a fixed ease allowance.
  const midCFY = (C.y + K.y) / 2;
  const acrossChestEase = 0.25 * PT;
  const I: Pt = { x: A.x - (m.acrossChestWidth / 2) * PT - acrossChestEase, y: midCFY };

  // Dart placement & first dart leg (J1) — the dart's placement point on the
  // waistline, dropped 0.125in to form the first leg of the V-notch.
  const dartPlacementDist = (m.bustSpan / 2 - 0.5) * PT;
  const J: Pt = { x: B.x - dartPlacementDist, y: B.y };
  const J1: Pt = { x: J.x, y: J.y - 0.125 * PT };
  const leg1Length = distance(H, J1);

  // Side extension & waist corner N — extra side-seam allowance drafted in
  // when the front bodice is meaningfully longer than the back (so the front
  // hangs correctly over the bust).
  const deltaL = m.frontBodiceLength - m.backBodiceLength; // both already inches
  let sideExtensionVal: number;
  if (deltaL >= 3.0) sideExtensionVal = 1.5;
  else if (deltaL > 1.0) sideExtensionVal = 1.25;
  else sideExtensionVal = 0.0;

  const sideExtensionPt = sideExtensionVal * PT;
  const sideSeamPt = m.sideSeamLength * PT;

  const L: Pt = { x: K.x, y: K.y - sideSeamPt };
  const M: Pt = { x: L.x - sideExtensionPt, y: L.y };
  const angleKM = angleBetween(K, M);
  const N: Pt = pointAtAngle(K, angleKM, sideSeamPt);

  // Remaining waist distance & second dart leg (P) — the dart's second leg
  // is drawn the same length as the first (leg1Length), angled from the bust
  // apex toward the point on the waistline that closes the dart.
  const remainingWaistDist = (m.waist / 4 - (m.bustSpan / 2 - 0.5)) * PT;
  const angleNJ1 = angleBetween(N, J1);
  const waistAnchorForP = pointAtAngle(N, angleNJ1, remainingWaistDist);
  const angleHAnchor = angleBetween(H, waistAnchorForP);
  const P: Pt = pointAtAngle(H, angleHAnchor, leg1Length);

  return { A, B, C, D, F, G, H, I, J, J1, K, L, M, N, P };
}

function toFrontDisplayPoints(p: FrontBodicePoints): FrontBodicePoints {
  return {
    A: flip(p.A), B: flip(p.B), C: flip(p.C), D: flip(p.D), F: flip(p.F), G: flip(p.G),
    H: flip(p.H), I: flip(p.I), J: flip(p.J), J1: flip(p.J1), K: flip(p.K), L: flip(p.L),
    M: flip(p.M), N: flip(p.N), P: flip(p.P),
  };
}

// Curve handles for the neckline (C->F) and armhole (G->I->K), ported
// directly from the source script's own explicit handle formulas — this
// script bakes non-degenerate handles into both curve segments itself, so
// (unlike the previous revision) no generic smooth-handle helper is needed
// here. IMPORTANT: `p` here must be the RAW (unflipped) points from
// computeFrontBodicePoints, not the display points — see flipRecord() above
// for why. Callers flip the returned handles with flipRecord() before
// building the display path/bbox.
function frontCurveHandles(p: FrontBodicePoints) {
  const neckDepth = Math.abs(p.F.y - p.C.y);
  const neckWidthPx = Math.abs(p.F.x - p.C.x);
  const distGI = Math.abs(p.G.y - p.I.y);
  const distIK = Math.abs(p.I.y - p.K.y);
  const armscyeWidth = Math.abs(p.K.x - p.I.x);

  return {
    cRight: { x: p.C.x - neckWidthPx * 0.45, y: p.C.y },
    fLeft: { x: p.F.x, y: p.F.y + neckDepth * 0.35 },
    gRight: { x: p.G.x, y: p.G.y - distGI * 0.3 },
    iLeft: { x: p.I.x, y: p.I.y + distGI * 0.3 },
    iRight: { x: p.I.x, y: p.I.y - distIK * 0.35 },
    kLeft: { x: p.K.x + armscyeWidth * 0.35, y: p.K.y },
  };
}

type FrontCurveHandles = ReturnType<typeof frontCurveHandles>;

// One continuous closed outline, matching the source script's own
// pathPoints.add() call order exactly: C -> F -> G -> I -> K -> N -> P -> H
// -> J1 -> B -> close back to C. The bust dart is welded directly into the
// cutting line (P -> H -> J1 is a V-notch at the apex) rather than drawn as
// a separate segment. C->F and G->I->K are curves (both endpoints carry a
// real handle in the source script); F->G and everything from K through the
// close back to C are plain straight lines (both endpoints left as
// zero-length/self-referencing handles in the source).
// `p` and `handles` must both already be display (flipped) — see flipRecord().
function buildFrontPath(p: FrontBodicePoints, handles: FrontCurveHandles): string {
  const { cRight, fLeft, gRight, iLeft, iRight, kLeft } = handles;
  return (
    `M ${fmt(p.C.x)},${fmt(p.C.y)} ` +
    `C ${fmt(cRight.x)},${fmt(cRight.y)} ${fmt(fLeft.x)},${fmt(fLeft.y)} ${fmt(p.F.x)},${fmt(p.F.y)} ` +
    `L ${fmt(p.G.x)},${fmt(p.G.y)} ` +
    `C ${fmt(gRight.x)},${fmt(gRight.y)} ${fmt(iLeft.x)},${fmt(iLeft.y)} ${fmt(p.I.x)},${fmt(p.I.y)} ` +
    `C ${fmt(iRight.x)},${fmt(iRight.y)} ${fmt(kLeft.x)},${fmt(kLeft.y)} ${fmt(p.K.x)},${fmt(p.K.y)} ` +
    `L ${fmt(p.N.x)},${fmt(p.N.y)} ` +
    `L ${fmt(p.P.x)},${fmt(p.P.y)} ` +
    `L ${fmt(p.H.x)},${fmt(p.H.y)} ` +
    `L ${fmt(p.J1.x)},${fmt(p.J1.y)} ` +
    `L ${fmt(p.B.x)},${fmt(p.B.y)} Z`
  );
}

function frontLabeledPoints(p: FrontBodicePoints): { label: string; pt: Pt }[] {
  return [
    { label: "C", pt: p.C }, { label: "F", pt: p.F }, { label: "G", pt: p.G }, { label: "I", pt: p.I },
    { label: "K", pt: p.K }, { label: "N", pt: p.N }, { label: "P", pt: p.P }, { label: "H", pt: p.H },
    { label: "J1", pt: p.J1 }, { label: "B", pt: p.B },
  ];
}

function frontBoundingBox(p: FrontBodicePoints, handles: FrontCurveHandles): BBox {
  const { cRight, fLeft, gRight, iLeft, iRight, kLeft } = handles;
  return bboxOfPoints([p.C, p.F, p.G, p.I, p.K, p.N, p.P, p.H, p.J1, p.B, cRight, fLeft, gRight, iLeft, iRight, kLeft]);
}

// ---------------------------------------------------------------------------
// Back bodice — direct port of NewBack_bodice.jsx, including its two
// construction toggles (shoulder dart, swayback contour). Unlike the front
// script's dart, which the earlier algorithm's front block also welded in,
// this back script needs no separate dart-line handling either — same
// single-continuous-outline shape.
// ---------------------------------------------------------------------------

type BackBodicePoints = {
  A: Pt; B: Pt; C: Pt; D: Pt; E: Pt; F: Pt; E1: Pt;
  P: Pt; P1: Pt; P2: Pt; Q: Pt;
  BActive: Pt; G: Pt; H: Pt; I: Pt; J: Pt; G1: Pt;
  K: Pt; L: Pt; M: Pt; N: Pt; O: Pt; R: Pt;
};

// "Set to 0 if unavailable to trigger fallback formula" in the source script
// becomes an explicit toggle here instead of asking for a magic zero.
function acrossBackHalfWidth(m: Measurements, shoulderWidthPts: number): number {
  if (!m.acrossBackWidthProvided) return shoulderWidthPts / 2 - 0.25 * PT;
  // Updated source script adds a small ease allowance on the "provided"
  // branch — previously this was just acrossBackWidth/2 with no added ease.
  // The fallback branch above is unchanged.
  return (m.acrossBackWidth * PT) / 2 + 0.25 * PT;
}

function computeBackBodicePoints(m: Measurements): BackBodicePoints {
  const bust = m.bust * PT;
  const waist = m.waist * PT;
  const backBodiceLength = m.backBodiceLength * PT;
  const centerBackLength = m.centerBackLength * PT;
  const shoulderWidth = m.shoulderWidth * PT;
  // Unified field name — see Measurements type comment.
  const shoulderLength = m.shoulderSeamLength * PT;
  const shoulderDrop = m.shoulderDrop * PT;
  const bustSpan = m.bustSpan * PT;
  const sideSeamLength = m.sideSeamLength * PT;
  const acrossBackHalf = acrossBackHalfWidth(m, shoulderWidth);

  const A: Pt = { x: 0, y: 0 };
  const B: Pt = { x: A.x, y: A.y - backBodiceLength };
  const C: Pt = { x: B.x, y: B.y + centerBackLength };
  const D: Pt = { x: A.x + shoulderWidth / 2, y: A.y };
  const E: Pt = { x: D.x, y: D.y - shoulderDrop };

  const dyF = Math.abs(A.y - E.y);
  const dxF = shortSide(shoulderLength, dyF);
  const F: Pt = { x: E.x - dxF, y: A.y };

  let E1: Pt = E;
  let P: Pt = { x: 0, y: 0 };
  let P1: Pt = { x: 0, y: 0 };
  let P2: Pt = { x: 0, y: 0 };
  let Q: Pt = { x: 0, y: 0 };

  if (m.hasShoulderDart) {
    const angleFE = angleBetween(F, E);
    E1 = pointAtAngle(E, angleFE, 0.5 * PT);
    P = { x: (F.x + E1.x) / 2, y: (F.y + E1.y) / 2 };
    P1 = pointAtAngle(P, angleFE, -0.25 * PT);
    P2 = pointAtAngle(P, angleFE, 0.25 * PT);
  }

  let BActive: Pt = B;
  let cbAngle = -Math.PI / 2; // default: straight down the CB line

  if (m.hasSwaybackContour) {
    const B1: Pt = { x: B.x + 0.75 * PT, y: B.y };
    cbAngle = angleBetween(C, B1);
    BActive = pointAtAngle(C, cbAngle, centerBackLength);
  }

  const dartPlacement = bustSpan / 2 - 0.5 * PT;

  let G: Pt, H: Pt, I: Pt, J: Pt, G1: Pt;

  if (!m.hasSwaybackContour) {
    G = { x: BActive.x + dartPlacement, y: BActive.y };
    H = { x: G.x + 1.0 * PT, y: G.y };
    I = { x: (G.x + H.x) / 2, y: G.y };
    J = { x: I.x, y: I.y + (sideSeamLength - 1.0 * PT) };
    G1 = { x: G.x, y: G.y };
  } else {
    const waistAngle = cbAngle + Math.PI / 2;
    G = pointAtAngle(BActive, waistAngle, dartPlacement);
    H = pointAtAngle(G, waistAngle, 1.0 * PT);
    I = { x: (G.x + H.x) / 2, y: (G.y + H.y) / 2 };
    J = pointAtAngle(I, cbAngle, -(sideSeamLength - 1.0 * PT));
    const jhLength = distance(H, J);
    const angleJG = angleBetween(J, G);
    G1 = pointAtAngle(J, angleJG, jhLength);
  }

  if (m.hasShoulderDart) {
    const anglePJ = angleBetween(P, J);
    const qDistance = sideSeamLength / 3 + 1.0 * PT;
    Q = pointAtAngle(P, anglePJ, qDistance);
  }

  let K: Pt;
  if (!m.hasSwaybackContour) {
    const remainingWaist = waist / 4 - dartPlacement;
    K = { x: H.x + remainingWaist, y: H.y };
  } else {
    K = { x: BActive.x + (waist / 4 + 1.0 * PT), y: B.y };
  }

  const L: Pt = { x: K.x, y: K.y + sideSeamLength };
  let M: Pt = { x: A.x, y: L.y };
  if (m.hasSwaybackContour) {
    M = { x: C.x + Math.abs(L.y - C.y) / Math.tan(Math.abs(cbAngle)), y: L.y };
  }

  const N: Pt = { x: M.x + bust / 4, y: M.y };
  const angleKN = angleBetween(K, N);
  const O: Pt = pointAtAngle(K, angleKN, sideSeamLength);

  const midCmY = (C.y + M.y) / 2;
  const R: Pt = { x: A.x + acrossBackHalf, y: midCmY };

  return { A, B, C, D, E, F, E1, P, P1, P2, Q, BActive, G, H, I, J, G1, K, L, M, N, O, R };
}

function toBackDisplayPoints(p: BackBodicePoints): BackBodicePoints {
  return {
    A: flip(p.A), B: flip(p.B), C: flip(p.C), D: flip(p.D), E: flip(p.E), F: flip(p.F), E1: flip(p.E1),
    P: flip(p.P), P1: flip(p.P1), P2: flip(p.P2), Q: flip(p.Q),
    BActive: flip(p.BActive), G: flip(p.G), H: flip(p.H), I: flip(p.I), J: flip(p.J), G1: flip(p.G1),
    K: flip(p.K), L: flip(p.L), M: flip(p.M), N: flip(p.N), O: flip(p.O), R: flip(p.R),
  };
}

// Armhole endpoint handles (e1Right, oLeft) are ported from the updated back
// script's own explicit axis-aligned formulas — previously these were
// computed via the generic smoothHandleOut/In helpers (which aimed the
// handle along whichever straight seam line fed into the point); the
// updated source script instead bakes in a purely vertical offset at E1 and
// a purely horizontal offset at O. rRight's coefficient also changed from
// 0.3 to 0.35 to match the updated source script exactly (rLeft's 0.3 was
// already correct and is unchanged).
// IMPORTANT: `p` here must be the RAW (unflipped) points from
// computeBackBodicePoints, not the display points — see flipRecord() above
// (frontCurveHandles carries the full explanation of why: these formulas are
// of the form `anchor.y ± k*Math.abs(anchor.y-other.y)`, which is only
// safe to evaluate in the same coordinate space the source script itself
// uses; reapplying it directly to already-flipped points silently reverses
// the offset direction, which is exactly what produced the self-intersecting
// loop at R caught during screenshot verification).
function backCurveHandles(p: BackBodicePoints) {
  const distER = Math.abs(p.E1.y - p.R.y);
  const distRO = Math.abs(p.R.y - p.O.y);
  const widthRO = Math.abs(p.O.x - p.R.x);

  return {
    cRight: { x: p.C.x + (p.F.x - p.C.x) * 0.4, y: p.C.y },
    rLeft: { x: p.R.x, y: p.R.y + distER * 0.3 },
    rRight: { x: p.R.x, y: p.R.y - distRO * 0.35 },
    e1Right: { x: p.E1.x, y: p.E1.y - distER * 0.3 },
    oLeft: { x: p.O.x - widthRO * 0.35, y: p.O.y },
  };
}

type BackCurveHandles = ReturnType<typeof backCurveHandles>;

// `p` and `handles` must both already be display (flipped) — see flipRecord().
function buildBackPath(p: BackBodicePoints, handles: BackCurveHandles, hasShoulderDart: boolean): string {
  const { cRight, rLeft, rRight, e1Right, oLeft } = handles;
  const shoulderSegment = hasShoulderDart
    ? `L ${fmt(p.P1.x)},${fmt(p.P1.y)} L ${fmt(p.Q.x)},${fmt(p.Q.y)} L ${fmt(p.P2.x)},${fmt(p.P2.y)} L ${fmt(p.E1.x)},${fmt(p.E1.y)} `
    : `L ${fmt(p.E1.x)},${fmt(p.E1.y)} `;

  return (
    `M ${fmt(p.C.x)},${fmt(p.C.y)} ` +
    `C ${fmt(cRight.x)},${fmt(cRight.y)} ${fmt(p.F.x)},${fmt(p.F.y)} ${fmt(p.F.x)},${fmt(p.F.y)} ` +
    shoulderSegment +
    `C ${fmt(e1Right.x)},${fmt(e1Right.y)} ${fmt(rLeft.x)},${fmt(rLeft.y)} ${fmt(p.R.x)},${fmt(p.R.y)} ` +
    `C ${fmt(rRight.x)},${fmt(rRight.y)} ${fmt(oLeft.x)},${fmt(oLeft.y)} ${fmt(p.O.x)},${fmt(p.O.y)} ` +
    `L ${fmt(p.K.x)},${fmt(p.K.y)} ` +
    `L ${fmt(p.H.x)},${fmt(p.H.y)} ` +
    `L ${fmt(p.J.x)},${fmt(p.J.y)} ` +
    `L ${fmt(p.G1.x)},${fmt(p.G1.y)} ` +
    `L ${fmt(p.BActive.x)},${fmt(p.BActive.y)} Z`
  );
}

function backLabeledPoints(p: BackBodicePoints, hasShoulderDart: boolean): { label: string; pt: Pt }[] {
  const base = [
    { label: "C", pt: p.C }, { label: "F", pt: p.F }, { label: "E1", pt: p.E1 }, { label: "R", pt: p.R },
    { label: "O", pt: p.O }, { label: "K", pt: p.K }, { label: "H", pt: p.H }, { label: "J", pt: p.J },
    { label: "G1", pt: p.G1 }, { label: "B", pt: p.BActive },
  ];
  return hasShoulderDart ? [...base, { label: "P1", pt: p.P1 }, { label: "Q", pt: p.Q }, { label: "P2", pt: p.P2 }] : base;
}

function backBoundingBox(p: BackBodicePoints, handles: BackCurveHandles, hasShoulderDart: boolean): BBox {
  const { cRight, rLeft, rRight, e1Right, oLeft } = handles;
  const points = [p.C, p.F, cRight, p.E1, p.R, rLeft, rRight, p.O, p.K, p.H, p.J, p.G1, p.BActive, e1Right, oLeft];
  if (hasShoulderDart) points.push(p.P1, p.Q, p.P2);
  return bboxOfPoints(points);
}

// ---------------------------------------------------------------------------
// Combined SVG export
// ---------------------------------------------------------------------------

type SvgPiece = { title: string; path: string; bbox: BBox };

function standaloneSvg(pieces: SvgPiece[]): string {
  const pad = 16;
  const gap = 40;
  const sizes = pieces.map((p) => bboxSize(p.bbox, pad));
  const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + gap * (pieces.length - 1);
  const totalHeight = Math.max(...sizes.map((s) => s.height));

  let xCursor = 0;
  const groups = pieces
    .map((piece, idx) => {
      const size = sizes[idx]!;
      const tx = xCursor - (piece.bbox.minX - pad);
      const ty = -(piece.bbox.minY - pad);
      xCursor += size.width + gap;
      return (
        `  <g transform="translate(${fmt(tx)},${fmt(ty)})">\n    <title>${piece.title}</title>\n` +
        `    <path d="${piece.path}" stroke="#1E2A47" stroke-width="2" fill="none" stroke-linecap="round" />\n  </g>`
      );
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(totalWidth)}pt" height="${fmt(totalHeight)}pt" viewBox="0 0 ${fmt(totalWidth)} ${fmt(totalHeight)}">\n` +
    `${groups}\n</svg>\n`
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

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-xs text-brand-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-accent-500" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-brand-400">{hint}</span>}
      </span>
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
  const [zoom, setZoom] = useState(100);

  const set = <K extends keyof Measurements>(key: K, value: Measurements[K]) =>
    setM((prev) => ({ ...prev, [key]: value }));

  const frontRaw = useMemo(() => computeFrontBodicePoints(m), [m]);
  const frontPoints = useMemo(() => toFrontDisplayPoints(frontRaw), [frontRaw]);
  // Curve handles are computed from the RAW points (frontCurveHandles expects
  // the source script's own Y-up space) and then flipped the same way the
  // named points are — see flipRecord()'s comment for why this order matters.
  const frontHandles = useMemo(() => flipRecord(frontCurveHandles(frontRaw)), [frontRaw]);
  const frontPath = useMemo(() => buildFrontPath(frontPoints, frontHandles), [frontPoints, frontHandles]);
  const frontBbox = useMemo(() => frontBoundingBox(frontPoints, frontHandles), [frontPoints, frontHandles]);
  const frontView = viewBoxOf(frontBbox);

  const backRaw = useMemo(() => computeBackBodicePoints(m), [m]);
  const backPoints = useMemo(() => toBackDisplayPoints(backRaw), [backRaw]);
  // Same raw-then-flip ordering as the front block's handles — see above.
  const backHandles = useMemo(() => flipRecord(backCurveHandles(backRaw)), [backRaw]);
  const backPath = useMemo(
    () => buildBackPath(backPoints, backHandles, m.hasShoulderDart),
    [backPoints, backHandles, m.hasShoulderDart]
  );
  const backBbox = useMemo(
    () => backBoundingBox(backPoints, backHandles, m.hasShoulderDart),
    [backPoints, backHandles, m.hasShoulderDart]
  );
  const backView = viewBoxOf(backBbox);

  const zoomScale = zoom / 100;

  function handleExport() {
    const svgString = standaloneSvg([
      { title: "Front Bodice Block", path: frontPath, bbox: frontBbox },
      { title: "Back Bodice Block", path: backPath, bbox: backBbox },
    ]);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bodice-block.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 bg-cream p-6 lg:grid-cols-[300px_1fr]">
      {/* Sidebar */}
      <div className="space-y-6 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-serif text-lg font-semibold text-brand-900">Front &amp; Back Bodice Draft</h2>
          <p className="mt-1 text-xs text-brand-400">Front — Lety Antony methodology; back — an updated construction script ported alongside it. Adjust measurements to redraft both blocks in real time.</p>
        </div>

        <FieldGroup title="Primary circumferences">
          <NumberField label="Bust" value={m.bust} min={28} max={54} onChange={(v) => set("bust", v)} />
          <NumberField label="Waist" value={m.waist} min={22} max={48} onChange={(v) => set("waist", v)} />
          <NumberField label="Bust span" value={m.bustSpan} min={5} max={13} onChange={(v) => set("bustSpan", v)} />
          <NumberField label="Shoulder width" value={m.shoulderWidth} min={10} max={20} onChange={(v) => set("shoulderWidth", v)} />
        </FieldGroup>

        <FieldGroup title="Shared shape">
          <NumberField label="Shoulder drop" value={m.shoulderDrop} min={0.25} max={3} step={0.05} onChange={(v) => set("shoulderDrop", v)} />
          <NumberField label="Shoulder seam length" value={m.shoulderSeamLength} min={3} max={8} onChange={(v) => set("shoulderSeamLength", v)} hint="Shared by both blocks" />
          <NumberField label="Side seam length" value={m.sideSeamLength} min={3} max={12} onChange={(v) => set("sideSeamLength", v)} hint="Shared by both blocks" />
        </FieldGroup>

        <FieldGroup title="Front lengths">
          <NumberField label="Front bodice length" value={m.frontBodiceLength} min={12} max={22} onChange={(v) => set("frontBodiceLength", v)} />
          <NumberField label="Centre front length" value={m.centerFrontLength} min={8} max={18} onChange={(v) => set("centerFrontLength", v)} />
          <NumberField label="Bust depth" value={m.bustDepth} min={6} max={15} onChange={(v) => set("bustDepth", v)} />
          <NumberField label="Across-chest width" value={m.acrossChestWidth} min={8} max={20} onChange={(v) => set("acrossChestWidth", v)} />
        </FieldGroup>

        <FieldGroup title="Back lengths">
          <NumberField label="Back bodice length" value={m.backBodiceLength} min={10} max={20} onChange={(v) => set("backBodiceLength", v)} />
          <NumberField label="Centre back length" value={m.centerBackLength} min={8} max={20} onChange={(v) => set("centerBackLength", v)} />
        </FieldGroup>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-serif text-sm font-semibold text-brand-800">Back construction</legend>
          <Toggle
            label="Across-back width known"
            checked={m.acrossBackWidthProvided}
            onChange={(v) => set("acrossBackWidthProvided", v)}
            hint={m.acrossBackWidthProvided ? "Adds 0.25in ease" : "Falls back to shoulder width / 2 − 0.25in"}
          />
          {m.acrossBackWidthProvided && (
            <NumberField label="Across-back width" value={m.acrossBackWidth} min={8} max={20} onChange={(v) => set("acrossBackWidth", v)} />
          )}
          <Toggle
            label="Shoulder dart (+0.5in)"
            checked={m.hasShoulderDart}
            onChange={(v) => set("hasShoulderDart", v)}
          />
          <Toggle
            label="Swayback contour (+0.75in)"
            checked={m.hasSwaybackContour}
            onChange={(v) => set("hasSwaybackContour", v)}
          />
        </fieldset>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-500">Zoom</span>
            <span className="text-xs text-brand-400">{zoom}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={200}
            step={10}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="mt-1 w-full accent-accent-500"
          />
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
      <div className="flex h-[640px] gap-4 overflow-auto rounded-2xl border border-brand-100 bg-cream-50 p-6">
        <div className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-400">Front</span>
          <svg width={frontView.width * zoomScale} height={frontView.height * zoomScale} viewBox={frontView.viewBox} className="max-w-full">
            <path d={frontPath} stroke="#1E2A47" strokeWidth={2} fill="none" strokeLinecap="round" />
            {showPoints &&
              frontLabeledPoints(frontPoints).map(({ label, pt }) => (
                <g key={label}>
                  <circle cx={pt.x} cy={pt.y} r={4} fill="#C67C4E" />
                  <text x={pt.x + 7} y={pt.y - 7} fontSize={13} fill="#1E2A47" fontFamily="ui-sans-serif, system-ui, sans-serif">
                    {label}
                  </text>
                </g>
              ))}
          </svg>
        </div>

        <div className="w-px shrink-0 self-stretch bg-brand-100" />

        <div className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-brand-400">Back</span>
          <svg width={backView.width * zoomScale} height={backView.height * zoomScale} viewBox={backView.viewBox} className="max-w-full">
            <path d={backPath} stroke="#1E2A47" strokeWidth={2} fill="none" strokeLinecap="round" />
            {showPoints &&
              backLabeledPoints(backPoints, m.hasShoulderDart).map(({ label, pt }) => (
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

      <p className="text-xs text-brand-400 lg:col-start-2">
        Side seam length ({m.sideSeamLength}in) is one shared measurement used directly by both blocks, so they match
        by construction. This is a starting draft from the source formulas — true up every curve by hand before
        cutting fabric.
      </p>
    </div>
  );
}
