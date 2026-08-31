import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 p-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-brand-900">Patternlab</h1>
        <p className="mt-1 text-sm text-brand-500">Parametric pattern drafting, extracted from AtelierHQ.</p>
      </div>

      <div className="space-y-3">
        <Link
          href="/lab"
          className="block rounded-xl border border-brand-100 bg-white p-4 shadow-sm transition hover:border-accent-400"
        >
          <div className="font-serif text-base font-semibold text-brand-800">Front bodice draft</div>
          <p className="mt-1 text-sm text-brand-500">
            Full darted front bodice block — bust dart, waist dart, curved neckline/armhole/side seam. Every
            measurement is a live input.
          </p>
        </Link>

        <Link
          href="/blocks"
          className="block rounded-xl border border-brand-100 bg-white p-4 shadow-sm transition hover:border-accent-400"
        >
          <div className="font-serif text-base font-semibold text-brand-800">Basic blocks</div>
          <p className="mt-1 text-sm text-brand-500">
            Skirt (basic/semi-circle/full-circle) and simplified bodice torso blocks, with seam allowance and zoom.
          </p>
        </Link>
      </div>
    </div>
  );
}
