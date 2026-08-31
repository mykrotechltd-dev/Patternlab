"use client";

import { useState } from "react";
import { PatternPreviewCanvas } from "./PatternPreviewCanvas";
import type { MeasurementValues, MeasurementUnit } from "@/lib/pattern/geometry";

const BLOCKS = [
  { key: "skirt", label: "Skirt" },
  { key: "bodice", label: "Bodice" },
] as const;

export function PatternBlockTabs({
  initialValues,
  initialUnit,
}: {
  initialValues: MeasurementValues;
  initialUnit: MeasurementUnit;
}) {
  const [block, setBlock] = useState<"skirt" | "bodice">("skirt");

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex gap-2">
        {BLOCKS.map((b) => (
          <button
            key={b.key}
            onClick={() => setBlock(b.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              block === b.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <PatternPreviewCanvas block={block} initialValues={initialValues} initialUnit={initialUnit} />
    </div>
  );
}
