/**
 * /pricing — public marketing page.
 *
 * Server component (no auth, no DB calls). The interactive parts
 * (billing toggle, FAQ accordion) are isolated to small client
 * components in src/components/marketing/.
 *
 * Data lives in src/lib/marketing/pricing-data.ts so it can be
 * unit-tested + reused by ops surfaces later (the marketing site,
 * sales decks) without re-deriving the contract.
 */

import type { Metadata } from "next";
import { Fragment } from "react";
import PricingTable from "@/components/marketing/PricingTable";
import FAQAccordion from "@/components/marketing/FAQAccordion";
import {
  PRICING_TIERS,
  COMPARISON_ROWS,
  FAQ_ENTRIES,
} from "@/lib/marketing/pricing-data";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Honest pricing for a modern dealer management system. Three plans (Starter, Growth, Enterprise) starting at $499 per rooftop per month. No DMS lock-in, no setup fees on Starter, full data export on cancellation.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing | Wolfpack Auto",
    description:
      "Honest pricing for a modern dealer management system. No DMS lock-in, no setup fees on Starter, full data export on cancellation.",
    type: "website",
  },
};

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center" aria-label="Included">
        <svg
          className="h-5 w-5 text-brand-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center text-gray-300" aria-label="Not included">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  return <span className="text-sm text-gray-700">{value}</span>;
}

export default function PricingPage() {
  // Group comparison rows by category for the table.
  const groupedRows = COMPARISON_ROWS.reduce<Record<string, typeof COMPARISON_ROWS[number][]>>(
    (acc, row) => {
      const list = acc[row.category] || [];
      list.push(row);
      acc[row.category] = list;
      return acc;
    },
    {},
  );
  const categories = Object.keys(groupedRows);

  const faqItems = FAQ_ENTRIES.map((f) => ({
    id: f.id,
    question: f.question,
    answer: f.answer,
  }));

  return (
    <div data-testid="pricing-page">
      {/* Hero */}
      <section
        aria-labelledby="pricing-hero-heading"
        className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950"
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-brand-400 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent-400 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
            Pricing
          </p>
          <h1
            id="pricing-hero-heading"
            className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Honest pricing. No DMS lock-in.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-brand-200">
            Three plans built for independent dealers, growing groups, and
            multi-rooftop enterprises. Cancel anytime, export all your data, no
            switching fees.
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section
        aria-labelledby="pricing-tiers-heading"
        className="bg-surface-muted py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="pricing-tiers-heading" className="sr-only">
            Available plans
          </h2>
          <PricingTable tiers={PRICING_TIERS} monthly={true} />
        </div>
      </section>

      {/* Comparison table */}
      <section
        aria-labelledby="pricing-compare-heading"
        className="bg-white py-16 sm:py-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            id="pricing-compare-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            Compare plans in detail
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            Every feature, side by side. Need something not listed? Ask sales
            and we will tell you the truth.
          </p>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-surface-border shadow-card">
            <table className="w-full min-w-[640px] border-collapse text-left" data-testid="pricing-compare-table">
              <caption className="sr-only">Feature comparison across Starter, Growth, and Enterprise plans</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="px-6 py-4 text-sm font-semibold text-gray-700">
                    Feature
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                    Starter
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-brand-700">
                    Growth
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <Fragment key={`cat-${category}`}>
                    <tr className="bg-brand-50/50">
                      <th
                        scope="colgroup"
                        colSpan={4}
                        className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-brand-800"
                      >
                        {category}
                      </th>
                    </tr>
                    {groupedRows[category].map((row) => (
                      <tr
                        key={`${category}-${row.feature}`}
                        className="border-t border-surface-border"
                      >
                        <th scope="row" className="px-6 py-4 text-sm font-medium text-gray-900">
                          {row.feature}
                        </th>
                        <td className="px-6 py-4 text-center">
                          <ComparisonCell value={row.starter} />
                        </td>
                        <td className="bg-brand-50/30 px-6 py-4 text-center">
                          <ComparisonCell value={row.growth} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ComparisonCell value={row.enterprise} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        aria-labelledby="pricing-faq-heading"
        className="bg-surface-muted py-16 sm:py-20"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2
            id="pricing-faq-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            The questions dealers actually ask before signing. Short, honest
            answers.
          </p>
          <div className="mt-10" data-testid="pricing-faq">
            <FAQAccordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section
        aria-labelledby="pricing-trust-heading"
        className="bg-white py-12"
        data-testid="pricing-trust-strip"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="pricing-trust-heading" className="sr-only">
            Trust and compliance
          </h2>
          <div className="rounded-2xl border border-surface-border bg-surface-muted px-6 py-8 sm:px-10">
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
              <ul className="flex flex-col gap-3 text-sm font-medium text-gray-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
                <li className="flex items-center gap-2">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2s10 4.477 10 10z" />
                  </svg>
                  GLBA compliant
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2s10 4.477 10 10z" />
                  </svg>
                  SOC 2 Type I in progress
                </li>
                <li className="flex items-center gap-2">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2s10 4.477 10 10z" />
                  </svg>
                  Cyber insurance carrier covered
                </li>
              </ul>
              <a
                href="/security-posture"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-300 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                Read the full security posture
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        aria-labelledby="pricing-cta-heading"
        className="relative overflow-hidden bg-gradient-to-r from-brand-700 to-brand-900"
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-32 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-8">
          <div>
            <h2 id="pricing-cta-heading" className="text-3xl font-bold text-white">
              Ready to see it for yourself?
            </h2>
            <p className="mt-2 text-brand-200">
              Start a free trial on Starter today, or book a 30-minute demo on Growth or Enterprise.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/contact?plan=starter"
              className="rounded-lg bg-white px-8 py-3.5 text-base font-bold text-brand-700 shadow-lg transition-all hover:bg-brand-50 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white"
            >
              Start free trial
            </a>
            <a
              href="/contact?plan=enterprise"
              className="rounded-lg border border-white/40 bg-transparent px-8 py-3.5 text-base font-bold text-white transition-all hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
