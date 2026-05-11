"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface CreateResult {
  id: string;
  name: string;
  slug: string;
  public_url: string;
  admin_url: string;
  admin_credentials: { email: string; temp_password: string };
}

export default function NewDealerPage() {
  return (
    <OperatorChrome>
      <NewDealerForm />
    </OperatorChrome>
  );
}

function NewDealerForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("#0070c7");
  const [brandLogo, setBrandLogo] = useState("");

  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name || !slug) {
      setError("Name and slug are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/operator/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          email: contactEmail,
          phone: contactPhone,
          branding: { primary: brandPrimary, logo: brandLogo },
        }),
      });
      const data = (await res.json()) as CreateResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-5" data-testid="dealer-created">
        <h2 className="text-2xl font-bold text-gray-900">Dealer created</h2>
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-5 text-sm">
          <p>
            <strong>{result.name}</strong> ({result.slug}) is live.
          </p>
          <dl className="mt-4 space-y-2 text-gray-800">
            <div className="flex gap-3">
              <dt className="w-40 shrink-0 text-gray-500">Public URL</dt>
              <dd className="font-mono">{result.public_url}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-40 shrink-0 text-gray-500">Admin URL</dt>
              <dd className="font-mono">{result.admin_url}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-40 shrink-0 text-gray-500">Admin email</dt>
              <dd className="font-mono">{result.admin_credentials.email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-40 shrink-0 text-gray-500">Temp password</dt>
              <dd
                className="rounded bg-white px-2 py-1 font-mono text-sm font-semibold text-accent-700"
                data-testid="temp-password"
              >
                {result.admin_credentials.temp_password}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-600">
            Copy this password before navigating away. It will not be shown again.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/operator/dealers/${result.id}`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            data-testid="cta-manage-dealer"
          >
            Manage dealer
          </Link>
          <Link
            href="/operator/dealers"
            className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-surface-subtle"
          >
            Back to dealers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5" data-testid="new-dealer-form">
      <h2 className="text-2xl font-bold text-gray-900">Onboard a new dealer</h2>
      <p className="text-sm text-gray-600">
        Creates the dealer tenant, a default owner admin account, message templates, and
        a webhook placeholder. The owner can complete branding from their own console.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-surface-border bg-white p-6 shadow-card">
        <div>
          <label className="block text-sm font-medium text-gray-700">Dealership name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ACME Motors"
            data-testid="field-name"
            className="mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">URL slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            required
            placeholder="acme-motors"
            data-testid="field-slug"
            className="mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-500">Lowercase letters, digits, hyphens.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Contact email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="owner@acme-motors.com"
              data-testid="field-email"
              className="mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(555) 555-0100"
              data-testid="field-phone"
              className="mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        <fieldset className="rounded-lg border border-surface-border p-3">
          <legend className="px-2 text-xs font-medium text-gray-600">Branding (optional)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-gray-600">Primary color</label>
              <input
                type="color"
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-surface-border"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Logo URL</label>
              <input
                type="url"
                value={brandLogo}
                onChange={(e) => setBrandLogo(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        </fieldset>

        {error && (
          <div role="alert" data-testid="form-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            data-testid="submit-new-dealer"
            className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create dealer"}
          </button>
          <Link
            href="/operator/dealers"
            className="rounded-lg border border-surface-border bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-surface-subtle"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
