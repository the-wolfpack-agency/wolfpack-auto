"use client";

import { useCallback, useState } from "react";
import ImageUploadZone from "@/components/ImageUploadZone";
import type {
  Vehicle,
  VehiclePhoto,
  VehicleCondition,
  VehicleStatus,
  FuelType,
  TransmissionType,
  DrivetrainType,
} from "@/types/vehicle";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VehicleFormData {
  vin: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  engine: string;
  transmission: TransmissionType;
  drivetrain: DrivetrainType;
  fuel_type: FuelType;
  mpg_city: number | null;
  mpg_highway: number | null;
  msrp: number | null;
  price: number;
  internet_price: number | null;
  condition: VehicleCondition;
  mileage: number;
  status: VehicleStatus;
  photos: VehiclePhoto[];
  description: string;
  features: string[];
}

interface VehicleFormProps {
  initialData?: Partial<VehicleFormData>;
  onSubmit: (data: VehicleFormData) => Promise<void>;
  isEditing?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const BODY_STYLES = [
  "Sedan", "SUV", "Truck", "Coupe", "Convertible", "Hatchback",
  "Wagon", "Van", "Minivan", "Crossover", "Pickup",
];

const DEALER_ID = process.env.NEXT_PUBLIC_DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function VehicleForm({
  initialData,
  onSubmit,
  isEditing = false,
}: VehicleFormProps) {
  /* ---- State ---- */

  const [form, setForm] = useState<VehicleFormData>({
    vin: initialData?.vin ?? "",
    stock_number: initialData?.stock_number ?? "",
    year: initialData?.year ?? new Date().getFullYear(),
    make: initialData?.make ?? "",
    model: initialData?.model ?? "",
    trim: initialData?.trim ?? "",
    body_style: initialData?.body_style ?? "",
    exterior_color: initialData?.exterior_color ?? "",
    interior_color: initialData?.interior_color ?? "",
    engine: initialData?.engine ?? "",
    transmission: initialData?.transmission ?? "automatic",
    drivetrain: initialData?.drivetrain ?? "fwd",
    fuel_type: initialData?.fuel_type ?? "gasoline",
    mpg_city: initialData?.mpg_city ?? null,
    mpg_highway: initialData?.mpg_highway ?? null,
    msrp: initialData?.msrp ?? null,
    price: initialData?.price ?? 0,
    internet_price: initialData?.internet_price ?? null,
    condition: initialData?.condition ?? "used",
    mileage: initialData?.mileage ?? 0,
    status: initialData?.status ?? "available",
    photos: initialData?.photos ?? [],
    description: initialData?.description ?? "",
    features: initialData?.features ?? [],
  });

  const [featureInput, setFeatureInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ---- Field updaters ---- */

  const set = useCallback(
    <K extends keyof VehicleFormData>(key: K, value: VehicleFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const setNum = useCallback(
    (key: keyof VehicleFormData, raw: string, nullable = false) => {
      if (raw === "" && nullable) {
        set(key, null as any);
        return;
      }
      const n = parseInt(raw, 10);
      if (!isNaN(n)) set(key, n as any);
    },
    [set],
  );

  const setFloat = useCallback(
    (key: keyof VehicleFormData, raw: string, nullable = false) => {
      if (raw === "" && nullable) {
        set(key, null as any);
        return;
      }
      const n = parseFloat(raw);
      if (!isNaN(n)) set(key, n as any);
    },
    [set],
  );

  /* ---- Validation ---- */

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!form.vin) {
      errs.vin = "VIN is required";
    } else if (!VIN_PATTERN.test(form.vin)) {
      errs.vin = "VIN must be exactly 17 alphanumeric characters (no I, O, Q)";
    }

    if (!form.make) errs.make = "Make is required";
    if (!form.model) errs.model = "Model is required";
    if (!form.year || form.year < 1900 || form.year > new Date().getFullYear() + 2) {
      errs.year = "Enter a valid year";
    }
    if (!form.price || form.price <= 0) errs.price = "Price is required";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ---- Generate Listing ---- */

  const generateListing = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/vehicles/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: form.vin,
          year: form.year,
          make: form.make,
          model: form.model,
          trim: form.trim,
          body_style: form.body_style,
          mileage: form.mileage,
          condition: form.condition,
          features: form.features,
          photos: form.photos,
          price: form.price,
          engine: form.engine,
          transmission: form.transmission,
          drivetrain: form.drivetrain,
          fuel_type: form.fuel_type,
          exterior_color: form.exterior_color,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");

      const data = await res.json();
      set("description", data.description ?? form.description);
      if (data.features?.length) {
        set("features", data.features);
      }
    } catch (err) {
      console.error("Listing generation error:", err);
    } finally {
      setGenerating(false);
    }
  };

  /* ---- Submit ---- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Features management ---- */

  const addFeature = () => {
    const trimmed = featureInput.trim();
    if (!trimmed || form.features.includes(trimmed)) return;
    set("features", [...form.features, trimmed]);
    setFeatureInput("");
  };

  const removeFeature = (idx: number) => {
    set(
      "features",
      form.features.filter((_, i) => i !== idx),
    );
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ================================================================ */}
      {/* Section: Vehicle Information                                      */}
      {/* ================================================================ */}
      <FormSection title="Vehicle Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="VIN" error={errors.vin} required>
            <input
              type="text"
              value={form.vin}
              onChange={(e) => set("vin", e.target.value.toUpperCase())}
              maxLength={17}
              placeholder="1HGCG5655WA007321"
              disabled={isEditing}
              className={inputCls(errors.vin, isEditing)}
            />
          </Field>

          <Field label="Stock Number">
            <input
              type="text"
              value={form.stock_number}
              onChange={(e) => set("stock_number", e.target.value)}
              placeholder="STK-001"
              className={inputCls()}
            />
          </Field>

          <Field label="Year" error={errors.year} required>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setNum("year", e.target.value)}
              min={1900}
              max={new Date().getFullYear() + 2}
              className={inputCls(errors.year)}
            />
          </Field>

