import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVehicleByVin } from "@/lib/data";
import { calculateFederalTaxCredit } from "@/lib/ev-utils";
import PaymentCalculator from "@/components/PaymentCalculator";
import PhotoGallery from "@/components/PhotoGallery";
import VehicleDisclosures from "@/components/VehicleDisclosures";
import FinancingDisclaimer from "@/components/FinancingDisclaimer";
import CARSRuleDisclosures from "@/components/CARSRuleDisclosures";
import EVTaxCreditBadge from "@/components/EVTaxCreditBadge";
import EVRangeCalculator from "@/components/EVRangeCalculator";
import ShoppersAlsoViewed from "@/components/ShoppersAlsoViewed";
import RecentlyViewedTracker from "@/components/RecentlyViewedTracker";
import { getDealerConfig } from "@/lib/dealer-config";

export const dynamic = "force-dynamic";

interface VDPParams {
  params: Promise<{ vin: string }>;
}

export async function generateMetadata({ params }: VDPParams): Promise<Metadata> {
  const { vin } = await params;
  const { data: vehicle } = await getVehicleByVin(vin);

  if (!vehicle) {
    return { title: "Vehicle Not Found" };
  }

  return {
    title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
    description: `View details, photos, and pricing for the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}. ${vehicle.mileage.toLocaleString()} miles, $${vehicle.price.toLocaleString()}.`,
    alternates: {
      canonical: `/inventory/${vehicle.vin}`,
    },
  };
}

