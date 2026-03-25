import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVehicleByVin } from "@/lib/data";

export const dynamic = "force-dynamic";

interface VDPParams {
  params: { vin: string };
}

export async function generateMetadata({ params }: VDPParams): Promise<Metadata> {
  const { data: vehicle } = await getVehicleByVin(params.vin);

  if (!vehicle) {
    return { title: "Vehicle Not Found" };
  }

  return {
    title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
    description: `View details, photos, and pricing for the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}. ${vehicle.mileage.toLocaleString()} miles, $${vehicle.price.toLocaleString()}.`,
  };
}

export default async function VehicleDetailPage({ params }: VDPParams) {
  const { vin } = params;
  const { data: vehicle } = await getVehicleByVin(vin);

  if (!vehicle) {
    notFound();
  }

  const v = vehicle;

  return (
    <div className="bg-surface-muted min-h-screen">
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
            <section aria-label="Vehicle photos">
              <div className={`h-80 overflow-hidden rounded-2xl bg-gradient-to-br ${v.gradient} shadow-card`}>
                {v.photo ? (
                  <img
                    src={v.photo.replace("w=800&h=600", "w=1200&h=800")}
                    alt={`${v.year} ${v.make} ${v.model} ${v.trim}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <svg className="mx-auto h-20 w-20 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                      <p className="mt-2 text-sm text-white/40">1 of 32 photos</p>
                    </div>
                  </div>
                )}
              </div>
              {/* Thumbnails */}
              <div className="mt-3 grid grid-cols-4 gap-3">
                {v.photo ? (
                  [
                    { w: 400, h: 300, q: 80 },
                    { w: 400, h: 250, q: 80 },
                    { w: 350, h: 300, q: 80 },
                    { w: 450, h: 300, q: 80 },
                  ].map((crop, i) => {
                    const baseUrl = v.photo.split("?")[0];
                    const thumbUrl = `${baseUrl}?w=${crop.w}&h=${crop.h}&fit=crop&auto=format&q=${crop.q}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`h-24 overflow-hidden rounded-xl ring-2 transition-all ${
                          i === 0 ? "ring-brand-500" : "ring-transparent hover:ring-brand-300"
                        }`}
                        aria-label={`View photo ${i + 1}`}
                      >
                        <img
                          src={thumbUrl}
                          alt={`${v.year} ${v.make} ${v.model} - view ${i + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    );
                  })
                ) : (
                  [
                    "from-blue-500 to-blue-700",
                    "from-blue-300 to-blue-500",
                    "from-slate-400 to-slate-600",
                    "from-blue-400 to-indigo-500",
                  ].map((grad, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`h-24 overflow-hidden rounded-xl bg-gradient-to-br ${grad} ring-2 transition-all ${
                        i === 0 ? "ring-brand-500" : "ring-transparent hover:ring-brand-300"
                      }`}
                      aria-label={`View photo ${i + 1}`}
                    >
                      <div className="flex h-full items-center justify-center">
                        <svg width="24" height="24" className="h-6 w-6 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

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
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-brand-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  Request Price
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-600 px-6 py-3.5 text-base font-bold text-brand-600 transition-all hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Schedule Test Drive
                </button>
              </div>
            </div>

            {/* Payment Calculator Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <h3 className="text-lg font-bold text-gray-900">Payment Calculator</h3>
              <div className="mt-4 rounded-xl bg-brand-50 p-5 text-center">
                <p className="text-sm text-brand-600">Estimated Monthly Payment</p>
                <p className="mt-1 text-3xl font-bold text-brand-700">$389<span className="text-lg font-normal text-brand-500">/mo</span></p>
                <p className="mt-1 text-xs text-brand-500">72 months at 4.9% APR with $3,000 down</p>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="calc-down" className="text-xs font-medium text-gray-600">Down Payment</label>
                  <input
                    id="calc-down"
                    type="text"
                    defaultValue="$3,000"
                    className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="calc-term" className="text-xs font-medium text-gray-600">Loan Term</label>
                  <select
                    id="calc-term"
                    className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option>36 months</option>
                    <option>48 months</option>
                    <option>60 months</option>
                    <option selected>72 months</option>
                    <option>84 months</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg bg-surface-subtle px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-surface-border"
                >
                  Calculate Payment
                </button>
              </div>
              <a
                href="/financing"
                className="mt-4 block text-center text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                Get Pre-Approved &rarr;
              </a>
            </div>

            {/* Dealer Card */}
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
                  <svg width="20" height="20" className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-gray-900">Wolfpack Motors</p>
                  <p className="text-xs text-gray-500">Denver, CO</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p className="flex items-center gap-2">
                  <svg width="16" height="16" className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Open today 9:00 AM - 8:00 PM
                </p>
                <a href="tel:+13035551234" className="flex items-center gap-2 text-brand-600 font-medium transition-colors hover:text-brand-700">
                  <svg width="16" height="16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  (303) 555-1234
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
      </div>
    </div>
  );
}
