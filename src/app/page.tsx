import type { Metadata } from "next";
import { getFeaturedVehicles } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wolfpack Auto | Find Your Next Vehicle",
  description:
    "Browse thousands of new and used vehicles. Lightning-fast search, transparent pricing, and a dealership experience built for the modern buyer.",
};

const testimonials = [
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

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="h-5 w-5 text-amber-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const { data: featuredVehicles } = await getFeaturedVehicles(4);

  return (
    <div>
      {/* Hero Section */}
      <section
        aria-labelledby="hero-heading"
        className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950"
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-brand-400 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent-400 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">
              Trusted by thousands of drivers
            </p>
            <h1
              id="hero-heading"
              className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Find Your Perfect Vehicle
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-brand-200">
              Browse our curated selection of certified vehicles with transparent
              pricing, easy financing, and a 7-day money-back guarantee.
            </p>

            {/* Search Bar */}
            <form
              action="/inventory"
              method="GET"
              role="search"
              aria-label="Vehicle search"
              className="mx-auto mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
            >
              <div className="flex flex-1 gap-2">
                <label htmlFor="hero-make" className="sr-only">Make</label>
                <select
                  id="hero-make"
                  name="make"
                  className="w-full rounded-lg border-0 bg-white/10 px-4 py-3.5 text-white backdrop-blur-sm placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-white/30 sm:w-auto"
                  defaultValue=""
                >
                  <option value="" disabled className="text-gray-900">Any Make</option>
                  <option className="text-gray-900">Honda</option>
                  <option className="text-gray-900">Toyota</option>
                  <option className="text-gray-900">Tesla</option>
                  <option className="text-gray-900">BMW</option>
                  <option className="text-gray-900">Ford</option>
                  <option className="text-gray-900">Chevrolet</option>
                </select>
                <label htmlFor="hero-model" className="sr-only">Model</label>
                <input
                  id="hero-model"
                  name="q"
                  type="search"
                  placeholder="Search model or keyword..."
                  className="flex-1 rounded-lg border-0 bg-white/10 px-4 py-3.5 text-white backdrop-blur-sm placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <label htmlFor="hero-zip" className="sr-only">ZIP Code</label>
                <input
                  id="hero-zip"
                  name="zip"
                  type="text"
                  placeholder="ZIP"
                  maxLength={5}
                  className="w-24 rounded-lg border-0 bg-white/10 px-4 py-3.5 text-white backdrop-blur-sm placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-accent-500 px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-accent-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-brand-900"
              >
                Browse Inventory
              </button>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-brand-300">
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                500+ Vehicles
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                Free CARFAX Report
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                7-Day Money Back
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section aria-labelledby="why-heading" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            id="why-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            Why Choose Wolfpack Motors
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            We are redefining the car-buying experience with transparency, quality, and customer-first service.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {/* Certified */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Certified Vehicles</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Every vehicle undergoes a rigorous 150-point inspection. Full CARFAX history report included with every listing.
              </p>
            </div>
            {/* Financing */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Easy Financing</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Get pre-approved in minutes with rates as low as 2.9% APR. We work with 30+ lenders to find your best rate.
              </p>
            </div>
            {/* Guarantee */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 transition-colors group-hover:bg-accent-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Money-Back Guarantee</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Drive it for 7 days. If you are not 100% satisfied, return it for a full refund. No questions asked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Vehicles */}
      <section aria-labelledby="featured-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h2
                id="featured-heading"
                className="text-3xl font-bold tracking-tight text-gray-900"
              >
                Featured Vehicles
              </h2>
              <p className="mt-2 text-gray-600">Hand-picked by our team for quality and value.</p>
            </div>
            <a
              href="/inventory"
              className="hidden text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 sm:block"
            >
              View all inventory &rarr;
            </a>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredVehicles.map((v) => (
              <a
                key={v.vin}
                href={`/inventory/${v.vin}`}
                className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
              >
                <div className={`relative h-48 bg-gradient-to-br ${v.gradient}`}>
                  {v.photo ? (
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
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
                    {v.tag}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">
                    {v.year} {v.make} {v.model}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {v.mileage.toLocaleString()} miles
                  </p>
                  <p className="mt-3 text-xl font-bold text-brand-700">
                    ${v.price.toLocaleString()}
                  </p>
                  <div className="mt-4 flex items-center text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
                    View Details
                    <svg className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <a
              href="/inventory"
              className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              View all inventory &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Financing Banner */}
      <section
        aria-labelledby="financing-heading"
        className="relative overflow-hidden bg-gradient-to-r from-brand-700 to-brand-900"
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-32 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-8 px-4 py-16 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 id="financing-heading" className="text-3xl font-bold text-white">
              Get Pre-Approved Today
            </h2>
            <p className="mt-2 text-brand-200">
              Payments starting as low as <span className="text-2xl font-bold text-white">$189/mo</span> with approved credit.
            </p>
          </div>
          <a
            href="/financing"
            className="shrink-0 rounded-lg bg-white px-8 py-3.5 text-base font-bold text-brand-700 shadow-lg transition-all hover:bg-brand-50 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-800"
          >
            Check Your Rate
          </a>
        </div>
      </section>

      {/* Testimonials */}
      <section aria-labelledby="testimonials-heading" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            id="testimonials-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            What Our Customers Say
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            Rated 4.8 stars across 1,200+ reviews on Google and DealerRater.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t) => (
              <blockquote
                key={t.name}
                className="rounded-2xl border border-surface-border bg-surface-muted p-8"
              >
                <StarRating count={t.rating} />
                <p className="mt-4 text-sm leading-relaxed text-gray-700">
                  &ldquo;{t.text}&rdquo;
                </p>
                <footer className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.location}</p>
                  </div>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Browse by Type */}
      <section aria-labelledby="browse-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2
            id="browse-heading"
            className="text-center text-3xl font-bold tracking-tight text-gray-900"
          >
            Browse by Type
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Sedans", photo: "https://images.unsplash.com/photo-1550355291-bbee04a92027?w=400&h=300&fit=crop&auto=format", count: "120+" },
              { label: "SUVs", photo: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&h=300&fit=crop&auto=format", count: "150+" },
              { label: "Trucks", photo: "https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400&h=300&fit=crop&auto=format", count: "85+" },
              { label: "Coupes", photo: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&auto=format", count: "40+" },
              { label: "Electric", photo: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=300&fit=crop&auto=format", count: "45+" },
              { label: "Vans", photo: "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=400&h=300&fit=crop&auto=format", count: "25+" },
              { label: "Convertibles", photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=300&fit=crop&auto=format", count: "30+" },
              { label: "Wagons", photo: "https://images.unsplash.com/photo-1549317661-bd32c8ce0ffe?w=400&h=300&fit=crop&auto=format", count: "15+" },
            ].map((cat, idx) => (
              <a
                key={cat.label}
                href={`/inventory?category=${encodeURIComponent(cat.label)}`}
                className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1 hover:border-brand-200"
              >
                <div className="relative h-32 overflow-hidden">
                  <img
                    src={cat.photo}
                    alt={`Browse ${cat.label}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading={idx < 4 ? undefined : "lazy"}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-3">
                    <span className="text-sm font-bold text-white">{cat.label}</span>
                    <span className="ml-2 text-xs text-white/80">{cat.count}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