export default async function VehicleDetailPage({ params }: VDPParams) {
  const { vin } = await params;
  const { data: vehicle } = await getVehicleByVin(vin);

  if (!vehicle) {
    notFound();
  }

  const dealer = await getDealerConfig();
  const v = vehicle;

  const vehicleCondition =
    v.condition === "new"
      ? "https://schema.org/NewCondition"
      : "https://schema.org/UsedCondition";

  const vehicleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `${v.year} ${v.make} ${v.model}`,
    vehicleModelDate: String(v.year),
    brand: { "@type": "Brand", name: v.make },
    model: v.model,
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: v.mileage,
      unitCode: "SMI",
    },
    vehicleCondition,
    offers: {
      "@type": "Offer",
      price: v.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Inventory", item: "/inventory" },
      { "@type": "ListItem", position: 3, name: `${v.year} ${v.make} ${v.model}` },
    ],
  };

  return (
    <div className="bg-surface-muted min-h-screen">
      {/* Record into recently-viewed session memory (powers the homepage resume bar) */}
      <RecentlyViewedTracker
        vin={v.vin}
        year={v.year}
        make={v.make}
        model={v.model}
        price={v.price}
      />
      {/* JSON-LD structured data */}
      {/* audit-safe: A5 reason="JSON-LD object literal of server-derived vehicle fields; JSON.stringify-encoded into a script tag (standard SEO pattern)" */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(vehicleJsonLd) }}
      />
      {/* audit-safe: A5 reason="JSON-LD breadcrumb of static + server-derived strings, JSON-encoded" */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Header bar */}
      <div className="bg-white border-b border-surface-border">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-gray-500">
              <li>
                <a href="/" className="transition-colors hover:text-brand-600">Home</a>
              </li>
              <li aria-hidden="true">
                <svg width="16" height="16" className="h-4 w-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </li>
              <li>
                <a href="/inventory" className="transition-colors hover:text-brand-600">Inventory</a>
              </li>
              <li aria-hidden="true">
                <svg width="16" height="16" className="h-4 w-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </li>
              <li aria-current="page" className="font-medium text-gray-900">
                {v.year} {v.make} {v.model} {v.trim}
              </li>
            </ol>
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Photos + Specs */}
          <div className="lg:col-span-2 space-y-8">
            {/* Photo Gallery */}
            {v.photo ? (
              <PhotoGallery
                mainPhoto={v.photo}
                alt={`${v.year} ${v.make} ${v.model} ${v.trim}`}
                gradient={v.gradient}
              />
            ) : (
              <section aria-label="Vehicle photos">
                <div className={`h-80 overflow-hidden rounded-2xl bg-gradient-to-br ${v.gradient} shadow-card`}>
                  <div className="flex h-full items-center justify-center">
                    <svg className="mx-auto h-20 w-20 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  </div>
                </div>
              </section>
            )}

            {/* Specifications */}
            <section aria-labelledby="specs-heading" className="rounded-2xl border border-surface-border bg-white p-8 shadow-card">
              <h2 id="specs-heading" className="text-xl font-bold text-gray-900">Vehicle Specifications</h2>
              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ["Year", String(v.year)],
                  ["Make", v.make],
                  ["Model", v.model],
                  ["Trim", v.trim],
                  ["Mileage", `${v.mileage.toLocaleString()} miles`],
                  ["Exterior Color", v.exteriorColor],
                  ["Interior Color", v.interiorColor],
                  ["Transmission", v.transmission],
                  ["Drivetrain", v.drivetrain],
                  ["Fuel Type", v.fuelType],
                  ["Engine", v.engine],
                  ["MPG", v.mpg],
                  ["Stock #", v.stockNumber],
                  ["VIN", vin],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3">
                    <dt className="text-sm font-medium text-gray-500">{label}</dt>
                    <dd className="text-sm font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Key Features */}
            <section aria-labelledby="features-heading" className="rounded-2xl border border-surface-border bg-white p-8 shadow-card">
              <h2 id="features-heading" className="text-xl font-bold text-gray-900">Key Features</h2>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {v.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-3 text-sm text-gray-700">
                    <svg width="20" height="20" className="h-5 w-5 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {feat}
                  </li>
                ))}
              </ul>
            </section>

            {/* EV Range & Charging Calculator */}
            {v.is_ev && v.ev_range_miles != null && (
              <EVRangeCalculator
                rangeMiles={v.ev_range_miles}
                chargeTimeL2Hours={v.ev_charge_time_l2_hours}
                chargeTimeDCMinutes={v.ev_charge_time_dc_minutes}
                batteryKwh={v.ev_battery_kwh}
              />
            )}

            {/* FTC Vehicle Disclosures */}
            <VehicleDisclosures vehicle={v} showFull />

            {/* FTC CARS Rule Pricing Disclosure */}
            <CARSRuleDisclosures />

            {/* AI Content Disclosure */}
            <p className="mt-4 text-xs text-gray-400">
              Some content on this page may be generated with AI assistance.
            </p>
          </div>

          {/* Right Column: Price + CTAs */}
          <div className="space-y-6">
            {/* Price Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900">
                  {v.year} {v.make} {v.model} {v.trim}
                </h1>
                <p className="mt-1 text-sm text-gray-500">{v.mileage.toLocaleString()} miles | {v.exteriorColor}</p>
                <div className="mt-4">
                  {v.msrp > v.price && (
                    <p className="text-sm text-gray-400 line-through">MSRP ${v.msrp.toLocaleString()}</p>
                  )}
                  <p className="text-price-xl text-brand-700">${v.price.toLocaleString()}</p>
                </div>
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  You Save ${(v.msrp - v.price).toLocaleString()}
                </div>

                {/* EV federal tax credit badge */}
                {v.is_ev && (() => {
                  const credit = calculateFederalTaxCredit({
                    is_ev: v.is_ev,
                    ev_drivetrain: v.ev_drivetrain,
                    msrp: v.msrp,
                    make: v.make,
                    year: v.year,
                    condition: v.condition,
                  });
                  return (
                    <EVTaxCreditBadge
                      eligible={credit.eligible}
                      amount={credit.amount}
                      condition={v.condition}
                    />
                  );
                })()}
              </div>

              <div className="mt-6 space-y-3">
                <a
                  href={`/contact?subject=price_request&vehicle=${encodeURIComponent(`${v.year} ${v.make} ${v.model} ${v.trim}`)}&vin=${v.vin}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-brand-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  data-track="cta-request-price"
                  data-track-vehicle={v.vin}
                >
                  <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  Request Price
                </a>
                <a
                  href={`/contact?subject=test_drive&vehicle=${encodeURIComponent(`${v.year} ${v.make} ${v.model} ${v.trim}`)}&vin=${v.vin}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-600 px-6 py-3.5 text-base font-bold text-brand-600 transition-all hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  data-track="cta-schedule-test-drive"
                  data-track-vehicle={v.vin}
                >
                  <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Schedule Test Drive
                </a>
              </div>
            </div>

            {/* Payment Calculator */}
            <PaymentCalculator vehiclePrice={v.price} msrp={v.msrp} />

            {/* Financing Disclosure */}
            <FinancingDisclaimer showAPRDefinition />

            {/* Dealer Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
                  <svg width="20" height="20" className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{dealer.name}</p>
                  <p className="text-xs text-gray-500">{dealer.city}, {dealer.state}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p className="flex items-center gap-2">
                  <svg width="16" height="16" className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Open today 9:00 AM - 8:00 PM
                </p>
                <a href={`tel:${dealer.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 text-brand-600 font-medium transition-colors hover:text-brand-700">
                  <svg width="16" height="16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {dealer.phone}
                </a>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { label: "CARFAX Clean", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
                { label: "150-Point Inspection", icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" },
                { label: "7-Day Return", icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" },
              ].map((badge) => (
                <div key={badge.label} className="flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                  <svg width="14" height="14" className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={badge.icon} />
                  </svg>
                  {badge.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Similar Vehicles */}
        <section aria-labelledby="similar-heading" className="mt-16">
          <h2 id="similar-heading" className="text-2xl font-bold text-gray-900">Similar Vehicles</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {v.similarVehicles.map((sv) => (
              <a
                key={sv.vin}
                href={`/inventory/${sv.vin}`}
                className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
              >
                <div className={`h-48 bg-gradient-to-br ${sv.gradient}`}>
                  {sv.photo ? (
                    <img
                      src={sv.photo}
                      alt={`${sv.year} ${sv.make} ${sv.model}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <svg width="48" height="48" className="h-12 w-12 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">
                    {sv.year} {sv.make} {sv.model}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">{sv.mileage.toLocaleString()} miles</p>
                  <p className="mt-2 text-lg font-bold text-brand-700">${sv.price.toLocaleString()}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Shoppers Also Viewed — collaborative filtering recommendations */}
        <ShoppersAlsoViewed vin={vin} />
      </div>
    </div>
  );
}
