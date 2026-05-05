import type { Metadata } from "next";
import { Suspense } from "react";
import { getInventoryVehicles, getVehicleFacets } from "@/lib/data";
import { getDealerConfig } from "@/lib/dealer-config";
import InventoryFilters, { InventorySortDropdown } from "@/components/InventoryFilters";
import CompareBar, { CompareButton } from "@/components/CompareBar";
import VehicleDisclosures from "@/components/VehicleDisclosures";

/** Escape HTML-special characters to prevent XSS when rendering user input. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const dealer = await getDealerConfig();
  return {
    title: "Inventory",
    description: "Browse our full vehicle inventory with advanced filters.",
    openGraph: {
      title: `Vehicle Inventory | ${dealer.name}`,
      description: "Browse our full vehicle inventory with advanced filters.",
      type: "website",
    },
  };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawQuery = typeof sp.q === "string" ? sp.q : "";
  const queryStr = escapeHtml(rawQuery);
  const makeFilter = typeof sp.make === "string" ? sp.make : undefined;
  const conditionFilter = typeof sp.condition === "string" ? sp.condition : undefined;
  const sortFilter = typeof sp.sort === "string" ? sp.sort : undefined;

  const [{ data: vehicles }, { data: facets }, dealer] = await Promise.all([
    getInventoryVehicles({ make: makeFilter, condition: conditionFilter, sort: sortFilter, q: queryStr || undefined }),
    getVehicleFacets(),
    getDealerConfig(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealer.name,
    telephone: `+1${dealer.phone.replace(/\D/g, "")}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: dealer.address,
      addressLocality: dealer.city,
      addressRegion: dealer.state,
      postalCode: dealer.zip,
      addressCountry: "US",
    },
    makesOffer: vehicles.slice(0, 20).map((v) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Car",
        name: `${v.year} ${v.make} ${v.model}`,
        brand: { "@type": "Brand", name: v.make },
        model: v.model,
        vehicleIdentificationNumber: v.vin,
        mileageFromOdometer: {
          "@type": "QuantitativeValue",
          value: v.mileage,
          unitCode: "SMI",
        },
        fuelType: v.fuel,
        vehicleTransmission: v.transmission,
        itemCondition:
          v.condition === "New"
            ? "https://schema.org/NewCondition"
            : "https://schema.org/UsedCondition",
      },
      price: v.price,
      priceCurrency: "USD",
    })),
  };

  return (
    <div className="bg-surface-muted min-h-screen">
      {/* audit-safe: A5 reason="JSON-LD ItemList of server-derived inventory rows, JSON-encoded; standard SEO pattern" */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Page Header */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-950 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-2 text-sm text-brand-300">
              <li><a href="/" className="transition-colors hover:text-white">Home</a></li>
              <li aria-hidden="true">/</li>
              <li className="text-white font-medium">Inventory</li>
            </ol>
          </nav>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Vehicle Inventory</h1>
          <p className="mt-2 text-brand-200">Find the perfect vehicle from our curated selection.</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Sidebar filters */}
          <aside
            aria-label="Inventory filters"
            className="w-full shrink-0 lg:w-sidebar-width"
          >
            <Suspense fallback={<div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card animate-pulse h-96" />}>
              <InventoryFilters
                makes={facets.makes}
                conditions={facets.conditions}
                bodyStyles={facets.bodyStyles}
              />
            </Suspense>
          </aside>

          {/* Results */}
          <section aria-label="Search results" className="flex-1">
            {/* Sort Bar */}
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-white px-5 py-3 shadow-card">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{vehicles.length}</span> vehicles
                {queryStr && (
                  <span> for &ldquo;<span className="font-medium">{queryStr}</span>&rdquo;</span>
                )}
              </p>
              <Suspense fallback={null}>
                <InventorySortDropdown />
              </Suspense>
            </div>

            {/* Vehicle Grid */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {vehicles.map((v) => (
                <a
                  key={v.vin}
                  href={`/inventory/${v.vin}`}
                  data-price={v.price}
                  data-vin={v.vin}
                  className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
                >
                  <div className={`relative h-48 bg-gradient-to-br ${v.gradient}`}>
                    {v.photo ? (
                      <img
                        src={v.photo}
                        alt={`${v.year} ${v.make} ${v.model} ${v.trim}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg width="64" height="64" className="h-16 w-16 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute left-3 top-3 flex gap-2">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
                        {v.condition}
                      </span>
                    </div>
                    <CompareButton vin={v.vin} />
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">
                          {v.year} {v.make} {v.model}
                        </h2>
                        <p className="text-sm text-gray-500">{v.trim}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-xl font-bold text-brand-700">${v.price.toLocaleString()}</span>
                      {v.msrp > v.price && (
                        <span className="text-sm text-gray-400 line-through">${v.msrp.toLocaleString()}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-gray-600">
                        <svg width="12" height="12" className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {v.mileage.toLocaleString()} mi
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-gray-600">
                        <svg width="12" height="12" className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                        {v.fuel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-gray-600">
                        {v.transmission}
                      </span>
                    </div>
                    <VehicleDisclosures vehicle={v} />
                    <div className="mt-3 flex items-center text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
                      View Details
                      <svg className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Inventory disclaimer footer */}
            <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-400">
              Prices do not include tax, title, registration, or dealer fees.
              Availability and pricing are subject to change without notice.
              Please verify all information with the dealership before purchase.
            </p>

            {/* Pagination */}
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-white text-gray-400 transition-colors hover:bg-surface-subtle"
                aria-label="Previous page"
                disabled
              >
                <svg width="16" height="16" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              {[1, 2, 3, 4].map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    page === 1
                      ? "bg-brand-600 text-white"
                      : "border border-surface-border bg-white text-gray-700 hover:bg-surface-subtle"
                  }`}
                  aria-current={page === 1 ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-white text-gray-700 transition-colors hover:bg-surface-subtle"
                aria-label="Next page"
              >
                <svg width="16" height="16" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </nav>
          </section>
        </div>
      </div>
      <CompareBar />
    </div>
  );
}

