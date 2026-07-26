"use client";

import { useEffect, useState, useCallback } from "react";
import type {
  DealerInsight,
  InsightType,
  PricingBenchmark,
  DemandSignal,
  NetworkStats,
} from "@/lib/cross-dealer-intelligence";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function confidenceBadge(c: string): string {
  switch (c) {
    case "high":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "low":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function deltaColor(delta: number): string {
  if (delta > 10) return "text-green-600";
  if (delta > 0) return "text-green-500";
  if (delta > -10) return "text-yellow-600";
  return "text-red-600";
}

function insightTypeLabel(type: InsightType): string {
  const map: Record<InsightType, string> = {
    market_demand: "Market Demand",
    pricing_benchmark: "Pricing",
    conversion_pattern: "Conversion",
    inventory_velocity: "Inventory Speed",
    engagement_benchmark: "Engagement",
    feature_adoption: "Feature Adoption",
    seasonal_trend: "Seasonal Trend",
    optimal_pricing: "Optimal Pricing",
  };
  return map[type] ?? type;
}

function insightTypeIcon(type: InsightType): string {
  const map: Record<InsightType, string> = {
    market_demand: "trending_up",
    pricing_benchmark: "attach_money",
    conversion_pattern: "swap_vert",
    inventory_velocity: "speed",
    engagement_benchmark: "timer",
    feature_adoption: "lightbulb",
    seasonal_trend: "calendar_month",
    optimal_pricing: "price_check",
  };
  return map[type] ?? "info";
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading intelligence data">
      <div className="h-10 w-80 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <p className="font-semibold text-red-800">Unable to load intelligence data</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
    </div>
  );
}

function NetworkStatsBar({ stats }: { stats: NetworkStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-xl bg-brand-50 p-4 text-center">
        <p className="text-2xl font-bold text-brand-800">{stats.total_dealers}</p>
        <p className="text-xs text-brand-700">Dealers in Network</p>
      </div>
      <div className="rounded-xl bg-emerald-50 p-4 text-center">
        <p className="text-2xl font-bold text-emerald-700">{stats.total_vehicles.toLocaleString()}</p>
        <p className="text-xs text-emerald-600">Vehicles Tracked</p>
      </div>
      <div className="rounded-xl bg-amber-50 p-4 text-center">
        <p className="text-2xl font-bold text-amber-700">{stats.total_insights_generated.toLocaleString()}</p>
        <p className="text-xs text-amber-600">Insights Generated</p>
      </div>
      <div className="rounded-xl bg-purple-50 p-4 text-center">
        <p className="text-2xl font-bold text-purple-700">{stats.regions_covered}</p>
        <p className="text-xs text-purple-600">Regions Covered</p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: DealerInsight }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <span className="inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
          {insightTypeLabel(insight.type)}
        </span>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadge(insight.confidence)}`}
        >
          {insight.confidence} confidence
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-gray-900">{insight.title}</h3>
      <p className="mt-1 text-xs text-gray-600 leading-relaxed">{insight.description}</p>

      {/* Metric vs benchmark */}
      <div className="mt-3 flex items-center gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Your metric</p>
          <p className="font-semibold text-gray-900">
            {typeof insight.metric_value === "number" && insight.metric_value > 1000
              ? `$${insight.metric_value.toLocaleString()}`
              : insight.metric_value}
          </p>
        </div>
        <div className="text-gray-300">vs</div>
        <div>
          <p className="text-xs text-gray-500">Network avg</p>
          <p className="font-semibold text-gray-900">
            {typeof insight.benchmark_value === "number" && insight.benchmark_value > 1000
              ? `$${insight.benchmark_value.toLocaleString()}`
              : insight.benchmark_value}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Delta</p>
          <p className={`font-semibold ${deltaColor(insight.delta_percent)}`}>
            {insight.delta_percent > 0 ? "+" : ""}
            {insight.delta_percent}%
          </p>
        </div>
      </div>

      {/* Recommended action */}
      <div className="mt-3 rounded-lg bg-brand-50 p-2.5">
        <p className="text-xs font-medium text-brand-900">Recommended action</p>
        <p className="text-xs text-brand-800">{insight.recommended_action}</p>
      </div>

      <p className="mt-2 text-[10px] text-gray-400">
        Based on {insight.data_points.toLocaleString()} data points in region {insight.region}
      </p>
    </div>
  );
}

function DemandTable({ signals }: { signals: DemandSignal[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600">Make</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600">Model</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-600">Searches</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-600">Trend</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600">Region</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s, idx) => (
            <tr
              key={`${s.make}-${s.model}-${idx}`}
              className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
            >
              <td className="px-4 py-2 font-medium text-gray-900">{s.make}</td>
              <td className="px-4 py-2 text-gray-700">{s.model}</td>
              <td className="px-4 py-2 text-right text-gray-700">{s.search_count.toLocaleString()}</td>
              <td className={`px-4 py-2 text-right font-medium ${deltaColor(s.trend_percent)}`}>
                {s.trend_percent > 0 ? "+" : ""}
                {s.trend_percent}%
              </td>
              <td className="px-4 py-2 text-gray-500">{s.region}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingTool({
  benchmark,
  onSearch,
  loading,
}: {
  benchmark: PricingBenchmark | null;
  onSearch: (make: string, model: string, year: number) => void;
  loading: boolean;
}) {
  const [make, setMake] = useState("Toyota");
  const [model, setModel] = useState("Camry");
  const [year, setYear] = useState(2024);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Pricing Benchmark Tool</h3>
      <p className="mt-1 text-xs text-gray-500">
        Compare your pricing against anonymized regional averages
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          placeholder="Make"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          aria-label="Vehicle make"
        />
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          aria-label="Vehicle model"
        />
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10) || 2024)}
          min={1990}
          max={2030}
          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          aria-label="Vehicle year"
        />
        <button
          onClick={() => onSearch(make, model, year)}
          disabled={loading || !make || !model}
          className="rounded-lg bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {benchmark && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Average Price</p>
            <p className="text-lg font-bold text-gray-900">${benchmark.avg_price.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Median Price</p>
            <p className="text-lg font-bold text-gray-900">${benchmark.median_price.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Price Range</p>
            <p className="text-sm font-semibold text-gray-900">
              ${benchmark.min_price.toLocaleString()} - ${benchmark.max_price.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Avg Days to Sell</p>
            <p className="text-lg font-bold text-gray-900">{benchmark.avg_days_to_sell}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-green-50 p-3 sm:col-span-4">
            <p className="text-xs font-medium text-green-800">Optimal Price Range</p>
            <p className="text-sm font-bold text-green-700">
              ${benchmark.optimal_price_low.toLocaleString()} - ${benchmark.optimal_price_high.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-green-600">
              Based on {benchmark.sample_size} comparable vehicles in region {benchmark.region}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                 */
/* -------------------------------------------------------------------------- */

export default function MarketIntelligencePage() {
  const [insights, setInsights] = useState<DealerInsight[]>([]);
  const [demandSignals, setDemandSignals] = useState<DemandSignal[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [benchmark, setBenchmark] = useState<PricingBenchmark | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightRes, demandRes] = await Promise.all([
        fetch("/api/admin/analytics/intelligence"),
        fetch("/api/admin/analytics/intelligence?type=regional_demand"),
      ]);

      if (!insightRes.ok) throw new Error(`Failed to load insights (${insightRes.status})`);
      if (!demandRes.ok) throw new Error(`Failed to load demand data (${demandRes.status})`);

      const insightData = await insightRes.json();
      const demandData = await demandRes.json();

      setInsights(insightData.insights ?? []);
      setNetworkStats(insightData.network_stats ?? null);
      setDemandSignals(demandData.demand ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePricingSearch = useCallback(async (make: string, model: string, year: number) => {
    setBenchmarkLoading(true);
    try {
      const res = await fetch(
        `/api/admin/analytics/intelligence?type=pricing_benchmark&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`,
      );
      if (!res.ok) throw new Error("Failed to load pricing benchmark");
      const data = await res.json();
      setBenchmark(data.benchmark ?? null);
    } catch {
      setBenchmark(null);
    } finally {
      setBenchmarkLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} />;

  // Group insights by type for organized display
  const insightsByType = insights.reduce<Record<string, DealerInsight[]>>((acc, insight) => {
    (acc[insight.type] ??= []).push(insight);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Market Intelligence</h1>
        <p className="mt-1 text-sm text-gray-500">
          Anonymized insights from across the dealer network. Every dealer makes every other dealer smarter.
        </p>
      </div>

      {/* Network stats */}
      {networkStats && <NetworkStatsBar stats={networkStats} />}

      {/* Insight cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Your Insights</h2>
        <p className="text-xs text-gray-500 mb-3">
          Personalized recommendations based on your performance vs. network benchmarks
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {insights.map((insight, idx) => (
            <InsightCard key={`${insight.type}-${idx}`} insight={insight} />
          ))}
        </div>
      </div>

      {/* Pricing benchmark tool */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pricing Benchmark</h2>
        <p className="text-xs text-gray-500 mb-3">
          See how your vehicles compare to anonymized regional pricing data
        </p>
        <PricingTool
          benchmark={benchmark}
          onSearch={handlePricingSearch}
          loading={benchmarkLoading}
        />
      </div>

      {/* Regional demand */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Regional Demand</h2>
        <p className="text-xs text-gray-500 mb-3">
          Top searched vehicles in your area — based on anonymized search data across all dealers
        </p>
        {demandSignals.length > 0 ? (
          <DemandTable signals={demandSignals} />
        ) : (
          <p className="text-sm text-gray-400">No demand data available for your region.</p>
        )}
      </div>

      {/* Footer */}
      {networkStats && (
        <p className="text-center text-xs text-gray-400">
          Powered by {networkStats.total_dealers} dealers in your network.
          All data is anonymized — no dealer names, customer PII, or exact inventory is ever shared.
        </p>
      )}
    </div>
  );
}
