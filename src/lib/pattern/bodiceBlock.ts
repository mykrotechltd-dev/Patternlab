import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic front torso block — quarter-measurement-plus-ease method, deliberately
// simplified: straight shoulder line, no armhole curve, no neckline curve, no
// bust dart. Getting armhole/neckline curves right requires real patternmaking
// judgment this engine doesn't have, so those are left for a human to add by
// hand rather than guessed at. Treat this as a torso block starting shape.
// Seam allowance and a back piece are available separately.
const DEFAULT_CHEST_EASE_MM = 40;
const DEFAULT_WAIST_EASE_MM = 20;
const BUST_LEVEL_FRACTION = 0.4; // rough proportion of bodice length down to the fullest bust point

export type BodiceBlockOptions = { chestEaseMM?: number; waistEaseMM?: number };

export function generateBodiceBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: BodiceBlockOptions = {}
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

  warnings.push("Torso block only, straight lines: add armhole curve, neckline curve, shoulder slope, and bust dart by hand before cutting fabric.");

  return {
    pieces: [
      {
        name: "Bodice — Front (basic torso block)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
