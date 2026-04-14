"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAnalytics } from "@/components/EventCollector";

/**
 * Prominent banner shown at the top of the admin dashboard when the
 * dealer's onboarding checklist is incomplete.  Fetches status from
 * `/api/admin/onboarding/status` on mount and hides itself once all
 * steps are done or the user dismisses it.
 */
export function OnboardingBanner() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [dismissed, setDismissed] = useState(false);
  const { track } = useAnalytics();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/onboarding/status");
      if (!res.ok) return;
      const json = await res.json();
      const steps = json.steps as { completed: boolean }[];
      const completedCount = steps.filter((s) => s.completed).length;
      const isComplete = json.completed === true;
      setSetupComplete(isComplete);
      setProgress({ completed: completedCount, total: steps.length });

      // Set a cookie so the Edge middleware can redirect without an API call.
      // Short TTL so it re-evaluates frequently as the user completes steps.
      document.cookie = `onboarding_complete=${isComplete}; path=/; max-age=300; SameSite=Strict`;

      if (!json.completed) {
        track("system", "onboarding_banner_shown", {
          completed_steps: completedCount,
          total_steps: steps.length,
        });
      }
    } catch {
      // Never break the dashboard for a banner
    }
  }, [track]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Still loading, already complete, or dismissed
  if (setupComplete === null || setupComplete || dismissed) return null;

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 to-blue-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-gray-900">
            Welcome! Let&apos;s get your dealership set up
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Complete setup to unlock all features.{" "}
            <span className="font-medium text-brand-600">
              {progress.completed} of {progress.total} steps done.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/admin/getting-started"
            className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Continue Setup
          </Link>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              track("system", "onboarding_banner_dismissed", {
                completed_steps: progress.completed,
                total_steps: progress.total,
              });
            }}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Dismiss banner"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
