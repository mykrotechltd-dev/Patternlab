import { MeasurementValues, MeasurementUnit, PatternResult, Point, readMM, boundingBoxOfPoints } from "./geometry";

// Basic sleeve block — the least reliable of these generators, and the one
// that most needs a trained eye before use. A real set-in sleeve cap is a
// smooth curve whose length must match the armhole it's sewn into — our
// bodice block doesn't even draw an armhole curve (deliberately, for the
// same reason: we don't have the patternmaking judgment to draft one
// correctly). So this sleeve cap is drawn as a simple PEAK (two straight
// lines meeting at a point), not a curve, sized from the bicep measurement
// alone with a rough cap-height ratio. It gives you a starting silhouette
// and correct overall dimensions — the cap absolutely must be hand-curved
// and trued against the actual armhole of the garment it's going into
// before anything is cut.
const DEFAULT_BICEP_EASE_MM = 30;
const CAP_HEIGHT_RATIO = 0.33; // rough rule of thumb: cap height ~ bicep / 3

export type SleeveBlockOptions = { bicepEaseMM?: number };

export function generateSleeveBlock(
  values: MeasurementValues,
  unit: MeasurementUnit,
  options: SleeveBlockOptions = {}
): PatternResult {
  const warnings: string[] = [];
  const bicepEaseMM = options.bicepEaseMM ?? DEFAULT_BICEP_EASE_MM;

  const bicep = readMM(values, unit, ["bicep", "arm"], 320, warnings, "Bicep/arm circumference");
  const sleeveLength = readMM(values, unit, ["sleeve_length"], 580, warnings, "Sleeve length");
  const wrist = readMM(values, unit, ["wrist"], 180, warnings, "Wrist circumference");

  const bicepHalf = bicep / 2 + bicepEaseMM / 2;
  const wristHalf = wrist / 2 + 10;
  const capHeight = bicep * CAP_HEIGHT_RATIO;

  const leftCapBase: Point = [-bicepHalf, capHeight];
  const capPeak: Point = [0, 0];
  const rightCapBase: Point = [bicepHalf, capHeight];
  const rightWrist: Point = [wristHalf, capHeight + sleeveLength];
  const leftWrist: Point = [-wristHalf, capHeight + sleeveLength];

  const path =
    `M ${leftCapBase[0]},${leftCapBase[1]} ` +
    `L ${capPeak[0]},${capPeak[1]} ` +
    `L ${rightCapBase[0]},${rightCapBase[1]} ` +
    `L ${rightWrist[0]},${rightWrist[1]} ` +
    `L ${leftWrist[0]},${leftWrist[1]} Z`;

  const points: Point[] = [leftCapBase, capPeak, rightCapBase, rightWrist, leftWrist];

  warnings.push(
    "Rough outline only — the cap is drawn as a straight-line peak, not a curve. It must be hand-curved and trued against the actual armhole of the garment before cutting. Do not cut fabric from this alone."
  );

  return {
    pieces: [
      {
        name: "Sleeve (rough outline — cap not curved)",
        pathMM: path,
        points,
        boundingBoxMM: boundingBoxOfPoints(points),
      },
    ],
    warnings,
  };
}
