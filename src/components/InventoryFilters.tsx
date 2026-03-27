"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Facet {
  value: string;
  count: number;
}

interface InventoryFiltersProps {
  makes: Facet[];
  conditions: Facet[];
  bodyStyles: Facet[];
}

export default function InventoryFilters({
  makes,
  conditions,
  bodyStyles,
}: InventoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentMake = searchParams.get("make") ?? "";
  const currentCondition = searchParams.get("condition") ?? "";
  const currentSort = searchParams.get("sort") ?? "";
  const currentQuery = searchParams.get("q") ?? "";
  const currentEvOnly = searchParams.get("ev_only") === "true";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/inventory?${params.toString()}`);
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("/inventory");
  }, [router]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const params = new URLSearchParams();

      const q = formData.get("q") as string;
      if (q?.trim()) params.set("q", q.trim());

      const make = formData.get("make") as string;
      if (make) params.set("make", make);

      // Collect checked condition values
      const condVals = formData.getAll("condition") as string[];
      if (condVals.length === 1) params.set("condition", condVals[0]);

      const sort = currentSort;
      if (sort) params.set("sort", sort);

      const qs = params.toString();
      router.push(qs ? `/inventory?${qs}` : "/inventory");
    },
    [router, currentSort],
  );

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-gray-900">Filters</h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Search */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Search</legend>
          <label htmlFor="filter-search" className="sr-only">
            Keyword search
          </label>
          <div className="relative mt-2">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              id="filter-search"
              name="q"
              type="search"
              defaultValue={currentQuery}
              placeholder="Make, model, keyword..."
              className="w-full rounded-lg border border-surface-border py-2.5 pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </fieldset>

        {/* Make */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Make</legend>
          <label htmlFor="filter-make" className="sr-only">
            Select make
          </label>
          <select
            id="filter-make"
            name="make"
            defaultValue={currentMake}
            onChange={(e) => updateParam("make", e.target.value)}
            className="mt-2 w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All Makes</option>
            {makes.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </fieldset>

        {/* Condition */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Condition</legend>
          <div className="mt-2 space-y-2">
            {(conditions.length > 0
              ? conditions.map((f) => f.value.charAt(0).toUpperCase() + f.value.slice(1))
              : ["New", "Used", "Certified"]
            ).map((opt) => {
              const id = `condition-${opt.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <div key={opt} className="flex items-center gap-2">
                  <input
                    id={id}
                    name="condition"
                    value={opt.toLowerCase()}
                    type="checkbox"
                    defaultChecked={currentCondition === opt.toLowerCase()}
                    onChange={(e) => {
                      updateParam("condition", e.target.checked ? opt.toLowerCase() : "");
                    }}
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

        {/* Body Style */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Body Style</legend>
          <div className="mt-2 space-y-2">
            {(bodyStyles.length > 0
              ? bodyStyles.map((f) => f.value.charAt(0).toUpperCase() + f.value.slice(1))
              : ["Sedan", "SUV", "Truck", "Coupe", "Van", "Wagon", "Convertible"]
            ).map((opt) => {
              const id = `body_style-${opt.toLowerCase().replace(/\s+/g, "-")}`;
              return (
                <div key={opt} className="flex items-center gap-2">
                  <input
                    id={id}
                    name="body_style"
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

        {/* Year Range */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Year</legend>
          <div className="mt-2 flex gap-2">
            <label htmlFor="year-min" className="sr-only">
              Minimum year
            </label>
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
            <label htmlFor="year-max" className="sr-only">
              Maximum year
            </label>
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
            <label htmlFor="price-min" className="sr-only">
              Minimum price
            </label>
            <select
              id="price-min"
              name="price_min"
              className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">No Min</option>
              {[10000, 20000, 30000, 40000, 50000].map((p) => (
                <option key={p} value={p}>
                  ${p / 1000}K
                </option>
              ))}
            </select>
            <label htmlFor="price-max" className="sr-only">
              Maximum price
            </label>
            <select
              id="price-max"
              name="price_max"
              className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">No Max</option>
              {[20000, 30000, 40000, 50000, 75000, 100000].map((p) => (
                <option key={p} value={p}>
                  ${p / 1000}K
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* EV Only toggle */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700">Electric Vehicles</legend>
          <div className="mt-2">
            <button
              type="button"
              role="switch"
              aria-checked={currentEvOnly}
              onClick={() => updateParam("ev_only", currentEvOnly ? "" : "true")}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                currentEvOnly
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-surface-border bg-white text-gray-600 hover:bg-surface-subtle"
              }`}
            >
              <span aria-hidden="true">&#x26A1;</span>
              EVs Only
            </button>
          </div>
        </fieldset>

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Apply Filters
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="w-full rounded-lg border border-surface-border px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-surface-subtle"
        >
          Clear All
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort dropdown — separate client component for the results bar
// ---------------------------------------------------------------------------

export function InventorySortDropdown() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") ?? "";

  const handleSort = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const value = e.target.value;
      if (value) {
        params.set("sort", value);
      } else {
        params.delete("sort");
      }
      router.push(`/inventory?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-by" className="text-sm text-gray-500">
        Sort by:
      </label>
      <select
        id="sort-by"
        value={currentSort}
        onChange={handleSort}
        className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="">Best Match</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="mileage_asc">Mileage: Low to High</option>
        <option value="year_desc">Year: Newest First</option>
      </select>
    </div>
  );
}
