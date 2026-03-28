"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface TradeInSubmission {
  id: string;
  created_at: string;
  year: string;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  condition?: string;
  estimate_low?: number;
  estimate_high?: number;
  lead_captured: boolean;
  converted_to_lead_id?: string;
  contact_name?: string;
  contact_email?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function TradeInAdminPage() {
  const [submissions, setSubmissions] = useState<TradeInSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/trade-in");
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setSubmissions(data.submissions ?? data.estimates ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load submissions.",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Derived stats
  const total = submissions.length;
  const leadsCaptures = submissions.filter((s) => s.lead_captured).length;
  const conversionRate =
    total > 0 ? Math.round((leadsCaptures / total) * 100) : 0;
  const avgValue =
    submissions.length > 0
      ? Math.round(
          submissions
            .filter((s) => s.estimate_low != null && s.estimate_high != null)
            .reduce((acc, s) => {
              const mid = ((s.estimate_low ?? 0) + (s.estimate_high ?? 0)) / 2;
              return acc + mid;
            }, 0) /
            Math.max(
              1,
              submissions.filter(
                (s) => s.estimate_low != null && s.estimate_high != null,
              ).length,
            ),
        )
      : 0;

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Trade-In Submissions
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading…" : `${total} submission${total !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <a
          href="/trade-in"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 sm:flex"
        >
          View Trade-In Page
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Estimates" value={total} />
        <StatCard
          label="Leads Captured"
          value={leadsCaptures}
          color="text-brand-600"
        />
        <StatCard
          label="Conversion Rate"
          value={`${conversionRate}%`}
          sub="captured / total"
          color={conversionRate >= 30 ? "text-emerald-600" : "text-amber-600"}
        />
        <StatCard
          label="Avg Estimated Value"
          value={avgValue > 0 ? formatCurrency(avgValue) : "—"}
          color="text-gray-900"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <caption className="sr-only">Trade-in submissions table</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Vehicle
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell"
                >
                  Mileage
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell"
                >
                  Condition
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Estimated Value
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Lead Captured
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Loading submissions…
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <TradeInIcon className="h-10 w-10 text-gray-300" />
                      <p className="text-sm text-gray-500">
                        No trade-in submissions yet. Share your trade-in page to
                        start collecting estimates.
                      </p>
                      <a
                        href="/trade-in"
                        className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View trade-in page →
                      </a>
                    </div>
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    className="transition-colors hover:bg-surface-muted/50"
                  >
                    {/* Date */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDate(sub.created_at)}
                    </td>

                    {/* Vehicle */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {sub.year} {sub.make} {sub.model}
                        {sub.trim && (
                          <span className="ml-1 text-xs font-normal text-gray-400">
                            {sub.trim}
                          </span>
                        )}
                      </p>
                      {sub.contact_name && (
                        <p className="text-xs text-gray-400">{sub.contact_name}</p>
                      )}
                    </td>

                    {/* Mileage — hidden on mobile */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 sm:table-cell">
                      {sub.mileage != null
                        ? sub.mileage.toLocaleString("en-US") + " mi"
                        : "—"}
                    </td>

                    {/* Condition — hidden on mobile */}
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm sm:table-cell">
                      {sub.condition ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                          {sub.condition}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Estimated Value */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {sub.estimate_low != null && sub.estimate_high != null ? (
                        <span>
                          {formatCurrency(sub.estimate_low)} –{" "}
                          {formatCurrency(sub.estimate_high)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Lead Captured */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {sub.lead_captured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {sub.converted_to_lead_id ? (
                        <a
                          href={`/admin/leads`}
                          className="font-medium text-brand-600 transition-colors hover:text-brand-700"
                        >
                          View Lead →
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Icon                                                                        */
/* -------------------------------------------------------------------------- */

function TradeInIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}
