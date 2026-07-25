import type { Metadata } from "next";
import { getFeaturedVehicles } from "@/lib/data";
import { getDealerConfig } from "@/lib/dealer-config";
import AnnouncementBar from "@/components/home/AnnouncementBar";
import FeaturedCarousel from "@/components/home/FeaturedCarousel";
import TestimonialsCarousel, {
  type Testimonial,
} from "@/components/home/TestimonialsCarousel";
import PaymentCalculatorSection from "@/components/home/PaymentCalculatorSection";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const dealer = await getDealerConfig();
  return {
    title: `${dealer.name} | ${dealer.tagline}`,
    description:
      "Browse thousands of new and used vehicles. Transparent pricing, easy financing, and a dealership experience built for the modern buyer.",
    openGraph: {
      title: `${dealer.name} | ${dealer.tagline}`,
      description:
        "Browse thousands of new and used vehicles. Transparent pricing, easy financing, and a dealership experience built for the modern buyer.",
      type: "website",
    },
  };
}

const MAKES = [
  "Audi", "BMW", "Chevrolet", "Ford", "Honda", "Hyundai", "Jeep",
  "Kia", "Mazda", "Nissan", "Subaru", "Tesla", "Toyota", "Volkswagen",
];

const testimonials: Testimonial[] = [
  {
    name: "Sarah M.",
    location: "Denver, CO",
    text: "The entire process was seamless. I found my dream car online, got pre-approved in minutes, and drove it home the same day. Best dealer experience I've ever had.",
    rating: 5,
  },
  {
    name: "James R.",
    location: "Boulder, CO",
    text: "Transparent pricing with no hidden fees. The team was incredibly knowledgeable and never pressured me. I'll be a customer for life.",
    rating: 5,
  },
  {
    name: "Maria L.",
    location: "Aurora, CO",
    text: "They helped me get financing even with my less-than-perfect credit. My monthly payment is exactly what they quoted. Highly recommend!",
    rating: 5,
  },
];

