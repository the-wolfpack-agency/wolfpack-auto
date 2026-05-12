"use client";

/**
 * WebsiteAuditRequestForm — public lead-magnet form for the Website Audit.
 *
 * Mobile + desktop responsive (per .ai/client-context.md).
 * Submits JSON to /api/website-audit-request. Surfaces server validation
 * errors inline. No raw fetch elsewhere — uses fetch directly because
 * this is a public unauthenticated form.
 *
 * Plain English. No competitor names. No em dashes.
 */

import { useState } from "react";

interface SuccessState {
  run_id: string;
  status: string;
  status_url: string;
}

const ROLE_OPTIONS = [
  { value: "", label: "Your role" },
  { value: "gm", label: "General Manager" },
  { value: "gsm", label: "General Sales Manager" },
  { value: "marketing_director", label: "Marketing Director" },
  { value: "owner", label: "Owner" },
  { value: "fi_director", label: "F&I Director" },
  { value: "other", label: "Other" },
];

const OEM_OPTIONS = [
  { value: "", label: "OEM affiliation (optional)" },
  { value: "porsche", label: "Porsche" },
  { value: "audi", label: "Audi" },
  { value: "toyota", label: "Toyota" },
  { value: "kia", label: "Kia" },
  { value: "independent", label: "Independent" },
  { value: "other", label: "Other" },
];

export default function WebsiteAuditRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const form = event.currentTarget;
    const fd = new FormData(form);

    const websiteUrl = String(fd.get("website_url") ?? "").trim();
    const email = String(fd.get("contact_email") ?? "").trim();

    // Light client-side validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid contact email.");
      setSubmitting(false);
      return;
    }
    if (!/^https?:\/\//i.test(websiteUrl)) {
      setError("Enter a full website URL (starting with https://).");
      setSubmitting(false);
      return;
    }

    const payload: Record<string, string | undefined> = {
      dealership_name: String(fd.get("dealership_name") ?? ""),
      website_url: websiteUrl,
      contact_name: String(fd.get("contact_name") ?? ""),
      contact_email: email,
      contact_phone: (String(fd.get("contact_phone") ?? "") || undefined) as string | undefined,
      contact_role: (String(fd.get("contact_role") ?? "") || undefined) as string | undefined,
      oem_affiliation: (String(fd.get("oem_affiliation") ?? "") || undefined) as string | undefined,
    };

    try {
      const res = await fetch("/api/website-audit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<SuccessState> & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Submission failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      setSuccess({
        run_id: String(body.run_id ?? ""),
        status: String(body.status ?? "pending"),
        status_url: String(body.status_url ?? ""),
      });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        data-testid="website-audit-success"
        className="rounded-lg border border-green-200 bg-green-50 p-6"
      >
        <h3 className="text-lg font-semibold text-green-900">Audit queued.</h3>
        <p className="mt-2 text-sm text-green-800">
          Your audit run id is{" "}
          <code className="rounded bg-green-100 px-1 py-0.5 text-xs">{success.run_id}</code>
          . We will scan your site and email the 4-page PDF to the address you
          provided within the next business day.
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
      data-testid="website-audit-form"
      onSubmit={handleSubmit}
      className="space-y-4"
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
          <span className="text-sm font-medium text-gray-700">Website URL</span>
          <input
            type="url"
            name="website_url"
            required
            placeholder="https://www.acmemotors.com"
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
        <span className="text-sm font-medium text-gray-700">OEM affiliation</span>
        <select
          name="oem_affiliation"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {OEM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div
          data-testid="website-audit-error"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        data-testid="website-audit-submit"
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Get my audit"}
      </button>

      <p className="text-xs text-gray-500">
        We will scan only the public pages of your dealer website. We do not
        collect customer data and we do not share results with other dealers.
      </p>
    </form>
  );
}
