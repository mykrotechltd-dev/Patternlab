"use client";

// Front & back bodice draft — v2, direct port of two Adobe Illustrator
// ExtendScript algorithms using the Helen Joseph-Armstrong construction
// methodology (NewFront-bodice.jsx / NewBack_bodice.jsx). Replaces the
// earlier ease-array/fit-level algorithm this file used to contain — that
// method took no inch inputs for shoulder drop, dart rotation, etc. and had
// no equivalent to this one's swayback/shoulder-dart toggles, so this is a
// like-for-like swap of the whole geometry engine, not an extension of it.
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
  // The back script's own doc says this "matches front bodice side seam" and
  // falls back to a direct measurement — both scripts take it as a plain
  // input rather than deriving it, so one shared field satisfies both.
  sideSeamLength: number;
  backBodiceLength: number;

  // Front-only
  frontBodiceLength: number;
  centerFrontLength: number;
  shoulderSeamLength: number;
  bustDepth: number;

  // Back-only
  centerBackLength: number;
  backShoulderLength: number;
  acrossBackWidthProvided: boolean;
  acrossBackWidth: number; // only read when acrossBackWidthProvided
  hasShoulderDart: boolean;
  hasSwaybackContour: boolean;
};

// The source scripts' own sample values — front's backBodiceLength (16.0)
// and back's own backBodiceLength (16.5) disagreed slightly; 16.5 is used
// here since the back block is the one that measurement primarily belongs to.
const DEFAULTS: Measurements = {
  bust: 36,
  waist: 28,
  bustSpan: 7,
  shoulderWidth: 15,
  shoulderDrop: 1.5,
  sideSeamLength: 8,
  backBodiceLength: 16.5,
  frontBodiceLength: 17,
  centerFrontLength: 14.25,
  shoulderSeamLength: 5,
  bustDepth: 10.5,
  centerBackLength: 15.5,
  backShoulderLength: 4.75,
  acrossBackWidthProvided: true,
  acrossBackWidth: 14.25,
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

// Both source scripts leave the armhole's two "corner" endpoints (front's E
// and K; back's E1 and O) as plain corner points — a zero-length handle on
// the side that touches the curve. That's fine for a straight-line-only
// path, but here it means the curve's tangent at that endpoint isn't
// controlled at all, so it can visibly kink against the straight seam line
// running into it (F->E, or K->N) instead of flowing into it. These two
// give that endpoint a real handle instead, aimed along the adjacent
// straight segment's own direction so the curve continues it smoothly —
// length scaled to a fraction of the curve's own chord so it looks
// proportionate at any body size, same fraction (0.3) the file's other
// curve handles already use.
const SMOOTH_HANDLE_FRACTION = 0.3;

// Outgoing handle for a curve that starts at `anchor`, arriving via a
// straight line from `prevPoint` — continues that line's direction past
// `anchor`, scaled against the curve's other endpoint `chordTo`.
function smoothHandleOut(anchor: Pt, prevPoint: Pt, chordTo: Pt): Pt {
  const dir = angleBetween(prevPoint, anchor);
  const len = distance(anchor, chordTo) * SMOOTH_HANDLE_FRACTION;
  return pointAtAngle(anchor, dir, len);
}

// Incoming handle for a curve that ends at `anchor`, continuing on via a
// straight line to `nextPoint` — sits behind `anchor` on the reverse of that
// line's direction, so the curve's tangent arrives already aimed that way.
function smoothHandleIn(anchor: Pt, nextPoint: Pt, chordFrom: Pt): Pt {
  const dir = angleBetween(anchor, nextPoint);
  const len = distance(anchor, chordFrom) * SMOOTH_HANDLE_FRACTION;
  return pointAtAngle(anchor, dir, -len);
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

// ---------------------------------------------------------------------------
// Front bodice — direct port of NewFront-bodice.jsx
// ---------------------------------------------------------------------------

type FrontBodicePoints = {
  A: Pt; B: Pt; C: Pt; D: Pt; E: Pt; F: Pt; G: Pt; H: Pt; I: Pt;
  J: Pt; J1: Pt; K: Pt; L: Pt; M: Pt; N: Pt; O: Pt; P: Pt; Q: Pt;
};

function computeFrontBodicePoints(m: Measurements): FrontBodicePoints {
  const bust = m.bust * PT;
  const waist = m.waist * PT;
  const frontBodiceLength = m.frontBodiceLength * PT;
  const backBodiceLength = m.backBodiceLength * PT;
  const shoulderWidth = m.shoulderWidth * PT;
  const centerFrontLength = m.centerFrontLength * PT;
  const shoulderDrop = m.shoulderDrop * PT;
  const shoulderSeamLength = m.shoulderSeamLength * PT;
  const bustSpan = m.bustSpan * PT;
  const bustDepth = m.bustDepth * PT;
  const sideSeamLength = m.sideSeamLength * PT;

  // Armhole depth logic
  let armholeDepth: number;
  if (m.bust < 40) armholeDepth = bust / 6 + 1.5 * PT;
  else if (m.bust < 50) armholeDepth = bust / 6 + 2.0 * PT;
  else armholeDepth = bust / 6 + 2.5 * PT;

  // Side extension logic
  const deltaL = (frontBodiceLength - backBodiceLength) / PT;
  let sideExtension: number;
  if (deltaL >= 3.0) sideExtension = 1.5 * PT;
  else if (deltaL > 1.0) sideExtension = 1.25 * PT;
  else sideExtension = 0;

  const sideSeamHeight = frontBodiceLength - shoulderDrop - armholeDepth;
  const dartPlacement = bustSpan / 2 - 0.5 * PT;

  // The source script's origin A sat at an absolute [600,800] (placement
  // within an 800x1000 Illustrator doc) — dropped in favor of [0,0] since
  // every other point is defined relative to A and the display layer
  // centers the draft itself; a pure translation, not a shape change.
  const A: Pt = { x: 0, y: 0 };
  const B: Pt = { x: A.x, y: A.y - frontBodiceLength };
  const C: Pt = { x: B.x, y: B.y + centerFrontLength };
  const D: Pt = { x: A.x - shoulderWidth / 2, y: A.y };
  const E: Pt = { x: D.x, y: D.y - shoulderDrop };

  const dyF = Math.abs(A.y - E.y);
  const dxF = shortSide(shoulderSeamLength, dyF);
  const F: Pt = { x: E.x + dxF, y: A.y };

  const G: Pt = { x: A.x, y: A.y - bustDepth };
  const H: Pt = { x: G.x - bustSpan / 2, y: G.y };
  const J: Pt = { x: B.x - dartPlacement, y: B.y };
  const I: Pt = { x: B.x - bust / 4, y: B.y };
  const K: Pt = { x: I.x, y: I.y + sideSeamHeight };
  const L: Pt = { x: K.x, y: K.y - sideSeamLength };
  const M: Pt = { x: L.x - sideExtension, y: L.y };

  const angleKM = angleBetween(K, M);
  const N: Pt = pointAtAngle(K, angleKM, sideSeamLength);

  const J1: Pt = { x: J.x, y: J.y - 0.125 * PT };
  const rightDartLegLength = distance(J1, H);

  const remainingWaist = waist / 4 - dartPlacement;
  const angleNJ1 = angleBetween(N, J1);
  const O: Pt = pointAtAngle(N, angleNJ1, remainingWaist);

  const angleHO = angleBetween(H, O);
  const P: Pt = pointAtAngle(H, angleHO, rightDartLegLength);

  const midArmholeY = E.y - (E.y - K.y) / 2;
  const Q: Pt = { x: E.x + 0.5 * PT, y: midArmholeY };

  return { A, B, C, D, E, F, G, H, I, J, J1, K, L, M, N, O, P, Q };
}

function toFrontDisplayPoints(p: FrontBodicePoints): FrontBodicePoints {
  return {
    A: flip(p.A), B: flip(p.B), C: flip(p.C), D: flip(p.D), E: flip(p.E), F: flip(p.F),
    G: flip(p.G), H: flip(p.H), I: flip(p.I), J: flip(p.J), J1: flip(p.J1), K: flip(p.K),
    L: flip(p.L), M: flip(p.M), N: flip(p.N), O: flip(p.O), P: flip(p.P), Q: flip(p.Q),
  };
}

// The curve handles in both source scripts are all linear interpolations
// between two named points (e.g. `C.y + (A.y - C.y) * 0.55`) rather than
// fixed pixel offsets like the previous algorithm used — negation distributes
// cleanly over a linear blend, so these can be computed directly from the
// already-flipped points below with no sign correction needed (unlike the
// old CURVE_HANDLE constants, which needed their Y offset's sign inverted
// post-flip). Shared by buildFrontPath() and frontBoundingBox() so the two
// never drift apart.
function frontCurveHandles(p: FrontBodicePoints) {
  return {
    cRight: { x: p.C.x, y: p.C.y + (p.A.y - p.C.y) * 0.55 },
    fLeft: { x: p.F.x + (p.A.x - p.F.x) * 0.55, y: p.F.y },
    qLeft: { x: p.Q.x, y: p.Q.y + (p.E.y - p.Q.y) * 0.3 },
    qRight: { x: p.Q.x, y: p.Q.y - (p.Q.y - p.K.y) * 0.3 },
    // Armhole endpoints — see smoothHandleOut/In above. eRight continues the
    // F->E shoulder line's own direction past E; kLeft anticipates the K->N
    // side-seam line's direction, arriving already aimed that way.
    eRight: smoothHandleOut(p.E, p.F, p.Q),
    kLeft: smoothHandleIn(p.K, p.N, p.Q),
  };
}

// One continuous closed outline — unlike the previous algorithm, the source
// script welds the bust dart directly into the cutting line (P -> H -> J1 is
// a V notch at the apex) rather than drawing it as a separate detached
// segment, so there's only ever one path here. The script also draws a
// second, separate "internal dart line" from H to J1 — that retraces an edge
// already in this outline exactly, so it isn't drawn again.
function buildFrontPath(p: FrontBodicePoints): string {
  const { cRight, fLeft, qLeft, qRight, eRight, kLeft } = frontCurveHandles(p);
  return (
    `M ${fmt(p.C.x)},${fmt(p.C.y)} ` +
    `C ${fmt(cRight.x)},${fmt(cRight.y)} ${fmt(fLeft.x)},${fmt(fLeft.y)} ${fmt(p.F.x)},${fmt(p.F.y)} ` +
    `L ${fmt(p.E.x)},${fmt(p.E.y)} ` +
    `C ${fmt(eRight.x)},${fmt(eRight.y)} ${fmt(qLeft.x)},${fmt(qLeft.y)} ${fmt(p.Q.x)},${fmt(p.Q.y)} ` +
    `C ${fmt(qRight.x)},${fmt(qRight.y)} ${fmt(kLeft.x)},${fmt(kLeft.y)} ${fmt(p.K.x)},${fmt(p.K.y)} ` +
    `L ${fmt(p.N.x)},${fmt(p.N.y)} ` +
    `L ${fmt(p.P.x)},${fmt(p.P.y)} ` +
    `L ${fmt(p.H.x)},${fmt(p.H.y)} ` +
    `L ${fmt(p.J1.x)},${fmt(p.J1.y)} ` +
    `L ${fmt(p.B.x)},${fmt(p.B.y)} Z`
  );
}

function frontLabeledPoints(p: FrontBodicePoints): { label: string; pt: Pt }[] {
  return [
    { label: "C", pt: p.C }, { label: "F", pt: p.F }, { label: "E", pt: p.E }, { label: "Q", pt: p.Q },
    { label: "K", pt: p.K }, { label: "N", pt: p.N }, { label: "P", pt: p.P }, { label: "H", pt: p.H },
    { label: "J1", pt: p.J1 }, { label: "B", pt: p.B },
  ];
}

function frontBoundingBox(p: FrontBodicePoints): BBox {
  const { cRight, fLeft, qLeft, qRight, eRight, kLeft } = frontCurveHandles(p);
  return bboxOfPoints([p.C, p.F, p.E, p.Q, p.K, p.N, p.P, p.H, p.J1, p.B, cRight, fLeft, qLeft, qRight, eRight, kLeft]);
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
  return (m.acrossBackWidth * PT) / 2;
}

function computeBackBodicePoints(m: Measurements): BackBodicePoints {
  const bust = m.bust * PT;
  const waist = m.waist * PT;
  const backBodiceLength = m.backBodiceLength * PT;
  const centerBackLength = m.centerBackLength * PT;
  const shoulderWidth = m.shoulderWidth * PT;
  const shoulderLength = m.backShoulderLength * PT;
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

// Same "linear interpolations survive the flip with no sign correction"
// property as the front block — see frontCurveHandles(). `hasShoulderDart`
// changes which point the shoulder line actually arrives at E1 from (P2 when
// the dart is on, F when it's off), which e1Right needs to aim its handle correctly.
function backCurveHandles(p: BackBodicePoints, hasShoulderDart: boolean) {
  return {
    cRight: { x: p.C.x + (p.F.x - p.C.x) * 0.4, y: p.C.y },
    rLeft: { x: p.R.x, y: p.R.y + (p.E1.y - p.R.y) * 0.3 },
    rRight: { x: p.R.x, y: p.R.y - (p.R.y - p.O.y) * 0.3 },
    // Armhole endpoints — continues the shoulder line's direction past E1;
    // anticipates the O->K side-seam line's direction arriving at O.
    e1Right: smoothHandleOut(p.E1, hasShoulderDart ? p.P2 : p.F, p.R),
    oLeft: smoothHandleIn(p.O, p.K, p.R),
  };
}

function buildBackPath(p: BackBodicePoints, hasShoulderDart: boolean): string {
  const { cRight, rLeft, rRight, e1Right, oLeft } = backCurveHandles(p, hasShoulderDart);
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

function backBoundingBox(p: BackBodicePoints, hasShoulderDart: boolean): BBox {
  const { cRight, rLeft, rRight, e1Right, oLeft } = backCurveHandles(p, hasShoulderDart);
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
  const frontPath = useMemo(() => buildFrontPath(frontPoints), [frontPoints]);
  const frontBbox = useMemo(() => frontBoundingBox(frontPoints), [frontPoints]);
  const frontView = viewBoxOf(frontBbox);

  const backRaw = useMemo(() => computeBackBodicePoints(m), [m]);
  const backPoints = useMemo(() => toBackDisplayPoints(backRaw), [backRaw]);
  const backPath = useMemo(() => buildBackPath(backPoints, m.hasShoulderDart), [backPoints, m.hasShoulderDart]);
  const backBbox = useMemo(() => backBoundingBox(backPoints, m.hasShoulderDart), [backPoints, m.hasShoulderDart]);
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
          <p className="mt-1 text-xs text-brand-400">Helen Joseph-Armstrong method — adjust measurements to redraft both blocks in real time.</p>
        </div>

        <FieldGroup title="Primary circumferences">
          <NumberField label="Bust" value={m.bust} min={28} max={54} onChange={(v) => set("bust", v)} />
          <NumberField label="Waist" value={m.waist} min={22} max={48} onChange={(v) => set("waist", v)} />
          <NumberField label="Bust span" value={m.bustSpan} min={5} max={13} onChange={(v) => set("bustSpan", v)} />
          <NumberField label="Shoulder width" value={m.shoulderWidth} min={10} max={20} onChange={(v) => set("shoulderWidth", v)} />
        </FieldGroup>

        <FieldGroup title="Shared shape">
          <NumberField label="Shoulder drop" value={m.shoulderDrop} min={0.5} max={3} step={0.05} onChange={(v) => set("shoulderDrop", v)} />
          <NumberField label="Side seam length" value={m.sideSeamLength} min={3} max={12} onChange={(v) => set("sideSeamLength", v)} hint="Shared by both blocks" />
        </FieldGroup>

        <FieldGroup title="Front lengths">
          <NumberField label="Front bodice length" value={m.frontBodiceLength} min={12} max={22} onChange={(v) => set("frontBodiceLength", v)} />
          <NumberField label="Centre front length" value={m.centerFrontLength} min={8} max={18} onChange={(v) => set("centerFrontLength", v)} />
          <NumberField label="Shoulder seam length" value={m.shoulderSeamLength} min={3} max={8} onChange={(v) => set("shoulderSeamLength", v)} />
          <NumberField label="Bust depth" value={m.bustDepth} min={6} max={15} onChange={(v) => set("bustDepth", v)} />
        </FieldGroup>

        <FieldGroup title="Back lengths">
          <NumberField label="Back bodice length" value={m.backBodiceLength} min={10} max={20} onChange={(v) => set("backBodiceLength", v)} />
          <NumberField label="Centre back length" value={m.centerBackLength} min={8} max={20} onChange={(v) => set("centerBackLength", v)} />
          <NumberField label="Back shoulder length" value={m.backShoulderLength} min={3} max={8} onChange={(v) => set("backShoulderLength", v)} />
        </FieldGroup>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-serif text-sm font-semibold text-brand-800">Back construction</legend>
          <Toggle
            label="Across-back width known"
            checked={m.acrossBackWidthProvided}
            onChange={(v) => set("acrossBackWidthProvided", v)}
            hint={m.acrossBackWidthProvided ? undefined : "Falls back to shoulder width / 2 − 0.25in"}
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
