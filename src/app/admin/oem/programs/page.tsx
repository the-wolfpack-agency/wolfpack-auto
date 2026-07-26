import type { Metadata } from "next";
import Link from "next/link";
import { getOemPrograms } from "@/db/queries/oem";

export const metadata: Metadata = { title: "OEM Programs" };

const TYPE_LABELS: Record<string, string> = {
  incentive: "Incentive",
  certification: "Certification",
  brand_standard: "Brand Standard",
  training: "Training",
  co_op_advertising: "Co-op Advertising",
};

const TYPE_COLORS: Record<string, string> = {
  incentive: "bg-green-100 text-green-700",
  certification: "bg-brand-100 text-brand-800",
  brand_standard: "bg-purple-100 text-purple-700",
  training: "bg-yellow-100 text-yellow-700",
  co_op_advertising: "bg-orange-100 text-orange-700",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatIncentive(amount: number | null, pct: number | null): string {
  if (amount != null) return `$${amount.toLocaleString()}`;
  if (pct != null) return `${pct}%`;
  return "—";
}

// ---------------------------------------------------------------------------
// Empty state — what programs look like before data
// ---------------------------------------------------------------------------

const PROGRAM_TEMPLATES = [
  {
    type: "incentive",
    name: "Q2 Sales Accelerator",
    description: "Dealers who sell 10+ certified pre-owned units receive a $500/unit rebate.",
  },
  {
    type: "certification",
    name: "Certified EV Dealer",
    description: "Comprehensive EV sales + service certification. Required for EV model allocation.",
  },
  {
    type: "brand_standard",
    name: "Digital Retailing Standard",
    description: "All franchise sites must offer online trade-in valuation and payment estimator.",
  },
  {
    type: "training",
    name: "F&I Product Training 2026",
    description: "Annual financing & insurance product compliance training. Required by April 30.",
  },
  {
    type: "co_op_advertising",
    name: "Summer Drive Event",
    description: "50% co-op reimbursement for qualifying digital and broadcast advertising.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OemProgramsPage() {
  const programs = await getOemPrograms();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/admin/oem" className="hover:text-brand-600">OEM Network</Link>
            <span>/</span>
            <span>Programs</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Programs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Incentive programs, certification tiers, brand standards, and co-op advertising.
          </p>
        </div>
        <span className="self-start inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400 shadow-sm">
          + New Program
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">Soon</span>
        </span>
      </div>

      {programs.length === 0 ? (
        <>
          {/* Pre-migration: show what programs look like */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <strong className="text-gray-700">No programs yet.</strong>{" "}
            Use the &ldquo;+ New Program&rdquo; button above to create your first OEM program.
            Below is a preview of supported program types.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROGRAM_TEMPLATES.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 opacity-75"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-700">{t.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      TYPE_COLORS[t.type] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {TYPE_LABELS[t.type]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{t.description}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Summary counts by type */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(TYPE_LABELS).map(([key, label]) => {
              const count = programs.filter((p) => p.type === key).length;
              if (count === 0) return null;
              return (
                <span
                  key={key}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    TYPE_COLORS[key] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {count} {label}
                </span>
              );
            })}
          </div>

          {/* Program cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {p.is_required && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                        Required
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[p.type] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {TYPE_LABELS[p.type] ?? p.type}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      p.is_active ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <h3 className="mt-3 font-semibold text-gray-900">{p.name}</h3>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{p.description}</p>
                )}

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {p.enrollment_count ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">Enrolled</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {p.completion_rate != null ? `${p.completion_rate}%` : "—"}
                    </p>
                    <p className="text-xs text-gray-400">Complete</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-brand-600">
                      {formatIncentive(p.incentive_amount, p.incentive_pct)}
                    </p>
                    <p className="text-xs text-gray-400">Incentive</p>
                  </div>
                </div>

                {/* Dates */}
                {(p.start_date || p.end_date) && (
                  <p className="mt-3 text-xs text-gray-400">
                    {formatDate(p.start_date)} – {formatDate(p.end_date)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
