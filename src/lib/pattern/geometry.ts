export type MeasurementValues = Record<string, string | number>;
export type MeasurementUnit = "in" | "cm";
export type Point = [number, number];

export type PatternPiece = {
  name: string;
  /** SVG path data, in millimeters, origin at the piece's top-left-ish reference point. */
  pathMM: string;
  /**
   * The same outline as a straight-line polygon (curve endpoints included,
   * control points dropped) — used for seam-allowance offsetting and any
   * other geometry that needs plain vertices rather than an SVG path string.
   * A close-enough approximation for our simple, mildly-curved basic blocks.
   */
  points: Point[];
  boundingBoxMM: { minX: number; maxX: number; minY: number; maxY: number };
};

export type PatternResult = {
  pieces: PatternPiece[];
  /** Measurement keys that were missing and had to be defaulted — surfaced to the user, never hidden. */
  warnings: string[];
};

/** Reads a numeric measurement value in millimeters, trying each key in order, falling back to a default. */
export function readMM(values: MeasurementValues, unit: MeasurementUnit, keys: string[], fallback: number, warnings: string[], label: string): number {
  for (const key of keys) {
    const raw = values[key];
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = typeof raw === "number" ? raw : parseFloat(raw);
      if (!Number.isNaN(n) && n > 0) {
        return unit === "in" ? n * 25.4 : n * 10;
      }
    }
  }
  warnings.push(`${label} not measured — used a default of ${fallback}mm. Verify before cutting.`);
  return fallback;
}

export function boundingBoxOfPoints(points: Point[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function pointsToClosedPathData(points: Point[]): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const rest = points.slice(1);
  return `M ${first[0]},${first[1]} ` + rest.map((p) => `L ${p[0]},${p[1]}`).join(" ") + " Z";
}

/**
 * Offsets a closed polygon outward by `distanceMM` using the miter-join
 * method: each vertex moves along the average of its two adjacent edge
 * normals. Good enough for our simple, mostly-convex basic-block shapes —
 * this is what draws the "cutting line" outside the seamline when seam
 * allowance is turned on. Not a general-purpose offset algorithm (no
 * handling for sharp concave notches), which is fine for what we draft.
 */
export function offsetPolygon(points: Point[], distanceMM: number): Point[] {
  if (distanceMM === 0 || points.length < 3) return points;
  const n = points.length;

  const edgeNormal = (a: Point, b: Point): Point => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // Outward normal for a clockwise polygon in SVG's y-down coordinate space.
    return [dy / len, -dx / len];
  };

  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const n1 = edgeNormal(prev, p);
    const n2 = edgeNormal(p, next);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const mLen = Math.hypot(mx, my) || 1;
    mx /= mLen;
    my /= mLen;
    // Miter length compensation so corners don't fall short of `distanceMM`.
    const cosHalf = Math.max((mx * n1[0] + my * n1[1]), 0.35);
    const miter = distanceMM / cosHalf;
    return [p[0] + mx * miter, p[1] + my * miter] as Point;
  });
}
