"use client";

import { useEffect, useState } from "react";
import { getRecentlyViewed, type RecentVehicle } from "@/lib/recently-viewed";
import { useAnalytics } from "@/components/EventCollector";

const DISMISS_KEY = "wolfpack_resume_bar_dismissed";

/**
 * "Resume where you left off" bar. Shows ONLY when the visitor actually has
 * recently-viewed vehicles this session - never fabricated. Personalized from
 * real on-device history; the impression + click are fed to the learning loop.
 */
export default function AnnouncementBar() {
  const { track } = useAnalytics();
  const [recent, setRecent] = useState<RecentVehicle | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const items = getRecentlyViewed();
    if (items.length === 0) return;
    setRecent(items[0]);
    track("resume_bar_shown", "engagement", {
      viewed_count: items.length,
      make: items[0].make,
    });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!recent) return null;

  const label = recent.bodyStyle
    ? `${recent.bodyStyle}s`
    : `the ${recent.year} ${recent.make} ${recent.model}`;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setRecent(null);
  };

  return (
    <div className="bg-brand-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p className="truncate text-brand-200">
          Welcome back - you were browsing{" "}
          <span className="font-semibold text-white">{label}</span>. Continue
          where you left off?
        </p>
        <a
          href={`/inventory/${recent.vin}`}
          data-track="resume_search_click"
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-brand-950 transition-colors hover:bg-brand-200"
        >
          Resume search
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-brand-400 transition-colors hover:text-white"
        >
          <svg width="16" height="16" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
