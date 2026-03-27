"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CertStatus = "not_started" | "in_progress" | "completed" | "expired";

interface Certification {
  id: string;
  employee_name: string;
  program_name: string;
  oem_program_id: string | null;
  status: CertStatus;
  completed_date: string | null;
  expiry_date: string | null;
  score: number | null;
  required: boolean;
}

interface ApiResponse {
  certifications: Certification[];
  completion_rate: number;
  expiring_soon_count: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<CertStatus, string> = {
  not_started: "bg-gray-100 text-gray-600 ring-gray-400/20",
  in_progress: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  expired: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_LABEL: Record<CertStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  expired: "Expired",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isExpiringSoon(expiry_date: string | null): boolean {
  if (!expiry_date) return false;
  const diff = new Date(expiry_date).getTime() - Date.now();
  return diff > 0 && diff <= THIRTY_DAYS_MS;
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TrainingPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [fEmployee, setFEmployee] = useState("");
  const [fProgram, setFProgram] = useState("");
  const [fOem, setFOem] = useState("");
  const [fStatus, setFStatus] = useState<CertStatus>("completed");
  const [fDate, setFDate] = useState("");
  const [fScore, setFScore] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/training");
      if (res.ok) {
        const json: ApiResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch training data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group certifications by employee
  const grouped = useMemo(() => {
    if (!data) return {} as Record<string, Certification[]>;
    return data.certifications.reduce<Record<string, Certification[]>>((acc, c) => {
      if (!acc[c.employee_name]) acc[c.employee_name] = [];
      acc[c.employee_name].push(c);
      return acc;
    }, {});
  }, [data]);

  const employees = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fEmployee || !fProgram) return;
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/admin/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_name: fEmployee,
          program_name: fProgram,
          oem_program_id: fOem || null,
          status: fStatus,
          completed_date: fDate || null,
          score: fScore ? Number(fScore) : null,
        }),
      });
      if (res.ok) {
        setSuccessMsg("Certification updated successfully.");
        setFEmployee("");
        setFProgram("");
        setFOem("");
        setFStatus("completed");
        setFDate("");
        setFScore("");
        await fetchData();
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (err) {
      console.error("Failed to update certification:", err);
    } finally {
      setSubmitLoading(false);
    }
  }

  const completionRate = data?.completion_rate ?? 0;
  const expiringSoon = data?.expiring_soon_count ?? 0;
  const totalCerts = data?.certifications.length ?? 0;
  const completedCount =
    data?.certifications.filter((c) => c.status === "completed").length ?? 0;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Training &amp; Certifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track OEM program completions and team compliance requirements.
        </p>
      </div>

      {/* Expiring soon alert */}
      {expiringSoon > 0 && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <WarningIcon />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {expiringSoon} certification{expiringSoon > 1 ? "s" : ""} expiring within 30 days
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Review the table below and schedule renewal before the expiry date.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Certifications" value={totalCerts} />
        <StatCard label="Completed" value={completedCount} color="text-green-600" />
        <StatCard label="Expiring Soon" value={expiringSoon} color={expiringSoon > 0 ? "text-amber-600" : undefined} />
        <StatCard label="Compliance Rate" value={`${completionRate}%`} color={completionRate >= 80 ? "text-green-600" : "text-red-600"} />
      </div>

      {/* Compliance progress bar */}
      <div className="mb-8 rounded-card border border-surface-border bg-white p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Overall Compliance Rate</span>
          <span className="text-sm font-bold text-gray-900">{completionRate}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${completionRate >= 80 ? "bg-green-500" : completionRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${completionRate}%` }}
            role="progressbar"
            aria-valuenow={completionRate}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          Based on required certifications only. OEM program IDs link to OEM certification systems; the x-oem-id header scopes which programs are required for this dealer.
        </p>
      </div>

      {/* Employee certification table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading certifications…</div>
      ) : employees.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">No certifications found.</div>
      ) : (
        <div className="mb-8 space-y-6">
          {employees.map((employee) => (
            <section key={employee} aria-labelledby={`emp-${employee.replace(/\s+/g, "-")}`}>
              <h2
                id={`emp-${employee.replace(/\s+/g, "-")}`}
                className="mb-2 text-sm font-semibold text-gray-700"
              >
                {employee}
              </h2>
              <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-border">
                    <caption className="sr-only">Certifications for {employee}</caption>
                    <thead className="bg-surface-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Program</th>
                        <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">OEM ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                        <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Score</th>
                        <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">Expiry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {grouped[employee].map((cert) => (
                        <tr key={cert.id} className="transition-colors hover:bg-surface-muted/50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{cert.program_name}</p>
                            {cert.required && (
                              <span className="text-xs text-brand-600">Required</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-gray-600 sm:table-cell">
                            {cert.oem_program_id ?? <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[cert.status]}`}
                            >
                              {STATUS_LABEL[cert.status]}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-sm text-gray-600 md:table-cell">
                            {cert.score != null ? `${cert.score}%` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="hidden px-4 py-3 text-sm md:table-cell">
                            <span className={isExpiringSoon(cert.expiry_date) ? "font-semibold text-amber-600" : "text-gray-600"}>
                              {fmt(cert.expiry_date)}
                              {isExpiringSoon(cert.expiry_date) && (
                                <span className="ml-1 text-xs text-amber-500">(soon)</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Update form */}
      <section aria-labelledby="update-cert-heading" className="rounded-card border border-surface-border bg-white p-6 shadow-card">
        <h2 id="update-cert-heading" className="mb-4 text-lg font-semibold text-gray-900">
          Update Certification
        </h2>

        {successMsg && (
          <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="f-employee" className="mb-1 block text-xs font-medium text-gray-700">
              Employee Name <span className="text-red-500">*</span>
            </label>
            <input
              id="f-employee"
              type="text"
              required
              value={fEmployee}
              onChange={(e) => setFEmployee(e.target.value)}
              placeholder="e.g. Mike Reynolds"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="f-program" className="mb-1 block text-xs font-medium text-gray-700">
              Program Name <span className="text-red-500">*</span>
            </label>
            <input
              id="f-program"
              type="text"
              required
              value={fProgram}
              onChange={(e) => setFProgram(e.target.value)}
              placeholder="e.g. EV Product Knowledge"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="f-oem" className="mb-1 block text-xs font-medium text-gray-700">
              OEM Program ID
            </label>
            <input
              id="f-oem"
              type="text"
              value={fOem}
              onChange={(e) => setFOem(e.target.value)}
              placeholder="e.g. OEM-EV-2024"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-gray-700">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              id="f-status"
              required
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as CertStatus)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-date" className="mb-1 block text-xs font-medium text-gray-700">
              Completed Date
            </label>
            <input
              id="f-date"
              type="date"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="f-score" className="mb-1 block text-xs font-medium text-gray-700">
              Score (%)
            </label>
            <input
              id="f-score"
              type="number"
              min={0}
              max={100}
              value={fScore}
              onChange={(e) => setFScore(e.target.value)}
              placeholder="e.g. 92"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={submitLoading}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {submitLoading ? "Saving…" : "Save Certification"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
      />
    </svg>
  );
}
