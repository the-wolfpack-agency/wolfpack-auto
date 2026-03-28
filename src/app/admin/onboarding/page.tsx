"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OnboardingPayload } from "@/lib/dealer-onboarding";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STEPS = [
  "Dealership Info",
  "Branding",
  "Import Inventory",
  "Team Setup",
  "Review & Launch",
] as const;

const STORAGE_KEY = "wolfpack_onboarding_progress";

const DMS_PROVIDERS = [
  { value: "cdk", label: "DMS Provider A" },
  { value: "reynolds", label: "DMS Provider B" },
  { value: "dealertrack", label: "Dealertrack" },
  { value: "tekion", label: "DMS Provider C" },
] as const;

type TeamMember = { email: string; role: "admin" | "manager" | "staff" };

/* -------------------------------------------------------------------------- */
/* Helper: initial state                                                      */
/* -------------------------------------------------------------------------- */

function emptyPayload(): OnboardingPayload {
  return {
    dealership: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
    },
    branding: {
      logoFile: null,
      primaryColor: "#0070c7",
      tagline: "",
    },
    inventory: {
      method: "csv",
    },
    team: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingPayload>(emptyPayload);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Persist / restore from localStorage ----------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          step: number;
          data: OnboardingPayload;
        };
        setStep(parsed.step);
        setData(parsed.data);
      }
    } catch {
      // Ignore corrupt data
    }
  }, []);

  useEffect(() => {
    if (!submitted) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data }));
      } catch {
        // Storage full — silently ignore
      }
    }
  }, [step, data, submitted]);

  // --- Navigation -----------------------------------------------------------
  const canGoNext = useCallback(() => {
    if (step === 0) {
      const d = data.dealership;
      return !!(d.name && d.address && d.city && d.state && d.zip && d.phone && d.email);
    }
    if (step === 1) return true; // branding is optional
    if (step === 2) return !!data.inventory.method;
    if (step === 3) return true; // team is optional
    return true;
  }, [step, data]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  // --- Submit ---------------------------------------------------------------
  const handleLaunch = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer placeholder",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      localStorage.removeItem(STORAGE_KEY);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Success screen -------------------------------------------------------
  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
          <CheckIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Your dealership is live!
        </h1>
        <p className="mt-2 text-gray-400">
          Your site is ready. Team invites have been sent.
        </p>
        <a
          href="/admin"
          className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Set Up Your Dealership</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete these steps to launch your dealer site.
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar currentStep={step} steps={STEPS} />

      {/* Step content */}
      <div className="mt-8 rounded-xl border border-gray-700 bg-gray-800 p-6 sm:p-8">
        {step === 0 && <StepDealershipInfo data={data} setData={setData} />}
        {step === 1 && <StepBranding data={data} setData={setData} />}
        {step === 2 && <StepInventory data={data} setData={setData} />}
        {step === 3 && <StepTeam data={data} setData={setData} />}
        {step === 4 && <StepReview data={data} />}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-lg border border-gray-600 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            disabled={!canGoNext()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={submitting}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Launching..." : "Launch Your Site"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Progress bar                                                               */
/* ========================================================================== */

function ProgressBar({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: readonly string[];
}) {
  return (
    <div>
      {/* Bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-600 transition-all duration-300"
          style={{
            width: `${((currentStep + 1) / steps.length) * 100}%`,
          }}
        />
      </div>

      {/* Labels */}
      <div className="mt-3 hidden gap-1 sm:flex">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {}}
            className={`flex-1 text-center text-xs font-medium transition-colors ${
              i <= currentStep ? "text-brand-600" : "text-gray-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 sm:hidden">
        Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Step 1: Dealership Info                                                    */
/* ========================================================================== */

function StepDealershipInfo({
  data,
  setData,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
}) {
  const update = (field: keyof OnboardingPayload["dealership"], value: string) => {
    setData((prev) => ({
      ...prev,
      dealership: { ...prev.dealership, [field]: value },
    }));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Dealership Information</h2>

      <Field label="Dealership Name" required>
        <input
          type="text"
          value={data.dealership.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Wolfpack Motors"
          className="input-field"
        />
      </Field>

      <Field label="Street Address" required>
        <input
          type="text"
          value={data.dealership.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="4500 W Colfax Ave"
          className="input-field"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" required>
          <input
            type="text"
            value={data.dealership.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Denver"
            className="input-field"
          />
        </Field>
        <Field label="State" required>
          <input
            type="text"
            value={data.dealership.state}
            onChange={(e) => update("state", e.target.value)}
            placeholder="CO"
            className="input-field"
          />
        </Field>
        <Field label="ZIP" required>
          <input
            type="text"
            value={data.dealership.zip}
            onChange={(e) => update("zip", e.target.value)}
            placeholder="80204"
            className="input-field"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" required>
          <input
            type="tel"
            value={data.dealership.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(303) 555-0100"
            className="input-field"
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            value={data.dealership.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="hello@wolfpackmotors.com"
            className="input-field"
          />
        </Field>
      </div>

      <Field label="Website">
        <input
          type="url"
          value={data.dealership.website}
          onChange={(e) => update("website", e.target.value)}
          placeholder="https://wolfpackmotors.com"
          className="input-field"
        />
      </Field>
    </div>
  );
}

/* ========================================================================== */
/* Step 2: Branding                                                           */
/* ========================================================================== */

function StepBranding({
  data,
  setData,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return; // 5 MB limit

    const reader = new FileReader();
    reader.onload = () => {
      setData((prev) => ({
        ...prev,
        branding: { ...prev.branding, logoFile: reader.result as string },
      }));
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleLogoFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Branding</h2>

      {/* Logo upload zone (mirrors ImageUploadZone pattern) */}
      <Field label="Logo">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragActive
              ? "border-brand-500 bg-brand-900/20"
              : "border-gray-600 bg-gray-700/30 hover:border-brand-400"
          }`}
        >
          {data.branding.logoFile ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={data.branding.logoFile}
                alt="Uploaded logo"
                className="max-h-16 max-w-[200px] object-contain"
              />
              <span className="text-xs text-gray-400">
                Click or drop to replace
              </span>
            </div>
          ) : (
            <>
              <UploadIcon className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-300">
                Drag your logo here or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-500">
                PNG, SVG, or JPEG -- max 5 MB
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".png,.svg,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleLogoFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </Field>

      {/* Primary color */}
      <Field label="Primary Color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={data.branding.primaryColor}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                branding: { ...prev.branding, primaryColor: e.target.value },
              }))
            }
            className="h-10 w-14 cursor-pointer rounded-lg border border-gray-600 bg-transparent p-1"
          />
          <input
            type="text"
            value={data.branding.primaryColor}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                branding: { ...prev.branding, primaryColor: e.target.value },
              }))
            }
            placeholder="#0070c7"
            className="input-field max-w-[140px]"
          />
          <div
            className="h-10 flex-1 rounded-lg"
            style={{ backgroundColor: data.branding.primaryColor }}
          />
        </div>
      </Field>

      {/* Tagline */}
      <Field label="Tagline">
        <input
          type="text"
          value={data.branding.tagline}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              branding: { ...prev.branding, tagline: e.target.value },
            }))
          }
          placeholder="Find Your Perfect Vehicle"
          className="input-field"
        />
      </Field>
    </div>
  );
}

