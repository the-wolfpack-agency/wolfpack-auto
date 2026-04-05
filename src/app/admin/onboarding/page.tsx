"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAnalytics } from "@/components/EventCollector";
import type { OnboardingPayload } from "@/lib/dealer-onboarding";
import DealerPreview from "@/components/onboarding/DealerPreview";
import {
  getAllTemplates,
  getTemplate,
  type DealerTemplate,
  type DealerTemplateId,
} from "@/lib/onboarding-templates";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STEPS = [
  "Dealership Info",
  "Customize",
  "Review & Launch",
] as const;

const STORAGE_KEY = "wolfpack_onboarding_progress";

const DMS_PROVIDERS = [
  { value: "cdk", label: "CDK Global" },
  { value: "reynolds", label: "Reynolds & Reynolds" },
  { value: "dealertrack", label: "DealerTrack" },
  { value: "tekion", label: "Tekion" },
  { value: "dealersocket", label: "DealerSocket" },
  { value: "routeone", label: "RouteOne" },
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
/* Collapsible section                                                        */
/* -------------------------------------------------------------------------- */

function CollapsibleSection({
  title,
  defaultOpen = false,
  onToggle,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div className="rounded-lg border border-gray-700">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-700/40"
      >
        <span className="text-sm font-medium text-gray-300">{title}</span>
        <ChevronIcon className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-gray-700 px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function OnboardingPage() {
  const router = useRouter();
  const { track } = useAnalytics();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingPayload>(emptyPayload);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DealerTemplate | null>(null);
  const [resultDealerId, setResultDealerId] = useState<string | null>(null);
  const [resultSlug, setResultSlug] = useState<string | null>(null);

  // CSV import feedback
  const [csvVehicleCount, setCsvVehicleCount] = useState(0);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{
    imported: number;
    errors: string[];
  } | null>(null);

  // Track which optional sections the user expanded in Step 2
  const expandedSections = useRef<Set<string>>(new Set());
  const [skippedStep2, setSkippedStep2] = useState(false);

  // Track step timing
  const stepEnteredAt = useRef<number>(Date.now());

  const trackStepView = useCallback(
    (stepIndex: number) => {
      stepEnteredAt.current = Date.now();
      track("onboarding", "step_viewed", {
        step_index: stepIndex,
        step_name: STEPS[stepIndex],
      });
    },
    [track],
  );

  const trackStepComplete = useCallback(
    (stepIndex: number) => {
      const durationMs = Date.now() - stepEnteredAt.current;
      track("onboarding", "step_completed", {
        step_index: stepIndex,
        step_name: STEPS[stepIndex],
        duration_ms: durationMs,
        template_selected: selectedTemplate?.id ?? "none",
      });
    },
    [track, selectedTemplate],
  );

  // --- Persist progress to server (PATCH) on each step change -----------
  const persistProgress = useCallback(
    async (currentStep: number, payload: OnboardingPayload) => {
      try {
        await fetch("/api/admin/onboarding", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer placeholder",
          },
          body: JSON.stringify({
            currentStep,
            data: payload,
            templateId: selectedTemplate?.id ?? null,
          }),
        });
      } catch {
        // Server persistence is best-effort; localStorage is primary fallback
      }
    },
    [selectedTemplate],
  );

  // --- Persist / restore from localStorage ----------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          step: number;
          data: OnboardingPayload;
        };
        // Clamp step to new 3-step range
        setStep(Math.min(parsed.step, STEPS.length - 1));
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
        // Storage full -- silently ignore
      }
    }
  }, [step, data, submitted]);

  // Track step views
  useEffect(() => {
    trackStepView(step);
  }, [step, trackStepView]);

  // --- Navigation -----------------------------------------------------------
  const canGoNext = useCallback(() => {
    if (step === 0) {
      const d = data.dealership;
      return !!(d.name && d.phone && d.email);
    }
    // Step 1 (Customize) and Step 2 (Review) always valid
    return true;
  }, [step, data]);

  const next = () => {
    if (step < STEPS.length - 1) {
      trackStepComplete(step);
      const nextStep = step + 1;
      setStep(nextStep);
      void persistProgress(nextStep, data);
    }
  };
  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  // --- Template selection handler ----------------------------------------
  const handleTemplateSelect = (templateId: DealerTemplateId) => {
    const tmpl = getTemplate(templateId);
    if (!tmpl) return;
    setSelectedTemplate(tmpl);
    setData((prev) => ({
      ...prev,
      branding: {
        ...prev.branding,
        primaryColor: tmpl.branding.primaryColor,
        tagline: tmpl.tagline,
      },
    }));
    track("onboarding", "template_selected", {
      template_id: templateId,
      template_label: tmpl.label,
    });
  };

  const skipToReview = () => {
    setSkippedStep2(true);
    track("onboarding", "skip_and_launch", {
      step_index: 1,
      step_name: STEPS[1],
      expanded_sections: Array.from(expandedSections.current).join(","),
    });
    trackStepComplete(1);
    setStep(2);
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

      const result = await res.json();
      setResultDealerId(result.dealer_id ?? null);
      setResultSlug(result.slug ?? null);

      if (result.vehicles_imported !== undefined) {
        setCsvImportResult({
          imported: result.vehicles_imported,
          errors: result.csv_errors ?? [],
        });
      }

      trackStepComplete(2);
      track("onboarding", "wizard_completed", {
        total_steps: STEPS.length,
        skipped_customize: skippedStep2,
        template_selected: selectedTemplate?.id ?? "none",
        csv_vehicles: csvVehicleCount,
        expanded_sections: Array.from(expandedSections.current).join(","),
      });

      localStorage.removeItem(STORAGE_KEY);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Track section expansion in Step 2 ------------------------------------
  const handleSectionToggle = (section: string, open: boolean) => {
    if (open) {
      expandedSections.current.add(section);
      track("onboarding", "section_expanded", {
        step_index: 1,
        section,
      });
    }
  };

  // --- Success screen with confetti celebration --------------------------------
  if (submitted) {
    const publicUrl = resultSlug ? `/${resultSlug}` : "/";
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/invite?dealer=${resultDealerId ?? ""}`
        : "";

    return (
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center text-center">
        {/* CSS-only confetti animation */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 50 }).map((_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
                backgroundColor: [
                  "#f97316",
                  "#2563eb",
                  "#059669",
                  "#dc2626",
                  "#8b5cf6",
                  "#ca8a04",
                ][i % 6],
              }}
            />
          ))}
        </div>

        <style>{`
          @keyframes confetti-fall {
            0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
          }
          .confetti-piece {
            position: absolute;
            top: -10px;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            animation: confetti-fall linear forwards;
          }
        `}</style>

        <div className="mb-4 flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-green-600">
          <CheckIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Your dealership is live!
        </h1>
        <p className="mt-2 text-gray-400">
          {data.dealership.name} is ready for customers.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={publicUrl}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            View Your Website
          </a>
          <a
            href="/admin"
            className="rounded-lg border border-gray-400 bg-gray-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-600"
          >
            Go to Dashboard
          </a>
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                void navigator.clipboard.writeText(inviteUrl);
              }
            }}
            className="rounded-lg border border-gray-400 bg-gray-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-600"
          >
            Share with Your Team
          </button>
        </div>

        {csvImportResult && (
          <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm">
            <p className="font-medium text-white">
              {csvImportResult.imported} vehicles imported
            </p>
            {csvImportResult.errors.length > 0 && (
              <p className="mt-1 text-yellow-400">
                {csvImportResult.errors.length} row(s) had issues
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Set Up Your Dealership</h1>
        <p className="mt-1 text-sm text-gray-500">
          Just 3 quick steps to get your site live.
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar currentStep={step} steps={STEPS} />

      {/* Step content */}
      <div className="mt-8 rounded-xl border border-gray-700 bg-gray-800 p-6 sm:p-8">
        {step === 0 && (
          <StepDealershipInfo
            data={data}
            setData={setData}
            selectedTemplate={selectedTemplate}
            onTemplateSelect={handleTemplateSelect}
          />
        )}
        {step === 1 && (
          <StepCustomize
            data={data}
            setData={setData}
            onSectionToggle={handleSectionToggle}
            csvVehicleCount={csvVehicleCount}
            setCsvVehicleCount={setCsvVehicleCount}
          />
        )}
        {step === 2 && (
          <StepReview data={data} template={selectedTemplate} />
        )}
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
          className="rounded-lg border border-gray-400 bg-gray-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          {/* Skip & Launch on Step 2 (Customize) */}
          {step === 1 && (
            <button
              type="button"
              onClick={skipToReview}
              className="rounded-lg border border-gray-500 bg-gray-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-600"
            >
              Skip & Launch
            </button>
          )}

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
/* Step 1: Dealership Info (simplified -- name, email, phone required)        */
/* ========================================================================== */

function StepDealershipInfo({
  data,
  setData,
  selectedTemplate,
  onTemplateSelect,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
  selectedTemplate: DealerTemplate | null;
  onTemplateSelect: (id: DealerTemplateId) => void;
}) {
  const update = (field: keyof OnboardingPayload["dealership"], value: string) => {
    setData((prev) => ({
      ...prev,
      dealership: { ...prev.dealership, [field]: value },
    }));
  };

  const templates = getAllTemplates();

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Tell us about your dealership</h2>
      <p className="text-sm text-gray-400">
        We just need a few basics to get started. You can add more details later in Settings.
      </p>

      <Field label="Dealership Name" required>
        <input
          type="text"
          value={data.dealership.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Wolfpack Motors"
          className="input-field"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City">
          <input
            type="text"
            value={data.dealership.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Denver"
            className="input-field"
          />
        </Field>
        <Field label="State">
          <input
            type="text"
            value={data.dealership.state}
            onChange={(e) => update("state", e.target.value)}
            placeholder="CO"
            className="input-field"
          />
        </Field>
      </div>

      {/* Instant preview -- Canva-style "show before ask" */}
      {data.dealership.name.trim() && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Live Preview
          </p>
          <DealerPreview
            dealerName={data.dealership.name}
            city={data.dealership.city}
            primaryColor={data.branding.primaryColor}
            accentColor={selectedTemplate?.branding.accentColor}
            tagline={data.branding.tagline}
            template={selectedTemplate}
          />
        </div>
      )}

      {/* Template picker -- Notion-style "start from best practice" */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-300">
          What kind of dealership are you?
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onTemplateSelect(tmpl.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                selectedTemplate?.id === tmpl.id
                  ? "border-brand-500 bg-brand-900/20"
                  : "border-gray-600 bg-gray-700/30 hover:border-gray-500"
              }`}
            >
              <span
                className="mb-1 inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: tmpl.branding.primaryColor }}
              />
              <p className="text-sm font-semibold text-white">{tmpl.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{tmpl.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" required>
          <input
            type="email"
            value={data.dealership.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="hello@wolfpackmotors.com"
            className="input-field"
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            value={data.dealership.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(303) 555-0100"
            className="input-field"
          />
        </Field>
      </div>

      {/* Optional address section */}
      <CollapsibleSection title="Add full address (optional)">
        <div className="space-y-4">
          <Field label="Street Address">
            <input
              type="text"
              value={data.dealership.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="4500 W Colfax Ave"
              className="input-field"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ZIP">
              <input
                type="text"
                value={data.dealership.zip}
                onChange={(e) => update("zip", e.target.value)}
                placeholder="80204"
                className="input-field"
              />
            </Field>
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
        </div>
      </CollapsibleSection>
    </div>
  );
}

/* ========================================================================== */
/* Step 2: Customize (merged branding + inventory + team -- all optional)     */
/* ========================================================================== */

function StepCustomize({
  data,
  setData,
  onSectionToggle,
  csvVehicleCount,
  setCsvVehicleCount,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
  onSectionToggle: (section: string, open: boolean) => void;
  csvVehicleCount: number;
  setCsvVehicleCount: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Make it yours</h2>
      <p className="text-sm text-gray-400">
        Everything here is optional. You can set these up later from your admin panel.
      </p>

      {/* Branding section */}
      <CollapsibleSection
        title="Add branding (optional)"
        onToggle={(open) => onSectionToggle("branding", open)}
      >
        <BrandingFields data={data} setData={setData} />
      </CollapsibleSection>

      {/* Inventory section */}
      <CollapsibleSection
        title="Set up inventory (optional)"
        onToggle={(open) => onSectionToggle("inventory", open)}
      >
        <InventoryFields
          data={data}
          setData={setData}
          csvVehicleCount={csvVehicleCount}
          setCsvVehicleCount={setCsvVehicleCount}
        />
      </CollapsibleSection>

      {/* Team section */}
      <CollapsibleSection
        title="Invite team members (optional)"
        onToggle={(open) => onSectionToggle("team", open)}
      >
        <TeamFields data={data} setData={setData} />
      </CollapsibleSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Branding fields (extracted from old Step 2)                                */
/* -------------------------------------------------------------------------- */

function BrandingFields({
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
      {/* Logo upload zone */}
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

/* -------------------------------------------------------------------------- */
/* Inventory fields (extracted from old Step 3)                               */
/* -------------------------------------------------------------------------- */

function InventoryFields({
  data,
  setData,
  csvVehicleCount,
  setCsvVehicleCount,
}: {
  data: OnboardingPayload;
  setData: React.Dispatch<React.SetStateAction<OnboardingPayload>>;
  csvVehicleCount: number;
  setCsvVehicleCount: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
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
    setCsvParseErrors([]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // Count vehicles (lines minus header) for immediate feedback
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const vehicleLines = Math.max(0, lines.length - 1);
      setCsvVehicleCount(vehicleLines);

      setData((prev) => ({
        ...prev,
        inventory: {
          ...prev.inventory,
          csvData: btoa(text),
        },
      }));
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Choose how you want to add your vehicles.
      </p>

      {/* Method selector */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { key: "csv", label: "CSV Upload", desc: "Drag and drop a spreadsheet" },
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

      {/* CSV drop zone — enhanced with vehicle count + progress feedback */}
      {data.inventory.method === "csv" && (
        <>
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
                : csvFileName
                  ? "border-green-500/50 bg-green-900/10"
                  : "border-gray-600 bg-gray-700/30 hover:border-brand-400"
            }`}
          >
            {csvFileName ? (
              <div className="text-center">
                <p className="text-sm font-medium text-green-400">
                  {csvFileName}
                </p>
                <p className="mt-1 text-lg font-bold text-white">
                  {csvVehicleCount} vehicle{csvVehicleCount !== 1 ? "s" : ""} detected
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Click or drop to replace
                </p>
              </div>
            ) : (
              <>
                <UploadIcon className="mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm font-medium text-gray-300">
                  Drag your CSV file here or click to browse
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  VIN, Year, Make, Model, Price columns required
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Works with VinSolutions, DealerTrack, or any standard CSV
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

          {csvParseErrors.length > 0 && (
            <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-3 text-xs text-yellow-300">
              <p className="font-medium">Some rows had issues:</p>
              <ul className="mt-1 list-inside list-disc">
                {csvParseErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {csvParseErrors.length > 5 && (
                  <li>...and {csvParseErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </>
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

      {/* Manual entry note */}
      {data.inventory.method === "manual" && (
        <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-4">
          <p className="text-sm text-gray-300">
            After launch, you can add vehicles one at a time from the admin
            panel.
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Team fields (extracted from old Step 4)                                    */
/* -------------------------------------------------------------------------- */

function TeamFields({
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
/* Step 3: Review & Launch                                                    */
/* ========================================================================== */

function StepReview({
  data,
  template,
}: {
  data: OnboardingPayload;
  template: DealerTemplate | null;
}) {
  const hasAddress = !!(data.dealership.address || data.dealership.city || data.dealership.state || data.dealership.zip);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Review & Launch</h2>
      <p className="text-sm text-gray-400">
        Make sure everything looks good, then hit Launch.
      </p>

      {/* Dealership */}
      <ReviewSection title="Dealership">
        <ReviewRow label="Name" value={data.dealership.name} />
        <ReviewRow label="Email" value={data.dealership.email} />
        <ReviewRow label="Phone" value={data.dealership.phone} />
        {hasAddress && (
          <ReviewRow
            label="Address"
            value={[data.dealership.address, data.dealership.city, data.dealership.state, data.dealership.zip].filter(Boolean).join(", ")}
          />
        )}
        {data.dealership.website && (
          <ReviewRow label="Website" value={data.dealership.website} />
        )}
      </ReviewSection>

      {/* Template */}
      {template && (
        <ReviewSection title="Template">
          <ReviewRow label="Type" value={template.label} />
          <ReviewRow label="Description" value={template.description} />
        </ReviewSection>
      )}

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
      <ReviewSection title="Inventory">
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

function ChevronIcon({ className }: { className?: string }) {
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
        d="m19.5 8.25-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}
