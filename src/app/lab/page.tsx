import Link from "next/link";
import { FrontBodiceDashboard } from "@/components/patterns/FrontBodiceDashboard";

export default function LabPage() {
  return (
    <div>
      <div className="p-4">
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← Back
        </Link>
      </div>
      <FrontBodiceDashboard />
    </div>
  );
}
