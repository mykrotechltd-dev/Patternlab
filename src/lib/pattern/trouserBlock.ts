import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic front trouser block — same quarter-measurement-plus-ease method as
// the skirt/bodice blocks, extended down through the crotch. Deliberately
// simplified: the crotch/inseam curve is approximated with a single
// quadratic curve (not a trued crotch curve), there's no fly extension, and
// front/back crotch shaping isn't differentiated — this is a front leg
// panel only. True the crotch curve and add a back piece by hand.
const DEFAULT_WAIST_EASE_MM = 10;
const DEFAULT_HIP_EASE_MM = 20;
const CROTCH_EXTENSION_MM = 25; // how far the crotch point bows out from center front — a fixed, commonly-used rough allowance, not derived from a measurement

export type TrouserBlockOptions = { waistEaseMM?: number; hipEaseMM?: number };

export function generateTrouserBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: TrouserBlockOptions = {}
): PatternResult {
  const warnings: string[] = [];
  const waistEaseMM = options.waistEaseMM ?? DEFAULT_WAIST_EASE_MM;
  const hipEaseMM = options.hipEaseMM ?? DEFAULT_HIP_EASE_MM;

  const waist = readMM(values, unit, ["waist"], 700, warnings, "Waist");
  const thigh = readMM(values, unit, ["thigh", "hip"], 560, warnings, "Thigh");
  const rise = readMM(values, unit, ["rise"], 280, warnings, "Rise (waist to crotch depth)");
  const inseam = readMM(values, unit, ["inseam"], 780, warnings, "Inseam");
  const ankle = readMM(values, unit, ["ankle"], 220, warnings, "Ankle");

  const waistQuarter = waist / 4 + waistEaseMM / 4;
  const thighQuarter = thigh / 4 + hipEaseMM / 4;
  const ankleHalf = ankle / 2 + 10; // small fixed hem ease

  const centerWaist: Point = [0, 0];
  const sideWaist: Point = [waistQuarter, 0];
  const sideThigh: Point = [thighQuarter, rise];
  const sideAnkle: Point = [ankleHalf, rise + inseam];
  const centerAnkle: Point = [0, rise + inseam];
  const crotchPoint: Point = [CROTCH_EXTENSION_MM, rise * 1.02];

  const path =
    `M ${centerWaist[0]},${centerWaist[1]} ` +
    `L ${sideWaist[0]},${sideWaist[1]} ` +
    `Q ${sideThigh[0]},${sideThigh[1] / 2} ${sideThigh[0]},${sideThigh[1]} ` +
    `L ${sideAnkle[0]},${sideAnkle[1]} ` +
    `L ${centerAnkle[0]},${centerAnkle[1]} ` +
    `Q ${crotchPoint[0]},${(crotchPoint[1] + centerAnkle[1]) / 2} ${crotchPoint[0]},${crotchPoint[1]} ` +
    `L ${centerWaist[0]},${centerWaist[1]} Z`;

  const points: Point[] = [centerWaist, sideWaist, sideThigh, sideAnkle, centerAnkle, crotchPoint];

  warnings.push(
    "Front leg panel only, crotch curve approximated: true the crotch/inseam curve against your own body or a fitted trouser, and add a back piece and fly by hand before cutting fabric."
  );

  return {
    pieces: [
      {
        name: "Trouser — Front (basic block)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
