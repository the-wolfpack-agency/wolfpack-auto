import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface DealerData {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  address: { street?: string; city?: string; state?: string; zip?: string };
  branding: { primary_color?: string; secondary_color?: string };
  sales_hours: Array<{ day: string; open: string; close: string; closed?: boolean }>;
}

async function getDealer(slug: string): Promise<DealerData | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<DealerData>(
      `SELECT id, name, slug, phone, email, address, branding, sales_hours FROM dealers WHERE slug = $1 AND is_active = true LIMIT 1`,
      [slug],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const dealer = await getDealer(slug);
  if (!dealer) return { title: "Dealer Not Found" };
  return {
    title: `${dealer.name} — Your Local Dealership`,
    description: `Visit ${dealer.name} for transparent pricing, financing, and AI-powered vehicle search.`,
  };
}

export default async function DealerSubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  // Skip dynamic route for hardcoded dealers (they have their own pages)
  if (slug === "summit-auto" || slug === "mile-high-motors") {
    notFound();
  }

  const dealer = await getDealer(slug);
  if (!dealer) notFound();

  const addr = dealer.address ?? {};
  const colors = dealer.branding ?? {};
  const primary = colors.primary_color ?? "#0070c7";

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="px-4 py-16 text-center text-white" style={{ backgroundColor: primary }}>
        <h1 className="text-4xl font-bold">{dealer.name}</h1>
        <p className="mt-2 text-lg opacity-90">
          {addr.city && addr.state ? `${addr.city}, ${addr.state}` : "Your Local Dealership"}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <a href={`tel:${dealer.phone}`} className="rounded-lg bg-white px-6 py-3 font-semibold text-gray-900 shadow">
            Call {dealer.phone}
          </a>
          <a href="/inventory" className="rounded-lg border-2 border-white px-6 py-3 font-semibold text-white">
            Browse Inventory
          </a>
        </div>
      </div>

      {/* Info Cards */}
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900">Contact</h3>
            <p className="mt-2 text-sm text-gray-600">{dealer.phone}</p>
            <p className="text-sm text-gray-600">{dealer.email}</p>
          </div>
          <div className="rounded-xl border p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900">Address</h3>
            <p className="mt-2 text-sm text-gray-600">
              {addr.street && `${addr.street}, `}{addr.city}, {addr.state} {addr.zip}
            </p>
          </div>
          <div className="rounded-xl border p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900">Services</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">Financing</span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Trade-In</span>
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">Service</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold text-gray-900">Ready to find your next vehicle?</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a href="/inventory" className="rounded-lg px-6 py-3 font-semibold text-white shadow" style={{ backgroundColor: primary }}>
              View Inventory
            </a>
            <a href="/trade-in" className="rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700">
              Get Trade-In Value
            </a>
            <a href="/service-booking" className="rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700">
              Book Service
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} {dealer.name}. All rights reserved.</p>
        <p className="mt-1">{addr.street}, {addr.city}, {addr.state} {addr.zip} | {dealer.phone}</p>
      </footer>
    </div>
  );
}
