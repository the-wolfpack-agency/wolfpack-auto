import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Summit Auto Group — Boulder's Premier Dealership",
  description:
    "Summit Auto Group in Boulder, CO — specializing in adventure-ready SUVs and trucks. Transparent pricing, financing available, and AI-powered vehicle search.",
};

const DEALER = {
  name: "Summit Auto Group",
  tagline: "Elevation Starts Here",
  phone: "(720) 555-8900",
  email: "sales@summitautogroup.com",
  address: "4500 Arapahoe Ave, Boulder, CO 80303",
  hours: "Mon-Sat: 9AM-7PM | Sun: 11AM-5PM",
  founded: "2019",
  colors: {
    primary: "#16a34a",      // green-600
    primaryDark: "#15803d",  // green-700
    accent: "#f97316",       // orange-500
    bg: "#f0fdf4",           // green-50
    heroGradientFrom: "#14532d", // green-950
    heroGradientTo: "#166534",   // green-800
  },
  stats: [
    { value: "1,200+", label: "Vehicles Sold" },
    { value: "4.9", label: "Star Rating" },
    { value: "6", label: "Years in Business" },
    { value: "97%", label: "Customer Satisfaction" },
  ],
  team: [
    { name: "Ryan Mitchell", role: "Founder & CEO", initials: "RM", bio: "Former REI executive who brought the outdoor mindset to car buying. Ryan believes every vehicle should be ready for adventure." },
    { name: "Lisa Chang", role: "Sales Director", initials: "LC", bio: "15 years in automotive with a passion for matching families to the perfect outdoor vehicle. Lisa knows every trail in Colorado." },
    { name: "Marcus Reeves", role: "Finance Manager", initials: "MR", bio: "CPA turned auto finance specialist. Marcus has relationships with 25+ lenders and finds rates others can't." },
  ],
  specialties: ["SUVs", "Trucks", "Adventure Vehicles", "Off-Road Ready", "Roof Rack Equipped", "All-Terrain Tires"],
  featured: [
    { name: "2024 Toyota 4Runner TRD Pro", price: "$58,995", tag: "Trail Ready", mileage: "1,200 mi" },
    { name: "2023 Jeep Wrangler Rubicon", price: "$47,500", tag: "Off-Road King", mileage: "8,300 mi" },
    { name: "2024 Subaru Outback Wilderness", price: "$39,995", tag: "Best Value", mileage: "5,100 mi" },
    { name: "2023 Ford Bronco Badlands", price: "$52,900", tag: "Adventure Ready", mileage: "3,700 mi" },
  ],
};

export default function SummitAutoPage() {
  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${DEALER.colors.heroGradientFrom}, ${DEALER.colors.heroGradientTo})` }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 top-1/3 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: DEALER.colors.primary }} />
          <div className="absolute -right-20 bottom-1/3 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: DEALER.colors.accent }} />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: DEALER.colors.accent }}>
              {DEALER.tagline}
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {DEALER.name}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-green-200">
              Boulder&apos;s premier destination for adventure-ready vehicles. Whether you&apos;re
              hitting the trails, hauling gear, or driving the family through the mountains —
              we&apos;ve got the perfect ride for your Colorado lifestyle.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="/inventory"
                className="rounded-lg px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl"
                style={{ backgroundColor: DEALER.colors.primary }}
              >
                Browse Adventure Vehicles
              </a>
              <a
                href={`tel:${DEALER.phone.replace(/\D/g, "")}`}
                className="rounded-lg border-2 border-white/30 px-8 py-3.5 text-base font-bold text-white transition-all hover:border-white/50 hover:bg-white/10"
              >
                Call {DEALER.phone}
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
                <p className="text-4xl font-bold" style={{ color: DEALER.colors.primary }}>{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Specialties */}
      <section className="py-16 sm:py-20" style={{ backgroundColor: DEALER.colors.bg }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">What We Specialize In</h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {DEALER.specialties.map((spec) => (
              <span key={spec} className="rounded-full border px-5 py-2 text-sm font-semibold text-white" style={{ backgroundColor: DEALER.colors.primary, borderColor: DEALER.colors.primaryDark }}>
                {spec}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Vehicles */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">Featured Vehicles</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">Hand-picked for Colorado adventures.</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DEALER.featured.map((v) => (
              <div key={v.name} className="group rounded-2xl border border-surface-border bg-white p-6 shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1" data-track="featured-vehicle" data-track-vehicle={v.name}>
                <div className="flex items-center justify-between">
                  <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: DEALER.colors.accent }}>{v.tag}</span>
                  <span className="text-xs text-gray-500">{v.mileage}</span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900">{v.name}</h3>
                <p className="mt-2 text-2xl font-bold" style={{ color: DEALER.colors.primary }}>{v.price}</p>
                <a href="/contact" className="mt-4 block rounded-lg py-2 text-center text-sm font-semibold text-white transition-colors" style={{ backgroundColor: DEALER.colors.primary }}>
                  Schedule Test Drive
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 sm:py-20" style={{ backgroundColor: DEALER.colors.bg }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">Meet Our Team</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {DEALER.team.map((member) => (
              <div key={member.name} className="rounded-2xl border border-surface-border bg-white p-6 text-center shadow-card">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${DEALER.colors.primary}, ${DEALER.colors.primaryDark})` }}>
                  {member.initials}
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{member.name}</h3>
                <p className="text-sm font-medium" style={{ color: DEALER.colors.primary }}>{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" style={{ background: `linear-gradient(to right, ${DEALER.colors.primaryDark}, ${DEALER.colors.heroGradientFrom})` }}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">Ready for Your Next Adventure?</h2>
          <p className="mt-4 text-lg text-green-200">Visit our Boulder showroom and find the perfect vehicle for your Colorado lifestyle.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/inventory" className="rounded-lg bg-white px-8 py-3.5 text-base font-bold shadow-lg transition-all hover:shadow-xl" style={{ color: DEALER.colors.primaryDark }}>
              Browse Inventory
            </a>
            <a href="/contact" className="rounded-lg border-2 border-white/30 px-8 py-3.5 text-base font-bold text-white transition-all hover:border-white/50 hover:bg-white/10">
              Contact Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
