"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MarketIntelCard } from "@/components/admin/MarketIntelCard";

const CONDITIONS = ["new", "used", "certified"] as const;
const FUEL_TYPES = ["gasoline", "hybrid", "electric", "diesel"] as const;
const TRANSMISSIONS = ["automatic", "manual"] as const;
const BODY_STYLES = ["sedan", "suv", "truck", "coupe", "van", "wagon", "convertible"] as const;
const STATUSES = ["available", "pending", "sold", "in_transit"] as const;

type Condition = (typeof CONDITIONS)[number];
type FuelType = (typeof FUEL_TYPES)[number];
type Transmission = (typeof TRANSMISSIONS)[number];
type BodyStyle = (typeof BODY_STYLES)[number];
type VehicleStatus = (typeof STATUSES)[number];

interface FormState {
  year: string;
  make: string;
  model: string;
  trim: string;
  condition: Condition;
  price: string;
  msrp: string;
  mileage: string;
  fuel_type: FuelType;
  transmission: Transmission;
  exterior_color: string;
  body_style: BodyStyle;
  description: string;
  status: VehicleStatus;
}

const inputCls =
  "mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

const labelCls = "block text-sm font-medium text-gray-700";

function FieldGroup({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function EditInventoryPage() {
  const params = useParams<{ vin: string }>();
  const router = useRouter();
  const vin = params.vin?.toUpperCase() ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ---- Load existing vehicle data ---- */
  useEffect(() => {
    if (!vin) return;

    async function load() {
      try {
        const res = await fetch(`/api/admin/vehicles/${vin}`);
        if (!res.ok) {
          setLoadError(res.status === 404 ? "Vehicle not found" : "Failed to load vehicle");
          return;
        }
        const v = await res.json();
        setForm({
          year: String(v.year ?? ""),
          make: v.make ?? "",
          model: v.model ?? "",
          trim: v.trim ?? "",
          condition: (CONDITIONS.includes(v.condition) ? v.condition : "used") as Condition,
          price: v.price ? String(Number(v.price)) : "",
          msrp: v.msrp ? String(Number(v.msrp)) : "",
          mileage: v.mileage != null ? String(Number(v.mileage)) : "",
          fuel_type: (FUEL_TYPES.includes(v.fuel_type) ? v.fuel_type : "gasoline") as FuelType,
          transmission: (TRANSMISSIONS.includes(v.transmission) ? v.transmission : "automatic") as Transmission,
          exterior_color: v.exterior_color ?? "",
          body_style: (BODY_STYLES.includes(v.body_style) ? v.body_style : "sedan") as BodyStyle,
          description: v.description ?? "",
          status: (STATUSES.includes(v.status) ? v.status : "available") as VehicleStatus,
        });
      } catch {
        setLoadError("Failed to load vehicle data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [vin]);

  function update(field: keyof FormState) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((prev) =>
        prev ? { ...prev, [field]: e.target.value } : prev,
      );
  }

  /* ---- Save handler ---- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitError(null);

    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setSubmitError("Price must be a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/inventory/${vin}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: parseInt(form.year, 10),
          make: form.make.trim(),
          model: form.model.trim(),
          trim: form.trim.trim() || null,
          condition: form.condition,
          price: priceNum,
          msrp: form.msrp ? parseFloat(form.msrp) : priceNum,
          mileage: form.mileage ? parseInt(form.mileage, 10) : 0,
          fuel_type: form.fuel_type,
          transmission: form.transmission,
          exterior_color: form.exterior_color.trim() || null,
          body_style: form.body_style,
          description: form.description.trim() || null,
          status: form.status,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSubmitError(json.error ?? "Failed to update vehicle.");
        return;
      }

      router.push("/admin/inventory");
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Delete handler ---- */
  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/inventory/${vin}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSubmitError(json.error ?? "Failed to delete vehicle.");
        setShowDeleteConfirm(false);
        return;
      }

      router.push("/admin/inventory");
    } catch {
      setSubmitError("Network error — please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"
            aria-label="Loading"
          />
          <p className="text-sm text-gray-500">Loading vehicle data…</p>
        </div>
      </div>
    );
  }

  /* ---- Not found ---- */
  if (loadError) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-lg font-semibold text-gray-900">{loadError}</p>
          <a
            href="/admin/inventory"
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Back to Inventory
          </a>
        </div>
      </div>
    );
  }

  if (!form) return null;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
          <a href="/admin" className="hover:text-gray-700">
            Admin
          </a>
          <span className="mx-2">/</span>
          <a href="/admin/inventory" className="hover:text-gray-700">
            Inventory
          </a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">
            {form.year} {form.make} {form.model}
          </span>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Vehicle</h1>
            <p className="mt-0.5 font-mono text-sm text-gray-500">VIN: {vin}</p>
          </div>
          <div className="flex gap-3">
            <a
              href={`/inventory/${vin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-muted"
            >
              View Listing
              <ExternalIcon className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {submitError && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-6 shadow-xl">
            <h2
              id="delete-confirm-title"
              className="mb-2 text-lg font-semibold text-gray-900"
            >
              Delete Vehicle?
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              This will permanently remove{" "}
              <strong>
                {form.year} {form.make} {form.model}
              </strong>{" "}
              (VIN: {vin}) from inventory. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-surface-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  />
                )}
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Market Intel — live valuation + comparables + recommendation */}
      <MarketIntelCard vin={vin} />

      <form onSubmit={handleSubmit} noValidate>
        {/* ---------------------------------------------------------------- */}
        {/* Identity                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="identity-heading"
          className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="identity-heading"
            className="mb-6 text-base font-semibold text-gray-900"
          >
            Vehicle Identity
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* VIN is immutable */}
            <FieldGroup label="VIN" htmlFor="vin-display">
              <input
                id="vin-display"
                type="text"
                value={vin}
                readOnly
                className={
                  inputCls +
                  " cursor-not-allowed bg-surface-subtle font-mono tracking-wide text-gray-500"
                }
              />
            </FieldGroup>

            <FieldGroup label="Status" htmlFor="status">
              <select
                id="status"
                value={form.status}
                onChange={update("status")}
                className={inputCls}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s
                      .split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Year" htmlFor="year" required>
              <input
                id="year"
                type="number"
                value={form.year}
                onChange={update("year")}
                min={1900}
                max={new Date().getFullYear() + 2}
                className={inputCls}
                required
              />
            </FieldGroup>

            <FieldGroup label="Condition" htmlFor="condition">
              <select
                id="condition"
                value={form.condition}
                onChange={update("condition")}
                className={inputCls}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Make" htmlFor="make" required>
              <input
                id="make"
                type="text"
                value={form.make}
                onChange={update("make")}
                className={inputCls}
                required
              />
            </FieldGroup>

            <FieldGroup label="Model" htmlFor="model" required>
              <input
                id="model"
                type="text"
                value={form.model}
                onChange={update("model")}
                className={inputCls}
                required
              />
            </FieldGroup>

            <FieldGroup label="Trim" htmlFor="trim">
              <input
                id="trim"
                type="text"
                value={form.trim}
                onChange={update("trim")}
                className={inputCls}
                placeholder="Optional"
              />
            </FieldGroup>

            <FieldGroup label="Body Style" htmlFor="body_style">
              <select
                id="body_style"
                value={form.body_style}
                onChange={update("body_style")}
                className={inputCls}
              >
                {BODY_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FieldGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Pricing & Mileage                                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="pricing-heading"
          className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="pricing-heading"
            className="mb-6 text-base font-semibold text-gray-900"
          >
            Pricing &amp; Mileage
          </h2>

          <div className="grid gap-5 sm:grid-cols-3">
            <FieldGroup label="Sale Price ($)" htmlFor="price" required>
              <input
                id="price"
                type="number"
                value={form.price}
                onChange={update("price")}
                min={1}
                step={1}
                className={inputCls}
                required
              />
            </FieldGroup>

            <FieldGroup label="MSRP ($)" htmlFor="msrp">
              <input
                id="msrp"
                type="number"
                value={form.msrp}
                onChange={update("msrp")}
                min={1}
                step={1}
                className={inputCls}
              />
            </FieldGroup>

            <FieldGroup label="Mileage" htmlFor="mileage">
              <input
                id="mileage"
                type="number"
                value={form.mileage}
                onChange={update("mileage")}
                min={0}
                step={1}
                className={inputCls}
              />
            </FieldGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Specs                                                            */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="specs-heading"
          className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="specs-heading"
            className="mb-6 text-base font-semibold text-gray-900"
          >
            Specifications
          </h2>

          <div className="grid gap-5 sm:grid-cols-3">
            <FieldGroup label="Fuel Type" htmlFor="fuel_type">
              <select
                id="fuel_type"
                value={form.fuel_type}
                onChange={update("fuel_type")}
                className={inputCls}
              >
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Transmission" htmlFor="transmission">
              <select
                id="transmission"
                value={form.transmission}
                onChange={update("transmission")}
                className={inputCls}
              >
                {TRANSMISSIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Exterior Color" htmlFor="exterior_color">
              <input
                id="exterior_color"
                type="text"
                value={form.exterior_color}
                onChange={update("exterior_color")}
                className={inputCls}
                placeholder="Midnight Blue"
              />
            </FieldGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Description                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="desc-heading"
          className="mb-6 rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="desc-heading"
            className="mb-6 text-base font-semibold text-gray-900"
          >
            Description
          </h2>

          <label htmlFor="description" className={labelCls}>
            Vehicle Description
          </label>
          <textarea
            id="description"
            value={form.description}
            onChange={update("description")}
            rows={5}
            className={inputCls + " resize-y"}
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Actions                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-end gap-4">
          <a
            href="/admin/inventory"
            className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-muted"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
            )}
            {submitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

function ExternalIcon({ className }: { className?: string }) {
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
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
