import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mile High Motors — Luxury & Performance in Denver",
  description:
    "Mile High Motors in Cherry Creek, Denver — luxury and performance vehicles. BMW, Mercedes, Porsche, Tesla. White-glove service and competitive financing.",
};

const DEALER = {
  name: "Mile High Motors",
  tagline: "Luxury. Performance. Denver.",
  phone: "(303) 555-7700",
  email: "concierge@milehighmotors.com",
  address: "200 Steele St, Cherry Creek, Denver, CO 80206",
  hours: "Mon-Fri: 10AM-8PM | Sat: 10AM-6PM | Sun: By Appointment",
  founded: "2017",
  colors: {
    primary: "#1e293b",      // slate-800
    primaryLight: "#334155",  // slate-700
    accent: "#d97706",       // amber-600
    accentLight: "#f59e0b",  // amber-500
    bg: "#f8fafc",           // slate-50
    heroGradientFrom: "#0f172a", // slate-900
    heroGradientTo: "#1e293b",   // slate-800
  },
  stats: [
    { value: "800+", label: "Vehicles Delivered" },
    { value: "5.0", label: "Star Rating" },
    { value: "9", label: "Years of Excellence" },
    { value: "$85K", label: "Avg. Vehicle Value" },
  ],
  team: [
    { name: "Victoria Aldridge", role: "Managing Director", initials: "VA", bio: "Former BMW North America regional manager. Victoria curates every vehicle in our collection to meet the highest standards of luxury and performance." },
    { name: "James Whitfield", role: "Client Advisor", initials: "JW", bio: "Certified luxury automotive specialist with 12 years serving Denver's most discerning drivers. James delivers white-glove service from first call to delivery." },
    { name: "Priya Nair", role: "Finance Director", initials: "PN", bio: "Former Goldman Sachs analyst. Priya structures financing packages that optimize tax advantages for high-net-worth buyers." },
  ],
  brands: ["BMW", "Mercedes-Benz", "Porsche", "Tesla", "Audi", "Range Rover", "Maserati", "Lexus"],
  featured: [
    { name: "2024 Porsche 911 Carrera S", price: "$142,500", tag: "New Arrival", mileage: "800 mi" },
    { name: "2024 BMW M4 Competition", price: "$89,900", tag: "M Performance", mileage: "2,100 mi" },
    { name: "2024 Mercedes-AMG GT 63", price: "$168,000", tag: "Flagship", mileage: "1,500 mi" },
    { name: "2024 Tesla Model S Plaid", price: "$94,990", tag: "Electric", mileage: "3,200 mi" },
  ],
};

export default function MileHighMotorsPage() {
  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${DEALER.colors.heroGradientFrom}, ${DEALER.colors.heroGradientTo})` }}
      >
        <div className="absolute inset-0 opacity-5">
          <div className="absolute -left-20 top-1/3 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: DEALER.colors.accent }} />
          <div className="absolute -right-20 bottom-1/3 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: DEALER.colors.accentLight }} />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: DEALER.colors.accentLight }}>
              {DEALER.tagline}
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {DEALER.name}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300">
              Cherry Creek&apos;s exclusive destination for luxury and performance automobiles.
              Every vehicle in our collection is hand-selected, meticulously inspected, and
              delivered with the white-glove service Denver&apos;s finest drivers expect.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="/inventory"
                className="rounded-lg px-8 py-3.5 text-base font-bold shadow-lg transition-all hover:shadow-xl"
                style={{ backgroundColor: DEALER.colors.accent, color: "#fff" }}
              >
                View Collection
              </a>
              <a
                href={`tel:${DEALER.phone.replace(/\D/g, "")}`}
                className="rounded-lg border-2 border-white/20 px-8 py-3.5 text-base font-bold text-white transition-all hover:border-white/40 hover:bg-white/5"
              >
                Private Consultation
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-surface-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {DEALER.stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold" style={{ color: DEALER.colors.accent }}>{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brands We Carry */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">Marques We Represent</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">Only the finest automotive brands make it to our floor.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {DEALER.brands.map((brand) => (
              <span key={brand} className="rounded-lg border-2 px-6 py-3 text-sm font-bold tracking-wide" style={{ borderColor: DEALER.colors.primary, color: DEALER.colors.primary }}>
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Collection */}
      <section className="py-16 sm:py-20" style={{ backgroundColor: DEALER.colors.bg }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">The Collection</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">Each vehicle hand-selected for performance, condition, and provenance.</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DEALER.featured.map((v) => (
              <div key={v.name} className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1" data-track="featured-vehicle" data-track-vehicle={v.name}>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: DEALER.colors.accent }}>{v.tag}</span>
                    <span className="text-xs text-gray-400">{v.mileage}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-gray-900">{v.name}</h3>
                  <p className="mt-2 text-2xl font-bold" style={{ color: DEALER.colors.primary }}>{v.price}</p>
                </div>
                <div className="border-t border-surface-border px-6 py-3">
                  <a href="/contact" className="block text-center text-sm font-semibold transition-colors" style={{ color: DEALER.colors.accent }}>
                    Request Private Viewing &rarr;
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">Your Advisory Team</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {DEALER.team.map((member) => (
              <div key={member.name} className="rounded-2xl border border-surface-border bg-white p-6 text-center shadow-card">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${DEALER.colors.primary}, ${DEALER.colors.primaryLight})` }}>
                  {member.initials}
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{member.name}</h3>
                <p className="text-sm font-medium" style={{ color: DEALER.colors.accent }}>{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" style={{ background: `linear-gradient(to right, ${DEALER.colors.heroGradientFrom}, ${DEALER.colors.primary})` }}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Experience the Difference</h2>
          <p className="mt-4 text-lg text-slate-300">Schedule a private viewing at our Cherry Creek showroom.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/inventory" className="rounded-lg px-8 py-3.5 text-base font-bold shadow-lg transition-all hover:shadow-xl" style={{ backgroundColor: DEALER.colors.accent, color: "#fff" }}>
              Browse Collection
            </a>
            <a href="/contact" className="rounded-lg border-2 border-white/20 px-8 py-3.5 text-base font-bold text-white transition-all hover:border-white/40 hover:bg-white/5">
              Book Appointment
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
