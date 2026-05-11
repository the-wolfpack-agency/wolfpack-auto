"use client";

/**
 * PricingTable — three-tier card grid with Monthly / Annual toggle.
 *
 * Accessibility:
 *   - The toggle is a <div role="group" aria-label="Billing cadence">
 *     containing two <button role="tab" aria-pressed>… pattern. Switched
 *     to plain buttons with aria-pressed because that is the simpler
 *     and more screen-reader-portable contract for a binary toggle.
 *   - Each card is wrapped in <article aria-labelledby> with a heading.
 *   - The "Most popular" badge sits inside the card and is announced as
 *     part of the article's accessible name via aria-describedby.
 *
 * Brand:
 *   - Popular tier (Growth) uses the brand-600 → brand-700 border and an
 *     accent-orange popular badge.
 *
 * Responsive:
 *   - Mobile: cards stack (grid-cols-1).
 *   - Tablet and up: 3 columns (lg:grid-cols-3). Popular card is offset
 *     up by 4px on lg+ so it visually leads.
 */

import { useState } from "react";
import { type PricingTier, displayedPrice, ANNUAL_DISCOUNT_LABEL } from "@/lib/marketing/pricing-data";

export interface PricingTableProps {
  tiers: ReadonlyArray<PricingTier>;
  /** Initial billing cadence. Defaults to monthly. */
  monthly?: boolean;
  /**
   * Optional analytics hook. Pricing page wires this to a typed event
   * (e.g. `pricing.cadence_changed`) without coupling this component to
   * the analytics registry.
   */
  onCadenceChange?: (annual: boolean) => void;
}

export default function PricingTable({
  tiers,
  monthly = true,
  onCadenceChange,
}: PricingTableProps) {
  const [annual, setAnnual] = useState(!monthly);

  const setCadence = (next: boolean) => {
    if (next === annual) return;
    setAnnual(next);
    if (onCadenceChange) onCadenceChange(next);
  };

  return (
    <div>
      {/* Billing toggle */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Billing cadence"
          className="inline-flex rounded-full border border-surface-border bg-white p-1 shadow-sm"
        >
          <button
            type="button"
            aria-pressed={!annual}
            aria-current={!annual ? "true" : undefined}
            onClick={() => setCadence(false)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              !annual
                ? "bg-brand-600 text-white shadow"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={annual}
            aria-current={annual ? "true" : undefined}
            onClick={() => setCadence(true)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              annual
                ? "bg-brand-600 text-white shadow"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Annual
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {annual ? (
            <span className="font-semibold text-accent-600">
              {ANNUAL_DISCOUNT_LABEL} (2 months free)
            </span>
          ) : (
            <span>Switch to annual and save 20% (2 months free).</span>
          )}
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {tiers.map((tier) => {
          const price = displayedPrice(tier, annual);
          const headingId = `pricing-tier-${tier.id}`;
          const badgeId = `pricing-tier-${tier.id}-badge`;
          return (
            <article
              key={tier.id}
              data-tier={tier.id}
              aria-labelledby={headingId}
              aria-describedby={tier.popular ? badgeId : undefined}
              className={`relative rounded-2xl border bg-white p-8 shadow-card transition-shadow ${
                tier.popular
                  ? "border-brand-600 ring-2 ring-brand-600 lg:-translate-y-1"
                  : "border-surface-border"
              }`}
            >
              {tier.popular && (
                <span
                  id={badgeId}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow"
                >
                  Most popular
                </span>
              )}
              <h3 id={headingId} className="text-xl font-bold text-gray-900">
                {tier.name}
              </h3>
              <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-gray-600">
                {tier.audience}
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold tracking-tight text-gray-900">
                  {price.value}
                </span>
                {price.suffix && (
                  <span className="ml-1 text-sm text-gray-500">{price.suffix}</span>
                )}
              </div>
              <a
                href={tier.cta.href}
                data-cta-tier={tier.id}
                className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-sm font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  tier.popular
                    ? "bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-500"
                    : "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500"
                }`}
              >
                {tier.cta.label}
              </a>
              <ul className="mt-6 space-y-3" aria-label={`${tier.name} features`}>
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
