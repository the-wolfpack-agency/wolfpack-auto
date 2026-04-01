/**
 * Competitive Exit Detection
 *
 * Detects when users are comparing with competitors by tracking:
 *  - Tab switch detection (visibilitychange events + duration away)
 *  - Clipboard copy detection (VIN, price, vehicle name copies)
 *  - Quick return pattern (tab away < 60s = likely price check)
 *  - Rage exit (3+ tab switches in 30s = frustrated/comparing)
 *  - Final exit behavior (section visible when leaving)
 *
 * Privacy-first: no PII, no cookies. All events fire-and-forget.
 * Integrates with EventCollector via the track() callback pattern.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CopiedContentType = "vin" | "price" | "vehicle_name" | "other";

export interface TabSwitchEvent {
  away_duration_ms: number;
  returned: boolean;
  section_visible_on_exit: string;
}

export interface ClipboardCopyEvent {
  copied_content_type: CopiedContentType;
  vin?: string;
}

export interface CompetitorCheckEvent {
  away_duration_ms: number;
  returned_within_60s: boolean;
  engaged_after_return: boolean;
}

export interface RageCompareEvent {
  switch_count: number;
  window_seconds: number;
}

export interface ExitDetectionConfig {
  vin: string;
  vehicleName?: string;
  price?: number;
  track: (
    eventType: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) => void;
}

export interface ExitDetectionState {
  destroy: () => void;
  /** Manually get the current visible section (for testing/external use) */
  getVisibleSection: () => string;
}

/* ------------------------------------------------------------------ */
/*  Content type classification                                        */
/* ------------------------------------------------------------------ */

/** VIN pattern: 17 alphanumeric characters (no I, O, Q) */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

/** Price pattern: optional $, digits with optional commas, optional decimals */
const PRICE_PATTERN = /^\$?\d{1,3}(,?\d{3})*(\.\d{2})?$/;

/**
 * Classify what the user copied to their clipboard.
 */
export function classifyCopiedContent(
  text: string,
  vehicleName?: string,
  vin?: string,
): CopiedContentType {
  const trimmed = text.trim();

  // Check for exact VIN match
  if (vin && trimmed.toUpperCase() === vin.toUpperCase()) return "vin";
  if (VIN_PATTERN.test(trimmed)) return "vin";

  // Check for price
  if (PRICE_PATTERN.test(trimmed)) return "price";
  // Also catch just number strings that look like prices
  const numericOnly = trimmed.replace(/[$,\s]/g, "");
  if (/^\d{4,6}(\.\d{2})?$/.test(numericOnly)) return "price";

  // Check for vehicle name
  if (vehicleName && trimmed.length > 5) {
    const lowerText = trimmed.toLowerCase();
    const lowerVehicle = vehicleName.toLowerCase();
    // Partial match: at least half the vehicle name words appear
    const vehicleWords = lowerVehicle.split(/\s+/);
    const matchCount = vehicleWords.filter((w) => lowerText.includes(w)).length;
    if (matchCount >= vehicleWords.length * 0.5) return "vehicle_name";
  }

  return "other";
}

/* ------------------------------------------------------------------ */
/*  Visible section detection                                          */
/* ------------------------------------------------------------------ */

/** Section identifiers to look for (data-section attributes or element IDs) */
const SECTION_SELECTORS = [
  "[data-section]",
  "#pricing",
  "#photos",
  "#features",
  "#specifications",
  "#financing",
  "#similar-vehicles",
  "#dealer-info",
];

/**
 * Determine which section of the VDP is currently visible.
 * Uses the element closest to the viewport center.
 */
export function detectVisibleSection(): string {
  if (typeof document === "undefined") return "unknown";

  const viewportCenter = (typeof window !== "undefined" ? window.innerHeight : 800) / 2;
  let closest = "unknown";
  let closestDistance = Infinity;

  for (const selector of SECTION_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elementCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest =
          (el as HTMLElement).dataset.section ??
          el.id ??
          el.tagName.toLowerCase();
      }
    }
  }

  return closest;
}

/* ------------------------------------------------------------------ */
/*  Rage detection                                                     */
/* ------------------------------------------------------------------ */

const RAGE_WINDOW_MS = 30_000;
const RAGE_THRESHOLD = 3;

/**
 * Check if recent tab switches constitute a "rage compare" pattern.
 * Returns the rage event data if triggered, null otherwise.
 */
