"use client";

import { useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/components/EventCollector";

export interface CalcVehicle {
  label: string;
  price: number;
  msrp: number | null;
}

const DEFAULT_APR = 6.9;
const TERMS = [24, 36, 48, 60, 72, 84];

function loanPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Homepage "Payment Calculator." section (V_01): dark, with a vehicle selector
 * on the left and a dark calculator card (vehicle toggle + Vehicle Price / Down
 * Payment / Loan Term sliders + live monthly estimate) on the right. Real
 * amortisation math; every preset price is a live featured vehicle.
 */
export default function PaymentCalculatorSection({
  vehicles,
}: {
  vehicles: CalcVehicle[];
}) {
  const { track } = useAnalytics();
  const presets = vehicles.length
    ? vehicles
    : [{ label: "Sample vehicle", price: 45_000, msrp: null }];

  const [idx, setIdx] = useState(0);
  const active = presets[Math.min(idx, presets.length - 1)];
  const [price, setPrice] = useState(active.price);
  const [down, setDown] = useState(() => Math.round(active.price * 0.1));
  const [term, setTerm] = useState(60);
  const lastEmit = useRef(0);

  // Reset price/down when the selected vehicle changes.
  useEffect(() => {
    setPrice(active.price);
    setDown(Math.round(active.price * 0.1));
  }, [active.price]);

  const monthly = loanPayment(Math.max(price - down, 0), DEFAULT_APR, term);

  // Throttled analytics (privacy-safe ranges, not exact values).
  useEffect(() => {
    const now = Date.now();
    if (now - lastEmit.current < 2500) return;
    lastEmit.current = now;
    track("calculator_input", "calc_interaction", {
      vehicle: active.label,
      term_months: term,
      target_monthly_range:
        monthly < 300 ? "under_300" : monthly < 500 ? "300_500" : monthly < 700 ? "500_700" : monthly < 1000 ? "700_1000" : "1000_plus",
    });
  }, [price, down, term, active.label, monthly, track]);

  const maxPrice = Math.round(active.price * 1.5);

  return (
    <section aria-labelledby="calculator-heading" className="bg-brand-950 py-16 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        {/* Left: copy + vehicle selector */}
        <div>
          <h2 id="calculator-heading" className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Payment Calculator.
          </h2>
          <p className="mt-5 text-xl font-semibold text-white">
            Know your number before you visit.
          </p>
          <p className="mt-4 max-w-md text-brand-300">
            Every listing includes a live monthly payment estimate, a feature
            borrowed from the top-converting dealer platforms, not a static
            price tag.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {presets.map((v, i) => (
              <button
                key={v.label}
                type="button"
                onClick={() => setIdx(i)}
                aria-pressed={i === idx}
                data-track="calc_preset_select"
                className={`flex w-32 flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors ${
                  i === idx
                    ? "border-white bg-white text-brand-950"
                    : "border-brand-700 bg-brand-900 text-brand-200 hover:border-brand-500"
                }`}
              >
                <svg className="h-10 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 13l2-5a2 2 0 011.9-1.4h10.2A2 2 0 0119 8l2 5m-18 0h18m-18 0v4a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-4M6.5 16.5h.01M17.5 16.5h.01" />
                </svg>
                <span className="text-sm font-semibold">{v.label}</span>
              </button>
            ))}
            <a
              href="/inventory"
              data-track="calc_add_vehicle"
              className="flex w-32 items-center justify-center rounded-2xl border border-brand-700 bg-brand-900 p-4 text-3xl font-light text-brand-400 transition-colors hover:border-brand-500 hover:text-white"
              aria-label="Add a vehicle"
            >
              +
            </a>
          </div>
        </div>

        {/* Right: calculator card */}
        <div className="rounded-card bg-brand-900 p-6 sm:p-8">
          {/* Vehicle toggle */}
          {presets.length > 1 && (
            <div className="flex rounded-full bg-brand-950 p-1" role="tablist">
              {presets.map((v, i) => (
                <button
                  key={v.label}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  onClick={() => setIdx(i)}
                  className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    i === idx ? "bg-white text-brand-950" : "text-brand-400 hover:text-white"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 space-y-7">
            <Slider
              label="Vehicle Price"
              value={fmt(price)}
              min={0}
              max={maxPrice}
              step={500}
              current={price}
              onChange={setPrice}
            />
            <Slider
              label="Down Payment"
              value={fmt(down)}
              min={0}
              max={price}
              step={500}
              current={down}
              onChange={(v) => setDown(Math.min(v, price))}
            />
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Loan Term</span>
                <span className="text-sm font-semibold text-white">{term} Months</span>
              </div>
              <input
                type="range"
                min={0}
                max={TERMS.length - 1}
                step={1}
                value={TERMS.indexOf(term)}
                onChange={(e) => setTerm(TERMS[Number(e.target.value)])}
                aria-label="Loan term in months"
                className="mt-3 w-full accent-white"
              />
            </div>
          </div>

          <p className="mt-8 text-4xl font-bold text-white">
            {fmt(monthly)}
            <span className="text-xl font-normal text-brand-400">/mo</span>
          </p>
          <p className="mt-2 text-xs text-brand-500">
            Estimate only, final rate subject to credit approval
          </p>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">{label}</span>
        <span className="text-sm font-semibold text-white">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-3 w-full accent-white"
      />
    </div>
  );
}
