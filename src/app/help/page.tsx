import type { Metadata } from "next";
import { getDealerConfig, summarizeBusinessHours } from "@/lib/dealer-config";

export async function generateMetadata(): Promise<Metadata> {
  const dealer = await getDealerConfig();
  return {
    title: "Help & FAQ",
    description: `Find answers to common questions about buying, financing, and servicing vehicles at ${dealer.name}. Browse our FAQ or contact us for help.`,
    openGraph: {
      title: `Help & FAQ | ${dealer.name}`,
      description: `Find answers to common questions about buying, financing, and servicing vehicles at ${dealer.name}.`,
      type: "website",
    },
  };
}

const faqCategories = [
  {
    id: "buying",
    title: "Buying a Vehicle",
    icon: (
      <svg width="24" height="24" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
    questions: [
      {
        q: "How do I buy a vehicle from your dealership?",
        a: "Browse our inventory online or visit our showroom. When you find a vehicle you like, you can request a price quote, schedule a test drive, or start the purchase process online. Our team will guide you through financing, trade-in, and paperwork to make the process seamless.",
      },
      {
        q: "What financing options are available?",
        a: "We work with over 30 lenders to find the best rate for your credit profile. Options include traditional auto loans, lease programs, and special financing for buyers with less-than-perfect credit. You can get pre-approved online in minutes with no impact to your credit score.",
      },
      {
        q: "How does the trade-in process work?",
        a: "Use our online trade-in tool to get an instant estimate based on real market data. When you visit the dealership, we will inspect your vehicle and provide a final offer. Your trade-in value can be applied directly toward the purchase of any vehicle in our inventory.",
      },
      {
        q: "What should I bring when purchasing a vehicle?",
        a: "Please bring a valid driver's license, proof of insurance, proof of income (recent pay stubs or tax returns), and your trade-in vehicle title if applicable. If you have been pre-approved for financing, bring your approval letter as well.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory & Vehicles",
    icon: (
      <svg width="24" height="24" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    questions: [
      {
        q: "How do I search for vehicles in your inventory?",
        a: "Use the search bar on our homepage or visit the Inventory page. You can filter by make, model, year, price range, body type, and more. Our search is powered by AI to help you find the perfect match even with general queries like 'family SUV under $30,000'.",
      },
      {
        q: "Do you provide vehicle history reports?",
        a: "Yes, every vehicle in our inventory includes a free CARFAX vehicle history report. You can view it directly on the vehicle detail page. The report covers accident history, service records, ownership history, and title information.",
      },
      {
        q: "Can I schedule a test drive?",
        a: "Absolutely. Click the 'Schedule Test Drive' button on any vehicle listing, or contact us by phone or email. We offer flexible scheduling including evenings and weekends. We can also bring the vehicle to you for a home test drive within our service area.",
      },
    ],
  },
  {
    id: "service",
    title: "Service & Maintenance",
    icon: (
      <svg width="24" height="24" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1h11.24M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    questions: [
      {
        q: "How do I schedule a service appointment?",
        a: "You can book a service appointment online through our Service Booking page, call our service department directly, or visit us in person. Online scheduling is available 24/7 and you will receive a confirmation email with your appointment details.",
      },
      {
        q: "What warranty coverage do your vehicles have?",
        a: "Coverage varies by vehicle. New vehicles come with the manufacturer's warranty. Certified pre-owned vehicles include an extended powertrain warranty. We also offer optional extended service contracts that cover additional components. Ask your sales representative for specific coverage details.",
      },
      {
        q: "Can I order parts through your dealership?",
        a: "Yes, our parts department stocks thousands of OEM and aftermarket parts. If we do not have what you need in stock, we can typically order it within 1-2 business days. Contact our parts department or use the online parts request form.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Privacy",
    icon: (
      <svg width="24" height="24" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    questions: [
      {
        q: "How do I create an account?",
        a: "Click the 'Sign Up' or 'Get Pre-Approved' button to create your account. You will need a valid email address. Your account lets you save favorite vehicles, track your financing application, view purchase history, and manage service appointments.",
      },
      {
        q: "How do I manage my communication preferences?",
        a: "Log into your account and visit the Settings page to manage your email and SMS preferences. You can opt out of marketing communications at any time while still receiving important transaction-related messages about your purchases and service appointments.",
      },
      {
        q: "How is my personal information protected?",
        a: "We take your privacy seriously. All personal data is encrypted at rest and in transit. We never sell your information to third parties. You can request a copy of your data or request deletion at any time through our Privacy page. We comply with all applicable data protection regulations.",
      },
    ],
  },
];

/** Flattened FAQ entry with its owning category, for search. */
type FaqHit = { category: string; categoryId: string; q: string; a: string };

const allFaqs: FaqHit[] = faqCategories.flatMap((cat) =>
  cat.questions.map((item) => ({
    category: cat.title,
    categoryId: cat.id,
    q: item.q,
    a: item.a,
  })),
);

function searchFaqs(query: string): FaqHit[] {
  const needle = query.toLowerCase();
  return allFaqs.filter(
    (f) =>
      f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle),
  );
}

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const query = (typeof sp.q === "string" ? sp.q : "").trim();
  const results = query ? searchFaqs(query) : null;

  const dealer = await getDealerConfig();
  const phoneHref = `tel:+1${dealer.phone.replace(/\D/g, "")}`;

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
            Support Center
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            How Can We Help?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-200">
            Find answers to common questions or reach out to our team directly.
          </p>

          {/* Search Bar */}
          <form
            action="/help"
            method="GET"
            role="search"
            aria-label="Search help topics"
            className="mx-auto mt-8 flex max-w-xl"
          >
            <label htmlFor="help-search" className="sr-only">
              Search help topics
            </label>
            <div className="relative flex-1">
              <svg
                className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                id="help-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search for answers..."
                className="w-full rounded-l-lg border-0 bg-white/10 py-3.5 pl-12 pr-4 text-base text-white backdrop-blur-sm placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
            <button
              type="submit"
              data-track="help_search_submit"
              className="rounded-r-lg bg-accent-500 px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-brand-900"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Search Results (only when a query is present) */}
      {results !== null && (
        <section
          aria-labelledby="help-results-heading"
          className="border-b border-surface-border bg-white py-12 sm:py-16"
        >
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2
              id="help-results-heading"
              className="text-2xl font-bold tracking-tight text-gray-900"
            >
              {results.length > 0
                ? `${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
                : `No results for "${query}"`}
            </h2>

            {results.length > 0 ? (
              <div className="mt-8 space-y-3">
                {results.map((item, idx) => (
                  <details
                    key={idx}
                    open
                    className="group rounded-xl border border-surface-border bg-white shadow-sm transition-shadow hover:shadow-card"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                      <span>
                        {item.q}
                        <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-brand-500">
                          {item.category}
                        </span>
                      </span>
                      <svg
                        className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="border-t border-surface-border px-6 py-5">
                      <p className="text-sm leading-relaxed text-gray-600">{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-surface-border bg-surface-muted p-8 text-center">
                <p className="text-gray-600">
                  We could not find an answer matching your search. Browse the
                  categories below, or reach out and our team will help directly.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={phoneHref}
                    className="rounded-lg bg-brand-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                  >
                    Call {dealer.phone}
                  </a>
                  <a
                    href="/contact"
                    className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-surface-muted"
                  >
                    Contact Us
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {faqCategories.map((cat) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-surface-border bg-white p-6 shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1 hover:border-brand-200"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  {cat.icon}
                </div>
                <div>
                  <p className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">
                    {cat.title}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {cat.questions.length} questions
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion Sections */}
      <section
        aria-labelledby="faq-heading"
        className="bg-surface-muted py-12 sm:py-16"
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2
            id="faq-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            Browse by category to find the answer you need.
          </p>

          <div className="mt-12 space-y-10">
            {faqCategories.map((cat) => (
              <div key={cat.id} id={cat.id} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    {cat.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {cat.title}
                  </h3>
                </div>

                <div className="space-y-3">
                  {cat.questions.map((item, idx) => (
                    <details
                      key={idx}
                      className="group rounded-xl border border-surface-border bg-white shadow-sm transition-shadow hover:shadow-card"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                        <span>{item.q}</span>
                        <svg
                          className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </summary>
                      <div className="border-t border-surface-border px-6 py-5">
                        <p className="text-sm leading-relaxed text-gray-600">
                          {item.a}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Still Need Help / Contact Section */}
      <section
        aria-labelledby="help-contact-heading"
        className="bg-white py-12 sm:py-16"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2
              id="help-contact-heading"
              className="text-3xl font-bold tracking-tight text-gray-900"
            >
              Still Have Questions?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
              Our team is here to help. Reach out through any of the channels below and we will get back to you within 1 business hour.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {/* Phone */}
            <a
              href={phoneHref}
              className="group flex flex-col items-center rounded-2xl border border-surface-border bg-white p-8 shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1 hover:border-brand-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <svg width="28" height="28" className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">Call Us</h3>
              <p className="mt-1 text-sm font-medium text-brand-600">
                {dealer.phone}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {summarizeBusinessHours(dealer.business_hours)}
              </p>
            </a>

            {/* Email */}
            <a
              href={`mailto:${dealer.email}`}
              className="group flex flex-col items-center rounded-2xl border border-surface-border bg-white p-8 shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1 hover:border-brand-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                <svg width="28" height="28" className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">Email Us</h3>
              <p className="mt-1 text-sm font-medium text-brand-600">
                {dealer.email}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                We respond within 1 business hour
              </p>
            </a>

            {/* Visit */}
            <a
              href="/contact"
              className="group flex flex-col items-center rounded-2xl border border-surface-border bg-white p-8 shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1 hover:border-brand-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 transition-colors group-hover:bg-accent-100">
                <svg width="28" height="28" className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">Visit Us</h3>
              <p className="mt-1 text-sm font-medium text-brand-600">
                {dealer.address}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {dealer.city}, {dealer.state} {dealer.zip}
              </p>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
