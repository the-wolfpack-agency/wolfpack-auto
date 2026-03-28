"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SaleEntry {
  id: string;
  date: string;
  vehicle: string;
  customer_name: string;
  sale_price: number;
  front_gross: number;
  back_gross: number;
  fi_gross: number;
  total_gross: number;
  salesperson: string;
  deal_type: string;
}

interface AccountingSummary {
  period: string;
  units_sold: number;
  total_revenue: number;
  total_front_gross: number;
  total_back_gross: number;
  total_fi_gross: number;
  total_gross: number;
  avg_front_gross: number;
  avg_back_gross: number;
  avg_fi_gross: number;
  avg_deal_gross: number;
  top_salesperson: { name: string; units: number; gross: number } | null;
  by_salesperson: { name: string; units: number; total_gross: number }[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    opts.push({ value: val, label });
  }
  return opts;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AccountingDashboard() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = `${month}-01`;
      const toDate = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0);
      const to = `${month}-${String(toDate.getDate()).padStart(2, "0")}`;

      const [salesRes, summaryRes] = await Promise.all([
        fetch(`/api/admin/accounting/sales-log?from=${from}&to=${to}`),
        fetch(`/api/admin/accounting/summary?month=${month}`),
      ]);
      const salesData = await salesRes.json();
      const summaryData = await summaryRes.json();
      setSales(salesData.sales ?? []);
      setSummary(summaryData.summary ?? null);
    } catch {
      setError("Failed to load accounting data.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const monthOptions = getMonthOptions();

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Accounting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track sales, gross profit, and deal performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <a
            href="/admin/accounting/commissions"
            className="rounded-lg border border-brand-600 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            Commissions
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* MTD Stats */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Units Sold</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">{summary.units_sold}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Front Gross</p>
            <p className="mt-0.5 text-2xl font-bold text-green-600">{usd(summary.total_front_gross)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Back Gross</p>
            <p className="mt-0.5 text-2xl font-bold text-blue-600">{usd(summary.total_back_gross)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total F&I</p>
            <p className="mt-0.5 text-2xl font-bold text-purple-600">{usd(summary.total_fi_gross)}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-brand-700">Avg Deal Gross</p>
            <p className="mt-0.5 text-2xl font-bold text-brand-700">{usd(summary.avg_deal_gross)}</p>
          </div>
        </div>
      )}

      {/* Top Salesperson + Breakdown */}
      {summary && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {summary.top_salesperson && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-medium text-emerald-700">Top Salesperson</p>
              <p className="mt-1 text-lg font-bold text-emerald-800">{summary.top_salesperson.name}</p>
              <p className="text-sm text-emerald-600">
                {summary.top_salesperson.units} units &middot; {usd(summary.top_salesperson.gross)} gross
              </p>
            </div>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 mb-2">By Salesperson</p>
            <div className="space-y-2">
              {summary.by_salesperson.map((sp) => (
                <div key={sp.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{sp.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{sp.units} units</span>
                    <span className="text-sm font-semibold text-gray-900">{usd(sp.total_gross)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sales Log Table */}
      <h2 className="mb-3 text-base font-semibold text-gray-800">Daily Sales Log</h2>
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : sales.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No sales recorded for this period.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Sale Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Front</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Back</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">F&I</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Gross</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">Salesperson</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(sale.date)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{sale.vehicle}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{sale.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right hidden md:table-cell">{usd(sale.sale_price)}</td>
                  <td className="px-4 py-3 text-sm text-green-600 text-right hidden md:table-cell">{usd(sale.front_gross)}</td>
                  <td className="px-4 py-3 text-sm text-blue-600 text-right hidden lg:table-cell">{usd(sale.back_gross)}</td>
                  <td className="px-4 py-3 text-sm text-purple-600 text-right hidden lg:table-cell">{usd(sale.fi_gross)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{usd(sale.total_gross)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden xl:table-cell">{sale.salesperson}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-3 text-sm font-bold text-gray-900" colSpan={3}>
                  Total ({sales.length} deals)
                </td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right hidden md:table-cell">
                  {usd(sales.reduce((s, r) => s + r.sale_price, 0))}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-green-600 text-right hidden md:table-cell">
                  {usd(sales.reduce((s, r) => s + r.front_gross, 0))}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right hidden lg:table-cell">
                  {usd(sales.reduce((s, r) => s + r.back_gross, 0))}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-purple-600 text-right hidden lg:table-cell">
                  {usd(sales.reduce((s, r) => s + r.fi_gross, 0))}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-brand-700 text-right">
                  {usd(sales.reduce((s, r) => s + r.total_gross, 0))}
                </td>
                <td className="hidden xl:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
