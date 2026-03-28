"use client";

import { useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CategoryScores {
  brandIdentity: number;
  legalDisclosures: number;
  digitalPresence: number;
  leadResponsiveness: number;
}

interface Violation {
  category: string;
  item: string;
  impact: "high" | "medium" | "low";
  recommendation: string;
}

interface ComplianceData {
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  categoryScores: CategoryScores | null;
  violations: Violation[];
  checkedAt: string | null;
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Grade badge                                                                 */
/* -------------------------------------------------------------------------- */

const GRADE_STYLES: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-300",
  B: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300",
  D: "bg-orange-100 text-orange-800 border-orange-300",
  F: "bg-red-100 text-red-800 border-red-300",
};

const IMPACT_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const CATEGORY_META: Array<{
  key: keyof CategoryScores;
  label: string;
  max: number;
}> = [
  { key: "brandIdentity", label: "Brand Identity", max: 25 },
  { key: "legalDisclosures", label: "Legal & Disclosures", max: 30 },
  { key: "digitalPresence", label: "Digital Presence", max: 25 },
  { key: "leadResponsiveness", label: "Lead Responsiveness", max: 20 },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 80) return "text-blue-600";
  if (score >= 70) return "text-yellow-600";
  if (score >= 60) return "text-orange-500";
  return "text-red-600";
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function ScoreGauge({ score }: { score: number | null }) {
  const display = score ?? 0;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
        Overall Score
      </p>
      <div
        className={`text-8xl font-bold tabular-nums ${scoreColor(display)}`}
        aria-label={`Compliance score: ${score ?? "not yet calculated"}`}
      >
        {score !== null ? display : "—"}
      </div>
      <p className="mt-1 text-sm text-gray-400">out of 100</p>
    </div>
  );
}

function GradeBadge({ grade }: { grade: "A" | "B" | "C" | "D" | "F" | null }) {
  if (!grade) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
          Grade
        </p>
        <span className="text-6xl font-bold text-gray-300">—</span>
      </div>
    );
  }

  const style = GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
        Grade
      </p>
      <span
        className={`inline-flex items-center justify-center rounded-xl border px-6 py-2 text-6xl font-bold ${style}`}
      >
        {grade}
      </span>
    </div>
  );
}

function CategoryBars({ scores }: { scores: CategoryScores | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        Category Breakdown
      </h2>
      <div className="space-y-4">
        {CATEGORY_META.map(({ key, label, max }) => {
          const pts = scores ? (scores[key] ?? 0) : 0;
          const pct = Math.round((pts / max) * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{label}</span>
                <span className="tabular-nums text-gray-500">
                  {scores ? pts : "—"} / {max}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-3 rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: scores ? `${pct}%` : "0%" }}
                  role="progressbar"
                  aria-valuenow={pts}
                  aria-valuemax={max}
                  aria-label={`${label}: ${pts} of ${max} points`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ViolationsList({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
        <p className="font-medium text-green-700">
          No violations detected — excellent compliance!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        Violations ({violations.length})
      </h2>
      <ul className="space-y-4">
        {violations.map((v, i) => (
          <li
            key={i}
            className="rounded-xl border border-gray-100 bg-gray-50 p-4"
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {v.category}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${IMPACT_STYLES[v.impact] ?? IMPACT_STYLES.low}`}
              >
                {v.impact}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-800">{v.item}</p>
            <p className="mt-1 text-xs text-gray-500">{v.recommendation}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function CompliancePage() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/compliance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ComplianceData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compliance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLatest();
  }, [fetchLatest]);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/compliance", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ComplianceData;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run compliance check.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            OEM Brand Compliance
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Automated scoring of your dealership against OEM brand standards.
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={checking || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Running…
            </>
          ) : (
            "Run Compliance Check"
          )}
        </button>
      </div>

      {/* Last checked */}
      {data?.checkedAt && (
        <p className="text-xs text-gray-400">
          Last checked: {formatDate(data.checkedAt)}
        </p>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pending message */}
      {!loading && data?.message && data.score === null && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {data.message}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl bg-gray-100"
            />
          ))}
        </div>
      )}

      {/* Main content */}
      {!loading && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <ScoreGauge score={data.score} />
            <GradeBadge grade={data.grade} />
          </div>

          <CategoryBars scores={data.categoryScores} />

          <ViolationsList violations={data.violations ?? []} />
        </>
      )}
    </div>
  );
}
