import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Browse our full vehicle inventory with advanced filters.",
};

const vehicles = [
  {
    vin: "1HGCV1F34PA000001",
    year: 2024,
    make: "Honda",
    model: "CR-V",
    trim: "EX-L",
    price: 34_250,
    msrp: 36_500,
    mileage: 1_283,
    fuel: "Gasoline",
    transmission: "CVT",
    gradient: "from-blue-400 to-blue-600",
    condition: "New",
    bodyStyle: "SUV",
  },
  {
    vin: "5YJ3E1EA1PF000002",
    year: 2023,
    make: "Tesla",
    model: "Model 3",
    trim: "Long Range",
    price: 38_990,
    msrp: 42_990,
    mileage: 12_450,
    fuel: "Electric",
    transmission: "Single-Speed",
    gradient: "from-red-400 to-red-600",
    condition: "Used",
    bodyStyle: "Sedan",
  },
  {
    vin: "2T3P1RFV4RC000003",
    year: 2024,
    make: "Toyota",
    model: "RAV4",
    trim: "XLE Premium",
    price: 35_875,
    msrp: 37_200,
    mileage: 856,
    fuel: "Hybrid",
    transmission: "CVT",
    gradient: "from-emerald-400 to-emerald-600",
    condition: "New",
    bodyStyle: "SUV",
  },
  {
    vin: "5UXTS3C50P9000004",
    year: 2023,
    make: "BMW",
    model: "X3",
    trim: "xDrive30i",
    price: 42_500,
    msrp: 48_750,
    mileage: 8_720,
    fuel: "Gasoline",
    transmission: "8-Speed Auto",
    gradient: "from-slate-500 to-slate-700",
    condition: "Certified",
    bodyStyle: "SUV",
  },
  {
    vin: "1G1YA2D4XP5000005",
    year: 2024,
    make: "Chevrolet",
    model: "Corvette",
    trim: "Stingray 2LT",
    price: 68_900,
    msrp: 72_400,
    mileage: 3_210,
    fuel: "Gasoline",
    transmission: "8-Speed DCT",
    gradient: "from-yellow-400 to-orange-500",
    condition: "Used",
    bodyStyle: "Coupe",
  },
  {
    vin: "1FTFW1E89PKA00006",
    year: 2023,
    make: "Ford",
    model: "F-150",
    trim: "Lariat",
    price: 52_350,
    msrp: 58_100,
    mileage: 15_680,
    fuel: "Gasoline",
    transmission: "10-Speed Auto",
    gradient: "from-sky-400 to-indigo-500",
    condition: "Used",
    bodyStyle: "Truck",
  },
];

