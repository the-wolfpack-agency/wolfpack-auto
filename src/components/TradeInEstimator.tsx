"use client";

import { useState, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VehicleCondition = "excellent" | "good" | "fair" | "poor";

interface TradeInEstimate {
  low: number;
  mid: number;
  high: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;

const CONDITION_MULTIPLIERS: Record<VehicleCondition, number> = {
  excellent: 1.0,
  good: 0.9,
  fair: 0.75,
  poor: 0.6,
};

const CONDITION_LABELS: Record<VehicleCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/**
 * Average MSRP estimates by segment. In production these would come from a
 * data provider (e.g. Black Book, Kelley Blue Book API). This simple lookup
 * keeps us zero-dependency while still producing reasonable estimates.
 */
const BASE_MSRP_ESTIMATE = 35_000;

const AVERAGE_ANNUAL_MILEAGE = 12_000;

// ---------------------------------------------------------------------------
// Depreciation model
// ---------------------------------------------------------------------------

function annualDepreciationRate(age: number): number {
  if (age <= 1) return 0.2;
  if (age <= 5) return 0.15;
  return 0.1;
}

function estimateValue(
  baseMsrp: number,
  age: number,
  condition: VehicleCondition,
  mileage: number,
): TradeInEstimate {
  // Step 1: Apply depreciation year-by-year
  let value = baseMsrp;
  for (let y = 1; y <= age; y++) {
    value *= 1 - annualDepreciationRate(y);
  }

  // Step 2: Condition multiplier
  value *= CONDITION_MULTIPLIERS[condition];

  // Step 3: Mileage adjustment
  const expectedMileage = age * AVERAGE_ANNUAL_MILEAGE;
  const mileageDelta = mileage - expectedMileage;
  // ~$0.05 per mile over/under expected
  value -= mileageDelta * 0.05;

  // Floor at $500
  value = Math.max(value, 500);

  return {
    low: Math.round(value * 0.9),
    mid: Math.round(value),
    high: Math.round(value * 1.1),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradeInEstimator() {
  const [year, setYear] = useState(CURRENT_YEAR - 3);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [mileage, setMileage] = useState(36_000);
  const [condition, setCondition] = useState<VehicleCondition>("good");
  const [showEstimate, setShowEstimate] = useState(false);

  const age = CURRENT_YEAR - year;

  const estimate = useMemo(() => {
    if (!make || !model) return null;
    return estimateValue(BASE_MSRP_ESTIMATE, age, condition, mileage);
  }, [make, model, age, condition, mileage]);

  const canEstimate = make.trim().length > 0 && model.trim().length > 0;

  return (
    <div className="rounded-card border border-surface-border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">
        Estimate Your Trade-In Value
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Get an instant estimate for your current vehicle.
      </p>

      <div className="mt-5 space-y-4">
        {/* Year */}
        <div>
          <label
            htmlFor="trade-year"
            className="block text-sm font-medium text-gray-700"
          >
            Year
          </label>
          <select
            id="trade-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {Array.from({ length: CURRENT_YEAR - MIN_YEAR + 2 }, (_, i) => {
              const y = CURRENT_YEAR + 1 - i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>

        {/* Make */}
        <div>
          <label
            htmlFor="trade-make"
            className="block text-sm font-medium text-gray-700"
          >
            Make
          </label>
          <input
            id="trade-make"
            type="text"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="e.g. Toyota"
            className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Model */}
        <div>
          <label
            htmlFor="trade-model"
            className="block text-sm font-medium text-gray-700"
          >
            Model
          </label>
          <input
            id="trade-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. Camry"
            className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Trim */}
        <div>
          <label
            htmlFor="trade-trim"
            className="block text-sm font-medium text-gray-700"
          >
            Trim{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="trade-trim"
            type="text"
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            placeholder="e.g. SE, XLE"
            className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Mileage */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="trade-mileage"
              className="text-sm font-medium text-gray-700"
            >
              Mileage
            </label>
            <span className="text-sm font-semibold text-gray-900">
              {mileage.toLocaleString()} mi
            </span>
          </div>
          <input
            id="trade-mileage"
            type="range"
            min={0}
            max={250_000}
            step={1_000}
            value={mileage}
            onChange={(e) => setMileage(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={250000}
            aria-valuenow={mileage}
            aria-label="Vehicle mileage"
            className="mt-2 w-full accent-brand-600"
          />
        </div>

        {/* Condition */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">
            Condition
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              Object.keys(CONDITION_MULTIPLIERS) as VehicleCondition[]
            ).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCondition(c)}
                aria-pressed={condition === c}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  condition === c
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-border text-gray-600 hover:border-gray-400"
                }`}
              >
                {CONDITION_LABELS[c]}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Get estimate button */}
        <button
          type="button"
          disabled={!canEstimate}
          onClick={() => setShowEstimate(true)}
          className="w-full rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Get Estimate
        </button>
      </div>

      {/* Estimate result */}
      {showEstimate && estimate && (
        <div className="mt-6 rounded-lg bg-surface-subtle p-5">
          <p className="text-sm font-medium text-gray-500">
            Estimated Trade-In Value for your {year} {make} {model}
            {trim ? ` ${trim}` : ""}
          </p>

          <div className="mt-3 flex items-end justify-center gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-400">Low</p>
              <p className="text-lg font-semibold text-gray-600">
                {fmt(estimate.low)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Estimated</p>
              <p className="text-3xl font-bold text-brand-700">
                {fmt(estimate.mid)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">High</p>
              <p className="text-lg font-semibold text-gray-600">
                {fmt(estimate.high)}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-5">
            <a
              href="/contact?source=trade-in"
              className="block rounded-lg border border-brand-600 px-6 py-3 text-center font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Get an Exact Quote &mdash; Submit Your Info
            </a>
          </div>

          {/* Disclaimer */}
          <p className="mt-4 text-xs leading-relaxed text-gray-400">
            This is an estimate only. Actual trade-in value will be determined
            upon physical inspection of your vehicle by the dealership. Factors
            including vehicle history, mechanical condition, regional market
            conditions, and current demand may affect the final offer. This
            estimate does not constitute a binding offer or guarantee.
          </p>
        </div>
      )}
    </div>
  );
}
