"use client";

import { useRef } from "react";

export interface Testimonial {
  name: string;
  location: string;
  text: string;
  rating: number;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="h-4 w-4 text-brand-950" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * Customer testimonials carousel. Every quote is rendered in the DOM (the
 * homepage E2E asserts exactly three <blockquote>s with the reviewer names);
 * the track scroll-snaps for mobile and shows all three at desktop widths.
 */
export default function TestimonialsCarousel({
  testimonials,
}: {
  testimonials: Testimonial[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.9, 400), behavior: "smooth" });
  };

  return (
    <div className="relative mt-12">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {testimonials.map((t) => (
          <blockquote
            key={t.name}
            className="w-[85%] shrink-0 snap-start rounded-card border border-surface-border bg-white p-8 sm:w-[45%] lg:w-[31%]"
          >
            <Stars count={t.rating} />
            <p className="mt-4 text-sm leading-relaxed text-brand-700">
              &ldquo;{t.text}&rdquo;
            </p>
            <footer className="mt-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-950">
                {t.name[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-950">{t.name}</p>
                <p className="text-xs text-brand-400">{t.location}</p>
              </div>
            </footer>
          </blockquote>
        ))}
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          data-track="testimonial_prev"
          aria-label="Previous reviews"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-border text-brand-700 transition-colors hover:border-brand-950 hover:text-brand-950"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          data-track="testimonial_next"
          aria-label="Next reviews"
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