/* ========================================================================== */
/* Step 3: Import Inventory                                                   */
/* ========================================================================== */

function StepInventory({
  data,
  setData,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
}) {
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const setMethod = (method: "csv" | "dms" | "manual") => {
    setData((prev) => ({
      ...prev,
      inventory: { ...prev.inventory, method },
    }));
  };

  const handleCsvFile = (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setData((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          csvData: btoa(reader.result as string),
        },
      }));
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Import Inventory</h2>
      <p className="text-sm text-gray-400">
        Choose how you want to add your vehicles.
      </p>

      {/* Method selector */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { key: "csv", label: "CSV Upload", desc: "Upload a spreadsheet" },
            { key: "dms", label: "DMS Feed", desc: "Connect your DMS" },
            { key: "manual", label: "Manual Entry", desc: "Add one by one" },
          ] as const
        ).map(({ key, label, desc }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMethod(key)}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              data.inventory.method === key
                ? "border-brand-500 bg-brand-900/20"
                : "border-gray-600 bg-gray-700/30 hover:border-gray-500"
            }`}
          >
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="mt-1 text-xs text-gray-400">{desc}</p>
          </button>
        ))}
      </div>

      {/* CSV drop zone */}
      {data.inventory.method === "csv" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setCsvDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setCsvDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCsvDragActive(false);
            if (e.dataTransfer.files?.[0]) handleCsvFile(e.dataTransfer.files[0]);
          }}
          onClick={() => csvInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              csvInputRef.current?.click();
          }}
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            csvDragActive
              ? "border-brand-500 bg-brand-900/20"
              : "border-gray-600 bg-gray-700/30 hover:border-brand-400"
          }`}
        >
          {csvFileName ? (
            <p className="text-sm text-green-400">
              Uploaded: {csvFileName}
            </p>
          ) : (
            <>
              <UploadIcon className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-300">
                Drag your CSV file here or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-500">
                VIN, Year, Make, Model, Price columns required
              </p>
            </>
          )}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleCsvFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* DMS provider selector */}
      {data.inventory.method === "dms" && (
        <Field label="DMS Provider">
          <select
            value={data.inventory.dmsProvider ?? ""}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                inventory: {
                  ...prev.inventory,
                  dmsProvider: e.target.value as any,
                },
              }))
            }
            className="input-field"
          >
            <option value="" disabled>
              Select your DMS provider
            </option>
            {DMS_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500">
            We will set up the integration after launch. Your account manager
            will reach out with connection instructions.
          </p>
        </Field>
      )}

      {/* Manual entry link */}
      {data.inventory.method === "manual" && (
        <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-4">
          <p className="text-sm text-gray-300">
            After launch, you can add vehicles one at a time from the admin
            panel.
          </p>
          <a
            href="/admin/vehicles/quick-add"
            className="mt-2 inline-flex items-center text-sm font-medium text-brand-400 hover:text-brand-300"
          >
            Go to Quick Add
            <ArrowRightIcon className="ml-1 h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Step 4: Team Setup                                                         */
/* ========================================================================== */

function StepTeam({
  data,
  setData,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<TeamMember["role"]>("staff");

  const addMember = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (data.team.some((m) => m.email === email)) return;

    setData((prev) => ({
      ...prev,
      team: [...prev.team, { email, role: newRole }],
    }));
    setNewEmail("");
    setNewRole("staff");
  };

  const removeMember = (idx: number) => {
    setData((prev) => ({
      ...prev,
      team: prev.team.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Team Setup</h2>
      <p className="text-sm text-gray-400">
        Invite team members to your admin panel. They will receive an email
        with login instructions.
      </p>

      {/* Add member form */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="team@example.com"
          className="input-field flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMember();
            }
          }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as TeamMember["role"])}
          className="input-field sm:w-36"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="staff">Staff</option>
        </select>
        <button
          type="button"
          onClick={addMember}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Add
        </button>
      </div>

      {/* Member list */}
      {data.team.length > 0 ? (
        <ul className="divide-y divide-gray-700 rounded-lg border border-gray-700">
          {data.team.map((member, idx) => (
            <li
              key={member.email}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">
                  {member.email}
                </p>
                <p className="text-xs capitalize text-gray-400">
                  {member.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeMember(idx)}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-400"
                aria-label={`Remove ${member.email}`}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">
          No team members added yet. You can always invite them later.
        </p>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Step 5: Review & Launch                                                    */
/* ========================================================================== */

function StepReview({ data }: { data: OnboardingPayload }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Review & Launch</h2>
      <p className="text-sm text-gray-400">
        Make sure everything looks good, then hit Launch.
      </p>

      {/* Dealership */}
      <ReviewSection title="Dealership">
        <ReviewRow label="Name" value={data.dealership.name} />
        <ReviewRow
          label="Address"
          value={`${data.dealership.address}, ${data.dealership.city}, ${data.dealership.state} ${data.dealership.zip}`}
        />
        <ReviewRow label="Phone" value={data.dealership.phone} />
        <ReviewRow label="Email" value={data.dealership.email} />
        {data.dealership.website && (
          <ReviewRow label="Website" value={data.dealership.website} />
        )}
      </ReviewSection>

      {/* Branding */}
      <ReviewSection title="Branding">
        <ReviewRow label="Primary Color">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded"
              style={{ backgroundColor: data.branding.primaryColor }}
            />
            {data.branding.primaryColor}
          </span>
        </ReviewRow>
        {data.branding.tagline && (
          <ReviewRow label="Tagline" value={data.branding.tagline} />
        )}
        <ReviewRow
          label="Logo"
          value={data.branding.logoFile ? "Uploaded" : "Not uploaded"}
        />
      </ReviewSection>

      {/* Inventory */}
      <ReviewSection title="Inventory Import">
        <ReviewRow
          label="Method"
          value={
            data.inventory.method === "csv"
              ? "CSV Upload"
              : data.inventory.method === "dms"
                ? `DMS Feed (${data.inventory.dmsProvider ?? "not selected"})`
                : "Manual Entry"
          }
        />
      </ReviewSection>

      {/* Team */}
      <ReviewSection title="Team">
        {data.team.length > 0 ? (
          data.team.map((m) => (
            <ReviewRow key={m.email} label={m.email} value={m.role} />
          ))
        ) : (
          <p className="text-sm text-gray-500">No team members invited.</p>
        )}
      </ReviewSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared UI components                                                       */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-300">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-700 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-white">
        {children ?? value ?? "--"}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

function UploadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
}
