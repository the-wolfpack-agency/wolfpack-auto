import type { Metadata } from "next";
import { getFeaturedVehicles } from "@/lib/data";
import { getDealerConfig } from "@/lib/dealer-config";
import AnnouncementBar from "@/components/home/AnnouncementBar";
import FeaturedCarousel from "@/components/home/FeaturedCarousel";
import TestimonialsCarousel, {
  type Testimonial,
} from "@/components/home/TestimonialsCarousel";
import PaymentCalculatorSection from "@/components/home/PaymentCalculatorSection";
import TradeInEstimator from "@/components/TradeInEstimator";

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
  { value: "4.8★", label: "Google Rating" },
  { value: "500+", label: "Vehicles In Stock" },
  { value: "30+", label: "Lending Partners" },
  { value: "150-Pt", label: "Inspection" },
  { value: "7-Day", label: "Money-Back" },
];

const SHOP_FEATURES = [
  {
    title: "AI Chat Assistant",
    body: "Answers inventory and financing questions 24/7, or hands off to a person when it matters.",
    icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 21l1.9-3.8A7.97 7.97 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  },
  {
    title: "Click-to-Text",
    body: "One tap starts a real SMS thread with our team - no forms, no hold music.",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z",
  },
  {
    title: "Digital Retailing",
    body: "Reserve a vehicle, apply for financing, and see out-the-door pricing before you visit.",
    icon: "M3 3h18v4H3zM3 10h18v11H3zM8 14h8",
  },
  {
    title: "Live Inventory Sync",
    body: "Stock and pricing update straight from the DMS - no stale listings, ever.",
    icon: "M4 4v5h.582M20 20v-5h-.581M5.5 9A7 7 0 0118.4 8M18.5 15A7 7 0 015.6 16",
  },
];

const CATEGORIES = [
  { label: "Sedans", photo: "https://images.unsplash.com/photo-1550355291-bbee04a92027?w=400&h=300&fit=crop&auto=format", count: "45 Available" },
  { label: "SUVs", photo: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&h=300&fit=crop&auto=format", count: "120 Available" },
  { label: "Trucks", photo: "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400&h=300&fit=crop&auto=format", count: "67 Available" },
  { label: "Coupes", photo: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&auto=format", count: "42 Available" },
  { label: "Electric", photo: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=300&fit=crop&auto=format", count: "33 Available" },
  { label: "Vans", photo: "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=400&h=300&fit=crop&auto=format", count: "94 Available" },
  { label: "Convertibles", photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=300&fit=crop&auto=format", count: "22 Available" },
  { label: "Wagons", photo: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400&h=300&fit=crop&auto=format", count: "52 Available" },
];

const WHY = [
  {
    title: "Certified Vehicles",
    body: "Every vehicle undergoes a rigorous 150-point inspection. Full CARFAX history report included with every listing.",
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  },
  {
    title: "Easy Financing",
    body: "Get pre-approved in minutes with rates as low as 2.9% APR. We work with 30+ lenders to find your best rate.",
    icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Money-Back Guarantee",
    body: "Drive it for 7 days. If you are not 100% satisfied, return it for a full refund. No questions asked.",
    icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182",
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
          src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1920&h=1200&fit=crop&auto=format&q=70"
          alt="Scenic open road"
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

        {/* Search bar overlapping the hero bottom */}
        <div className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <form
            action="/inventory"
            method="GET"
            role="search"
            aria-label="Vehicle search"
            className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5"
          >
            <div className="grid gap-3 sm:grid-cols-[1.2fr_1.5fr_auto_auto] sm:items-center">
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
          </form>
        </div>
      </section>

      {/* Featured Vehicles */}
      <section aria-labelledby="featured-heading" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <h2
              id="featured-heading"
              className="text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl"
            >
              Featured Vehicles.
            </h2>
            <a
              href="/inventory"
              className="hidden text-sm font-semibold text-brand-700 transition-colors hover:text-brand-950 sm:block"
            >
              View all inventory &rarr;
            </a>
          </div>
          <FeaturedCarousel vehicles={featuredVehicles} />
        </div>
      </section>

      {/* Trust bar */}
      <section aria-label="Dealer highlights" className="bg-brand-950">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-brand-800 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:px-8">
          {TRUST_STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 px-2 py-6 text-center">
              <span className="text-xl font-bold text-white">{s.value}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-brand-400">
                {s.label}
              </span>
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
                  <div className="flex h-20 w-full items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cat.photo}
                      alt={`Browse ${cat.label}`}
                      className="h-full w-full rounded-lg object-cover transition-transform duration-300 group-hover:scale-105"
                      loading={idx < 4 ? undefined : "lazy"}
                    />
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
          <h2 id="shop-heading" className="max-w-md text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Built for how people shop now.
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {SHOP_FEATURES.map((f) => (
              <div key={f.title}>
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-700 text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={f.icon} />
                  </svg>
                </div>
                <h3 className="mt-5 text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-400">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section aria-labelledby="why-heading" className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="why-heading" className="text-center text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">
            Why Choose {dealer.name}?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-brand-500">
            We are redefining the car-buying experience with transparency,
            quality, and customer-first service.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {WHY.map((c) => (
              <div
                key={c.title}
                className="rounded-card border border-surface-border bg-white p-8 text-center transition-all hover:-translate-y-1 hover:shadow-card-hover"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-950 text-white">
                  <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={c.icon} />
                  </svg>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-brand-950">{c.title}</h3>
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
          <h2 id="testimonials-heading" className="text-center text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">
            What Our Customers Say.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-brand-500">
            Rated 4.8 stars across 1,200+ reviews on Google and DealerRater.
          </p>
          <TestimonialsCarousel testimonials={testimonials} />
        </div>
      </section>

      {/* Free Trade-In Estimate (reuses the real TradeInEstimator widget) */}
      <section aria-labelledby="trade-in-heading" className="bg-surface-muted py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-16 lg:px-8">
          <div>
            <h2 id="trade-in-heading" className="text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">
              Free Trade-In Estimate.
            </h2>
            <p className="mt-4 max-w-md text-lg text-brand-500">
              Get an instant trade-in estimate in under 2 minutes - no
              obligation, no pressure. See your vehicle&apos;s real market value
              today.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-brand-700">
              {[
                "Instant estimate - no waiting, no sales calls",
                "Based on real market data, not guesswork",
                "Apply your trade-in value toward any vehicle",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 shrink-0 text-brand-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <TradeInEstimator />
          </div>
        </div>
      </section>
    </div>
  );
}
