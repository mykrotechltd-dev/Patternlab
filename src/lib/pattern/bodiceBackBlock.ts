import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic back torso block — same construction as the front block, with less
// ease at the chest level, reflecting the general convention that a back
// bodice is narrower than the front at bust level (there's no bust volume
// on the back). Like the front block: straight lines, no armhole/neckline
// curve, no shoulder slope — a torso block starting shape, not a finished
// pattern.
const DEFAULT_CHEST_EASE_MM = 20; // less than the front block's 40mm — narrower back at bust level
const DEFAULT_WAIST_EASE_MM = 15;
const BUST_LEVEL_FRACTION = 0.4;

export type BodiceBackBlockOptions = { chestEaseMM?: number; waistEaseMM?: number };

export function generateBodiceBackBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: BodiceBackBlockOptions = {}
): PatternResult {
  const warnings: string[] = [];
  const chestEaseMM = options.chestEaseMM ?? DEFAULT_CHEST_EASE_MM;
  const waistEaseMM = options.waistEaseMM ?? DEFAULT_WAIST_EASE_MM;

  const bust = readMM(values, unit, ["bust", "chest"], 880, warnings, "Bust/chest");
  const waist = readMM(values, unit, ["waist"], 700, warnings, "Waist");
  const shoulder = readMM(values, unit, ["shoulder"], 380, warnings, "Shoulder width");
  const bodiceLength = readMM(
    values,
    unit,
    ["blouse_length", "shirt_length", "gown_length"],
    400,
    warnings,
    "Bodice length (shoulder to waist)"
  );

  const bustQuarter = bust / 4 + chestEaseMM / 4;
  const waistQuarter = waist / 4 + waistEaseMM / 4;
  const shoulderHalf = shoulder / 2;
  const bustLevelY = bodiceLength * BUST_LEVEL_FRACTION;

  const centerNeck: Point = [0, 0];
  const shoulderPoint: Point = [shoulderHalf, 0];
  const bustPoint: Point = [bustQuarter, bustLevelY];
  const waistPoint: Point = [waistQuarter, bodiceLength];
  const centerWaist: Point = [0, bodiceLength];

  const path =
    `M ${centerNeck[0]},${centerNeck[1]} ` +
    `L ${shoulderPoint[0]},${shoulderPoint[1]} ` +
    `L ${bustPoint[0]},${bustPoint[1]} ` +
    `L ${waistPoint[0]},${waistPoint[1]} ` +
    `L ${centerWaist[0]},${centerWaist[1]} Z`;

  const points: Point[] = [centerNeck, shoulderPoint, bustPoint, waistPoint, centerWaist];

  warnings.push(
    "Torso block only, straight lines, narrower ease than the front (a general convention, not measured on your customer): add armhole curve, neckline curve, and shoulder slope by hand before cutting fabric."
  );

  return {
    pieces: [
      {
        name: "Bodice — Back (basic torso block)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
