"use client";

import { useRef } from "react";
import type { FeaturedVehicle } from "@/lib/data";

/**
 * Featured-vehicle carousel. Horizontal scroll-snap track with prev/next
 * controls (arrows are progressive enhancement - the track scrolls/swipes
 * natively without JS). Cards preserve the contract the homepage E2E asserts:
 * an `a[href^="/inventory/<vin>"]` with an <h3> title, a `$` price, "miles",
 * and "View Details".
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
    const amount = Math.min(el.clientWidth * 0.9, 360);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
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
            className="group w-[85%] shrink-0 snap-start overflow-hidden rounded-card border border-surface-border bg-white shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover sm:w-[45%] lg:w-[31%]"
          >
            <div className={`relative h-52 bg-gradient-to-br ${v.gradient}`}>
              {v.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.photo}
                  alt={`${v.year} ${v.make} ${v.model}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="64" height="64" className="h-16 w-16 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                </div>
              )}
              <span className="absolute left-4 top-4 rounded-full border border-brand-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-950 backdrop-blur-sm">
                {v.tag}
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-base font-semibold text-brand-950">
                {v.year} {v.make} {v.model}
              </h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-brand-400">
                {v.mileage.toLocaleString()} miles
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xl font-bold text-brand-950">
                  ${v.price.toLocaleString()}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-surface-border px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors group-hover:border-brand-950 group-hover:text-brand-950">
                  View Details
                  <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Carousel controls */}
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          data-track="featured_prev"
          aria-label="Previous vehicles"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-border text-brand-700 transition-colors hover:border-brand-950 hover:text-brand-950"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          data-track="featured_next"
          aria-label="Next vehicles"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-border text-brand-700 transition-colors hover:border-brand-950 hover:text-brand-950"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
