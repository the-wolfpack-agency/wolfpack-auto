"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                   */
/* ------------------------------------------------------------------ */

interface ConsentPreferences {
  essential: true; // always on
  analytics: boolean;
  marketing: boolean;
}

type ConsentStatus = "accepted" | "custom" | null;

const CONSENT_COOKIE = "wolfpack_consent";
const PREFS_COOKIE = "wolfpack_consent_prefs";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/* ------------------------------------------------------------------ */
/*  Cookie helpers                                                      */
/* ------------------------------------------------------------------ */

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getConsentStatus(): ConsentStatus {
  const val = getCookie(CONSENT_COOKIE);
  if (val === "accepted" || val === "custom") return val;
  return null;
}

function getSavedPreferences(): ConsentPreferences | null {
  const raw = getCookie(PREFS_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      essential: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * CookieConsent — GDPR/CCPA compliant cookie consent banner.
 *
 * Shows on first visit when no consent cookie is present.
 * Two modes:
 *   1. "Accept All" — sets wolfpack_consent=accepted, enables everything
 *   2. "Manage Preferences" — granular toggles for Analytics + Marketing
 *
 * Stores consent in cookies (not just localStorage) so middleware and
 * server components can also read consent status.
 *
 * Emits a CustomEvent so EventCollector reacts immediately.
 * Also writes to localStorage for backward compatibility.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPreferences>({
    essential: true,
    analytics: true,
    marketing: false,
  });

  useEffect(() => {
    // Never show the consent banner inside the heatmap preview iframe — it
    // clutters the background render and is irrelevant (tracking is suppressed
    // entirely by EventCollector when __heatmap_bg=1).
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("__heatmap_bg") === "1"
    ) {
      return;
    }

    const status = getConsentStatus();
    if (!status) {
      setVisible(true);
    } else {
      // Load saved preferences for potential re-open
      const saved = getSavedPreferences();
      if (saved) setPrefs(saved);
    }
  }, []);

  const emitConsentEvent = useCallback(
    (type: "accepted_all" | "custom", preferences: ConsentPreferences) => {
      // Dispatch event for EventCollector
      window.dispatchEvent(
        new CustomEvent("cookie_consent_change", {
          detail: {
            level: type === "accepted_all" ? "all" : "custom",
            type,
            preferences,
          },
        }),
      );

      // Backward compatibility: write to localStorage
      try {
        localStorage.setItem(
          "cookie_consent",
          type === "accepted_all" || preferences.analytics ? "all" : "essential",
        );
      } catch {
        /* localStorage unavailable */
      }
    },
    [],
  );

  const handleAcceptAll = useCallback(() => {
    const allPrefs: ConsentPreferences = {
      essential: true,
      analytics: true,
      marketing: true,
    };

    setCookie(CONSENT_COOKIE, "accepted", COOKIE_MAX_AGE);
    setCookie(PREFS_COOKIE, JSON.stringify(allPrefs), COOKIE_MAX_AGE);
    setVisible(false);
    setShowPreferences(false);
    emitConsentEvent("accepted_all", allPrefs);
  }, [emitConsentEvent]);

  const handleSavePreferences = useCallback(() => {
    setCookie(CONSENT_COOKIE, "custom", COOKIE_MAX_AGE);
    setCookie(PREFS_COOKIE, JSON.stringify(prefs), COOKIE_MAX_AGE);

    // If marketing is off, clear any marketing cookies
    if (!prefs.marketing) {
      document.cookie =
        "wolfpack_vid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }

    setVisible(false);
    setShowPreferences(false);
    emitConsentEvent("custom", prefs);
  }, [prefs, emitConsentEvent]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-brand-800 bg-brand-950/95 shadow-2xl backdrop-blur-sm">
        {/* Main banner */}
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-center text-sm leading-relaxed text-gray-300 sm:text-left">
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

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              onClick={() => setShowPreferences((p) => !p)}
              className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-brand-600 hover:text-white"
            >
              Manage Preferences
            </button>
            <button
              onClick={handleAcceptAll}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
            >
              Accept All
            </button>
          </div>
        </div>

        {/* Preferences panel */}
        {showPreferences && (
          <div className="border-t border-brand-800 px-5 py-4 sm:px-6">
            <div className="space-y-3">
              {/* Essential — always on */}
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-white">
                    Essential
                  </span>
                  <p className="text-xs text-gray-400">
                    Required for the site to function. Always enabled.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="h-4 w-4 cursor-not-allowed rounded border-gray-600 bg-gray-700 text-brand-600 opacity-60"
                  aria-label="Essential cookies (always enabled)"
                />
              </label>

              {/* Analytics */}
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-white">
                    Analytics
                  </span>
                  <p className="text-xs text-gray-400">
                    Help us understand how visitors use our site.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, analytics: e.target.checked }))
                  }
                  className="h-4 w-4 cursor-pointer rounded border-gray-600 bg-gray-700 text-brand-600 focus:ring-brand-500"
                  aria-label="Analytics cookies"
                />
              </label>

              {/* Marketing */}
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-white">
                    Marketing
                  </span>
                  <p className="text-xs text-gray-400">
                    Used for targeted advertising and promotions.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, marketing: e.target.checked }))
                  }
                  className="h-4 w-4 cursor-pointer rounded border-gray-600 bg-gray-700 text-brand-600 focus:ring-brand-500"
                  aria-label="Marketing cookies"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSavePreferences}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
