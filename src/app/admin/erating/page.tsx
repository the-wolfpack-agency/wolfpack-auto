"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ProductSummary {
  category: string;
  avg_cost: number;
  avg_retail: number;
  avg_profit: number;
  deals_attached: number;
  penetration_rate: number;
}

interface RateProduct {
  id: string;
  name: string;
  category: string;
  provider: string;
  cost_rate: number;
  retail_rate: number;
  term_months: number;
  deductible: number;
  coverage_description: string;
}

interface Comparison {
  product_name: string;
  category: string;
  rates: Array<{
    provider: string;
    cost_rate: number;
    retail_rate: number;
    dealer_profit: number;
    profit_margin: number;
  }>;
  best_margin_provider: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ERatingPage() {
  const [summary, setSummary] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [vin, setVin] = useState("");
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    fetchJson<{ summary?: ProductSummary[] }>("/api/admin/erating")
      .then((data) => setSummary(data.summary ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCompare = useCallback(async () => {
    if (!vin.trim()) return;
    setComparing(true);
    try {
      const data = await fetchJson<{ comparisons?: Comparison[] }>("/api/admin/erating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, compare: true }),
      });
      setComparisons(data.comparisons ?? []);
    } catch {
      // swallow
    } finally {
      setComparing(false);
    }
  }, [vin]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">F&I eRating</h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time F&I product pricing, rate comparison, and dealer markup calculator.
        </p>
      </div>

      {/* Rate Lookup */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Rate Comparison</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            placeholder="Enter VIN to compare rates..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleCompare}
            disabled={comparing || !vin.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {comparing ? "Loading..." : "Compare Rates"}
          </button>
        </div>
      </div>

      {/* Comparison Results */}
      {comparisons.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Rate Comparison Results</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {comparisons.map((comp) => (
              <div key={comp.category} className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{comp.product_name}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {comp.rates.map((rate) => (
                    <div
                      key={rate.provider}
                      className={`rounded-lg border p-3 ${
                        rate.provider === comp.best_margin_provider
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200"
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-500 uppercase">
                        {rate.provider.replace(/_/g, " ")}
                        {rate.provider === comp.best_margin_provider && (
                          <span className="ml-1 text-green-600">Best</span>
                        )}
                      </p>
                      <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                        <span className="text-gray-500">Cost:</span>
                        <span className="font-medium text-gray-900">${rate.cost_rate}</span>
                        <span className="text-gray-500">Retail:</span>
                        <span className="font-medium text-gray-900">${rate.retail_rate}</span>
                        <span className="text-gray-500">Profit:</span>
                        <span className="font-bold text-green-600">${rate.dealer_profit}</span>
                        <span className="text-gray-500">Margin:</span>
                        <span className="font-medium text-gray-900">{rate.profit_margin}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Summary */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Product Performance</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Avg Cost</th>
              <th className="px-4 py-3">Avg Retail</th>
              <th className="px-4 py-3">Avg Profit</th>
              <th className="px-4 py-3">Attached</th>
              <th className="px-4 py-3">Penetration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.map((product) => (
              <tr key={product.category} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{product.category}</td>
                <td className="px-4 py-3 text-gray-700">${product.avg_cost}</td>
                <td className="px-4 py-3 text-gray-700">${product.avg_retail}</td>
                <td className="px-4 py-3 font-bold text-green-600">${product.avg_profit}</td>
                <td className="px-4 py-3 text-gray-700">{product.deals_attached}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${product.penetration_rate}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-700">{product.penetration_rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
