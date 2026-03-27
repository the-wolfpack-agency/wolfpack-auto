"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EVRangeCalculatorProps {
  rangeMiles: number;
  chargeTimeL2Hours?: number | null;
  chargeTimeDCMinutes?: number | null;
  batteryKwh?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Average US residential electricity rate ($/kWh) as of 2024. */
const CENTS_PER_KWH = 0.16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EVRangeCalculator({
  rangeMiles,
  chargeTimeL2Hours,
  chargeTimeDCMinutes,
  batteryKwh,
}: EVRangeCalculatorProps) {
  const [dailyCommute, setDailyCommute] = useState<number>(30);

  const daysBetweenCharges =
    dailyCommute > 0 ? Math.floor(rangeMiles / dailyCommute) : 0;

  const chargeCost =
    batteryKwh != null && batteryKwh > 0
      ? roundTo(batteryKwh * CENTS_PER_KWH, 2)
      : null;

  return (
    <section
      aria-labelledby="ev-calc-heading"
      className="rounded-2xl border border-surface-border bg-white p-8 shadow-card"
    >
      <h2
        id="ev-calc-heading"
        className="flex items-center gap-2 text-xl font-bold text-gray-900"
      >
        <span aria-hidden="true">&#x26A1;</span>
        EV Range &amp; Charging
      </h2>

      {/* Range stat */}
      <div className="mt-6 flex items-center gap-4 rounded-xl bg-emerald-50 px-6 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-6 w-6 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Estimated Range
          </p>
          <p className="text-3xl font-bold text-emerald-800">
            {rangeMiles.toLocaleString()}{" "}
            <span className="text-lg font-normal">miles per charge</span>
          </p>
        </div>
      </div>

      {/* Daily commute calculator */}
      <div className="mt-6">
        <label
          htmlFor="ev-daily-commute"
          className="block text-sm font-semibold text-gray-700"
        >
          My daily commute
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="ev-daily-commute"
            type="number"
            min={1}
            max={rangeMiles}
            value={dailyCommute}
            onChange={(e) =>
              setDailyCommute(Math.max(1, Number(e.target.value)))
            }
            className="w-24 rounded-lg border border-surface-border px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            aria-label="Daily commute in miles"
          />
          <span className="text-sm text-gray-500">miles/day</span>
        </div>

        {dailyCommute > 0 && (
          <p className="mt-3 text-sm text-gray-700">
            {daysBetweenCharges > 0 ? (
              <>
                You can drive{" "}
                <span className="font-bold text-brand-700">
                  {daysBetweenCharges} day
                  {daysBetweenCharges !== 1 ? "s" : ""}
                </span>{" "}
                between charges on your commute.
              </>
            ) : (
              <>
                Your commute exceeds the vehicle&apos;s single-charge range.
                You will need to charge daily.
              </>
            )}
          </p>
        )}
      </div>

      {/* Charging times */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {chargeTimeL2Hours != null && chargeTimeL2Hours > 0 && (
          <div className="rounded-xl border border-surface-border bg-surface-muted px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              L2 Home Charger
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {chargeTimeL2Hours}{" "}
              <span className="text-base font-normal text-gray-500">hrs</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Typical 240V Level 2 outlet
            </p>
          </div>
        )}

        {chargeTimeDCMinutes != null && chargeTimeDCMinutes > 0 && (
          <div className="rounded-xl border border-surface-border bg-surface-muted px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              DC Fast Charge
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {chargeTimeDCMinutes}{" "}
              <span className="text-base font-normal text-gray-500">min</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              10&ndash;80% at a public fast charger
            </p>
          </div>
        )}
      </div>

      {/* Cost to charge */}
      {chargeCost !== null && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
          <svg
            className="h-5 w-5 shrink-0 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-blue-800">
            <span className="font-bold">${chargeCost.toFixed(2)}</span> to
            fully charge at home{" "}
            <span className="text-blue-600">
              (at $0.16/kWh avg. residential rate)
            </span>
          </p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        Range estimates based on manufacturer EPA ratings. Actual range varies
        with driving conditions, temperature, and charging habits.
      </p>
    </section>
  );
}
