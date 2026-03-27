"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface InventoryAnalyticsData {
  daysOnLotDistribution: { bucket: string; count: number }[];
  priceVsViews: { priceRange: string; avgViews: number; vehicleCount: number }[];
  inventoryGapReport: { query: string; searches: number; trend: "rising" | "stable" | "falling" }[];
  slowMovers: {
    name: string;
    vin: string;
    daysOnLot: number;
    currentPrice: number;
    suggestedPrice: number;
    views: number;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Sample data                                                                */
/* -------------------------------------------------------------------------- */

function getSampleData(): InventoryAnalyticsData {
  return {
    daysOnLotDistribution: [
      { bucket: "0-7 days", count: 14 },
      { bucket: "8-14 days", count: 22 },
      { bucket: "15-30 days", count: 18 },
      { bucket: "31-60 days", count: 11 },
      { bucket: "61-90 days", count: 6 },
      { bucket: "90+ days", count: 3 },
    ],
    priceVsViews: [
      { priceRange: "Under $15k", avgViews: 89, vehicleCount: 8 },
      { priceRange: "$15k-$25k", avgViews: 134, vehicleCount: 15 },
      { priceRange: "$25k-$35k", avgViews: 112, vehicleCount: 22 },
      { priceRange: "$35k-$50k", avgViews: 76, vehicleCount: 18 },
      { priceRange: "$50k-$75k", avgViews: 58, vehicleCount: 9 },
      { priceRange: "$75k+", avgViews: 41, vehicleCount: 4 },
    ],
    inventoryGapReport: [
      { query: "Honda Civic under $20k", searches: 47, trend: "rising" },
      { query: "Toyota RAV4 Hybrid", searches: 38, trend: "rising" },
      { query: "electric SUV", searches: 29, trend: "rising" },
      { query: "minivan under $30k", searches: 22, trend: "stable" },
      { query: "diesel truck", searches: 18, trend: "falling" },
      { query: "Subaru Outback", searches: 15, trend: "stable" },
      { query: "convertible under $40k", searches: 12, trend: "stable" },
      { query: "AWD sedan", searches: 10, trend: "rising" },
    ],
    slowMovers: [
      { name: "2022 Nissan Altima SV", vin: "1N4BL4BV8NN123456", daysOnLot: 94, currentPrice: 24_990, suggestedPrice: 22_490, views: 12 },
      { name: "2021 Kia Forte LXS", vin: "3KPF24AD5ME123456", daysOnLot: 87, currentPrice: 19_995, suggestedPrice: 17_995, views: 8 },
      { name: "2022 Hyundai Elantra SE", vin: "5NPDH4AE2NH123456", daysOnLot: 73, currentPrice: 21_500, suggestedPrice: 19_750, views: 15 },
      { name: "2021 Chevy Malibu LT", vin: "1G1ZD5ST3MF123456", daysOnLot: 68, currentPrice: 22_800, suggestedPrice: 20_800, views: 18 },
      { name: "2022 VW Jetta S", vin: "3VWC57BU7NM123456", daysOnLot: 62, currentPrice: 23_450, suggestedPrice: 21_950, views: 11 },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function InventoryAnalyticsPage() {
  const [data, setData] = useState<InventoryAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(getSampleData());
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return null;

  const maxDaysCount = Math.max(...data.daysOnLotDistribution.map((d) => d.count));
  const maxViews = Math.max(...data.priceVsViews.map((p) => p.avgViews));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventory Analytics</h1>
        <p className="mt-1 text-base text-gray-500">
          Lot performance, pricing intelligence, and inventory gap detection.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b border-surface-border pb-3">
        <TabLink href="/admin/analytics">Dashboard</TabLink>
        <TabLink href="/admin/analytics/leads">Leads</TabLink>
        <TabLink href="/admin/analytics/inventory" active>Inventory</TabLink>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------------------ */}
        {/* Days on Lot Distribution                                           */}
        {/* ------------------------------------------------------------------ */}
        <Card title="Days on Lot Distribution">
          <div className="space-y-3">
            {data.daysOnLotDistribution.map((d) => {
              const color = d.bucket.includes("90+") ? "bg-red-500"
                : d.bucket.includes("61") ? "bg-orange-500"
                : d.bucket.includes("31") ? "bg-yellow-500"
                : "bg-green-500";
              return (
                <div key={d.bucket}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{d.bucket}</span>
                    <span className="font-semibold text-gray-900">{d.count} vehicles</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${(d.count / maxDaysCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">
                {data.daysOnLotDistribution.reduce((s, d) => s + d.count, 0)} total vehicles
              </span>
              {" "} &mdash; avg{" "}
              <span className="font-semibold text-gray-700">
                {Math.round(
                  data.daysOnLotDistribution.reduce((s, d, i) => {
                    const mid = [3.5, 11, 22.5, 45.5, 75.5, 120][i] || 30;
                    return s + d.count * mid;
                  }, 0) / Math.max(data.daysOnLotDistribution.reduce((s, d) => s + d.count, 0), 1),
                )}{" "}
                days
              </span>{" "}
              on lot
            </p>
          </div>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Price vs Views                                                     */}
        {/* ------------------------------------------------------------------ */}
        <Card title="Price vs Views Correlation">
          <p className="mb-3 text-xs text-gray-500">Average views per vehicle by price range</p>
          <div className="space-y-3">
            {data.priceVsViews.map((p) => (
              <div key={p.priceRange}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{p.priceRange}</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-900">{p.avgViews}</span> avg views
                    <span className="ml-2 text-gray-400">({p.vehicleCount} vehicles)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${(p.avgViews / maxViews) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Inventory Gap Report                                                */}
      {/* ------------------------------------------------------------------ */}
      <Card title="Inventory Gap Report">
        <p className="mb-4 text-xs text-gray-500">
          What customers are searching for that you do not currently have in stock.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Search Query</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Searches (30d)</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.inventoryGapReport.map((g) => {
                const trendStyle = {
                  rising: { label: "Rising", color: "text-red-600", arrow: "\u2191" },
                  stable: { label: "Stable", color: "text-gray-500", arrow: "\u2192" },
                  falling: { label: "Falling", color: "text-green-600", arrow: "\u2193" },
                };
                const t = trendStyle[g.trend];
                return (
                  <tr key={g.query} className="transition-colors hover:bg-surface-muted/50">
                    <td className="py-2.5 font-medium text-gray-700">{g.query}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{g.searches}</td>
                    <td className={`py-2.5 text-right font-semibold ${t.color}`}>
                      {t.arrow} {t.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Slow Movers with Repricing Suggestions                              */}
      {/* ------------------------------------------------------------------ */}
      <Card title="Slow Movers &mdash; Repricing Suggestions">
        <p className="mb-4 text-xs text-gray-500">
          Vehicles on lot 60+ days with suggested price adjustments based on market data and view counts.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Vehicle</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Days</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Views</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Current</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Suggested</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Reduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.slowMovers.map((v) => {
                const reduction = v.currentPrice - v.suggestedPrice;
                const reductionPct = ((reduction / v.currentPrice) * 100).toFixed(1);
                return (
                  <tr key={v.vin} className="transition-colors hover:bg-surface-muted/50">
                    <td className="py-2.5">
                      <div className="font-medium text-gray-900">{v.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{v.vin}</div>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`font-semibold ${v.daysOnLot >= 90 ? "text-red-600" : "text-orange-600"}`}>
                        {v.daysOnLot}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-gray-500">{v.views}</td>
                    <td className="py-2.5 text-right text-gray-700">${v.currentPrice.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-semibold text-green-600">${v.suggestedPrice.toLocaleString()}</td>
                    <td className="py-2.5 text-right">
                      <span className="text-red-600 font-medium">-${reduction.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-gray-400">({reductionPct}%)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <p className="text-xs text-yellow-800">
            <span className="font-semibold">Potential savings:</span> Repricing these{" "}
            {data.slowMovers.length} vehicles could reduce carrying costs by an estimated $
            {(data.slowMovers.length * 45 * data.slowMovers.reduce((s, v) => s + v.daysOnLot - 60, 0) / data.slowMovers.length).toLocaleString()}
            /month in floor plan interest.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared Components                                                          */
/* -------------------------------------------------------------------------- */

function TabLink({ href, children, active = false }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : "text-gray-600 hover:bg-surface-muted hover:text-gray-900"
      }`}
    >
      {children}
    </a>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
      <h3 className="mb-4 text-base font-semibold text-gray-900" dangerouslySetInnerHTML={{ __html: title }} />
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded bg-gray-200" />
      <div className="h-4 w-80 rounded bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-card bg-gray-100" />
        <div className="h-72 rounded-card bg-gray-100" />
      </div>
      <div className="h-64 rounded-card bg-gray-100" />
      <div className="h-64 rounded-card bg-gray-100" />
    </div>
  );
}