          <Field label="Make" error={errors.make} required>
            <input
              type="text"
              value={form.make}
              onChange={(e) => set("make", e.target.value)}
              placeholder="Honda"
              className={inputCls(errors.make)}
            />
          </Field>

          <Field label="Model" error={errors.model} required>
            <input
              type="text"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="Accord"
              className={inputCls(errors.model)}
            />
          </Field>

          <Field label="Trim">
            <input
              type="text"
              value={form.trim}
              onChange={(e) => set("trim", e.target.value)}
              placeholder="EX-L"
              className={inputCls()}
            />
          </Field>
        </div>
      </FormSection>

      {/* ================================================================ */}
      {/* Section: Specifications                                          */}
      {/* ================================================================ */}
      <FormSection title="Specifications">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Body Style">
            <select
              value={form.body_style}
              onChange={(e) => set("body_style", e.target.value)}
              className={selectCls()}
            >
              <option value="">Select...</option>
              {BODY_STYLES.map((s) => (
                <option key={s} value={s.toLowerCase()}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Engine">
            <input
              type="text"
              value={form.engine}
              onChange={(e) => set("engine", e.target.value)}
              placeholder="2.0L Turbo 4-Cylinder"
              className={inputCls()}
            />
          </Field>

          <Field label="Transmission">
            <select
              value={form.transmission}
              onChange={(e) => set("transmission", e.target.value as TransmissionType)}
              className={selectCls()}
            >
              <option value="automatic">Automatic</option>
              <option value="manual">Manual</option>
              <option value="cvt">CVT</option>
            </select>
          </Field>

          <Field label="Drivetrain">
            <select
              value={form.drivetrain}
              onChange={(e) => set("drivetrain", e.target.value as DrivetrainType)}
              className={selectCls()}
            >
              <option value="fwd">FWD</option>
              <option value="rwd">RWD</option>
              <option value="awd">AWD</option>
              <option value="4wd">4WD</option>
            </select>
          </Field>

          <Field label="Fuel Type">
            <select
              value={form.fuel_type}
              onChange={(e) => set("fuel_type", e.target.value as FuelType)}
              className={selectCls()}
            >
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
              <option value="electric">Electric</option>
              <option value="hybrid">Hybrid</option>
              <option value="plug_in_hybrid">Plug-in Hybrid</option>
            </select>
          </Field>

          <Field label="Exterior Color">
            <input
              type="text"
              value={form.exterior_color}
              onChange={(e) => set("exterior_color", e.target.value)}
              placeholder="Lunar Silver Metallic"
              className={inputCls()}
            />
          </Field>

          <Field label="Interior Color">
            <input
              type="text"
              value={form.interior_color}
              onChange={(e) => set("interior_color", e.target.value)}
              placeholder="Black Leather"
              className={inputCls()}
            />
          </Field>

          <Field label="City MPG">
            <input
              type="number"
              value={form.mpg_city ?? ""}
              onChange={(e) => setNum("mpg_city", e.target.value, true)}
              min={0}
              placeholder="--"
              className={inputCls()}
            />
          </Field>

          <Field label="Highway MPG">
            <input
              type="number"
              value={form.mpg_highway ?? ""}
              onChange={(e) => setNum("mpg_highway", e.target.value, true)}
              min={0}
              placeholder="--"
              className={inputCls()}
            />
          </Field>
        </div>
      </FormSection>

      {/* ================================================================ */}
      {/* Section: Pricing                                                 */}
      {/* ================================================================ */}
      <FormSection title="Pricing">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="MSRP">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={form.msrp ?? ""}
                onChange={(e) => setFloat("msrp", e.target.value, true)}
                min={0}
                step={0.01}
                placeholder="0.00"
                className={`${inputCls()} pl-7`}
              />
            </div>
          </Field>

          <Field label="Asking Price" error={errors.price} required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={form.price || ""}
                onChange={(e) => setFloat("price", e.target.value)}
                min={0}
                step={0.01}
                placeholder="0.00"
                className={`${inputCls(errors.price)} pl-7`}
              />
            </div>
          </Field>

          <Field label="Internet Price">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={form.internet_price ?? ""}
                onChange={(e) => setFloat("internet_price", e.target.value, true)}
                min={0}
                step={0.01}
                placeholder="0.00"
                className={`${inputCls()} pl-7`}
              />
            </div>
          </Field>
        </div>
      </FormSection>

      {/* ================================================================ */}
      {/* Section: Condition                                               */}
      {/* ================================================================ */}
      <FormSection title="Condition">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Condition">
            <select
              value={form.condition}
              onChange={(e) => set("condition", e.target.value as VehicleCondition)}
              className={selectCls()}
            >
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="certified">Certified Pre-Owned</option>
            </select>
          </Field>

          <Field label="Mileage">
            <input
              type="number"
              value={form.mileage}
              onChange={(e) => setNum("mileage", e.target.value)}
              min={0}
              className={inputCls()}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as VehicleStatus)}
              className={selectCls()}
            >
              <option value="available">Available</option>
              <option value="pending">Pending</option>
              <option value="sold">Sold</option>
              <option value="in_transit">In Transit</option>
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ================================================================ */}
      {/* Section: Photos                                                  */}
      {/* ================================================================ */}
      <FormSection title="Photos">
        <ImageUploadZone
          dealerId={DEALER_ID}
          vin={form.vin || "draft"}
          existingPhotos={form.photos}
          onChange={(photos) => set("photos", photos)}
        />
      </FormSection>

