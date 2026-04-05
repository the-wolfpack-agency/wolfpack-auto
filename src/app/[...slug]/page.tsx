/**
 * Dynamic catch-all page — renders dealer-specific content based on URL slug.
 *
 * Routes:
 *   /                → Home (handled by app/page.tsx, not here)
 *   /inventory       → Inventory listing (handled by app/inventory/, not here)
 *   /about           → Dealer about page
 *   /contact         → Contact form
 *   /financing       → Financing information
 *   /hours           → Business hours
 *   /directions      → Map / directions
 *   /[anything-else] → 404
 */

import { notFound } from "next/navigation";
import { getCurrentDealer } from "@/lib/tenant-context";
import { getBrandingCSS, getResolvedBranding } from "@/lib/branding";
import type { Dealer } from "@/types/dealer";
import type { Metadata } from "next";

// ---------------------------------------------------------------------------
// Route registry
// ---------------------------------------------------------------------------

type PageComponent = (props: { dealer: Dealer }) => React.JSX.Element;

const PAGES: Record<string, { title: string; component: PageComponent }> = {
  about: { title: "About Us", component: AboutPage },
  contact: { title: "Contact Us", component: ContactPage },
  financing: { title: "Financing", component: FinancingPage },
  hours: { title: "Business Hours", component: HoursPage },
  directions: { title: "Get Directions", component: DirectionsPage },
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  const pageKey = slug.join("/");

  const page = PAGES[pageKey];
  if (!page) {
    notFound();
  }

  const dealer = await getCurrentDealer();
  const brandingCSS = getBrandingCSS(dealer);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandingCSS }} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <page.component dealer={dealer!} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Generate metadata per page
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const pageKey = slug.join("/");
  const page = PAGES[pageKey];
  const dealer = await getCurrentDealer();

  const dealerName = dealer?.name ?? "Our Dealership";
  const title = page ? `${page.title} | ${dealerName}` : dealerName;

  return {
    title,
    description: `${page?.title ?? "Page"} for ${dealerName}`,
  };
}

// ---------------------------------------------------------------------------
// Sub-page components
// ---------------------------------------------------------------------------

