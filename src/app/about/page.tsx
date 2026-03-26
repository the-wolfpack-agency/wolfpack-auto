import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about Wolfpack Motors — trusted automotive sales since 2021, 500+ vehicles sold, and a 4.8-star rating.",
};

const teamMembers = [
  {
    name: "Nick Hoxsie",
    role: "Founder & CEO",
    bio: "Former Director at AMCI Global with deep roots in automotive marketing. Founded Wolfpack in 2021 with a vision to build the most customer-focused dealership in Colorado.",
    gradient: "from-brand-500 to-brand-700",
    initials: "NH",
  },
  {
    name: "Max Fuerst",
    role: "Executive Vice President",
    bio: "Former CCO at Lokal Media House and Director at Speed Patrol. Max brings creative leadership and operational excellence to every aspect of the Wolfpack experience.",
    gradient: "from-emerald-500 to-emerald-700",
    initials: "MF",
  },
  {
    name: "Meghan Burke",
    role: "Brand & Marketing Director",
    bio: "15 years in the agency world with her own marketing agency under her belt. Meghan ensures every customer touchpoint reflects the quality and trust Wolfpack stands for.",
    gradient: "from-amber-500 to-amber-700",
    initials: "MB",
  },
];

const stats = [
  { value: "500+", label: "Vehicles Sold" },
  { value: "4.8", label: "Star Rating" },
  { value: "5", label: "Years in Business" },
  { value: "98%", label: "Customer Satisfaction" },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-brand-400 blur-3xl" />
          <div className="absolute -right-20 bottom-1/3 h-80 w-80 rounded-full bg-accent-400 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Our Story</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built on Trust, Driven by Excellence
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-brand-200">
              Since 2021, Wolfpack Motors has been redefining the car-buying experience in the Denver metro area. What started as a bold vision from a team of automotive and marketing veterans has grown into one of Colorado&apos;s most trusted dealerships, all because we believe in one simple idea: you deserve honesty, transparency, and a car you can count on.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section aria-label="Company statistics" className="bg-white border-b border-surface-border">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold text-brand-700">{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section aria-labelledby="values-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="values-heading" className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Our Values
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            These are not just words on a wall. They guide every decision we make, every day.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {/* Transparency */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Transparency</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                No hidden fees, no bait-and-switch. Every price you see is the price you pay. Full CARFAX reports and inspection results are available before you even ask.
              </p>
            </div>
            {/* Quality */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Quality</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                Every vehicle passes our rigorous 150-point inspection. We reject more cars than we accept because our name is on every one we sell.
              </p>
            </div>
            {/* Service */}
            <div className="group rounded-2xl border border-surface-border bg-white p-8 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 transition-colors group-hover:bg-accent-100">
                <svg width="32" height="32" className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <h3 className="mt-6 text-lg font-bold text-gray-900">Service</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                From your first visit to years after your purchase, we are here for you. Our 7-day money-back guarantee is just the beginning of our commitment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section aria-labelledby="team-heading" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="team-heading" className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Meet Our Team
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            Real people who care about finding you the right vehicle at the right price.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <div
                key={member.name}
                className="group rounded-2xl border border-surface-border bg-white p-6 text-center shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
              >
                <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${member.gradient} text-2xl font-bold text-white shadow-lg`}>
                  {member.initials}
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{member.name}</h3>
                <p className="text-sm font-medium text-brand-600">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* History Timeline */}
      <section aria-labelledby="history-heading" className="bg-surface-muted py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 id="history-heading" className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Our Journey
          </h2>
          <div className="mt-12 space-y-8">
            {[
              { year: "2021", event: "Nick Hoxsie founds Wolfpack Motors in Denver, CO — bringing automotive marketing expertise to the dealer floor." },
              { year: "2022", event: "Expanded inventory and launched our online buying platform, serving customers across Colorado." },
              { year: "2023", event: "Grew the team with industry veterans Max and Meghan. Introduced our 150-point inspection guarantee." },
              { year: "2024", event: "Launched contactless delivery, virtual test drives, and our AI-powered vehicle search." },
              { year: "2025", event: "Surpassed 500 vehicles sold with a 4.8-star customer satisfaction rating." },
              { year: "2026", event: "Celebrating 5 years of redefining the Colorado car-buying experience." },
            ].map((milestone, i) => (
              <div key={milestone.year} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-lg">
                    {i + 1}
                  </div>
                  {i < 5 && <div className="mt-2 h-full w-0.5 bg-brand-200" />}
                </div>
                <div className="pb-8">
                  <p className="text-sm font-bold text-brand-600">{milestone.year}</p>
                  <p className="mt-1 text-gray-700">{milestone.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-brand-700 to-brand-900 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Come See Us</h2>
          <p className="mt-4 text-lg text-brand-200">
            Visit our showroom and experience the Wolfpack difference in person.
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
              Get Directions
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