const TRUST_STATS = [
  { value: "4.8", label: "Google Rating", icon: "M11.48 3.5a.56.56 0 011.04 0l2.12 5.11a.56.56 0 00.48.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 00-.18.56l1.28 5.39a.56.56 0 01-.84.6l-4.72-2.88a.56.56 0 00-.59 0l-4.72 2.88a.56.56 0 01-.84-.6l1.28-5.39a.56.56 0 00-.18-.56l-4.2-3.6a.56.56 0 01.32-.99l5.52-.44a.56.56 0 00.48-.35L11.48 3.5z" },
  { value: "10K+", label: "Loyal Customers", icon: "M6.63 10.5c.81 0 1.54-.45 2.03-1.08a9.04 9.04 0 012.86-2.4c.72-.38 1.35-.96 1.65-1.72.22-.53.33-1.1.33-1.67v-.38a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.15-.26 2.24-.72 3.22-.27.56.1 1.28.72 1.28h3.13c1.03 0 1.94.7 2.05 1.72.05.42.07.85.07 1.28a11.95 11.95 0 01-2.65 7.52c-.39.48-.99.73-1.6.73H14.23c-.48 0-.96-.08-1.42-.23l-3.11-1.04a4.5 4.5 0 00-1.43-.23H5.9M14.25 9h2.25M5.9 18.75c.08.2.17.4.27.6.2.4-.08.9-.52.9h-.9c-.9 0-1.72-.52-1.98-1.37a12 12 0 01-.52-3.5c0-1.56.3-3.04.83-4.4.24-.62 1.02-1.08 1.85-1.08h1.05c.47 0 .75.56.5.96a8.96 8.96 0 00-1.3 4.67c0 1.19.23 2.33.65 3.37z" },
  { value: "BBB A+", label: "Accredited", icon: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.38c0-.62-.5-1.12-1.12-1.12h-.88M7.5 18.75v-3.38c0-.62.5-1.12 1.12-1.12h.88m5 0H9.5m5 0a7.45 7.45 0 01-.98-3.17M9.5 14.25a7.45 7.45 0 00.98-3.17M5.25 4.24c-.98.14-1.95.32-2.92.52A6 6 0 007.73 9.73M5.25 4.24V4.5c0 2.1.97 3.99 2.48 5.23M5.25 4.24V2.72a46.3 46.3 0 016.75-.47c2.29 0 4.55.16 6.75.47v1.52M7.73 9.73a6.73 6.73 0 002.75 1.35m8.27-6.84V4.5c0 2.1-.97 3.99-2.48 5.23m2.48-5.49a46.3 46.3 0 012.92.52 6 6 0 01-5.4 4.97m0 0a6.73 6.73 0 01-2.75 1.35m0 0a6.77 6.77 0 01-3.04 0" },
  { value: "30+", label: "Lending Partners", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  { value: "19+", label: "Years, Est 2007", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
];

const SHOP_FEATURES = [
  {
    title: "AI Chat Assistant",
    body: "Answers inventory and financing questions 24/7, or hands off to a person when it matters.",
    icon: "M8.63 12a.38.38 0 11-.75 0 .38.38 0 01.75 0zm3.75 0a.38.38 0 11-.75 0 .38.38 0 01.75 0zm3.75 0a.38.38 0 11-.75 0 .38.38 0 01.75 0zM21 12c0 4.56-4.03 8.25-9 8.25a9.76 9.76 0 01-2.56-.34 6 6 0 01-4.03 1.06 4.48 4.48 0 00.98-2.02c.09-.46-.13-.9-.47-1.23C3.93 16.18 3 14.19 3 12c0-4.56 4.03-8.25 9-8.25s9 3.69 9 8.25z",
  },
  {
    title: "Click-to-Text",
    body: "One tap starts a real SMS thread with our team, no forms, no hold music.",
    icon: "M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3",
  },
  {
    title: "Digital Retailing",
    body: "Reserve a vehicle, apply for financing, and see out-the-door pricing before you visit.",
    icon: "M9 17.25v1.01a3 3 0 01-.88 2.12L7.5 21h9l-.62-.62A3 3 0 0115 18.26v-1.01m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25",
  },
  {
    title: "Live Inventory Sync",
    body: "Stock and pricing update straight from the DMS, no stale listings, ever.",
    icon: "M16.02 9.35h4.99M2.99 19.64v-4.99m0 0h4.99m-4.99 0l3.18 3.18a8.25 8.25 0 0013.8-3.7M4.03 9.87a8.25 8.25 0 0113.8-3.7l3.18 3.18m0-4.99v4.99",
  },
];

// Browse-by-Type imagery uses the designer's own V_01 car cutouts. The file
// exported 7 of the 8 (no convertible), so Convertibles uses a stock white
// convertible until the designer supplies that cutout.
const CATEGORIES = [
  { label: "Sedans", photo: "/images/types/sedan.png", count: "45 Available" },
  { label: "SUVs", photo: "/images/types/suv.png", count: "120 Available" },
  { label: "Trucks", photo: "/images/types/truck.png", count: "67 Available" },
  { label: "Coupes", photo: "/images/types/coupe.png", count: "42 Available" },
  { label: "Electric", photo: "/images/types/electric.png", count: "33 Available" },
  { label: "Vans", photo: "/images/types/van.png", count: "94 Available" },
  { label: "Convertibles", photo: "", count: "22 Available" },
  { label: "Wagons", photo: "/images/types/wagon.png", count: "52 Available" },
];

const WHY = [
  {
    title: "Certified Vehicles",
    body: "Every vehicle undergoes a rigorous 150-point inspection. Full CARFAX history report included with every listing.",
    icon: "M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Easy Financing",
    body: "Get pre-approved in minutes with rates as low as 2.9% APR. We work with 30+ lenders to find your best rate.",
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  },
  {
    title: "Money-Back Guarantee",
    body: "Drive it for 7 days. If you are not 100% satisfied, return it for a full refund. No questions asked.",
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  },
];

export default async function HomePage() {
  const [{ data: featuredVehicles }, dealer] = await Promise.all([
    getFeaturedVehicles(6),
    getDealerConfig(),
  ]);

  const calcVehicles = featuredVehicles.slice(0, 3).map((v) => ({
    label: `${v.make} ${v.model}`,
    price: v.price,
    msrp: null,
  }));

  return (
    <div>
      {/* Personalized resume bar - only renders with real session history */}
      <AnnouncementBar />

      {/* Hero: full-bleed photographic background with overlaid copy (V_01) */}
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero.jpg"
          alt="Vehicle on a mountain road"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-950/90 via-brand-950/70 to-brand-950/30" />

        <div className="mx-auto max-w-7xl px-4 pb-28 pt-20 sm:px-6 sm:pb-32 sm:pt-24 lg:px-8 lg:pb-40 lg:pt-32">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              {dealer.name}
            </p>
            <h1
              id="hero-heading"
              className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              {dealer.tagline}
            </h1>
            <p className="mt-5 max-w-md text-lg text-white/80">
              Transparent pricing. 7-day money-back guarantee. Pre-approved in
              minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/inventory"
                data-track="hero_browse_inventory"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-100"
              >
                Browse Inventory
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="/financing"
                data-track="hero_get_prequalified"
                className="inline-flex items-center gap-2 rounded-full border border-white/50 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Get Pre-Qualified
              </a>
            </div>
          </div>
        </div>

      </section>

      {/* Search module: straddles the hero and Featured sections, per V_01 */}
      <div className="relative z-20 mx-auto -mt-14 max-w-7xl px-4 sm:-mt-16 sm:px-6 lg:px-8">
        <form
          action="/inventory"
          method="GET"
          role="search"
          aria-label="Vehicle search"
          className="rounded-card border border-surface-border bg-white p-5 shadow-card-hover sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <span className="shrink-0 text-lg font-semibold tracking-tight text-brand-950">
              Search by Make &amp; Model
            </span>
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-center">
              <div>
                <label htmlFor="hero-make" className="sr-only">Make</label>
                <select
                  id="hero-make"
                  name="make"
                  defaultValue=""
                  className="w-full appearance-none rounded-full border border-surface-border bg-white px-4 py-3 text-base text-brand-950 focus:border-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-950"
                >
                  <option value="">Any Make</option>
                  {MAKES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hero-model" className="sr-only">Model or keyword</label>
                <input
                  id="hero-model"
                  name="q"
                  type="search"
                  placeholder="Search model or keyword..."
                  className="w-full rounded-full border border-surface-border px-4 py-3 text-base text-brand-950 placeholder:text-brand-400 focus:border-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-950"
                />
              </div>
              <div>
                <label htmlFor="hero-zip" className="sr-only">ZIP Code</label>
                <input
                  id="hero-zip"
                  name="zip"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="ZIP"
                  className="w-full rounded-full border border-surface-border px-4 py-3 text-base text-brand-950 placeholder:text-brand-400 focus:border-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-950 sm:w-28"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
              >
                Browse Inventory
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Featured Vehicles */}
      <section aria-labelledby="featured-heading" className="bg-surface-muted py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2
              id="featured-heading"
              className="text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl"
            >
              Featured Vehicles.
            </h2>
            <a
              href="/inventory"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-950 transition-colors hover:text-brand-600"
            >
              View All Inventory
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <FeaturedCarousel vehicles={featuredVehicles} />
        </div>
      </section>

      {/* Trust bar */}
      <section aria-label="Dealer highlights" className="bg-brand-950">
        <div className="mx-auto flex max-w-7xl flex-col divide-y divide-brand-800 px-4 sm:flex-row sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
          {TRUST_STATS.map((s) => (
            <div key={s.label} className="flex flex-1 items-center gap-3 px-4 py-6">
              <svg className="h-8 w-8 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
              </svg>
              <div>
                <p className="text-lg font-bold leading-none text-white">{s.value}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-brand-400">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Browse by Type (white panel with dark header strip, per V_01) */}
      <section aria-labelledby="browse-heading" className="bg-surface-muted py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-white shadow-card">
            <div className="flex items-center justify-between bg-brand-950 px-6 py-5 sm:px-8">
              <h2 id="browse-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Browse by Type
              </h2>
              <a href="/inventory" className="text-sm font-semibold text-white/90 transition-colors hover:text-white">
                View All Inventory &rarr;
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 sm:gap-5 sm:p-8">
              {CATEGORIES.map((cat, idx) => (
                <a
                  key={cat.label}
                  href={`/inventory?category=${encodeURIComponent(cat.label)}`}
                  data-track="browse_category_click"
                  className="group flex flex-col items-center rounded-2xl bg-surface-muted p-4 text-center transition-colors hover:bg-surface-subtle"
                >
                  <div className="flex h-24 w-full items-center justify-center overflow-hidden px-2">
                    {cat.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.photo}
                        alt={`Browse ${cat.label}`}
                        className="max-h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                        loading={idx < 4 ? undefined : "lazy"}
                      />
                    ) : (
                      <svg className="h-12 w-20 text-brand-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13l2-5a2 2 0 011.9-1.4h10.2A2 2 0 0119 8l2 5m-18 0h18m-18 0v4a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-4M6.5 16.5h.01M17.5 16.5h.01" />
                      </svg>
                    )}
                  </div>
                  <span className="mt-3 inline-block rounded-full bg-brand-950 px-4 py-1.5 text-xs font-semibold text-white">
                    {cat.label}
                  </span>
                  <p className="mt-2 text-xs text-brand-400">{cat.count}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built for how people shop now */}
      <section aria-labelledby="shop-heading" className="bg-brand-900 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="shop-heading" className="max-w-md text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Built for how people shop now.
          </h2>
          <div className="mt-14 grid gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-brand-700">
            {SHOP_FEATURES.map((f) => (
              <div key={f.title} className="lg:px-8 lg:first:pl-0">
                <svg className="h-9 w-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d={f.icon} />
                </svg>
                <h3 className="mt-6 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us (dark interior-photo header + overlapping line-icon cards) */}
      <section aria-labelledby="why-heading" className="bg-surface-muted">
        <div className="relative isolate overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/why-choose-bg.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-brand-950/70" />
          <div className="mx-auto max-w-3xl px-4 pb-40 pt-20 text-center sm:px-6 sm:pb-48 sm:pt-28 lg:px-8">
            <h2 id="why-heading" className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Why Choose {dealer.name}?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-white/80">
              We are redefining the car-buying experience with transparency,
              quality, and customer-first service.
            </p>
          </div>
        </div>
        <div className="relative z-10 mx-auto -mt-28 max-w-7xl px-4 pb-16 sm:-mt-32 sm:px-6 sm:pb-24 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {WHY.map((c) => (
              <div key={c.title} className="rounded-card bg-white p-8 text-center shadow-card">
                <svg className="mx-auto h-14 w-14 text-brand-950" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d={c.icon} />
                </svg>
                <h3 className="mt-6 text-lg font-bold text-brand-950">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-brand-500">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Calculator (dark, reuses PaymentCalculator + carries financing CTA) */}
      <PaymentCalculatorSection vehicles={calcVehicles} />

      {/* Testimonials */}
      <section aria-labelledby="testimonials-heading" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 id="testimonials-heading" className="text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              What Our Customers Say.
            </h2>
            <a
              href="/about"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-950 transition-colors hover:text-brand-600"
            >
              See All Reviews
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <TestimonialsCarousel testimonials={testimonials} />
        </div>
      </section>

      {/* Free Trade-In Estimate (V_01) */}
      <section aria-labelledby="trade-in-heading" className="bg-white py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
          <div>
            <h2 id="trade-in-heading" className="text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Free Trade-In Estimate
            </h2>
            <p className="mt-5 max-w-md text-lg text-brand-500">
              Get an instant trade-in estimate in under 2 minutes, no obligation,
              no pressure. See your vehicle&apos;s real market value today.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Instant estimate, no waiting, no sales calls",
                "Based on real market data, not guesswork",
                "Apply your trade-in value toward any vehicle",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-base text-brand-950">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-950">
                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <form action="/trade-in" method="GET" className="mt-8 max-w-md">
              <label htmlFor="trade-vin" className="block text-lg font-semibold text-brand-950">
                Have your VIN?
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  id="trade-vin"
                  name="vin"
                  type="text"
                  placeholder="Enter your VIN"
                  className="w-full rounded-full border border-surface-border px-5 py-3 text-base text-brand-950 placeholder:text-brand-400 focus:border-brand-950 focus:outline-none focus:ring-1 focus:ring-brand-950"
                />
                <button
                  type="submit"
                  data-track="tradein_get_estimate"
                  className="shrink-0 rounded-full bg-brand-950 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                >
                  Get Estimate
                </button>
              </div>
            </form>
          </div>

          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/types/suv.png"
              alt="Trade in your vehicle"
              className="w-full object-contain"
            />
            <span className="absolute left-[6%] top-[42%] rounded-full border border-brand-950/20 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-950 shadow-card">
              Market Priced
            </span>
            <span className="absolute left-1/2 top-[8%] -translate-x-1/2 rounded-full border border-brand-950/20 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-950 shadow-card">
              150-Pt Inspection
            </span>
            <span className="absolute right-[4%] top-[26%] rounded-full border border-brand-950/20 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-950 shadow-card">
              Carfax Verified
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
