"use client";

import { useRef } from "react";
import type { FeaturedVehicle } from "@/lib/data";

/**
 * Featured-vehicle carousel (V_01). White cards with an outlined "New Arrival"
 * badge, the car image, title, "MILES · BODY" meta, a divider, then price + a
 * black "Details" button. White circular carousel controls below. Card keeps
 * the E2E contract: an `a[href^="/inventory/<vin>"]` with an <h3> title, a `$`
 * price, "miles", and "Details".
 */
export default function FeaturedCarousel({
  vehicles,
}: {
  vehicles: FeaturedVehicle[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.9, 420), behavior: "smooth" });
  };

  return (
    <div className="relative mt-10">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {vehicles.map((v) => (
          <a
            key={v.vin}
            href={`/inventory/${v.vin}`}
            data-track="featured_vehicle_click"
            className="group flex w-[85%] shrink-0 snap-start flex-col rounded-card bg-white p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover sm:w-[45%] lg:w-[31%]"
          >
            <div className="relative flex h-48 items-center justify-center overflow-hidden">
              <span className="absolute left-0 top-0 rounded-full border border-brand-950/25 bg-white px-3 py-1 text-xs font-semibold text-brand-950">
                {v.tag}
              </span>
              {v.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.photo}
                  alt={`${v.year} ${v.make} ${v.model}`}
                  className="max-h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-brand-300">
                  <svg className="h-12 w-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 13l2-5a2 2 0 011.9-1.4h10.2A2 2 0 0119 8l2 5m-18 0h18m-18 0v4a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-4M6.5 16.5h.01M17.5 16.5h.01" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">
                    Image coming soon
                  </span>
                </div>
              )}
            </div>

            <h3 className="mt-4 text-xl font-bold leading-tight text-brand-950">
              {v.year} {v.make} {v.model}
            </h3>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-brand-400">
              {v.mileage.toLocaleString()} miles{v.bodyStyle ? ` · ${v.bodyStyle}` : ""}
            </p>

            <div className="mt-4 border-t border-surface-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-brand-950">
                  ${v.price.toLocaleString()}
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors group-hover:bg-brand-800">
                  Details
                  <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          data-track="featured_prev"
          aria-label="Previous vehicles"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-950 shadow-card transition-transform hover:scale-105"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          data-track="featured_next"
          aria-label="Next vehicles"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-950 shadow-card transition-transform hover:scale-105"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
