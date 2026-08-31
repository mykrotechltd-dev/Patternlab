import { generateSkirtBlock } from "./skirtBlock";
import { generateBodiceBlock } from "./bodiceBlock";
import { generateTrouserBlock } from "./trouserBlock";
import { generateSkirtBackBlock } from "./skirtBackBlock";
import { generateBodiceBackBlock } from "./bodiceBackBlock";
import { generateSleeveBlock } from "./sleeveBlock";

// Single source of truth for the six block generators, shared by the PDF
// route handler and the chooser page — a route.ts file can only export the
// HTTP method handlers it defines (GET, POST, ...), so this can't live there.
export const GENERATORS = {
  skirt: { fn: generateSkirtBlock, label: "Basic skirt block (front)" },
  "skirt-back": { fn: generateSkirtBackBlock, label: "Basic skirt block (back)" },
  bodice: { fn: generateBodiceBlock, label: "Basic bodice block (front)" },
  "bodice-back": { fn: generateBodiceBackBlock, label: "Basic bodice block (back)" },
  trouser: { fn: generateTrouserBlock, label: "Basic trouser block (front)" },
  sleeve: { fn: generateSleeveBlock, label: "Basic sleeve block (rough outline)" },
} as const;

export type BlockKey = keyof typeof GENERATORS;