export default function InventoryPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const query = typeof searchParams.q === "string" ? searchParams.q : "";

  return (
    <div className="bg-surface-muted min-h-screen">
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
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <h2 className="text-lg font-bold text-gray-900">Filters</h2>
              <form method="GET" action="/inventory" className="mt-6 space-y-6">
                {/* Search */}
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-700">Search</legend>
                  <label htmlFor="filter-search" className="sr-only">Keyword search</label>
                  <div className="relative mt-2">
                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      id="filter-search"
                      name="q"
                      type="search"
                      defaultValue={query}
                      placeholder="Make, model, keyword..."
                      className="w-full rounded-lg border border-surface-border py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </fieldset>

                {/* Make */}
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-700">Make</legend>
                  <label htmlFor="filter-make" className="sr-only">Select make</label>
                  <select
                    id="filter-make"
                    name="make"
                    className="mt-2 w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">All Makes</option>
                    <option>BMW</option>
                    <option>Chevrolet</option>
                    <option>Ford</option>
                    <option>Honda</option>
                    <option>Tesla</option>
                    <option>Toyota</option>
                  </select>
                </fieldset>

                {/* Model */}
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-700">Model</legend>
                  <label htmlFor="filter-model" className="sr-only">Select model</label>
                  <select
                    id="filter-model"
                    name="model"
                    className="mt-2 w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">All Models</option>
                  </select>
                </fieldset>

                {/* Condition */}
                <FilterGroup
                  legend="Condition"
                  name="condition"
                  options={["New", "Used", "Certified"]}
                />

                {/* Body Style */}
                <FilterGroup
                  legend="Body Style"
                  name="body_style"
                  options={["Sedan", "SUV", "Truck", "Coupe", "Van", "Wagon", "Convertible"]}
                />

                {/* Year Range */}
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-700">Year</legend>
                  <div className="mt-2 flex gap-2">
                    <label htmlFor="year-min" className="sr-only">Minimum year</label>
                    <select
                      id="year-min"
                      name="year_min"
                      className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">From</option>
                      {[2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                    </select>
                    <label htmlFor="year-max" className="sr-only">Maximum year</label>
                    <select
                      id="year-max"
                      name="year_max"
                      className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">To</option>
                      {[2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>

                {/* Price Range */}
                <fieldset>
                  <legend className="text-sm font-semibold text-gray-700">Price Range</legend>
                  <div className="mt-2 flex gap-2">
                    <label htmlFor="price-min" className="sr-only">Minimum price</label>
                    <select
                      id="price-min"
                      name="price_min"
                      className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">No Min</option>
                      {[10000, 20000, 30000, 40000, 50000].map((p) => (
                        <option key={p} value={p}>${(p / 1000)}K</option>
                      ))}
                    </select>
                    <label htmlFor="price-max" className="sr-only">Maximum price</label>
                    <select
                      id="price-max"
                      name="price_max"
                      className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">No Max</option>
                      {[20000, 30000, 40000, 50000, 75000, 100000].map((p) => (
                        <option key={p} value={p}>${(p / 1000)}K</option>
                      ))}
                    </select>
                  </div>
                </fieldset>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  Apply Filters
                </button>
                <button
                  type="reset"
                  className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-subtle"
                >
                  Clear All
                </button>
              </form>
            </div>
          </aside>

          {/* Results */}
          <section aria-label="Search results" className="flex-1">
            {/* Sort Bar */}
            <div className="flex items-center justify-between rounded-xl border border-surface-border bg-white px-5 py-3 shadow-card">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">24</span> vehicles
                {query && (
                  <span> for &ldquo;<span className="font-medium">{query}</span>&rdquo;</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="sort-by" className="text-sm text-gray-500">Sort by:</label>
                <select
                  id="sort-by"
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option>Best Match</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                  <option>Mileage: Low to High</option>
                  <option>Year: Newest First</option>
                </select>
              </div>
            </div>

            {/* Vehicle Grid */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {vehicles.map((v) => (
                <a
                  key={v.vin}
                  href={`/inventory/${v.vin}`}
                  className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition-all hover:shadow-card-hover hover:-translate-y-1"
                >
                  <div className={`relative h-48 bg-gradient-to-br ${v.gradient}`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg width="64" height="64" className="h-16 w-16 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                    </div>
                    <div className="absolute left-3 top-3 flex gap-2">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
                        {v.condition}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-600 backdrop-blur-sm transition-colors hover:bg-white hover:text-red-500"
                      aria-label={`Save ${v.year} ${v.make} ${v.model}`}
                    >
                      <svg width="16" height="16" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </button>
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
    </div>
  );
}

function FilterGroup({
  legend,
  name,
  options,
}: {
  legend: string;
  name: string;
  options: string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700">{legend}</legend>
      <div className="mt-2 space-y-2">
        {options.map((opt) => {
          const id = `${name}-${opt.toLowerCase().replace(/\s+/g, "-")}`;
          return (
            <div key={opt} className="flex items-center gap-2">
              <input
                id={id}
                name={name}
                value={opt.toLowerCase()}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor={id} className="text-sm text-gray-600">
                {opt}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
