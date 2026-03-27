/**
 * FTC-compliant vehicle disclosure component.
 *
 * Shows condition badges, odometer statements, warranty info, and price
 * disclaimers required by federal and state auto-dealer regulations.
 */

import type { VehicleCondition } from "@/types/vehicle";

interface VehicleDisclosuresProps {
  vehicle: {
    condition: string;
    mileage: number;
    price: number;
    year: number;
    make: string;
    model: string;
    warranty?: string;
  };
  /** Show all disclosures (VDP) vs compact view (listing card). */
  showFull?: boolean;
}

const CONDITION_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  used: { label: "Used", color: "bg-amber-50 text-amber-700 border-amber-200" },
  certified: { label: "Certified Pre-Owned", color: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function VehicleDisclosures({
  vehicle,
  showFull = false,
}: VehicleDisclosuresProps) {
  const conditionKey = vehicle.condition.toLowerCase() as VehicleCondition;
  const badge = CONDITION_LABELS[conditionKey] ?? CONDITION_LABELS.used;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (!showFull) {
    // Compact view for listing cards
    return (
      <div className="mt-2 space-y-1">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}
        >
          {badge.label}
        </span>
        <p className="text-[10px] leading-tight text-gray-400">
          Price does not include tax, title, registration, or dealer fees.
        </p>
      </div>
    );
  }

  // Full view for VDP pages
  return (
    <div className="rounded-xl border border-surface-border bg-gray-50 p-5 text-xs leading-relaxed text-gray-500">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Vehicle Disclosures</h3>

      <div className="space-y-2">
        {/* Condition badge */}
        <p>
          <span
            className={`mr-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}
          >
            {badge.label}
          </span>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </p>

        {/* Warranty / As-Is disclosure */}
        {conditionKey === "new" ? (
          <p>This vehicle is covered by the manufacturer&apos;s new-vehicle limited warranty.</p>
        ) : vehicle.warranty ? (
          <p>Warranty: {vehicle.warranty}</p>
        ) : (
          <p>
            This vehicle is sold <strong>AS-IS</strong> unless otherwise noted in writing.
            No dealer warranty is expressed or implied unless provided in a separate written agreement.
          </p>
        )}

        {/* Odometer disclosure (federal requirement) */}
        <p>
          Odometer reads <strong>{vehicle.mileage.toLocaleString()} miles</strong> as of{" "}
          {today}. Actual mileage may vary due to test drives and vehicle relocation.
        </p>

        {/* Price disclaimer */}
        <p>
          Listed price of <strong>${vehicle.price.toLocaleString()}</strong> does not
          include tax, title, registration, or dealer documentation fees. Final price may
          vary. See dealer for complete details.
        </p>

        {/* Availability */}
        <p>
          Vehicle availability and pricing are subject to change without notice.
          Please verify all information with the dealership before purchase.
        </p>
      </div>
    </div>
  );
}
