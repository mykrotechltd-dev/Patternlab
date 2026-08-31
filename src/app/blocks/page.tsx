import Link from "next/link";
import { PatternBlockTabs } from "@/components/patterns/PatternBlockTabs";

// A representative measurement set (centimeters) — this is a standalone demo
// with no backend, so there's nothing to load; every field is adjustable via
// the sliders once the page is up.
const DEMO_MEASUREMENTS = {
  bust: 88,
  chest: 88,
  waist: 70,
  hip: 96,
  hip_depth: 20,
  skirt_length: 60,
  shoulder: 38,
  blouse_length: 40,
};

export default function BlocksPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/" className="text-sm text-brand-600 hover:underline">
        ← Back
      </Link>
      <h1 className="font-serif text-xl font-semibold text-brand-900">Basic blocks</h1>
      <PatternBlockTabs initialValues={DEMO_MEASUREMENTS} initialUnit="cm" />
    </div>
  );
}
