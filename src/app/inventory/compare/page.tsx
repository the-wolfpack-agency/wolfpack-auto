import type { Metadata } from "next";
import { getVehicleByVin, type VehicleDetail } from "@/lib/data";
import CompareTracker, { CompareWinnerLink } from "@/components/CompareTracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare Vehicles",
  description: "Compare vehicles side by side to find the perfect match.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // Accept up to 3 VINs via ?vins=VIN1,VIN2,VIN3
  const vinsParam = typeof sp.vins === "string" ? sp.vins : "";
  const vins = vinsParam.split(",").filter(Boolean).slice(0, 3);

  const vehicles: VehicleDetail[] = [];
  for (const vin of vins) {
    const { data } = await getVehicleByVin(vin);
    if (data) vehicles.push(data);
  }

  const specs: { label: string; key: keyof VehicleDetail | ((v: VehicleDetail) => string) }[] = [
    { label: "Price", key: (v) => `$${v.price.toLocaleString()}` },
    { label: "MSRP", key: (v) => `$${v.msrp.toLocaleString()}` },
    { label: "Savings", key: (v) => `$${(v.msrp - v.price).toLocaleString()}` },
    { label: "Mileage", key: (v) => `${v.mileage.toLocaleString()} mi` },
    { label: "Condition", key: "condition" },
    { label: "Fuel Type", key: "fuelType" },
    { label: "Engine", key: "engine" },
    { label: "Transmission", key: "transmission" },
    { label: "Drivetrain", key: "drivetrain" },
    { label: "MPG", key: "mpg" },
    { label: "Exterior", key: "exteriorColor" },
    { label: "Interior", key: "interiorColor" },
  ];

  function getValue(v: VehicleDetail, spec: typeof specs[number]): string {
    if (typeof spec.key === "function") return spec.key(v);
    return String(v[spec.key] ?? "—");
  }

  const allVins = vehicles.map((v) => v.vin);

  return (
    <CompareTracker vins={allVins}>
    <div className="bg-surface-muted min-h-screen">
      {/* Header */}
      <div className="bg-brand-950 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-2 text-sm text-brand-300">
              <li><a href="/" className="transition-colors hover:text-white">Home</a></li>
              <li aria-hidden="true">/</li>
              <li><a href="/inventory" className="transition-colors hover:text-white">Inventory</a></li>
              <li aria-hidden="true">/</li>
              <li className="text-white font-medium">Compare</li>
            </ol>
          </nav>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Compare Vehicles</h1>
          <p className="mt-2 text-brand-200">Side-by-side comparison to find your perfect match.</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {vehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-card">
            <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No vehicles selected</h2>
            <p className="mt-2 text-sm text-gray-500">
              Select up to 3 vehicles from the inventory to compare them side by side.
            </p>
            <a
              href="/inventory"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Browse Inventory
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              {/* Vehicle Cards Row */}
              <thead>
                <tr>
                  <th className="w-40 p-2" />
                  {vehicles.map((v) => (
                    <th key={v.vin} className="p-2 text-left align-top">
                      <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
                        <div className={`relative h-40 overflow-hidden rounded-lg bg-gradient-to-br ${v.gradient}`}>
                          {v.photo && (
                            <img
                              src={v.photo}
                              alt={`${v.year} ${v.make} ${v.model}`}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="mt-3">
                          <p className="text-xs font-medium text-brand-600">{v.condition} {v.year}</p>
                          <h3 className="text-lg font-bold text-gray-900">{v.make} {v.model}</h3>
                          <p className="text-sm text-gray-500">{v.trim}</p>
                          <p className="mt-2 text-xl font-bold text-brand-700">${v.price.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <a
                            href={`/inventory/${v.vin}`}
                            className="flex-1 rounded-lg bg-brand-50 px-3 py-2 text-center text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
                          >
                            View Details
                          </a>
                          <CompareWinnerLink
                            vin={v.vin}
                            allVins={allVins}
                            href={`/contact?subject=test_drive&vehicle=${encodeURIComponent(`${v.year} ${v.make} ${v.model} ${v.trim}`)}&vin=${v.vin}`}
                            className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                          >
                            Test Drive
                          </CompareWinnerLink>
                        </div>
                      </div>
                    </th>
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: 3 - vehicles.length }).map((_, i) => (
                    <th key={`empty-${i}`} className="p-2 align-top">
                      <a
                        href="/inventory"
                        className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-4 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
                      >
                        <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <p className="mt-2 text-sm font-medium text-gray-500">Add Vehicle</p>
                      </a>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Specs Comparison */}
              <tbody>
                {specs.map((spec, i) => (
                  <tr
                    key={spec.label}
                    className={i % 2 === 0 ? "bg-white" : "bg-surface-muted"}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{spec.label}</td>
                    {vehicles.map((v) => {
                      const val = getValue(v, spec);
                      return (
                        <td key={v.vin} className="px-4 py-3 text-sm text-gray-900">
                          {val}
                        </td>
                      );
                    })}
                    {Array.from({ length: 3 - vehicles.length }).map((_, j) => (
                      <td key={`empty-${j}`} className="px-4 py-3 text-sm text-gray-300">—</td>
                    ))}
                  </tr>
                ))}

                {/* Features Comparison */}
                <tr className="border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">Key Features</td>
                  {vehicles.map((v) => (
                    <td key={v.vin} className="px-4 py-3">
                      <ul className="space-y-1">
                        {v.features.map((f) => (
                          <li key={f} className="flex items-start gap-1.5 text-xs text-gray-700">
                            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </td>
                  ))}
                  {Array.from({ length: 3 - vehicles.length }).map((_, j) => (
                    <td key={`empty-feat-${j}`} className="px-4 py-3 text-sm text-gray-300">—</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </CompareTracker>
  );
}
