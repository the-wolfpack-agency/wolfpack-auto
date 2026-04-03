"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface ReplacementVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  price: number;
  estimatedMonthlyPayment: number;
  paymentDifference: number;
  segment: string;
}

interface EquityOpportunity {
  customerId: string;
  customerName: string;
  currentVehicle: {
    vin: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    lastServiceDate: string;
  };
  equityPosition: {
    vehicleValue: number;
    loanBalance: number;
    equity: number;
    isPositive: boolean;
    description: string;
  };
  vehicleAgeYears: number;
  score: number;
  suggestedReplacements: ReplacementVehicle[];
}

interface EquityMiningData {
  opportunities: EquityOpportunity[];
  stats: {
    avgEquity: number;
    topSegments: string[];
    totalPotentialRevenue: number;
  };
  totalCustomersScanned: number;
  opportunitiesFound: number;
  scannedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function OpportunityCard({ opp }: { opp: EquityOpportunity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid="equity-opportunity-card"
      className="rounded-card border border-surface-border bg-white p-5 shadow-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {opp.customerName}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            {opp.currentVehicle.year} {opp.currentVehicle.make}{" "}
            {opp.currentVehicle.model} &middot;{" "}
            {opp.currentVehicle.mileage.toLocaleString()} mi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              opp.score >= 80
                ? "bg-emerald-50 text-emerald-700"
                : opp.score >= 60
                  ? "bg-amber-50 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            Score: {opp.score}
          </span>
        </div>
      </div>

      {/* Equity bar */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-500">Vehicle Value</p>
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(opp.equityPosition.vehicleValue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Loan Balance</p>
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(opp.equityPosition.loanBalance)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Equity</p>
          <p
            className={`text-sm font-bold ${
              opp.equityPosition.isPositive
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {opp.equityPosition.isPositive ? "+" : ""}
            {formatCurrency(opp.equityPosition.equity)}
          </p>
        </div>
      </div>

      {/* Last service + age */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span>Last service: {formatDate(opp.currentVehicle.lastServiceDate)}</span>
        <span>{opp.vehicleAgeYears} years old</span>
      </div>

      {/* Replacements toggle */}
      {opp.suggestedReplacements.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {expanded ? "Hide" : "Show"} {opp.suggestedReplacements.length}{" "}
            replacement{opp.suggestedReplacements.length !== 1 ? "s" : ""}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {opp.suggestedReplacements.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rep.year} {rep.make} {rep.model}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(rep.price)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(rep.estimatedMonthlyPayment)}/mo
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        rep.paymentDifference <= 0
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {rep.paymentDifference <= 0 ? "" : "+"}
                      {formatCurrency(rep.paymentDifference)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function EquityMiningPage() {
  const [data, setData] = useState<EquityMiningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/equity-mining");
      if (res.status === 401 || res.status === 403) return;
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load equity mining data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRunScan() {
    try {
      setScanning(true);
      const res = await fetch("/api/admin/equity-mining", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      // Reload data after scan
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Scan failed.",
      );
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equity Mining</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading
              ? "Loading..."
              : data
                ? `${data.opportunitiesFound} opportunities from ${data.totalCustomersScanned} customers`
                : "No data available"}
          </p>
        </div>
        <button
          onClick={handleRunScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
        >
          {scanning ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Scanning...
            </>
          ) : (
            "Run Scan"
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Opportunities"
            value={data.opportunitiesFound}
            sub={`from ${data.totalCustomersScanned} customers`}
            color="text-brand-600"
          />
          <StatCard
            label="Avg Equity"
            value={formatCurrency(data.stats.avgEquity)}
            color="text-emerald-600"
          />
          <StatCard
            label="Top Segments"
            value={data.stats.topSegments.join(", ") || "---"}
            color="text-gray-900"
          />
          <StatCard
            label="Potential Revenue"
            value={formatCurrency(data.stats.totalPotentialRevenue)}
            sub="from top replacements"
            color="text-gray-900"
          />
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-card border border-surface-border bg-gray-50"
            />
          ))}
        </div>
      )}

      {/* Opportunity cards */}
      {data && !loading && (
        <div className="space-y-4">
          {data.opportunities.length === 0 ? (
            <div className="rounded-card border border-surface-border bg-white p-8 text-center text-sm text-gray-400">
              No equity mining opportunities found. Try running a scan.
            </div>
          ) : (
            data.opportunities.map((opp) => (
              <OpportunityCard key={opp.customerId} opp={opp} />
            ))
          )}
        </div>
      )}

      {/* Scan timestamp */}
      {data?.scannedAt && (
        <p className="mt-6 text-xs text-gray-400">
          Last scanned: {formatDate(data.scannedAt)}
        </p>
      )}
    </>
  );
}