      {/* ================================================================ */}
      {/* Section: Listing Content                                         */}
      {/* ================================================================ */}
      <FormSection title="Listing Content">
        <div className="space-y-4">
          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generateListing}
              disabled={generating || !form.make || !form.model}
              className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <SparkleIcon className="mr-2 h-4 w-4" />
                  {isEditing ? "Regenerate Listing" : "Generate Listing"}
                </>
              )}
            </button>
            <span className="text-xs text-gray-500">
              AI-powered description and feature suggestions
            </span>
          </div>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              placeholder="Vehicle description will appear here after generation, or type your own..."
              className={inputCls()}
            />
          </Field>

          {/* Features */}
          <Field label="Features">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={featureInput}
                  onChange={(e) => setFeatureInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFeature();
                    }
                  }}
                  placeholder="Add a feature..."
                  className={`flex-1 ${inputCls()}`}
                />
                <button
                  type="button"
                  onClick={addFeature}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  Add
                </button>
              </div>

              {form.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                    >
                      {feat}
                      <button
                        type="button"
                        onClick={() => removeFeature(idx)}
                        className="ml-1 text-gray-400 hover:text-red-500"
                        aria-label={`Remove ${feat}`}
                      >
                        <XSmallIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>
      </FormSection>

      {/* ================================================================ */}
      {/* Submit                                                           */}
      {/* ================================================================ */}
      <div className="flex items-center justify-end gap-3 border-t border-surface-border pt-6">
        <a
          href="/admin/inventory"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isEditing ? (
            "Update Vehicle"
          ) : (
            "Save Vehicle"
          )}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(error?: string, disabled = false): string {
  return [
    "block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors",
    "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
    error
      ? "border-red-300 bg-red-50"
      : "border-gray-300 bg-white",
    disabled ? "cursor-not-allowed bg-gray-100 text-gray-500" : "",
  ].join(" ");
}

/** Select variant — normalizes native dropdown chrome so selects match input widths. */
function selectCls(error?: string, disabled = false): string {
  return `${inputCls(error, disabled)} appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-8`;
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
    </svg>
  );
}

function XSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
