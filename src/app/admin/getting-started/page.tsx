"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  link: string;
}

interface ChecklistData {
  steps: ChecklistStep[];
  progress: number;
  completed: boolean;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function GettingStartedPage() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/onboarding/status");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json: ChecklistData = await res.json();
      setData(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
          <p className="text-sm text-gray-500">Loading your progress...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">
            {error ?? "Something went wrong loading your checklist."}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchStatus();
            }}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const completedCount = data.steps.filter((s) => s.completed).length;
  const totalCount = data.steps.length;

  // All done!
  if (data.completed) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center rounded-xl border border-green-200 bg-green-50 p-8 text-center sm:p-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
            <CheckIcon className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            You are all set!
          </h1>
          <p className="mt-2 max-w-md text-gray-600">
            You have completed all the setup steps. Your dealership is fully
            configured and ready for business.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/admin"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Go to Dashboard
            </a>
            <a
              href="/admin/analytics-brain"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              View Analytics Brain
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Getting Started</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete these steps to get the most out of your dealership platform.
          You can do them in any order.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">
            Your progress
          </p>
          <p className="text-sm font-bold text-brand-600">
            {completedCount} of {totalCount} complete
          </p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-500 ease-out"
            style={{ width: `${data.progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {data.progress}% complete
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {data.steps.map((step, index) => (
          <a
            key={step.id}
            href={step.link}
            className={`group flex items-start gap-4 rounded-xl border p-4 transition-all sm:p-5 ${
              step.completed
                ? "border-green-200 bg-green-50/50"
                : "border-gray-200 bg-white shadow-sm hover:border-brand-300 hover:shadow-md"
            }`}
          >
            {/* Status indicator */}
            <div className="mt-0.5 shrink-0">
              {step.completed ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600">
                  <CheckIcon className="h-4 w-4 text-white" />
                </div>
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-gray-400 transition-colors group-hover:border-brand-400 group-hover:text-brand-500">
                  {index + 1}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${
                  step.completed ? "text-green-800" : "text-gray-900"
                }`}
              >
                {step.label}
              </p>
              <p
                className={`mt-0.5 text-sm ${
                  step.completed ? "text-green-600" : "text-gray-500"
                }`}
              >
                {step.completed ? "Done!" : step.description}
              </p>
            </div>

            {/* Arrow for incomplete items */}
            {!step.completed && (
              <div className="mt-1 shrink-0">
                <ArrowRightIcon className="h-5 w-5 text-gray-300 transition-colors group-hover:text-brand-500" />
              </div>
            )}
          </a>
        ))}
      </div>

      {/* Help text */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5 text-center">
        <p className="text-sm text-gray-500">
          Need help? Reach out to your account manager or visit the{" "}
          <a
            href="/admin/resources"
            className="font-medium text-brand-600 hover:text-brand-700"
          >
            Resources
          </a>{" "}
          page for guides and tutorials.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icons                                                           */
/* -------------------------------------------------------------------------- */

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
