import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic back skirt block — identical construction to the front block, with
// one deliberate difference: less waist ease, reflecting the commonly-taught
// convention that a back waist is drafted more fitted than the front (the
// back waist dart typically takes in more than the front). This is a
// general, widely-published convention, not a measurement-derived number —
// treat the exact dart intake as a starting point to true up by hand.
const DEFAULT_WAIST_EASE_MM = 4; // less than the front block's 10mm — more fitted back waist
const DEFAULT_HIP_EASE_MM = 20;

export type SkirtBackBlockOptions = { waistEaseMM?: number; hipEaseMM?: number };

export function generateSkirtBackBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: SkirtBackBlockOptions = {}
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

  warnings.push(
    "Basic back block: same construction as the front with a tighter waist ease (a common but general convention, not measured on your customer) — add a back waist dart by hand before cutting fabric."
  );

  return {
    pieces: [
      {
        name: "Skirt — Back (basic block)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
