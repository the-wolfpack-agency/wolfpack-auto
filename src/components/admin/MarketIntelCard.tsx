"use client";

/**
 * MarketIntelCard — dashboard card on the vehicle-detail (edit) page.
 *
 * Shows:
 *   - Current market value vs our price (with $ delta and recommendation)
 *   - Days-on-lot vs the local-market median
 *   - Top 3 comparable listings
 *   - Recommendation pill + confidence + plain-language rationale
 *
 * Mobile-first responsive per `feedback_mobile_first.md`. All currency in
 * cents, displayed via the `formatUSD` helper. When mock data is in play
 * (default), a clearly labeled "estimate" banner appears so dealers know
 * what they are looking at.
 *
 * No em dashes in user-facing copy (`feedback_no_em_dashes.md`).
 */

import { useCallback, useEffect, useState } from "react";

export type Recommendation =
  | "HOLD"
  | "REPRICE_DOWN"
  | "REPRICE_UP"
  | "MOVE_TO_LOT_FRONT"
  | "MOVE_TO_BACK_LOT";

interface Signal {
  vehicleId: string;
  daysOnLot: number;
  marketVelocityDaysMedian: number | null;
  ourPriceCents: number;
  marketValueCents: number;
  priceDeltaCents: number;
  recommendation: Recommendation;
  confidence: number;
  rationale: string;
  comparablesCount: number;
  generatedAt: string;
}

interface Comparable {
  compVinOrId: string;
  compYear?: number;
  compMake?: string;
  compModel?: string;
  compTrim?: string;
  compPriceCents: number;
  compMiles?: number;
  compDistanceMiles?: number;
  compDealerName?: string;
  isMock: boolean;
}

interface ApiPayload {
  signal: Signal | null;
  top_comparables: Comparable[];
  noData: boolean;
  noDataReason: string | null;
  mock_in_use: boolean;
}

export interface MarketIntelCardProps {
  vin: string;
}

function formatUSD(cents: number): string {
  const dollars = Math.round((cents || 0) / 100);
  return `$${dollars.toLocaleString()}`;
}

const RECOMMENDATION_STYLES: Record<Recommendation, string> = {
  HOLD: "bg-gray-100 text-gray-700 ring-gray-500/20",
  REPRICE_DOWN: "bg-red-50 text-red-700 ring-red-600/20",
  REPRICE_UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  MOVE_TO_LOT_FRONT: "bg-brand-50 text-brand-800 ring-brand-700/20",
  MOVE_TO_BACK_LOT: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  HOLD: "Hold",
  REPRICE_DOWN: "Lower the price",
  REPRICE_UP: "Raise the price",
  MOVE_TO_LOT_FRONT: "Move to lot front",
  MOVE_TO_BACK_LOT: "Move to back lot",
};

export function MarketIntelCard({ vin }: MarketIntelCardProps) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntel = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/vehicles/${vin}/market-intel`);
      if (!res.ok) {
        setError(`Failed to load market intel (HTTP ${res.status}).`);
        return;
      }
      const payload = (await res.json()) as ApiPayload;
      setData(payload);
      setError(null);
    } catch {
      setError("Network error loading market intel.");
    } finally {
      setLoading(false);
    }
  }, [vin]);

  useEffect(() => {
    void fetchIntel();
  }, [fetchIntel]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch(`/api/admin/vehicles/${vin}/market-intel`, { method: "POST" });
      await fetchIntel();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <section
        aria-labelledby="market-intel-heading"
        className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        data-testid="market-intel-card"
      >
        <h2 id="market-intel-heading" className="mb-2 text-base font-semibold text-gray-900">
          Market Intel
        </h2>
        <p className="text-sm text-gray-500">Loading market intelligence...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-labelledby="market-intel-heading"
        className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        data-testid="market-intel-card"
      >
        <h2 id="market-intel-heading" className="mb-2 text-base font-semibold text-gray-900">
          Market Intel
        </h2>
        <p className="text-sm text-red-600">{error}</p>
      </section>
    );
  }

  const signal = data?.signal ?? null;
  const comps = data?.top_comparables ?? [];

  return (
    <section
      aria-labelledby="market-intel-heading"
      className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
      data-testid="market-intel-card"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="market-intel-heading" className="text-base font-semibold text-gray-900">
          Market Intel
        </h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-60 sm:self-auto"
        >
          {refreshing ? "Refreshing..." : "Refresh now"}
        </button>
      </div>

      {data?.mock_in_use && (
        <div
          role="status"
          data-testid="market-intel-mock-banner"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          Showing estimates only. Live market data activates when a KBB or
          comparable feed partnership is connected.
        </div>
      )}

      {!signal && (
        <p className="text-sm text-gray-500" data-testid="market-intel-empty">
          No market signal yet. Click Refresh now to capture the first snapshot.
        </p>
      )}

      {signal && (
        <>
          <div
            data-testid="market-intel-recommendation"
            className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span
              className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${RECOMMENDATION_STYLES[signal.recommendation]}`}
            >
              {RECOMMENDATION_LABELS[signal.recommendation]}
            </span>
            <span className="text-xs text-gray-500">
              Confidence: {(signal.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <p className="mb-5 text-sm text-gray-700" data-testid="market-intel-rationale">
            {signal.rationale}
          </p>

          {/* Stat grid: mobile = stacked, desktop = 4-col */}
          <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="market-intel-stats">
            <div>
              <dt className="text-xs font-medium text-gray-500">Our price</dt>
              <dd className="mt-0.5 text-base font-semibold text-gray-900">
                {formatUSD(signal.ourPriceCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Market value</dt>
              <dd className="mt-0.5 text-base font-semibold text-gray-900">
                {formatUSD(signal.marketValueCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Delta</dt>
              <dd
                className={`mt-0.5 text-base font-semibold ${
                  signal.priceDeltaCents > 0
                    ? "text-red-600"
                    : signal.priceDeltaCents < 0
                      ? "text-emerald-600"
                      : "text-gray-900"
                }`}
              >
                {signal.priceDeltaCents > 0 ? "+" : ""}
                {formatUSD(signal.priceDeltaCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Days on lot</dt>
              <dd className="mt-0.5 text-base font-semibold text-gray-900">
                {signal.daysOnLot}
                {signal.marketVelocityDaysMedian != null && (
                  <span className="ml-1 text-xs font-normal text-gray-500">
                    (median {signal.marketVelocityDaysMedian})
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            Top comparable listings
          </h3>
          {comps.length === 0 ? (
            <p className="text-xs text-gray-500" data-testid="market-intel-no-comps">
              No comparable listings captured yet.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="market-intel-comparables">
              {comps.slice(0, 3).map((c) => (
                <li
                  key={c.compVinOrId}
                  className="flex flex-col gap-1 rounded-md border border-surface-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {c.compYear ?? signal.daysOnLot ? `${c.compYear ?? ""} ${c.compMake ?? ""} ${c.compModel ?? ""}`.trim() : "Comparable"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {c.compTrim ? `${c.compTrim} . ` : ""}
                      {c.compMiles != null ? `${c.compMiles.toLocaleString()} mi` : ""}
                      {c.compDistanceMiles != null ? ` . ${c.compDistanceMiles} mi away` : ""}
                      {c.isMock ? " . estimate" : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">
                    {formatUSD(c.compPriceCents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
