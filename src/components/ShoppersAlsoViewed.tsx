"use client";

/**
 * ShoppersAlsoViewed, collaborative filtering recommendation widget.
 *
 * Fetches related vehicles from the lookalike engine API and displays
 * them as cards. Falls back gracefully if the API is unavailable.
 *
 * Tracks impressions via the analytics system.
 */

import { useEffect, useState } from "react";
import { useAnalytics } from "@/components/EventCollector";

interface RecommendedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  score: number;
  reason: string;
}

interface ShoppersAlsoViewedProps {
  vin: string;
}

export default function ShoppersAlsoViewed({ vin }: ShoppersAlsoViewedProps) {
  const [vehicles, setVehicles] = useState<RecommendedVehicle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { track } = useAnalytics();

  useEffect(() => {
    let cancelled = false;

    async function fetchRecommendations() {
      try {
        const res = await fetch(
          `/api/inventory/recommendations?vin=${encodeURIComponent(vin)}&limit=4`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.recommendations)) {
          setVehicles(data.recommendations);
          // Track that recommendations were shown
          track("recommendation", "recommendations_shown", {
            source_vin: vin,
            count: data.recommendations.length,
            type: "shoppers_also_viewed",
          });
        }
      } catch {
        // Silently fail, recommendations are non-critical
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchRecommendations();
    return () => {
      cancelled = true;
    };
  }, [vin, track]);

  // Don't render anything if no recommendations loaded
  if (!loaded || vehicles.length === 0) return null;

  return (
    <section aria-labelledby="also-viewed-heading" className="mt-16">
      <h2
        id="also-viewed-heading"
        className="text-2xl font-bold text-gray-900"
      >
        Shoppers Also Viewed
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Based on what other shoppers browsed
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {vehicles.map((v) => (
          <a
            key={v.vin}
            href={`/inventory/${v.vin}`}
            className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
            data-track="recommendation-click"
            data-track-vin={v.vin}
            data-track-source={vin}
            onClick={() => {
              track("recommendation", "recommendation_clicked", {
                source_vin: vin,
                recommended_vin: v.vin,
                score: v.score,
                type: "shoppers_also_viewed",
              });
            }}
          >
            <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200">
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-gray-400">
                <svg
                  width="40"
                  height="40"
                  className="h-10 w-10 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                  />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Image coming soon
                </span>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors text-sm">
                {v.year} {v.make} {v.model}
              </h3>
              <p className="mt-2 text-lg font-bold text-brand-700">
                ${v.price.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-gray-400">{v.reason}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
