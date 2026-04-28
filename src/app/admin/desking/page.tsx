"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FiProduct {
  id: string;
  name: string;
  cost: number;
  price: number;
  profit: number;
  selected: boolean;
}

interface DeskingDeal {
  id: string;
  vehicle: string;
  customer_name: string;
  selling_price: number;
  trade_value: number;
  down_payment: number;
  term: number;
  apr: number;
  monthly_payment: number;
  front_gross: number;
  back_gross: number;
  total_gross: number;
  fi_per_copy: number;
  fi_products: FiProduct[];
  created_at: string;
}

interface PaymentScenario {
  term: number;
  monthly_payment: number;
  total_interest: number;
  total_cost: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function usdWhole(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  months: number
): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function calcScenarios(
  amountFinanced: number,
  apr: number
): PaymentScenario[] {
  const terms = [36, 48, 60, 72, 84];
  return terms.map((term) => {
    const monthly = calcMonthlyPayment(amountFinanced, apr, term);
    const totalCost = monthly * term;
    return {
      term,
      monthly_payment: monthly,
      total_interest: totalCost - amountFinanced,
      total_cost: totalCost,
    };
  });
}

const DEFAULT_FI_PRODUCTS: FiProduct[] = [
  { id: "warranty", name: "Extended Warranty", cost: 400, price: 1895, profit: 1495, selected: false },
  { id: "gap", name: "GAP Insurance", cost: 150, price: 895, profit: 745, selected: false },
  { id: "paint", name: "Paint Protection", cost: 100, price: 695, profit: 595, selected: false },
  { id: "theft", name: "Theft Deterrent", cost: 50, price: 399, profit: 349, selected: false },
  { id: "tire", name: "Tire & Wheel Protection", cost: 120, price: 795, profit: 675, selected: false },
  { id: "maint", name: "Prepaid Maintenance", cost: 200, price: 995, profit: 795, selected: false },
  { id: "key", name: "Key Replacement", cost: 30, price: 299, profit: 269, selected: false },
  { id: "dent", name: "Dent Protection", cost: 80, price: 595, profit: 515, selected: false },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DeskingPage() {
  /* Form state */
  const [sellingPrice, setSellingPrice] = useState(35000);
  const [tradeIn, setTradeIn] = useState(10000);
  const [downPayment, setDownPayment] = useState(2000);
  const [term, setTerm] = useState(60);
  const [apr, setApr] = useState(6.9);
  const [fiProducts, setFiProducts] = useState<FiProduct[]>(DEFAULT_FI_PRODUCTS);

  /* Saved deals */
  const [deals, setDeals] = useState<DeskingDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* Derived calculations */
  const fiTotal = fiProducts.filter((p) => p.selected).reduce((s, p) => s + p.price, 0);
  const fiProfit = fiProducts.filter((p) => p.selected).reduce((s, p) => s + p.profit, 0);
  const amountFinanced = Math.max(0, sellingPrice - tradeIn - downPayment + fiTotal);
  const monthlyPayment = calcMonthlyPayment(amountFinanced, apr, term);
  const frontGross = sellingPrice - (sellingPrice * 0.85); // Assume 85% cost basis
  const backGross = fiProfit;
  const totalGross = frontGross + backGross;
  const fiPerCopy = fiProfit;
  const scenarios = calcScenarios(amountFinanced, apr);

  /* Data fetching */
  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/desking");
      const data = await res.json();
      setDeals(data.deals ?? []);
    } catch {
      setError("Failed to load desking deals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const handleSaveDeal = async () => {
    setSaving(true);
    setSuccessMsg("");
    setError("");
    try {
      const res = await fetch("/api/admin/desking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* The API expects `{ deal: { selling_price, ... }, fi_products: [...] }`.
           Wrapping the financial fields under `deal` and lifting
           `fi_products` to a sibling matches the route handler's
           contract (returned 400 "deal with selling_price is required"
           when sent flat). */
        body: JSON.stringify({
          deal: {
            selling_price: sellingPrice,
            trade_value: tradeIn,
            down_payment: downPayment,
            term,
            apr,
            monthly_payment: monthlyPayment,
            front_gross: frontGross,
            back_gross: backGross,
            total_gross: totalGross,
            fi_per_copy: fiPerCopy,
          },
          fi_products: fiProducts.filter((p) => p.selected).map((p) => ({
            id: p.id,
            name: p.name,
            cost: p.cost,
            price: p.price,
            profit: p.profit,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.cause ?? `Save failed (${res.status})`);
      }
      setSuccessMsg("Deal saved successfully.");
      void loadDeals();
    } catch (err) {
      setError(`Failed to save deal: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleFiProduct = (id: string) => {
    setFiProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  return (
    <div data-testid="desking-page">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">F&I Desking Workspace</h1>
          <p className="mt-1 text-sm text-gray-500">
            Calculate payments, compare scenarios, and build F&I menus.
          </p>
        </div>
        <button
          onClick={handleSaveDeal}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Deal"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Deal Calculator */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Deal Calculator</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Selling Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Trade-In Value
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  value={tradeIn}
                  onChange={(e) => setTradeIn(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Down Payment
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                APR (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={apr}
                onChange={(e) => setApr(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Term (months)
              </label>
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value={36}>36 months</option>
                <option value={48}>48 months</option>
                <option value={60}>60 months</option>
                <option value={72}>72 months</option>
                <option value={84}>84 months</option>
              </select>
            </div>
          </div>

          {/* Live Payment */}
          <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-brand-700">Monthly Payment</p>
                <p className="mt-0.5 text-3xl font-bold text-brand-700">
                  {usd(monthlyPayment)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500">Amount Financed</p>
                <p className="mt-0.5 text-lg font-semibold text-gray-900">
                  {usdWhole(amountFinanced)}
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span>{term} mo @ {apr}% APR</span>
              <span>F&I Products: {usdWhole(fiTotal)}</span>
            </div>
          </div>
        </div>

        {/* Profit Analysis */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Profit Analysis</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs font-medium text-green-700">Front Gross</p>
              <p className="mt-0.5 text-2xl font-bold text-green-700">{usdWhole(frontGross)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-medium text-blue-700">Back Gross</p>
              <p className="mt-0.5 text-2xl font-bold text-blue-700">{usdWhole(backGross)}</p>
            </div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
              <p className="text-xs font-medium text-brand-700">Total Gross</p>
              <p className="mt-0.5 text-2xl font-bold text-brand-700">{usdWhole(totalGross)}</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
              <p className="text-xs font-medium text-purple-700">F&I Per Copy</p>
              <p className="mt-0.5 text-2xl font-bold text-purple-700">{usdWhole(fiPerCopy)}</p>
            </div>
          </div>

          {/* F&I Product Menu */}
          <h3 className="mb-3 mt-5 text-sm font-semibold text-gray-700">F&I Product Menu</h3>
          <div className="space-y-2">
            {fiProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => toggleFiProduct(product.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  product.selected
                    ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      product.selected
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {product.selected && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      Cost: {usd(product.cost)} &middot; Sell: {usd(product.price)}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${product.selected ? "text-green-600" : "text-gray-400"}`}>
                  +{usdWhole(product.profit)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-sm font-medium text-gray-600">
              {fiProducts.filter((p) => p.selected).length} products selected
            </span>
            <span className="text-sm font-bold text-green-600">
              Total profit: {usdWhole(fiProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Scenarios Table */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Payment Scenarios</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Term</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Monthly Payment</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                  Total Interest
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scenarios.map((s) => (
                <tr
                  key={s.term}
                  className={`hover:bg-gray-50 ${s.term === term ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : ""}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {s.term} months
                    {s.term === term && (
                      <span className="ml-2 inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        Selected
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    {usd(s.monthly_payment)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-red-600 hidden sm:table-cell">
                    {usd(s.total_interest)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 hidden md:table-cell">
                    {usd(s.total_cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Desking Deals */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Recent Desking Deals</h2>
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading deals...</div>
        ) : deals.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-400">No desking deals saved yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Configure a deal above and click Save Deal to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Selling Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">Payment</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden md:table-cell">Front</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden md:table-cell">Back</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Total Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(deal.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {usdWhole(deal.selling_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 hidden sm:table-cell">
                      {usd(deal.monthly_payment)}/mo
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 hidden md:table-cell">
                      {usdWhole(deal.front_gross)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-blue-600 hidden md:table-cell">
                      {usdWhole(deal.back_gross)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                      {usdWhole(deal.total_gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
