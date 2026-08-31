import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints, pointsToClosedPathData } from "./geometry";

// Circle skirts are drafted from a single radius derived from the waist
// measurement, not the quarter-body-plus-ease method the basic block uses —
// there's no hip shaping or darts, because the flare itself provides the
// ease. What's returned is the standard cut-on-the-fold panel: a
// quarter-circle annulus (inner arc = waist, outer arc = hem, two straight
// radial edges = the fold and the side seam). Four of these panels (cut on
// a double fold) make a full-circle skirt; two make a semi-circle skirt —
// preview-only for now, this isn't wired into the PDF export.
const ARC_SEGMENTS = 16;

export type CircleSkirtStyle = "semi" | "full";
export type CircleSkirtOptions = { waistEaseMM?: number };

function arcPoints(radius: number, fromDeg: number, toDeg: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const rad = ((fromDeg + (toDeg - fromDeg) * t) * Math.PI) / 180;
    pts.push([radius * Math.cos(rad), radius * Math.sin(rad)]);
  }
  return pts;
}

export function generateCircleSkirtBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  style: CircleSkirtStyle,
  options: CircleSkirtOptions = {}
): PatternResult {
  const warnings: string[] = [];
  const waistEaseMM = options.waistEaseMM ?? 10;

  const waist = readMM(values, unit, ["waist"], 700, warnings, "Waist");
  const length = readMM(values, unit, ["skirt_length"], 600, warnings, "Skirt length");

  // Full circle: the waist sits on the full circumference of a circle
  // (2*pi*r). Semi-circle: the garment is only half that circle, so the
  // same waist length is spread over pi*r instead — half the angle, so it
  // takes roughly twice the radius to fit the same waist measurement.
  const angleDivisor = style === "full" ? 2 * Math.PI : Math.PI;
  const innerRadius = (waist + waistEaseMM) / angleDivisor;
  const outerRadius = innerRadius + length;

  const waistArc = arcPoints(innerRadius, 0, 90);
  const hemArc = arcPoints(outerRadius, 90, 0);
  const points: Point[] = [...waistArc, ...hemArc];

  warnings.push(
    style === "full"
      ? "Full-circle skirt: this is one quarter-panel, cut on a double fold (×4) to make the whole circle. No hip shaping or darts — the flare provides the ease."
      : "Semi-circle skirt: this is one quarter-panel, cut on a single fold (×2) to make the half-circle. No hip shaping or darts — the flare provides the ease."
  );

  return {
    pieces: [
      {
        name:
          style === "full"
            ? "Full-circle skirt — quarter panel (cut ×4 on double fold)"
            : "Semi-circle skirt — quarter panel (cut ×2 on fold)",
        pathMM: pointsToClosedPathData(points),
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
