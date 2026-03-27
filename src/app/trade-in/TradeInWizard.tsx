"use client";

import { useState, useEffect } from "react";
import { trackEvent } from "@/components/Analytics";
import { useAnalytics } from "@/components/EventCollector";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CURRENT_YEAR = new Date().getFullYear();

const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR + 1 - 1990 + 1 },
  (_, i) => CURRENT_YEAR + 1 - i,
);

const MAKES = [
  "Acura",
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "Fiat",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jaguar",
  "Jeep",
  "Kia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lucid",
  "Maserati",
  "Mazda",
  "Mercedes-Benz",
  "Mercury",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Oldsmobile",
  "Plymouth",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Rivian",
  "Saab",
  "Saturn",
  "Scion",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "Other",
];

const CONDITIONS = [
  {
    value: "excellent",
    label: "Excellent",
    description:
      "Like new. No accidents, minimal wear, all features working.",
  },
  {
    value: "good",
    label: "Good",
    description: "Normal wear for age. Minor cosmetic issues, fully functional.",
  },
  {
    value: "fair",
    label: "Fair",
    description: "Visible wear, some mechanical issues, or minor accident.",
  },
  {
    value: "poor",
    label: "Poor",
    description:
      "Significant wear, mechanical problems, or major damage.",
  },
] as const;

type Condition = (typeof CONDITIONS)[number]["value"];

const ACCIDENT_OPTIONS = [
  { value: "none", label: "No Accidents", description: "Clean history report" },
  {
    value: "minor",
    label: "Minor Accident",
    description: "Fender bender or minor damage, repaired",
  },
  {
    value: "major",
    label: "Major Accident",
    description: "Significant collision or structural damage",
  },
] as const;

const TITLE_OPTIONS = [
  {
    value: "clean",
    label: "Clean Title",
    description: "Standard ownership, no issues",
  },
  {
    value: "rebuilt",
    label: "Rebuilt Title",
    description: "Previously salvaged, now roadworthy",
  },
  {
    value: "salvage",
    label: "Salvage Title",
    description: "Declared total loss by insurance",
  },
] as const;

