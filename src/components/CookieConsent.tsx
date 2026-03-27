"use client";

import { useEffect, useState } from "react";

type ConsentLevel = "all" | "essential";

const STORAGE_KEY = "cookie_consent";

/**
 * CookieConsent — compact banner that appears on first visit.
 *
 * Stores the user's choice in localStorage. Other components (e.g. EventCollector)
 * read `localStorage.getItem('cookie_consent')` to decide which tracking to enable.
 *
 * - "all"       — full analytics + A/B testing cookie
 * - "essential" — page views only, no behavioral signals, no wolfpack_vid cookie
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setVisible(true);
      }
    } catch {
      // localStorage not available — don't show
    }
  }, []);

  function handleConsent(level: ConsentLevel) {
    try {
      localStorage.setItem(STORAGE_KEY, level);

      if (level === "essential") {
        // Remove the A/B testing cookie if it exists
        document.cookie =
          "wolfpack_vid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      }
    } catch {
      // localStorage not available — silently fail
    }

    setVisible(false);

    // Dispatch a custom event so EventCollector can react immediately
    window.dispatchEvent(
      new CustomEvent("cookie_consent_change", { detail: { level } }),
    );
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-xl border border-brand-800 bg-brand-950/95 px-6 py-4 shadow-2xl backdrop-blur-sm sm:flex-row sm:justify-between">
        <p className="text-center text-sm text-gray-300 sm:text-left">
          We use cookies to improve your experience and analyze site traffic.
          See our{" "}
          <a
            href="/privacy"
            className="text-brand-400 underline hover:text-brand-300"
          >
            Privacy Policy
          </a>{" "}
          for details.
        </p>

        <div className="flex shrink-0 gap-3">
          <button
            onClick={() => handleConsent("essential")}
            className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-brand-600 hover:text-white"
          >
            Essential Only
          </button>
          <button
            onClick={() => handleConsent("all")}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
