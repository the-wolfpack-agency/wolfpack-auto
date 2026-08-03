import type { Metadata } from "next";
import PaymentCalculator from "@/components/PaymentCalculator";

export const metadata: Metadata = {
  title: "Financing",
  description: "Flexible auto financing options with rates as low as 2.9% APR. Get pre-approved in minutes.",
};

const tiers = [
  {
    name: "Excellent Credit",
    score: "720+",
    apr: "2.9%",
    monthly: "$429",
    color: "brand",
    bg: "bg-brand-50",
    border: "border-brand-200",
    accent: "text-brand-700",
    badge: "bg-brand-100 text-brand-700",
    buttonBg: "bg-brand-600 hover:bg-brand-700",
    featured: true,
  },
  {
    name: "Good Credit",
    score: "660-719",
    apr: "4.9%",
    monthly: "$489",
    color: "emerald",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    accent: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    buttonBg: "bg-emerald-600 hover:bg-emerald-700",
    featured: false,
  },
  {
    name: "Building Credit",
    score: "580-659",
    apr: "7.9%",
    monthly: "$559",
    color: "amber",
    bg: "bg-amber-50",
    border: "border-amber-200",
    accent: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    buttonBg: "bg-amber-600 hover:bg-amber-700",
    featured: false,
  },
];

const faqs = [
  {
    question: "What credit score do I need to get approved?",
    answer: "We work with buyers across the entire credit spectrum. While rates vary based on credit history, we have relationships with over 30 lenders specializing in all credit tiers. Many customers with scores as low as 500 have been approved through our network.",
  },
  {
    question: "How long does the pre-approval process take?",
    answer: "Our online pre-approval takes just 2-3 minutes and does not affect your credit score. We use a soft inquiry to provide you with real rates and terms. A full application with hard inquiry only happens once you are ready to purchase.",
  },
  {
    question: "Can I trade in my current vehicle?",
    answer: "Absolutely. We accept trade-ins and offer competitive market-based valuations. Your trade-in value can be applied directly to your down payment, reducing your monthly payments. Get an instant estimate online or visit us for an in-person appraisal.",
  },
  {
    question: "Is there a penalty for early payoff?",
    answer: "No. None of our lending partners charge prepayment penalties. You are free to make additional payments or pay off your loan early at any time, which can save you money on interest over the life of the loan.",
  },
];

