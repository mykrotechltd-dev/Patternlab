import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic front skirt block — quarter-measurement-plus-ease method, the same
// approach used in most introductory patternmaking courses (e.g. Aldrich's
// basic block). This is a straight-line/simple-curve DRAFT, not a finished
// pattern: it has no waist dart. Treat it as a starting shape to true up by
// hand. Seam allowance and a back piece are available separately.
const DEFAULT_WAIST_EASE_MM = 10; // total ease split across the quarter measurement
const DEFAULT_HIP_EASE_MM = 20;

export type SkirtBlockOptions = { waistEaseMM?: number; hipEaseMM?: number };

export function generateSkirtBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: SkirtBlockOptions = {}
): PatternResult {
  const warnings: string[] = [];
  const waistEaseMM = options.waistEaseMM ?? DEFAULT_WAIST_EASE_MM;
  const hipEaseMM = options.hipEaseMM ?? DEFAULT_HIP_EASE_MM;

  const waist = readMM(values, unit, ["waist"], 700, warnings, "Waist");
  const hip = readMM(values, unit, ["hip"], 960, warnings, "Hip");
  const hipDepth = readMM(values, unit, ["hip_depth"], 200, warnings, "Hip depth (waist to widest point)");
  const skirtLength = readMM(values, unit, ["skirt_length"], 600, warnings, "Skirt length");

  const waistQuarter = waist / 4 + waistEaseMM / 4;
  const hipQuarter = hip / 4 + hipEaseMM / 4;

  const centerWaist: Point = [0, 0];
  const sideWaist: Point = [waistQuarter, 0];
  const sideHip: Point = [hipQuarter, hipDepth];
  const sideHem: Point = [hipQuarter, skirtLength];
  const centerHem: Point = [0, skirtLength];

  const path =
    `M ${centerWaist[0]},${centerWaist[1]} ` +
    `L ${sideWaist[0]},${sideWaist[1]} ` +
    `Q ${sideHip[0]},${sideHip[1] / 2} ${sideHip[0]},${sideHip[1]} ` +
    `L ${sideHem[0]},${sideHem[1]} ` +
    `L ${centerHem[0]},${centerHem[1]} Z`;

  const points: Point[] = [centerWaist, sideWaist, sideHip, sideHem, centerHem];

  warnings.push("Basic front block only: add a waist dart by hand before cutting fabric.");

  return {
    pieces: [
      {
        name: "Skirt — Front (basic block)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
