import type { PatternPiece } from "./geometry";
import { offsetPolygon, pointsToClosedPathData } from "./geometry";

/**
 * Serializes a pattern piece into a standalone, self-contained SVG file
 * string — millimeters as the unit, so opening it in any vector editor (or
 * printing it directly) preserves true scale. Used for the browser-side
 * "Download SVG" button; the returned string is written straight to a Blob,
 * no server round-trip involved.
 *
 * `seamAllowanceMM` (optional) draws a second, dashed cutting-line path
 * offset outward by that distance — same offset logic the PDF export uses.
 */
export function pieceToStandaloneSvg(piece: PatternPiece, seamAllowanceMM = 0): string {
  const cutPoints = seamAllowanceMM > 0 ? offsetPolygon(piece.points, seamAllowanceMM) : null;
  const cutPath = cutPoints ? pointsToClosedPathData(cutPoints) : null;

  const xs = cutPoints ? [piece.boundingBoxMM.minX, piece.boundingBoxMM.maxX, ...cutPoints.map((p) => p[0])] : [piece.boundingBoxMM.minX, piece.boundingBoxMM.maxX];
  const ys = cutPoints ? [piece.boundingBoxMM.minY, piece.boundingBoxMM.maxY, ...cutPoints.map((p) => p[1])] : [piece.boundingBoxMM.minY, piece.boundingBoxMM.maxY];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" ` +
    `viewBox="${minX} ${minY} ${width} ${height}">\n` +
    `  <title>${escapeXml(piece.name)}</title>\n` +
    (cutPath ? `  <path d="${cutPath}" stroke="#b45309" stroke-width="0.5" stroke-dasharray="3,2" fill="none" />\n` : "") +
    `  <path d="${piece.pathMM}" stroke="black" stroke-width="0.6" fill="none" />\n` +
    `</svg>\n`
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