export default function FinancingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-950">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute left-1/4 top-0 h-72 w-72 rounded-full bg-brand-400 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-accent-400 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Auto Financing</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Flexible Financing Options
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-brand-200">
            Get pre-approved in minutes with rates as low as 2.9% APR. We partner with 30+ lenders to find the perfect payment for your budget.
          </p>
          <div className="mt-8">
            <a
              href="#apply"
              className="inline-flex rounded-lg bg-accent-500 px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-accent-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-brand-900"
            >
              Get Pre-Approved Now
            </a>
          </div>
        </div>
      </section>

      {/* Financing Tiers */}
      <section aria-labelledby="tiers-heading" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="tiers-heading" className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Rates for Every Credit Profile
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            Based on a $30,000 vehicle with $3,000 down over 72 months. Your actual rate may vary.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative overflow-hidden rounded-2xl border-2 ${tier.border} ${tier.bg} p-8 text-center transition-all hover:-translate-y-1 hover:shadow-lg ${
                  tier.featured ? "ring-2 ring-brand-500 ring-offset-2" : ""
                }`}
              >
                {tier.featured && (
                  <div className="absolute -right-8 top-5 rotate-45 bg-brand-600 px-10 py-1 text-xs font-bold text-white">
                    Most Popular
                  </div>
                )}
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tier.badge}`}>
                  Credit Score: {tier.score}
                </span>
                <h3 className={`mt-4 text-xl font-bold ${tier.accent}`}>{tier.name}</h3>
                <div className="mt-6">
                  <span className={`text-5xl font-bold ${tier.accent}`}>{tier.apr}</span>
                  <span className="text-lg text-gray-500"> APR</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  As low as <span className="font-semibold">{tier.monthly}/mo</span>
                </p>
                <ul className="mt-6 space-y-3 text-left text-sm text-gray-700">
                  {[
                    "No application fees",
                    "Soft credit check (no impact)",
                    "Decision in minutes",
                    "30+ lending partners",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <svg className={`h-4 w-4 shrink-0 ${tier.accent}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                {/* Was a <button> with no handler: it looked like the primary
                    call to action on the page and did nothing at all. Points at
                    the page's own #apply section, the same target the hero CTA
                    above already uses. */}
                <a
                  href="#apply"
                  className={`mt-8 block w-full rounded-xl px-6 py-3 text-center text-base font-bold text-white transition-colors ${tier.buttonBg} focus:outline-none focus:ring-2 focus:ring-offset-2`}
                >
                  Apply Now
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Payment Calculator */}
      <section aria-labelledby="interactive-calc-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="interactive-calc-heading" className="mb-8 text-center text-3xl font-bold tracking-tight text-gray-900">
            Calculate Your Payment
          </h2>
          <PaymentCalculator vehiclePrice={25000} />
        </div>
      </section>

      {/* Payment Calculator */}
      <section id="apply" aria-labelledby="calc-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-surface-border bg-white p-8 shadow-card sm:p-12">
            <h2 id="calc-heading" className="text-center text-2xl font-bold text-gray-900">Payment Calculator</h2>
            <p className="mt-2 text-center text-sm text-gray-600">Estimate your monthly payment before you visit.</p>

            <div className="mt-8 space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="calc-price" className="text-sm font-medium text-gray-700">Vehicle Price</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      id="calc-price"
                      type="text"
                      defaultValue="34,250"
                      className="w-full rounded-lg border border-surface-border py-3 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="calc-down" className="text-sm font-medium text-gray-700">Down Payment</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      id="calc-down"
                      type="text"
                      defaultValue="3,000"
                      className="w-full rounded-lg border border-surface-border py-3 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="calc-trade" className="text-sm font-medium text-gray-700">Trade-In Value</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      id="calc-trade"
                      type="text"
                      defaultValue="0"
                      className="w-full rounded-lg border border-surface-border py-3 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="calc-apr" className="text-sm font-medium text-gray-700">Interest Rate (APR)</label>
                  <div className="relative mt-1">
                    <input
                      id="calc-apr"
                      type="text"
                      defaultValue="4.9"
                      className="w-full rounded-lg border border-surface-border py-3 pl-3 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="calc-term-select" className="text-sm font-medium text-gray-700">Loan Term</label>
                <select
                  id="calc-term-select"
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option>36 months (3 years)</option>
                  <option>48 months (4 years)</option>
                  <option>60 months (5 years)</option>
                  <option selected>72 months (6 years)</option>
                  <option>84 months (7 years)</option>
                </select>
              </div>

              <div className="rounded-xl bg-brand-50 p-6 text-center">
                <p className="text-sm text-brand-600">Your Estimated Monthly Payment</p>
                <p className="mt-2 text-4xl font-bold text-brand-700">$489<span className="text-xl font-normal text-brand-500">/mo</span></p>
              </div>

              {/* Had no handler and did nothing. There is no public
                  pre-approval form yet, so it goes to /contact, which is where
                  this page's own closing CTA already sends people. An honest
                  destination beats a button that silently fails under a
                  customer's finger. */}
              <a
                href="/contact"
                className="block w-full rounded-xl bg-brand-600 px-6 py-3.5 text-center text-base font-bold text-white shadow-lg transition-all hover:bg-brand-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Get Pre-Approved with This Payment
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Frequently Asked Questions
          </h2>
          <div className="mt-12 space-y-4">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-surface-border bg-surface-muted"
                open={i === 0}
              >
                <summary className="flex cursor-pointer items-center justify-between px-6 py-5 text-left font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <svg
                    className="ml-4 h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-sm leading-relaxed text-gray-600">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-brand-700 to-brand-900 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready to Get Started?</h2>
          <p className="mt-4 text-lg text-brand-200">
            Pre-approval takes just 2 minutes and will not affect your credit score.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/inventory"
              className="rounded-lg bg-white px-8 py-3.5 text-base font-bold text-brand-700 shadow-lg transition-all hover:bg-brand-50 hover:shadow-xl"
            >
              Browse Inventory
            </a>
            <a
              href="/contact"
              className="rounded-lg border-2 border-white/30 px-8 py-3.5 text-base font-bold text-white transition-all hover:border-white/50 hover:bg-white/10"
            >
              Talk to a Specialist
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
