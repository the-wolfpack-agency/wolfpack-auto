"use client";

import { useState } from "react";
import PaymentCalculator from "@/components/PaymentCalculator";

export interface CalcVehicle {
  label: string;
  price: number;
  msrp: number | null;
}

/**
 * Homepage "Payment Calculator" section (dark). Reuses the existing
 * <PaymentCalculator/> (real amortisation + analytics) and lets the visitor
 * switch it between real featured vehicles - so every preset price is a live
 * listing, never a made-up number. Also carries the financing CTA.
 */
export default function PaymentCalculatorSection({
  vehicles,
}: {
  vehicles: CalcVehicle[];
}) {
  const presets = vehicles.length
    ? vehicles
    : [{ label: "Sample vehicle", price: 45_000, msrp: null }];
  const [idx, setIdx] = useState(0);
  const active = presets[Math.min(idx, presets.length - 1)];

  return (
    <section
      aria-labelledby="calculator-heading"
      className="bg-brand-950 py-16 sm:py-24"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <div>
          <h2
            id="calculator-heading"
            className="text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            Payment Calculator.
          </h2>
          <p className="mt-4 max-w-md text-brand-300">
            Know your monthly payment before you visit. Every listing shows a
            live monthly estimate - a feature borrowed from the top-converting
            dealer platforms, not a static price tag.
          </p>

          {presets.length > 1 && (
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
                Try it on a featured vehicle
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.map((v, i) => (
                  <button
                    key={v.label}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-pressed={i === idx}
                    data-track="calc_preset_select"
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      i === idx
                        ? "border-white bg-white text-brand-950"
                        : "border-brand-700 text-brand-200 hover:border-brand-400"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <a
            href="/financing"
            data-track="calc_check_rate"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-200"
          >
            Check Your Rate
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        <div>
          <PaymentCalculator vehiclePrice={active.price} msrp={active.msrp} />
        </div>
      </div>
    </section>
  );
}
