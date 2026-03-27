"use client";

import type { Metadata } from "next";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Note: metadata export requires a server component boundary.
// The title is handled by the admin layout template.

const CONDITIONS = ["new", "used", "certified"] as const;
const FUEL_TYPES = ["gasoline", "hybrid", "electric", "diesel"] as const;
const TRANSMISSIONS = ["automatic", "manual"] as const;
const BODY_STYLES = ["sedan", "suv", "truck", "coupe", "van", "wagon", "convertible"] as const;

type Condition = (typeof CONDITIONS)[number];
type FuelType = (typeof FUEL_TYPES)[number];
type Transmission = (typeof TRANSMISSIONS)[number];
type BodyStyle = (typeof BODY_STYLES)[number];

interface FormState {
  vin: string;
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
}

const INITIAL: FormState = {
  vin: "",
  year: String(new Date().getFullYear()),
  make: "",
  model: "",
  trim: "",
  condition: "used",
  price: "",
  msrp: "",
  mileage: "",
  fuel_type: "gasoline",
  transmission: "automatic",
  exterior_color: "",
  body_style: "sedan",
  description: "",
};

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

export default function AddInventoryPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!form.vin.trim()) return setError("VIN is required.");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(form.vin.trim())) {
      return setError("VIN must be exactly 17 characters (A–Z, 0–9, no I/O/Q).");
    }
    const yearNum = parseInt(form.year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 2) {
      return setError("Year must be a valid model year.");
    }
    if (!form.make.trim()) return setError("Make is required.");
    if (!form.model.trim()) return setError("Model is required.");
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum <= 0) return setError("Price must be a positive number.");

    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: form.vin.trim().toUpperCase(),
          year: yearNum,
          make: form.make.trim(),
          model: form.model.trim(),
          trim: form.trim.trim() || undefined,
          condition: form.condition,
          price: priceNum,
          msrp: form.msrp ? parseFloat(form.msrp) : priceNum,
          mileage: form.mileage ? parseInt(form.mileage, 10) : 0,
          fuel_type: form.fuel_type,
          transmission: form.transmission,
          exterior_color: form.exterior_color.trim() || undefined,
          body_style: form.body_style,
          description: form.description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(json.error ?? "Failed to add vehicle.");
        return;
      }

      router.push("/admin/inventory");
    } catch (err) {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
          <span className="text-gray-900">Add Vehicle</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Add Vehicle</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter vehicle details to add it to your inventory.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

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
            <FieldGroup label="VIN" htmlFor="vin" required>
              <input
                id="vin"
                type="text"
                value={form.vin}
                onChange={update("vin")}
                maxLength={17}
                className={inputCls + " font-mono uppercase"}
                placeholder="1HGBH41JXMN109186"
                required
              />
            </FieldGroup>

            <FieldGroup label="Stock Number" htmlFor="stock_number">
              <input
                id="stock_number"
                type="text"
                className={inputCls}
                placeholder="Optional"
                readOnly
                defaultValue=""
              />
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
                placeholder="Toyota"
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
                placeholder="Camry"
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
                placeholder="XSE V6 (optional)"
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
                placeholder="24995"
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
                placeholder="Same as price if blank"
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
                placeholder="0"
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
            placeholder="Describe the vehicle's features, history, and selling points…"
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
            {submitting ? "Adding…" : "Add Vehicle"}
          </button>
        </div>
      </form>
    </>
  );
}
