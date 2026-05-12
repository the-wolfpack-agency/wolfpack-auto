"use client";

/**
 * AuditRequestForm — public lead-magnet form for the F&I Penetration Audit.
 *
 * Mobile + desktop responsive. Submits multipart/form-data to
 * /api/audit-request. Surfaces server validation errors inline and shows
 * an explicit "audit queued" confirmation with the run id.
 *
 * No client-side analytics or fetch wrappers — the form is intentionally
 * lightweight so it loads on a prospect's mobile data plan in <1s.
 */

import { useState } from "react";

interface SuccessState {
  id: string;
  status: string;
}

const ROLE_OPTIONS = [
  { value: "", label: "Your role" },
  { value: "fi_director", label: "F&I Director" },
  { value: "gm", label: "General Manager" },
  { value: "gsm", label: "General Sales Manager" },
  { value: "controller", label: "Controller" },
  { value: "other", label: "Other" },
];

export default function AuditRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    setUploadProgress(10);

    const form = event.currentTarget;
    const data = new FormData(form);

    // Light client-side validation
    const email = String(data.get("contact_email") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid contact email.");
      setSubmitting(false);
      setUploadProgress(0);
      return;
    }
    const csv = data.get("csv_file");
    if (!csv || (csv instanceof File && csv.size === 0)) {
      setError("Upload a CSV of your funded deals.");
      setSubmitting(false);
      setUploadProgress(0);
      return;
    }

    try {
      setUploadProgress(40);
      const res = await fetch("/api/audit-request", {
        method: "POST",
        body: data,
      });
      setUploadProgress(85);
      const body = (await res.json().catch(() => ({}))) as Partial<SuccessState> & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Submission failed (HTTP ${res.status})`);
        setSubmitting(false);
        setUploadProgress(0);
        return;
      }
      setSuccess({
        id: String(body.id ?? ""),
        status: String(body.status ?? "pending"),
      });
      setUploadProgress(100);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploadProgress(0);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        data-testid="audit-request-success"
        className="rounded-lg border border-green-200 bg-green-50 p-6"
      >
        <h3 className="text-lg font-semibold text-green-900">Audit queued.</h3>
        <p className="mt-2 text-sm text-green-800">
          Your audit run id is{" "}
          <code className="rounded bg-green-100 px-1 py-0.5 text-xs">{success.id}</code>
          . We will email the 4-page PDF to the address you provided within the
          next business day. No phone call required.
        </p>
        <button
          type="button"
          className="mt-4 rounded border border-green-300 px-3 py-1.5 text-sm text-green-900 hover:bg-green-100"
          onClick={() => setSuccess(null)}
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form
      data-testid="audit-request-form"
      onSubmit={handleSubmit}
      className="space-y-4"
      encType="multipart/form-data"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Dealership name</span>
          <input
            type="text"
            name="dealership_name"
            required
            minLength={2}
            maxLength={200}
            placeholder="ACME Motors"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Rooftops</span>
          <input
            type="number"
            name="rooftops_count"
            defaultValue={1}
            min={1}
            max={500}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Your name</span>
          <input
            type="text"
            name="contact_name"
            required
            minLength={2}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Your email</span>
          <input
            type="email"
            name="contact_email"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Phone (optional)</span>
          <input
            type="tel"
            name="contact_phone"
            maxLength={40}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Role</span>
          <select
            name="contact_role"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Funded-deal CSV (last 3 months)
        </span>
        <input
          type="file"
          name="csv_file"
          accept=".csv,text/csv"
          required
          className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-blue-700"
        />
        <span className="mt-1 block text-xs text-gray-500">
          Required columns: deal_id, fi_manager, funded_at (or created_at), plus
          at least one product attach column (e.g. gap, warranty, tire_wheel).
        </span>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="anonymize" value="1" />
        <span className="text-sm text-gray-700">
          Anonymize manager names in the PDF (recommended for first-time audits)
        </span>
      </label>

      {error && (
        <div
          data-testid="audit-request-error"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {submitting && uploadProgress > 0 && (
        <div
          data-testid="audit-request-progress"
          className="h-2 w-full overflow-hidden rounded bg-gray-200"
          role="progressbar"
          aria-valuenow={uploadProgress}
        >
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        data-testid="audit-request-submit"
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Get my audit"}
      </button>

      <p className="text-xs text-gray-500">
        We don&apos;t share your data. The audit runs on your data alone; we
        don&apos;t aggregate it with other dealers.
      </p>
    </form>
  );
}