export function detectRageCompare(
  switchTimestamps: number[],
): RageCompareEvent | null {
  if (switchTimestamps.length < RAGE_THRESHOLD) return null;

  const now = Date.now();
  const recentSwitches = switchTimestamps.filter(
    (ts) => now - ts <= RAGE_WINDOW_MS,
  );

  if (recentSwitches.length >= RAGE_THRESHOLD) {
    return {
      switch_count: recentSwitches.length,
      window_seconds: Math.round(RAGE_WINDOW_MS / 1000),
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Exit detection tracker (stateful)                                  */
/* ------------------------------------------------------------------ */

/**
 * Initialize competitive exit detection for a VDP page.
 *
 * Attaches event listeners for visibilitychange and copy events.
 * Returns a controller with destroy() for cleanup.
 *
 * Usage:
 *   const tracker = initExitDetection({ vin, vehicleName, price, track });
 *   // On unmount:
 *   tracker.destroy();
 */
export function initExitDetection(
  config: ExitDetectionConfig,
): ExitDetectionState {
  const { vin, vehicleName, price, track } = config;

  // State
  let leftAt: number | null = null;
  let sectionOnExit = "unknown";
  const switchTimestamps: number[] = [];
  let destroyed = false;
  let engagedAfterReturn = false;

  // Track engagement after returning (any click or scroll = engaged)
  function markEngaged(): void {
    engagedAfterReturn = true;
  }

  /* ---- Visibility change handler ---- */
  function handleVisibilityChange(): void {
    if (destroyed) return;

    if (document.visibilityState === "hidden") {
      // User left the tab
      leftAt = Date.now();
      sectionOnExit = detectVisibleSection();
      engagedAfterReturn = false;
      switchTimestamps.push(Date.now());

      track("exit_detection", "exit.tab_switch", {
        vin,
        away_duration_ms: 0, // Will be updated on return
        returned: false,
        section_visible_on_exit: sectionOnExit,
      });

      // Check for rage compare
      const rage = detectRageCompare(switchTimestamps);
      if (rage) {
        track("exit_detection", "exit.rage_compare", {
          vin,
          switch_count: rage.switch_count,
          window_seconds: rage.window_seconds,
        });
      }
    } else if (document.visibilityState === "visible" && leftAt !== null) {
      // User returned
      const awayDuration = Date.now() - leftAt;
      const returnedWithin60s = awayDuration <= 60_000;

      track("exit_detection", "exit.tab_switch", {
        vin,
        away_duration_ms: awayDuration,
        returned: true,
        section_visible_on_exit: sectionOnExit,
      });

      // Competitor check pattern
      if (returnedWithin60s) {
        // Defer engagement check briefly to allow user interaction
        setTimeout(() => {
          track("exit_detection", "exit.competitor_check", {
            vin,
            away_duration_ms: awayDuration,
            returned_within_60s: true,
            engaged_after_return: engagedAfterReturn,
          });
        }, 3000);
      } else {
        track("exit_detection", "exit.competitor_check", {
          vin,
          away_duration_ms: awayDuration,
          returned_within_60s: false,
          engaged_after_return: false,
        });
      }

      leftAt = null;
    }
  }

  /* ---- Clipboard copy handler ---- */
  function handleCopy(): void {
    if (destroyed) return;

    // Read selection text (not clipboard API — no permission needed)
    const selection = document.getSelection();
    const text = selection?.toString() ?? "";
    if (!text.trim()) return;

    const contentType = classifyCopiedContent(text, vehicleName, vin);

    track("exit_detection", "exit.clipboard_copy", {
      vin,
      copied_content_type: contentType,
      // Never include the actual copied text — privacy first
    });
  }

  /* ---- Attach listeners ---- */
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("click", markEngaged, { passive: true });
    document.addEventListener("scroll", markEngaged, { passive: true });
  }

  function getVisibleSection(): string {
    return detectVisibleSection();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("click", markEngaged);
      document.removeEventListener("scroll", markEngaged);
    }
  }

  return { destroy, getVisibleSection };
}

/* ------------------------------------------------------------------ */
/*  React hook factory                                                 */
/* ------------------------------------------------------------------ */

/**
 * Create a React hook for exit detection tracking.
 *
 * Usage:
 *   const useExitDetection = createExitDetectionHook(track);
 *   // In component:
 *   useExitDetection(vin, vehicleName, price);
 */
export function createExitDetectionHook(
  track: ExitDetectionConfig["track"],
) {
  return function useExitDetectionSetup(
    vin: string,
    vehicleName?: string,
    price?: number,
  ): ExitDetectionState {
    return initExitDetection({ vin, vehicleName, price, track });
  };
}
