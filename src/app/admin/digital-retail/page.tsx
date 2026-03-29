"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CreditApp {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  annual_income: number;
  employment_status: string;
  vehicle_interest: string;
  co_applicant: boolean;
  status: "submitted" | "reviewing" | "approved" | "declined";
  submitted_at: string;
}

interface CalcResult {
  deal_type: string;
  monthly_payment: number;
  term_months: number;
  apr: number;
  amount_financed?: number;
  total_interest?: number;
  total_cost: number;
  sales_tax: number;
  residual_value?: number;
  due_at_signing?: number;
}

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  reviewing: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function DigitalRetailPage() {
  const [apps, setApps] = useState<CreditApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculator state
  const [calcType, setCalcType] = useState<"retail" | "lease">("retail");
  const [price, setPrice] = useState(35000);
  const [down, setDown] = useState(3000);
  const [tradeVal, setTradeVal] = useState(0);
  const [tradePayoff, setTradePayoff] = useState(0);
  const [apr, setApr] = useState(5.9);
  const [term, setTerm] = useState(60);
  const [residualPct, setResidualPct] = useState(55);
  const [taxRate, setTaxRate] = useState(7.0);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/digital-retail/credit-app");
      if (res.ok) {
        const data = await res.json();
        setApps(data.applications ?? []);
      }
    } catch {
      setError("Failed to load credit applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const calculate = async () => {
    setCalculating(true);
    try {
      const res = await fetch("/api/admin/digital-retail/calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_price: price,
          down_payment: down,
          trade_value: tradeVal,
          trade_payoff: tradePayoff,
          apr,
          term_months: term,
          deal_type: calcType,
          residual_pct: residualPct,
          tax_rate: taxRate,
        }),
      });
      if (res.ok) {
        setCalcResult(await res.json());
      }
    } finally {
      setCalculating(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Digital Retailing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Payment calculator, credit applications, and online purchase tools.
        </p>
      </div>

      {/* Payment Calculator */}
      <div className="mb-8 overflow-hidden rounded-card border border-surface-border bg-white px-4 py-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment Calculator</h2>

        {/* Type tabs */}
        <div className="mb-4 flex gap-2">
          {(["retail", "lease"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setCalcType(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                calcType === t
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t === "retail" ? "Finance" : "Lease"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Vehicle Price</label>
            <input type="number" value={price} onChange={(e) => setPrice(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Down Payment</label>
            <input type="number" value={down} onChange={(e) => setDown(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Trade-In Value</label>
            <input type="number" value={tradeVal} onChange={(e) => setTradeVal(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Trade Payoff</label>
            <input type="number" value={tradePayoff} onChange={(e) => setTradePayoff(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">APR (%)</label>
            <input type="number" step="0.1" value={apr} onChange={(e) => setApr(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Term (months)</label>
            <select value={term} onChange={(e) => setTerm(+e.target.value)}
              className="w-full min-w-0 appearance-none rounded-lg border border-gray-300 bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat px-3 py-2 pr-8 text-sm">
              {[24, 36, 48, 60, 72, 84].map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tax Rate (%)</label>
            <input type="number" step="0.1" value={taxRate} onChange={(e) => setTaxRate(+e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          {calcType === "lease" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Residual (%)</label>
              <input type="number" step="1" value={residualPct} onChange={(e) => setResidualPct(+e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <button
          onClick={calculate}
          disabled={calculating}
          className="mt-4 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {calculating ? "Calculating..." : "Calculate Payment"}
        </button>

        {calcResult && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Estimated Monthly Payment</p>
              <p className="text-3xl font-bold text-brand-700">
                {fmt(calcResult.monthly_payment)}<span className="text-base font-normal text-gray-500">/mo</span>
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {calcResult.amount_financed != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Financed</p>
                  <p className="font-medium">{fmt(calcResult.amount_financed)}</p>
                </div>
              )}
              {calcResult.total_interest != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total Interest</p>
                  <p className="font-medium">{fmt(calcResult.total_interest)}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs text-gray-500">Sales Tax</p>
                <p className="font-medium">{fmt(calcResult.sales_tax)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Cost</p>
                <p className="font-medium">{fmt(calcResult.total_cost)}</p>
              </div>
              {calcResult.residual_value != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Residual</p>
                  <p className="font-medium">{fmt(calcResult.residual_value)}</p>
                </div>
              )}
              {calcResult.due_at_signing != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Due at Signing</p>
                  <p className="font-medium">{fmt(calcResult.due_at_signing)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Credit Applications */}
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="border-b border-surface-border px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-gray-900">Credit Applications</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? "Loading..." : `${apps.length} application${apps.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-surface-border text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Applicant</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 sm:table-cell">Vehicle Interest</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 md:table-cell">Income</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 sm:table-cell">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {apps.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No credit applications yet.
                  </td>
                </tr>
              ) : (
                apps.map((app) => (
                  <tr key={app.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{app.first_name} {app.last_name}</p>
                      <p className="text-xs text-gray-500">{app.email}</p>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-700 sm:table-cell">
                      {app.vehicle_interest}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-700 md:table-cell">
                      {fmt(app.annual_income)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[app.status] ?? ""}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 sm:table-cell">
                      {new Date(app.submitted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
