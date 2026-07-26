"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface FeatureImportance {
  feature: string;
  weight: number;
  direction: string;
}

interface PropensityPrediction {
  customerId: string;
  probability: number;
  tier: string;
  topFactors: FeatureImportance[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TIER_COLORS: Record<string, string> = {
  hot: "bg-red-50 text-red-700",
  warm: "bg-amber-50 text-amber-700",
  cold: "bg-brand-50 text-brand-800",
};

const FEATURE_LABELS: Record<string, string> = {
  visitFrequency: "Visit Frequency",
  recencyDays: "Recency (days)",
  pagesViewed: "Pages Viewed",
  vehiclesViewed: "Vehicles Viewed",
  timeOnSiteMinutes: "Time on Site",
  chatUsed: "Chat Used",
  formInteractions: "Form Interactions",
  emailOpens: "Email Opens",
  pastPurchases: "Past Purchases",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PropensityPage() {
  const [ranked, setRanked] = useState<PropensityPrediction[]>([]);
  const [featureImportance, setFeatureImportance] = useState<FeatureImportance[]>([]);
  const [modelTrained, setModelTrained] = useState(false);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/propensity");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setRanked(data.ranked);
      setFeatureImportance(data.featureImportance);
      setModelTrained(data.modelTrained);
    } catch {
      setError("Failed to load propensity data");
    } finally {
      setLoading(false);
    }
  }

  async function trainModel() {
    setTraining(true);
    try {
      const res = await fetch("/api/admin/propensity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "train" }),
      });
      if (!res.ok) throw new Error("Failed to train");
      await loadData();
    } catch {
      setError("Failed to train model");
    } finally {
      setTraining(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Propensity</h1>
          <p className="mt-1 text-sm text-gray-500">
            ML-powered prediction of which customers are most likely to buy.
          </p>
        </div>
        <button
          onClick={trainModel}
          disabled={training}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {training ? "Training..." : modelTrained ? "Retrain Model" : "Train Model"}
        </button>
      </div>

      {/* Feature importance */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Feature Importance</h2>
        <p className="mt-1 text-sm text-gray-500">Which factors predict purchases best.</p>
        <div className="mt-4 space-y-2">
          {featureImportance.slice(0, 5).map((f) => {
            const maxWeight = featureImportance[0]?.weight ?? 1;
            const pct = Math.round((f.weight / maxWeight) * 100);
            return (
              <div key={f.feature} className="flex items-center gap-3">
                <span className="w-32 text-sm text-gray-700">
                  {FEATURE_LABELS[f.feature] ?? f.feature}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      f.direction === "positive" ? "bg-emerald-500" : "bg-red-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs text-gray-500">
                  {f.weight.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranked customers */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Rankings</h2>
          <p className="text-sm text-gray-500">{ranked.length} customers scored</p>
        </div>
        <div className="divide-y divide-gray-100">
          {ranked.map((pred, idx) => (
            <div key={pred.customerId} className="flex items-center gap-4 px-5 py-3">
              <span className="w-8 text-center text-sm font-medium text-gray-400">
                #{idx + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{pred.customerId}</p>
                <p className="text-xs text-gray-500">
                  Top factors:{" "}
                  {pred.topFactors
                    .map((f) => FEATURE_LABELS[f.feature] ?? f.feature)
                    .join(", ")}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  TIER_COLORS[pred.tier] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {pred.tier}
              </span>
              <span className="w-16 text-right text-sm font-bold text-gray-900">
                {(pred.probability * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