function AboutPage({ dealer }: { dealer: Dealer }) {
  const branding = getResolvedBranding(dealer);

  return (
    <article>
      <header className="mb-8">
        {branding.logo_url && (
          <img
            src={branding.logo_url}
            alt={`${dealer.name} logo`}
            className="mb-4 h-16 w-auto"
          />
        )}
        <h1 className="text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
          About {dealer.name}
        </h1>
      </header>

      <section className="prose max-w-none">
        <p className="text-lg text-gray-600">
          Welcome to {dealer.name}. We are dedicated to providing an exceptional
          automotive experience with transparent pricing, quality vehicles, and
          outstanding customer service.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {dealer.has_service_center && (
            <div className="rounded-lg border border-surface-border p-6">
              <h3 className="font-semibold">Service Center</h3>
              <p className="mt-2 text-sm text-gray-500">
                Full-service maintenance and repair facility on-site.
              </p>
            </div>
          )}
          {dealer.has_financing && (
            <div className="rounded-lg border border-surface-border p-6">
              <h3 className="font-semibold">Financing Available</h3>
              <p className="mt-2 text-sm text-gray-500">
                Competitive rates and flexible terms for every credit situation.
              </p>
            </div>
          )}
          {dealer.has_trade_in && (
            <div className="rounded-lg border border-surface-border p-6">
              <h3 className="font-semibold">Trade-In Welcome</h3>
              <p className="mt-2 text-sm text-gray-500">
                Get a fair market value for your current vehicle.
              </p>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

function ContactPage({ dealer }: { dealer: Dealer }) {
  return (
    <article>
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
        Contact {dealer.name}
      </h1>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Contact info */}
        <div>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="text-lg">
                <a href={`tel:${dealer.phone}`} className="hover:underline">
                  {dealer.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-lg">
                <a href={`mailto:${dealer.email}`} className="hover:underline">
                  {dealer.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Address</dt>
              <dd className="text-lg">
                {dealer.address.street}
                <br />
                {dealer.address.city}, {dealer.address.state} {dealer.address.zip}
              </dd>
            </div>
          </dl>
        </div>

        {/* Contact form */}
        <form
          action="/api/leads"
          method="POST"
          className="space-y-4 rounded-lg border border-surface-border p-6"
        >
          <h2 className="text-xl font-semibold">Send Us a Message</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">First Name</span>
              <input
                type="text"
                name="first_name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Last Name</span>
              <input
                type="text"
                name="last_name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              name="email"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Phone</span>
            <input
              type="tel"
              name="phone"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Message</span>
            <textarea
              name="notes"
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-md px-6 py-2 font-medium text-white"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Send Message
          </button>
        </form>
      </div>
    </article>
  );
}

function FinancingPage({ dealer }: { dealer: Dealer }) {
  if (!dealer.has_financing) {
    return (
      <article>
        <h1 className="mb-4 text-3xl font-bold">Financing</h1>
        <p className="text-gray-600">
          Please contact us at{" "}
          <a href={`tel:${dealer.phone}`} className="underline">
            {dealer.phone}
          </a>{" "}
          to discuss financing options.
        </p>
      </article>
    );
  }

  return (
    <article>
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
        Financing at {dealer.name}
      </h1>

      <div className="prose max-w-none">
        <p className="text-lg text-gray-600">
          We work with multiple lenders to find the best rates and terms for your
          situation. Whether you have excellent credit or are rebuilding, we have
          options for you.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-surface-border p-6 text-center">
            <p className="text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
              2.9%
            </p>
            <p className="mt-2 text-sm text-gray-500">Rates as low as</p>
          </div>
          <div className="rounded-lg border border-surface-border p-6 text-center">
            <p className="text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
              84 mo
            </p>
            <p className="mt-2 text-sm text-gray-500">Flexible terms up to</p>
          </div>
          <div className="rounded-lg border border-surface-border p-6 text-center">
            <p className="text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
              60 sec
            </p>
            <p className="mt-2 text-sm text-gray-500">Pre-approval in</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function HoursPage({ dealer }: { dealer: Dealer }) {
  const formatDay = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);

  return (
    <article>
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
        Business Hours
      </h1>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Sales hours */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">Sales</h2>
          <table className="w-full">
            <tbody>
              {dealer.sales_hours.map((h) => (
                <tr key={h.day} className="border-b border-surface-border">
                  <td className="py-2 font-medium">{formatDay(h.day)}</td>
                  <td className="py-2 text-right text-gray-600">
                    {h.closed ? "Closed" : `${h.open} - ${h.close}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Service hours */}
        {dealer.has_service_center && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">Service</h2>
            <table className="w-full">
              <tbody>
                {dealer.service_hours.map((h) => (
                  <tr key={h.day} className="border-b border-surface-border">
                    <td className="py-2 font-medium">{formatDay(h.day)}</td>
                    <td className="py-2 text-right text-gray-600">
                      {h.closed ? "Closed" : `${h.open} - ${h.close}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </article>
  );
}

function DirectionsPage({ dealer }: { dealer: Dealer }) {
  const { address } = dealer;
  const mapsQuery = encodeURIComponent(
    `${address.street}, ${address.city}, ${address.state} ${address.zip}`,
  );

  return (
    <article>
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--brand-primary)" }}>
        Get Directions to {dealer.name}
      </h1>

      <div className="space-y-4">
        <address className="text-lg not-italic text-gray-700">
          {address.street}
          <br />
          {address.city}, {address.state} {address.zip}
        </address>

        <a
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md px-6 py-2 font-medium text-white"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          Open in Google Maps
        </a>

        {/* Embed map if coordinates available */}
        {address.lat && address.lng && (
          <div className="mt-6 aspect-video w-full overflow-hidden rounded-lg border border-surface-border">
            <iframe
              title={`Map of ${dealer.name}`}
              src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}&q=${mapsQuery}`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </div>
    </article>
  );
}
