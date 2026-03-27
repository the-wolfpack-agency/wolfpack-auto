"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAnalytics } from "@/components/EventCollector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalcMode = "loan" | "lease";

interface PaymentCalculatorProps {
  /** Vehicle sticker/sale price, pre-filled from VDP. */
  vehiclePrice: number;
  /** Optional MSRP — used as residual base for lease calc. */
  msrp?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERM_OPTIONS = [24, 36, 48, 60, 72, 84] as const;

const DEFAULT_APR = 6.9;
const DEFAULT_DOWN = 0;
const DEFAULT_TRADE = 0;
const DEFAULT_TERM = 60;

/** Lease residual percentages by term (industry averages). */
const RESIDUAL_PCT: Record<number, number> = {
  24: 0.62,
  36: 0.55,
  48: 0.48,
  60: 0.42,
  72: 0.36,
  84: 0.30,
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/**
 * Standard amortisation formula:
 *   M = P * r / (1 - (1+r)^-n)
 * where P = principal, r = monthly rate, n = months.
 */
function loanPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Lease payment:
 *   depreciation  = (capCost - residual) / months
 *   financeCharge = (capCost + residual) * moneyFactor
 *   monthly       = depreciation + financeCharge
 */
function leasePayment(
  capCost: number,
  residualValue: number,
  moneyFactor: number,
  months: number,
): number {
  if (capCost <= 0 || months <= 0) return 0;
  const depreciation = (capCost - residualValue) / months;
  const financeCharge = (capCost + residualValue) * moneyFactor;
  return depreciation + financeCharge;
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

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentCalculator({
  vehiclePrice,
  msrp,
}: PaymentCalculatorProps) {
  const { track } = useAnalytics();
  const [mode, setMode] = useState<CalcMode>("loan");
  const [downPayment, setDownPayment] = useState(DEFAULT_DOWN);
  const [tradeIn, setTradeIn] = useState(DEFAULT_TRADE);
  const [apr, setApr] = useState(DEFAULT_APR);
  const [term, setTerm] = useState(DEFAULT_TERM);
  const interactionCount = useRef(0);
  const lastEmit = useRef(0);

  const maxDown = vehiclePrice;

  // Track calculator interactions (debounced — emit after user settles)
  useEffect(() => {
    interactionCount.current++;
    const now = Date.now();
    // Only emit every 3 seconds to avoid flooding
    if (now - lastEmit.current < 3000) return;
    lastEmit.current = now;

    const principal = Math.max(vehiclePrice - downPayment - tradeIn, 0);
    const monthly = loanPayment(principal, apr, term);

    track("calculator_input", "calc_interaction", {
      mode,
      vehicle_price: vehiclePrice,
      // Privacy-safe ranges, not exact values
      down_payment_range: downPayment < 1000 ? "under_1K" : downPayment < 5000 ? "1K_5K" : downPayment < 10000 ? "5K_10K" : downPayment < 20000 ? "10K_20K" : "20K_plus",
      trade_in_range: tradeIn < 1000 ? "under_1K" : tradeIn < 5000 ? "1K_5K" : tradeIn < 10000 ? "5K_10K" : "10K_plus",
      term_months: term,
      target_monthly_range: monthly < 300 ? "under_300" : monthly < 500 ? "300_500" : monthly < 700 ? "500_700" : monthly < 1000 ? "700_1000" : "1000_plus",
      interaction_count: interactionCount.current,
    });
  }, [mode, downPayment, tradeIn, apr, term, vehiclePrice, track]);

  // Loan calculation
  const loanResult = useMemo(() => {
    const principal = Math.max(vehiclePrice - downPayment - tradeIn, 0);
    const monthly = loanPayment(principal, apr, term);
    const totalCost = monthly * term;
    const totalInterest = totalCost - principal;
    return { monthly, totalCost, totalInterest, principal };
  }, [vehiclePrice, downPayment, tradeIn, apr, term]);

  // Lease calculation
  const leaseResult = useMemo(() => {
    const basePrice = msrp ?? vehiclePrice;
    const capCost = Math.max(vehiclePrice - downPayment - tradeIn, 0);
    const residualPct = RESIDUAL_PCT[term] ?? 0.50;
    const residualValue = basePrice * residualPct;
    const moneyFactor = apr / 100 / 24; // APR to money factor
    const monthly = leasePayment(capCost, residualValue, moneyFactor, term);
    const totalCost = monthly * term + downPayment + tradeIn;
    return { monthly, totalCost, residualValue, capCost };
  }, [vehiclePrice, msrp, downPayment, tradeIn, apr, term]);

  const result = mode === "loan" ? loanResult : leaseResult;

  const handleDownChange = useCallback((v: number) => {
    setDownPayment(Math.max(0, Math.min(v, maxDown)));
  }, [maxDown]);

  const handleTradeChange = useCallback((v: number) => {
    setTradeIn(Math.max(0, v));
  }, []);

  return (
    <div className="rounded-card border border-surface-border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900">Payment Calculator</h2>

      {/* Mode toggle */}
      <div className="mt-4 flex rounded-lg bg-surface-subtle p-1" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "loan"}
          onClick={() => setMode("loan")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "loan"
              ? "bg-white text-brand-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Finance
        </button>
        <button
          role="tab"
          aria-selected={mode === "lease"}
          onClick={() => setMode("lease")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "lease"
              ? "bg-white text-brand-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Lease
        </button>
      </div>

      {/* Estimated monthly */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">Estimated Monthly Payment</p>
        <p className="mt-1 text-4xl font-bold text-brand-700">
          {fmtDecimal(result.monthly)}
          <span className="text-lg font-normal text-gray-400">/mo</span>
        </p>
      </div>

      {/* Inputs */}
      <div className="mt-6 space-y-5">
        {/* Vehicle price (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Vehicle Price
          </label>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {fmt(vehiclePrice)}
          </p>
        </div>

        {/* Down payment */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="calc-down-payment"
              className="text-sm font-medium text-gray-700"
            >
              Down Payment
            </label>
            <span className="text-sm font-semibold text-gray-900">
              {fmt(downPayment)}
            </span>
          </div>
          <input
            id="calc-down-payment"
            type="range"
            min={0}
            max={maxDown}
            step={500}
            value={downPayment}
            onChange={(e) => handleDownChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={maxDown}
            aria-valuenow={downPayment}
            aria-label="Down payment amount"
            className="mt-2 w-full accent-brand-600"
          />
        </div>

        {/* Trade-in value */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="calc-trade-in"
              className="text-sm font-medium text-gray-700"
            >
              Trade-In Value
            </label>
            <span className="text-sm font-semibold text-gray-900">
              {fmt(tradeIn)}
            </span>
          </div>
          <input
            id="calc-trade-in"
            type="range"
            min={0}
            max={Math.round(vehiclePrice * 0.6)}
            step={500}
            value={tradeIn}
            onChange={(e) => handleTradeChange(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={Math.round(vehiclePrice * 0.6)}
            aria-valuenow={tradeIn}
            aria-label="Trade-in value"
            className="mt-2 w-full accent-brand-600"
          />
        </div>

        {/* APR */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="calc-apr"
              className="text-sm font-medium text-gray-700"
            >
              {mode === "loan" ? "APR" : "Money Factor (as APR)"}
            </label>
            <span className="text-sm font-semibold text-gray-900">
              {apr.toFixed(1)}%
            </span>
          </div>
          <input
            id="calc-apr"
            type="range"
            min={0}
            max={18}
            step={0.1}
            value={apr}
            onChange={(e) => setApr(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={18}
            aria-valuenow={apr}
            aria-label="Annual percentage rate"
            className="mt-2 w-full accent-brand-600"
          />
        </div>

        {/* Term */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Term (months)
          </label>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TERM_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTerm(t)}
                aria-pressed={term === t}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  term === t
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-surface-border text-gray-600 hover:border-gray-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <dl className="mt-6 divide-y divide-surface-border text-sm">
        {mode === "loan" ? (
          <>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Loan Amount</dt>
              <dd className="font-medium text-gray-900">{fmt(loanResult.principal)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Total Interest</dt>
              <dd className="font-medium text-gray-900">
                {fmt(loanResult.totalInterest)}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Total Cost</dt>
              <dd className="font-medium text-gray-900">{fmt(loanResult.totalCost)}</dd>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Capitalized Cost</dt>
              <dd className="font-medium text-gray-900">{fmt(leaseResult.capCost)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Residual Value</dt>
              <dd className="font-medium text-gray-900">
                {fmt(leaseResult.residualValue)}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Total Lease Cost</dt>
              <dd className="font-medium text-gray-900">{fmt(leaseResult.totalCost)}</dd>
            </div>
          </>
        )}
      </dl>

      {/* Regulation Z Truth-in-Lending disclosure */}
      <p className="mt-6 text-xs leading-relaxed text-gray-400">
        This calculator provides estimates only. Actual terms, including APR,
        monthly payment, and total cost, may vary based on creditworthiness,
        vehicle selection, and dealer participation. APR is based on
        creditworthiness and may differ from the rate shown. Lease payments
        assume a closed-end lease with the residual value shown. Taxes, title,
        registration, and dealer fees are not included. See dealer for complete
        financing details and eligibility requirements. Not all buyers will
        qualify for all rates or terms.
      </p>
    </div>
  );
}