const OWNER_OPTIONS = [
  { value: "1", label: "1 Owner" },
  { value: "2", label: "2 Owners" },
  { value: "3+", label: "3+ Owners" },
] as const;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface WizardData {
  // Step 1
  year: string;
  make: string;
  model: string;
  trim: string;
  // Step 2
  mileage: string;
  condition: Condition | "";
  // Step 3
  accidentHistory: string;
  titleStatus: string;
  previousOwners: string;
  // Step 4 lead
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface EstimateResult {
  id: string;
  estimatedLow: number;
  estimatedHigh: number;
  estimatedMid: number;
  confidence: "high" | "medium" | "low";
  factors: Array<{ label: string; impact: number; description: string }>;
  expiresAt: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatMileageDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

/* -------------------------------------------------------------------------- */
/* Progress Bar                                                                */
/* -------------------------------------------------------------------------- */

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = ((step - 1) / (total - 1)) * 100;
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Step {step} of {total}
        </span>
        <span className="text-xs font-medium text-brand-600">
          {Math.round(pct)}% complete
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500"
          style={{ width: `${step === 1 ? 5 : pct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card Button                                                                 */
/* -------------------------------------------------------------------------- */

function CardButton({
  selected,
  onClick,
  label,
  description,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col rounded-xl border-2 p-4 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
        selected
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-300/40"
          : "border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50"
      } ${className}`}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6l2.5 2.5L10 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      {description && (
        <span className="mt-1 text-xs leading-relaxed text-gray-500">{description}</span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline error                                                                */
/* -------------------------------------------------------------------------- */

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Wizard Component                                                       */
/* -------------------------------------------------------------------------- */

const INITIAL_DATA: WizardData = {
  year: "",
  make: "",
  model: "",
  trim: "",
  mileage: "",
  condition: "",
  accidentHistory: "",
  titleStatus: "",
  previousOwners: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

export default function TradeInWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [mileageDisplay, setMileageDisplay] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [factorsOpen, setFactorsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dealer analytics platform
  const { track, trackConversion } = useAnalytics();

  // Animate transitions — toggle visibility class
  const [visible, setVisible] = useState(true);

  function animateToStep(next: number) {
    setVisible(false);
    setTimeout(() => {
      setStep(next);
      setError(null);
      setVisible(true);
    }, 180);
    // GA4 event
    trackEvent("trade_in_step", { step: next });
    // Dealer analytics platform
    track("trade_in", `step_${next}`, { step: next, make: data.make, year: data.year });
  }

  const step1Valid = !!data.year && !!data.make && !!data.model.trim();
  const step2Valid = !!data.mileage && !!data.condition;
  const step3Valid =
    !!data.accidentHistory && !!data.titleStatus && !!data.previousOwners;

  async function fetchEstimate() {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch("/api/trade-in/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: data.year,
          make: data.make,
          model: data.model,
          trim: data.trim,
          mileage: Number(data.mileage.replace(/\D/g, "")),
          condition: data.condition,
          accidentHistory: data.accidentHistory,
          titleStatus: data.titleStatus,
          previousOwners: data.previousOwners,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const result: EstimateResult = await res.json();
      setEstimate(result);
      trackEvent("trade_in_estimate_received", {
        make: data.make,
        year: Number(data.year),
        condition: data.condition,
        estimated_mid: result.estimatedMid,
      });
      // Dealer analytics platform tracking
      track("trade_in", "estimate_received", {
        make: data.make,
        year: data.year,
        condition: data.condition,
        estimatedMid: result.estimatedMid,
        estimatedLow: result.estimatedLow,
        estimatedHigh: result.estimatedHigh,
      });
      animateToStep(4);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to calculate your estimate. Please try again.",
      );
    } finally {
      setEstimating(false);
    }
  }

  async function handleSubmitLead() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/trade-in/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate_id: estimate?.id,
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
          vehicle: {
            year: data.year,
            make: data.make,
            model: data.model,
            trim: data.trim,
          },
          estimate_low: estimate?.estimatedLow,
          estimate_high: estimate?.estimatedHigh,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      setSubmitted(true);
      trackEvent("trade_in_lead_submitted", {
        make: data.make,
        year: Number(data.year),
        estimated_mid: estimate?.estimatedMid ?? 0,
      });
      // Dealer analytics platform — conversion event
      trackConversion("trade_in_lead", {
        make: data.make,
        year: data.year,
        model: data.model,
        condition: data.condition,
        estimatedMid: estimate?.estimatedMid,
        estimatedLow: estimate?.estimatedLow,
        estimatedHigh: estimate?.estimatedHigh,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to submit your claim. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function update(field: keyof WizardData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  const stepClass = `transition-all duration-200 ${
    visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
  }`;

  return (
    <section className="min-h-screen bg-gradient-to-br from-gray-50 to-brand-50/30 py-12">
      <div className="mx-auto max-w-2xl px-4">
        {/* Page header */}
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            Free Trade-In Estimate
          </div>
        </div>

        {/* Wizard card */}
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-lg">
          <div className="px-6 pt-6 sm:px-8">
            {step < 4 && <ProgressBar step={step} total={4} />}
          </div>

          <div className="px-6 pb-8 sm:px-8">
            {/* ---------------------------------------------------------------- */}
            {/* Step 1 — Your Vehicle                                            */}
            {/* ---------------------------------------------------------------- */}
            {step === 1 && (
              <div className={stepClass}>
                <h1 className="text-2xl font-bold text-gray-900">
                  What vehicle are you trading in?
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  We&apos;ll give you an instant offer based on real market data.
                </p>

                <div className="mt-6 space-y-4">
                  {/* Year */}
                  <div>
                    <label htmlFor="ti-year" className="block text-sm font-medium text-gray-700">
                      Year <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="ti-year"
                      value={data.year}
                      onChange={(e) => update("year", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      style={{ fontSize: 16 }}
                    >
                      <option value="">Select year</option>
                      {YEARS.map((y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Make */}
                  <div>
                    <label htmlFor="ti-make" className="block text-sm font-medium text-gray-700">
                      Make <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="ti-make"
                      value={data.make}
                      onChange={(e) => update("make", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      style={{ fontSize: 16 }}
                    >
                      <option value="">Select make</option>
                      {MAKES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model */}
                  <div>
                    <label htmlFor="ti-model" className="block text-sm font-medium text-gray-700">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ti-model"
                      type="text"
                      value={data.model}
                      onChange={(e) => update("model", e.target.value)}
                      placeholder="e.g. Camry, F-150, Civic"
                      className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      style={{ fontSize: 16 }}
                    />
                  </div>

                  {/* Trim */}
                  <div>
                    <label htmlFor="ti-trim" className="block text-sm font-medium text-gray-700">
                      Trim{" "}
                      <span className="text-xs font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      id="ti-trim"
                      type="text"
                      value={data.trim}
                      onChange={(e) => update("trim", e.target.value)}
                      placeholder="e.g. Sport, Limited, XLT"
                      className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      style={{ fontSize: 16 }}
                    />
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    disabled={!step1Valid}
                    onClick={() => animateToStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* Step 2 — Vehicle Details                                         */}
            {/* ---------------------------------------------------------------- */}
            {step === 2 && (
              <div className={stepClass}>
                <h1 className="text-2xl font-bold text-gray-900">
                  Tell us about your vehicle
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Accurate details get you the most accurate offer.
                </p>

                <div className="mt-6 space-y-6">
                  {/* Mileage */}
                  <div>
                    <label htmlFor="ti-mileage" className="block text-sm font-medium text-gray-700">
                      Mileage <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="ti-mileage"
                      type="text"
                      inputMode="numeric"
                      value={mileageDisplay}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setMileageDisplay(e.target.value.replace(/[^\d,]/g, ""));
                        update("mileage", raw);
                      }}
                      onBlur={() => {
                        if (data.mileage) {
                          setMileageDisplay(formatMileageDisplay(data.mileage));
                        }
                      }}
                      placeholder="e.g. 45,000"
                      className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      style={{ fontSize: 16 }}
                    />
                  </div>

                  {/* Condition */}
                  <div>
                    <p className="mb-3 block text-sm font-medium text-gray-700">
                      Condition <span className="text-red-500">*</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {CONDITIONS.map((c) => (
                        <CardButton
                          key={c.value}
                          selected={data.condition === c.value}
                          onClick={() => update("condition", c.value)}
                          label={c.label}
                          description={c.description}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => animateToStep(1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!step2Valid}
                    onClick={() => animateToStep(3)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* Step 3 — Vehicle History                                         */}
            {/* ---------------------------------------------------------------- */}
            {step === 3 && (
              <div className={stepClass}>
                <h1 className="text-2xl font-bold text-gray-900">
                  A little more about your vehicle
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  This helps us give you a fair and accurate offer.
                </p>

                <div className="mt-6 space-y-8">
                  {/* Accident History */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-gray-700">
                      Accident History <span className="text-red-500">*</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {ACCIDENT_OPTIONS.map((opt) => (
                        <CardButton
                          key={opt.value}
                          selected={data.accidentHistory === opt.value}
                          onClick={() => update("accidentHistory", opt.value)}
                          label={opt.label}
                          description={opt.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Title Status */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-gray-700">
                      Title Status <span className="text-red-500">*</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {TITLE_OPTIONS.map((opt) => (
                        <CardButton
                          key={opt.value}
                          selected={data.titleStatus === opt.value}
                          onClick={() => update("titleStatus", opt.value)}
                          label={opt.label}
                          description={opt.description}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Previous Owners */}
                  <div>
                    <p className="mb-3 text-sm font-medium text-gray-700">
                      Previous Owners <span className="text-red-500">*</span>
                    </p>
                    <div className="flex gap-3">
                      {OWNER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => update("previousOwners", opt.value)}
                          className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
                            data.previousOwners === opt.value
                              ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-300/40"
                              : "border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-gray-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && <InlineError message={error} />}

                <div className="mt-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => animateToStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                    </svg>
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!step3Valid || estimating}
                    onClick={fetchEstimate}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {estimating ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Calculating your offer...
                      </>
                    ) : (
                      <>
                        Get My Offer
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* Step 4 — Instant Offer + Lead Capture                           */}
            {/* ---------------------------------------------------------------- */}
            {step === 4 && estimate && (
              <div className={stepClass}>
                <div className="grid gap-10 lg:grid-cols-2">
                  {/* Offer panel */}
                  <div>
                    <p className="text-sm font-medium text-gray-500">Your vehicle is worth</p>
                    <p className="mt-2 bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-5xl">
                      {formatCurrency(estimate.estimatedLow)} – {formatCurrency(estimate.estimatedHigh)}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        Instant trade-in estimate
                      </span>
                      <span className="text-xs text-gray-400">Offer valid for 7 days</span>
                    </div>

                    {/* Vehicle summary */}
                    <div className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      <span className="font-semibold">{data.year} {data.make} {data.model}</span>
                      {data.trim && <span className="text-gray-500"> {data.trim}</span>}
                      <span className="mx-2 text-gray-300">·</span>
                      <span className="text-gray-500">{formatMileageDisplay(data.mileage)} mi</span>
                      <span className="mx-2 text-gray-300">·</span>
                      <span className="capitalize text-gray-500">{data.condition} condition</span>
                    </div>

                    {/* Collapsible factors */}
                    {estimate.factors && estimate.factors.length > 0 && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setFactorsOpen((o) => !o)}
                          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 focus:outline-none"
                        >
                          How we calculated this
                          <svg
                            className={`h-3.5 w-3.5 transition-transform ${factorsOpen ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        {factorsOpen && (
                          <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-xs">
                            {estimate.factors.map((f) => (
                              <div key={f.label} className="flex items-center justify-between px-3 py-2">
                                <span className="text-gray-600">{f.label}</span>
                                <span
                                  className={`font-semibold ${
                                    f.impact >= 0 ? "text-emerald-600" : "text-red-500"
                                  }`}
                                >
                                  {f.impact >= 0 ? "+" : ""}
                                  {formatCurrency(f.impact)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lead capture panel */}
                  <div>
                    {submitted ? (
                      <div className="flex flex-col items-center py-6 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                        </div>
                        <h2 className="mt-4 text-xl font-bold text-gray-900">You&apos;re all set!</h2>
                        <p className="mt-2 text-sm text-gray-500">
                          We&apos;ll be in touch within 24 hours to schedule your free appraisal.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                          <a
                            href="/inventory"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                          >
                            Browse Our Inventory
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                          </a>
                          <a
                            href="/contact"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                          >
                            Contact Us
                          </a>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-lg font-bold text-gray-900">Claim Your Offer</h2>
                        <p className="mt-1 text-sm text-gray-500">
                          Lock in this estimate and we&apos;ll schedule your free appraisal.
                        </p>

                        <div className="mt-4 space-y-3">
                          {/* First + Last name */}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor="ti-fname" className="block text-xs font-medium text-gray-700">
                                First Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                id="ti-fname"
                                type="text"
                                value={data.firstName}
                                onChange={(e) => update("firstName", e.target.value)}
                                autoComplete="given-name"
                                className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                style={{ fontSize: 16 }}
                              />
                            </div>
                            <div>
                              <label htmlFor="ti-lname" className="block text-xs font-medium text-gray-700">
                                Last Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                id="ti-lname"
                                type="text"
                                value={data.lastName}
                                onChange={(e) => update("lastName", e.target.value)}
                                autoComplete="family-name"
                                className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                style={{ fontSize: 16 }}
                              />
                            </div>
                          </div>

                          {/* Email */}
                          <div>
                            <label htmlFor="ti-email" className="block text-xs font-medium text-gray-700">
                              Email <span className="text-red-500">*</span>
                            </label>
                            <input
                              id="ti-email"
                              type="email"
                              value={data.email}
                              onChange={(e) => update("email", e.target.value)}
                              autoComplete="email"
                              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              style={{ fontSize: 16 }}
                            />
                          </div>

                          {/* Phone */}
                          <div>
                            <label htmlFor="ti-phone" className="block text-xs font-medium text-gray-700">
                              Phone{" "}
                              <span className="text-xs font-normal text-gray-400">(optional)</span>
                            </label>
                            <input
                              id="ti-phone"
                              type="tel"
                              value={data.phone}
                              onChange={(e) => update("phone", e.target.value)}
                              autoComplete="tel"
                              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              style={{ fontSize: 16 }}
                            />
                          </div>
                        </div>

                        {submitError && <InlineError message={submitError} />}

                        <button
                          type="button"
                          disabled={
                            submitting ||
                            !data.firstName.trim() ||
                            !data.lastName.trim() ||
                            !data.email.trim()
                          }
                          onClick={handleSubmitLead}
                          className="mt-5 w-full rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {submitting ? "Submitting..." : "Claim My Offer"}
                        </button>

                        <p className="mt-3 text-center text-xs text-gray-400">
                          No obligation. We respect your privacy.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trust badges */}
        {step < 4 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400">
            {[
              "No obligation, ever",
              "100% free estimate",
              "Takes under 2 minutes",
            ].map((badge) => (
              <span key={badge} className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
