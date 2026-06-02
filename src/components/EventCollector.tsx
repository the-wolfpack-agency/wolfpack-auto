"use client";

/**
 * EventCollector — client-side behavioral data collection provider.
 *
 * Wraps the entire app and automatically captures:
 *  - Page views (with referrer, viewport size)
 *  - Clicks (element, text, href, data-track attributes)
 *  - Scroll depth (10% increments)
 *  - Time on page (fires on visibility change or navigation)
 *  - Session lifecycle (start, heartbeat, end)
 *  - Form interactions (focus, submit)
 *
 * Manual tracking via useAnalytics() hook for:
 *  - Chat messages, vehicle views, search queries, conversions
 *
 * Privacy-first: no cookies, no PII, sessionStorage fingerprint only.
 * Batched: collects events and flushes every 5s or 20 events.
 *
 * Reusable across projects — no Wolfpack-specific logic.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  startSession as startJourneySession,
  recordVehicleView as journeyRecordVehicleView,
  recordCalculatorUsed as journeyRecordCalculatorUsed,
  recordPageView as journeyRecordPageView,
  getJourneyState,
} from "@/lib/journey-stitcher";
import {
  buildTemporalInput,
  generateTemporalEvents,
} from "@/lib/temporal-patterns";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AnalyticsEvent {
  event_type: string;
  action: string;
  page: string;
  session_id: string;
  user_fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface AnalyticsContextValue {
  /** Track a custom event */
  track: (
    eventType: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) => void;
  /** Track a chat message (both user and assistant) */
  trackChat: (role: "user" | "assistant", content: string) => void;
  /** Track a vehicle view */
  trackVehicleView: (vin: string, title: string) => void;
  /** Track a search query */
  trackSearch: (query: string, resultCount: number, source: string) => void;
  /** Track a conversion action */
  trackConversion: (
    action: string,
    metadata?: Record<string, unknown>,
  ) => void;
  /** Attach video tracking to a <video> element ref */
  trackVideo: (
    ref: RefObject<HTMLVideoElement | null>,
    videoId: string,
    title: string,
  ) => void;
  /** Track vehicle comparison actions (add/remove/view/winner) */
  trackComparison: (
    action: "add" | "remove" | "view" | "winner",
    metadata: { vins: string[]; selected_vin?: string },
  ) => void;
  /** Track A/B test variant assignment */
  trackABAssignment: (testName: string, variant: string) => void;
  /** Track A/B test conversion */
  trackABConversion: (testName: string, variant: string, value?: number) => void;
  /** Track push notification engagement */
  trackPushEvent: (
    action: "push_permission_granted" | "push_permission_denied" | "push_received" | "push_clicked" | "push_dismissed",
    metadata?: Record<string, unknown>,
  ) => void;
  /** Get current session ID */
  getSessionId: () => string;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

/**
 * Hook to access the analytics tracking API.
 */
export function useAnalytics(): AnalyticsContextValue {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    // Return no-op fallback for SSR or when provider is missing
    return {
      track: () => {},
      trackChat: () => {},
      trackVehicleView: () => {},
      trackSearch: () => {},
      trackConversion: () => {},
      trackVideo: () => {},
      trackComparison: () => {},
      trackABAssignment: () => {},
      trackABConversion: () => {},
      trackPushEvent: () => {},
      getSessionId: () => "",
    };
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Session & fingerprint management                                   */
/* ------------------------------------------------------------------ */

const SESSION_KEY = "wolfpack_analytics_session";
const FINGERPRINT_KEY = "wolfpack_analytics_fp";

/** CSPRNG-backed token. Falls back to Date.now+counter only if Web Crypto is missing. */
function secureToken(byteLen: number): string {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buf = new Uint8Array(byteLen);
    window.crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Should not happen in modern browsers; degrade gracefully.
  return Date.now().toString(36);
}

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now()}_${secureToken(6)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

function getOrCreateFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    let fp = localStorage.getItem(FINGERPRINT_KEY);
    if (!fp) {
      // Anonymous fingerprint — no PII, CSPRNG-derived random ID
      fp = `fp_${Date.now()}_${secureToken(8)}`;
      localStorage.setItem(FINGERPRINT_KEY, fp);
    }
    return fp;
  } catch {
    return `fp_${Date.now()}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Event buffer & flush                                               */
/* ------------------------------------------------------------------ */

/* Raised from 5s/20 events to 30s/100 events on 2026-05-19 after the
 * Neon data-transfer quota was exhausted. The earlier cadence was
 * writing every open tab into analytics_events six times faster than
 * the retention cron could prune. The beforeunload flush handler still
 * catches in-flight events when a user closes the tab so no signal is
 * lost. See scripts/scan-db-burners.sh + docs/handoff-2026-05-19.md. */
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_THRESHOLD = 100;

/** Categorize a numeric value into a privacy-safe range bucket. */
function categorizeValue(val: string): string {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return "non_numeric";
  if (n < 100) return "under_100";
  if (n < 1000) return "100_999";
  if (n < 5000) return "1K_5K";
  if (n < 10000) return "5K_10K";
  if (n < 25000) return "10K_25K";
  if (n < 50000) return "25K_50K";
  if (n < 100000) return "50K_100K";
  return "100K_plus";
}

let eventBuffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Event types that are always tracked regardless of consent level.
 *
 * heatmap_click / heatmap_move carry ZERO identity (session_id and
 * user_fingerprint are hard-coded "anon", metadata has NO text/href/PII).
 * They are cookieless aggregate-only signals — legitimate-interest
 * essential analytics, like Plausible/Fathom. Adding them here means
 * enqueueEvent will pass them through without a consent check. */
const ESSENTIAL_EVENT_TYPES = new Set(["page_view", "heatmap_click", "heatmap_move"]);

/** Check if analytics consent is granted (cookie or localStorage). */
function hasAnalyticsConsent(): boolean {
  try {
    /* Admin context: dealer staff operating their own platform are
       not "visitors" in the privacy-regulation sense — they're
       authenticated operators using internal tooling. Their click /
       scroll / dwell on /admin/* pages is operational analytics, not
       visitor tracking, so we treat the admin context as consented.
       This is what unblocks the heatmap from showing the dealer's
       own activity (per the 2026-05-02 incident: dealer was clicking
       around their own admin pages and nothing tracked). */
    if (
      typeof window !== "undefined" &&
      typeof window.location !== "undefined" &&
      window.location.pathname.startsWith("/admin")
    ) {
      return true;
    }
    // Primary: check cookie (set by CookieConsent component)
    if (typeof document !== "undefined") {
      const cookieMatch = document.cookie.match(/(?:^|; )wolfpack_consent=([^;]*)/);
      const consentVal = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
      if (consentVal === "accepted") return true;
      if (consentVal === "custom") {
        const prefsMatch = document.cookie.match(/(?:^|; )wolfpack_consent_prefs=([^;]*)/);
        if (prefsMatch) {
          try {
            const prefs = JSON.parse(decodeURIComponent(prefsMatch[1]));
            return !!prefs.analytics;
          } catch { return false; }
        }
        return false;
      }
    }
    // Fallback: check localStorage (backward compatibility)
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("cookie_consent") === "all";
    }
  } catch {
    /* storage unavailable */
  }
  return false;
}

function enqueueEvent(event: AnalyticsEvent): void {
  // Respect cookie consent: if consent is not granted, only allow essential events.
  if (!ESSENTIAL_EVENT_TYPES.has(event.event_type)) {
    if (!hasAnalyticsConsent()) return;
  }

  eventBuffer.push(event);

  if (eventBuffer.length >= FLUSH_THRESHOLD) {
    flushEvents();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
  }
}

function flushEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventBuffer.length === 0) return;

  const batch = [...eventBuffer];
  eventBuffer = [];

  // Fire-and-forget — never block the UI
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics/events",
      new Blob([JSON.stringify({ events: batch })], {
        type: "application/json",
      }),
    );
  } else {
    fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {
      // Silently drop — analytics should never crash the app
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Provider component                                                 */
/* ------------------------------------------------------------------ */

export default function EventCollector({
  children,
}: {
  children: ReactNode;
}) {
  const sessionId = useRef("");
  const fingerprint = useRef("");
  const pageEnteredAt = useRef(Date.now());
  const currentPage = useRef("");
  const scrollDepthReported = useRef(new Set<number>());
  /** Cookie consent level: "all" = full tracking, "essential" = page views only, "" = not yet set (treat as essential) */
  const consentLevel = useRef<string>("");

  /** Returns true if the user has consented to full (non-essential) tracking.
   *
   *  Reads BOTH consent systems so either grant satisfies the gate:
   *    1. localStorage.cookie_consent === "all" (legacy)
   *    2. wolfpack_consent cookie (current CookieConsent component)
   *
   *  Admin context exception (regression 2026-05-02): paths under
   *  /admin/* are dealer staff using internal tooling, not regulated
   *  visitors. They auto-consent so the dealer's own clicks track on
   *  the heatmap without needing the cookie banner. Public pages
   *  still gate on the explicit consent grant. */
  function hasFullConsent(): boolean {
    if (
      typeof window !== "undefined" &&
      typeof window.location !== "undefined" &&
      window.location.pathname.startsWith("/admin")
    ) {
      return true;
    }
    if (consentLevel.current === "all") return true;
    /* Cookie-based consent (current CookieConsent component) — without
       this, public-page clicks went untracked even after the user
       accepted the banner because consentLevel is only updated via
       the cookie_consent_change CustomEvent, and we miss the initial
       cookie grant from a prior session. Regression 2026-05-02. */
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^|; )wolfpack_consent=([^;]*)/);
      if (m) {
        const v = decodeURIComponent(m[1]);
        if (v === "accepted") return true;
        if (v === "custom") {
          const p = document.cookie.match(
            /(?:^|; )wolfpack_consent_prefs=([^;]*)/,
          );
          if (p) {
            try {
              const prefs = JSON.parse(decodeURIComponent(p[1]));
              if (prefs.analytics) return true;
            } catch {
              /* fall through */
            }
          }
        }
      }
    }
    return false;
  }

  // Initialize session + read consent
  useEffect(() => {
    sessionId.current = getOrCreateSession();
    fingerprint.current = getOrCreateFingerprint();

    // Read stored consent preference
    try {
      consentLevel.current = localStorage.getItem("cookie_consent") ?? "";
    } catch {
      consentLevel.current = "";
    }

    // Listen for consent changes from CookieConsent banner
    function handleConsentChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.level) {
        consentLevel.current = detail.level;
      }
    }
    window.addEventListener("cookie_consent_change", handleConsentChange);
    return () =>
      window.removeEventListener("cookie_consent_change", handleConsentChange);
  }, []);

  // --- Journey stitcher + temporal pattern initialization ---
  useEffect(() => {
    try {
      // Start a new journey session (reads/writes localStorage)
      const { events: journeyEvents } = startJourneySession();

      // Fire all journey events into the analytics pipeline
      for (const evt of journeyEvents) {
        enqueueEvent({
          event_type: evt.type.split(".")[0],
          action: evt.type,
          page: window.location.pathname,
          session_id: sessionId.current,
          user_fingerprint: fingerprint.current,
          timestamp: new Date().toISOString(),
          metadata: evt.data,
        });
      }

      // Run temporal classification on session start
      const journeyState = getJourneyState();
      const temporalInput = buildTemporalInput(journeyState);
      const temporalEvents = generateTemporalEvents(temporalInput);

      for (const evt of temporalEvents) {
        enqueueEvent({
          event_type: evt.type.split(".")[0],
          action: evt.type,
          page: window.location.pathname,
          session_id: sessionId.current,
          user_fingerprint: fingerprint.current,
          timestamp: new Date().toISOString(),
          metadata: evt.data,
        });
      }
    } catch {
      // Journey/temporal analytics must never break the app
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Core event builder ---
  const buildEvent = useCallback(
    (
      eventType: string,
      action: string,
      metadata: Record<string, unknown> = {},
    ): AnalyticsEvent => ({
      event_type: eventType,
      action,
      page: typeof window !== "undefined" ? window.location.pathname : "",
      session_id: sessionId.current,
      user_fingerprint: fingerprint.current,
      timestamp: new Date().toISOString(),
      metadata,
    }),
    [],
  );

  // --- Public tracking API ---
  const track = useCallback(
    (
      eventType: string,
      action: string,
      metadata?: Record<string, unknown>,
    ) => {
      enqueueEvent(buildEvent(eventType, action, metadata));
    },
    [buildEvent],
  );

  const trackChat = useCallback(
    (role: "user" | "assistant", content: string) => {
      enqueueEvent(
        buildEvent("chat_message", `chat_${role}`, { role, content }),
      );
    },
    [buildEvent],
  );

  const trackVehicleView = useCallback(
    (vin: string, title: string) => {
      enqueueEvent(
        buildEvent("vehicle_view", "view_vehicle", { vin, title }),
      );
      // Feed into journey stitcher — extract category from title (e.g. "2024 Toyota Camry" -> "Toyota")
      try {
        const parts = title.split(" ");
        const category = parts.length >= 2 ? parts[1] : parts[0] || "unknown";
        const journeyEvents = journeyRecordVehicleView(vin, category);
        for (const evt of journeyEvents) {
          enqueueEvent(
            buildEvent(evt.type.split(".")[0], evt.type, evt.data),
          );
        }
      } catch { /* journey analytics must never break */ }
    },
    [buildEvent],
  );

  const trackSearch = useCallback(
    (query: string, resultCount: number, source: string) => {
      enqueueEvent(
        buildEvent("search", "search_vehicles", {
          query,
          result_count: resultCount,
          source,
        }),
      );
    },
    [buildEvent],
  );

  const trackConversion = useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      enqueueEvent(buildEvent("conversion", action, metadata));
    },
    [buildEvent],
  );

  const trackComparison = useCallback(
    (
      action: "add" | "remove" | "view" | "winner",
      metadata: { vins: string[]; selected_vin?: string },
    ) => {
      const eventMap: Record<string, string> = {
        add: "vehicle_compare_add",
        remove: "vehicle_compare_remove",
        view: "vehicle_compare_view",
        winner: "vehicle_compare_winner",
      };
      enqueueEvent(
        buildEvent(eventMap[action], `compare_${action}`, {
          vins: metadata.vins,
          vehicle_count: metadata.vins.length,
          ...(metadata.selected_vin ? { selected_vin: metadata.selected_vin } : {}),
        }),
      );
    },
    [buildEvent],
  );

  // --- A/B test tracking ---
  const trackABAssignment = useCallback(
    (testName: string, variant: string) => {
      enqueueEvent(
        buildEvent("ab_test_assignment", "ab_assignment", {
          test_name: testName,
          variant,
        }),
      );
    },
    [buildEvent],
  );

  const trackABConversion = useCallback(
    (testName: string, variant: string, value?: number) => {
      enqueueEvent(
        buildEvent("ab_test_conversion", "ab_conversion", {
          test_name: testName,
          variant,
          ...(value !== undefined ? { conversion_value: value } : {}),
        }),
      );
    },
    [buildEvent],
  );

  // --- Push notification engagement tracking ---
  const trackPushEvent = useCallback(
    (
      action:
        | "push_permission_granted"
        | "push_permission_denied"
        | "push_received"
        | "push_clicked"
        | "push_dismissed",
      metadata?: Record<string, unknown>,
    ) => {
      enqueueEvent(
        buildEvent("push_engagement", action, metadata ?? {}),
      );
    },
    [buildEvent],
  );

  // --- Video watch-through tracking ---
  const videoCleanups = useRef(new Map<string, () => void>());

  const trackVideo = useCallback(
    (
      ref: RefObject<HTMLVideoElement | null>,
      videoId: string,
      title: string,
    ) => {
      // Defer attachment until next tick so the ref is populated
      setTimeout(() => {
        const el = ref.current;
        if (!el) return;

        // Prevent duplicate listeners for the same videoId
        if (videoCleanups.current.has(videoId)) {
          videoCleanups.current.get(videoId)!();
        }

        const milestonesHit = new Set<number>();

        const meta = () => ({
          video_id: videoId,
          video_title: title,
          duration: el.duration || 0,
          current_time: el.currentTime || 0,
          percentage: el.duration
            ? Math.round((el.currentTime / el.duration) * 100)
            : 0,
        });

        function onPlay() {
          enqueueEvent(buildEvent("video", "video_play", meta()));
        }

        function onPause() {
          enqueueEvent(buildEvent("video", "video_pause", meta()));
        }

        function onEnded() {
          if (!milestonesHit.has(100)) {
            milestonesHit.add(100);
            enqueueEvent(buildEvent("video", "video_progress", { ...meta(), milestone: 100 }));
          }
          enqueueEvent(buildEvent("video", "video_complete", meta()));
        }

        function onTimeUpdate() {
          if (!el || !el.duration) return;
          const pct = Math.round((el.currentTime / el.duration) * 100);
          for (const milestone of [25, 50, 75]) {
            if (pct >= milestone && !milestonesHit.has(milestone)) {
              milestonesHit.add(milestone);
              enqueueEvent(
                buildEvent("video", "video_progress", { ...meta(), milestone }),
              );
            }
          }
        }

        function onSeeked() {
          // Detect replay: user seeks back to near the start after reaching 75%+
          if (el && el.currentTime < el.duration * 0.1 && milestonesHit.has(75)) {
            enqueueEvent(buildEvent("video", "video_replay", meta()));
            milestonesHit.clear();
          }
        }

        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnded);
        el.addEventListener("timeupdate", onTimeUpdate);
        el.addEventListener("seeked", onSeeked);

        const cleanup = () => {
          el.removeEventListener("play", onPlay);
          el.removeEventListener("pause", onPause);
          el.removeEventListener("ended", onEnded);
          el.removeEventListener("timeupdate", onTimeUpdate);
          el.removeEventListener("seeked", onSeeked);
        };

        videoCleanups.current.set(videoId, cleanup);
      }, 0);
    },
    [buildEvent],
  );

  // Cleanup all video listeners on unmount
  useEffect(() => {
    return () => {
      videoCleanups.current.forEach((cleanup) => cleanup());
      videoCleanups.current.clear();
    };
  }, []);

  const getSessionIdFn = useCallback(() => sessionId.current, []);

  // --- Auto-tracking: page views ---
  useEffect(() => {
    const page = window.location.pathname;
    if (page !== currentPage.current) {
      // Fire time_on_page for previous page
      if (currentPage.current) {
        const duration = Date.now() - pageEnteredAt.current;
        enqueueEvent(
          buildEvent("time_on_page", "page_exit", {
            duration_ms: duration,
            previous_page: currentPage.current,
          }),
        );
      }

      currentPage.current = page;
      pageEnteredAt.current = Date.now();
      scrollDepthReported.current.clear();

      enqueueEvent(
        buildEvent("page_view", "view", {
          referrer: document.referrer,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          user_agent: navigator.userAgent,
        }),
      );

      // Record page view in journey stitcher
      try { journeyRecordPageView(); } catch { /* never break */ }
    }
  }, [buildEvent]);

  // --- Auto-tracking: clicks (non-essential — requires full consent) ---
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!hasFullConsent()) return;

      const target = e.target as HTMLElement;
      if (!target) return;

      // Find the nearest clickable element
      const clickable = target.closest("a, button, [data-track]");
      const el = clickable ?? target;

      /* x/y are page-relative (pageX includes scrollX) so the
         heatmap renders correctly even if a visitor clicks something
         deep in the page. viewport_w lets the aggregator normalize
         across screen sizes. */
      const metadata: Record<string, unknown> = {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 100),
        x: Math.round(e.pageX),
        y: Math.round(e.pageY),
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
      };

      // Capture href for links
      if (el instanceof HTMLAnchorElement && el.href) {
        metadata.href = el.href;
      }

      // Capture data-track attribute for custom tracking
      const trackAttr = el.getAttribute("data-track");
      if (trackAttr) {
        metadata.track_id = trackAttr;
      }

      // Capture data-track-* attributes
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-track-")) {
          const key = attr.name.replace("data-track-", "");
          metadata[key] = attr.value;
        }
      }

      enqueueEvent(
        buildEvent("click", trackAttr ?? "click", metadata),
      );
    }

    document.addEventListener("click", handleClick, { passive: true });
    return () => document.removeEventListener("click", handleClick);
  }, [buildEvent]);

  // --- Auto-tracking: scroll depth (non-essential — requires full consent) ---
  useEffect(() => {
    function handleScroll() {
      if (!hasFullConsent()) return;
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const pct = Math.round((scrollTop / docHeight) * 100);

      // Report at 25%, 50%, 75%, 90%, 100% thresholds
      for (const threshold of [25, 50, 75, 90, 100]) {
        if (pct >= threshold && !scrollDepthReported.current.has(threshold)) {
          scrollDepthReported.current.add(threshold);
          enqueueEvent(
            buildEvent("scroll", `scroll_${threshold}`, {
              depth: threshold,
              page: window.location.pathname,
            }),
          );
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [buildEvent]);

  // --- Auto-tracking: visibility change (non-essential — requires full consent) ---
  useEffect(() => {
    function handleVisibilityChange() {
      if (!hasFullConsent()) return;
      if (document.hidden) {
        const duration = Date.now() - pageEnteredAt.current;
        enqueueEvent(
          buildEvent("time_on_page", "page_hidden", {
            duration_ms: duration,
            page: currentPage.current,
          }),
        );
      } else {
        pageEnteredAt.current = Date.now();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [buildEvent]);

  // --- Auto-tracking: form interactions (non-essential — requires full consent) ---
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      if (!hasFullConsent()) return;
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        enqueueEvent(
          buildEvent("form_interaction", "field_focus", {
            field_name: target.name || target.id || "unknown",
            field_type: (target as HTMLInputElement).type || target.tagName.toLowerCase(),
            form_id: target.form?.id || target.form?.action || "unknown",
          }),
        );
      }
    }

    function handleSubmit(e: Event) {
      if (!hasFullConsent()) return;
      const form = e.target as HTMLFormElement;
      enqueueEvent(
        buildEvent("form_interaction", "form_submit", {
          form_id: form.id || form.action || "unknown",
          form_action: form.action,
        }),
      );
    }

    document.addEventListener("focusin", handleFocusIn, { passive: true });
    document.addEventListener("submit", handleSubmit, { passive: true });
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("submit", handleSubmit);
    };
  }, [buildEvent]);

  // ================================================================
  // ADVANCED BEHAVIORAL SIGNALS — industry-differentiating captures
  // ================================================================

  // --- 1. Micro-hesitation tracking (non-essential — requires full consent) ---
  useEffect(() => {
    const fieldState = new Map<
      string,
      { lastValue: string; lastChange: number; peakLength: number }
    >();

    function handleInput(e: Event) {
      if (!hasFullConsent()) return;
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      )
        return;

      const fieldId = target.name || target.id || "unknown";
      const now = Date.now();
      const value = target.value;
      const state = fieldState.get(fieldId) ?? {
        lastValue: "",
        lastChange: now,
        peakLength: 0,
      };

      // Detect deletion: value got shorter (user deleted text)
      if (value.length < state.peakLength && state.peakLength > 3) {
        const deleted = state.peakLength - value.length;
        enqueueEvent(
          buildEvent("micro_hesitation", "field_deletion", {
            field_name: fieldId,
            chars_deleted: deleted,
            peak_length: state.peakLength,
            current_length: value.length,
            time_since_last_change_ms: now - state.lastChange,
          }),
        );
      }

      state.lastValue = value;
      state.lastChange = now;
      state.peakLength = Math.max(state.peakLength, value.length);
      fieldState.set(fieldId, state);
    }

    document.addEventListener("input", handleInput, { passive: true });
    return () => document.removeEventListener("input", handleInput);
  }, [buildEvent]);

  // --- 2. Cursor heatmap data (hover position + linger) ---
  useEffect(() => {
    let lastEmit = 0;
    let lingerStart = 0;
    let lingerX = 0;
    let lingerY = 0;
    const LINGER_THRESHOLD_MS = 1500; // 1.5s of near-stillness = linger
    const EMIT_INTERVAL_MS = 2000; // emit at most every 2s
    const MOVE_TOLERANCE = 20; // px — movement within this = still lingering

    function handleMouseMove(e: MouseEvent) {
      if (!hasFullConsent()) return;
      const now = Date.now();

      // Check for linger: cursor stayed near same spot
      const dx = Math.abs(e.clientX - lingerX);
      const dy = Math.abs(e.clientY - lingerY);

      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
        // Cursor moved significantly — check if we were lingering
        if (lingerStart > 0 && now - lingerStart > LINGER_THRESHOLD_MS) {
          const lingerDuration = now - lingerStart;
          const target = document.elementFromPoint(lingerX, lingerY);
          enqueueEvent(
            buildEvent("cursor_heatmap", "linger", {
              x: lingerX,
              y: lingerY,
              duration_ms: lingerDuration,
              element_tag: target?.tagName.toLowerCase() ?? "unknown",
              element_text: (target?.textContent ?? "").trim().slice(0, 80),
              viewport_width: window.innerWidth,
              viewport_height: window.innerHeight,
            }),
          );
        }

        lingerX = e.clientX;
        lingerY = e.clientY;
        lingerStart = now;
      }

      // Periodic position sampling (not every event — that's too much data)
      if (now - lastEmit > EMIT_INTERVAL_MS) {
        lastEmit = now;
        enqueueEvent(
          buildEvent("cursor_heatmap", "position", {
            x: e.clientX,
            y: e.clientY,
            scroll_y: window.scrollY,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
          }),
        );
      }
    }

    // Only track on non-touch devices
    if (typeof window !== "undefined" && !("ontouchstart" in window)) {
      document.addEventListener("mousemove", handleMouseMove, {
        passive: true,
      });
    }
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [buildEvent]);

  // --- 3. Copy-paste detection ---
  useEffect(() => {
    function handleCopy() {
      const selection = window.getSelection()?.toString().trim() ?? "";
      if (selection.length < 2 || selection.length > 500) return;

      // Detect what type of content was copied
      let contentType = "text";
      if (/^\d[A-Z0-9]{16}$/.test(selection)) contentType = "vin";
      else if (/^\$?[\d,]+(\.\d{2})?$/.test(selection)) contentType = "price";
      else if (/^\(\d{3}\)\s?\d{3}-\d{4}$/.test(selection))
        contentType = "phone";
      else if (/@/.test(selection)) contentType = "email";

      enqueueEvent(
        buildEvent("copy_paste", "copy", {
          content: selection.slice(0, 200),
          content_type: contentType,
          content_length: selection.length,
          source_element:
            window.getSelection()?.anchorNode?.parentElement?.tagName.toLowerCase() ??
            "unknown",
        }),
      );
    }

    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (pasted.length < 2) return;

      enqueueEvent(
        buildEvent("copy_paste", "paste", {
          content_length: pasted.length,
          target_field:
            (target as HTMLInputElement).name ||
            target.id ||
            target.tagName.toLowerCase(),
        }),
      );
    }

    document.addEventListener("copy", handleCopy, { passive: true });
    document.addEventListener("paste", handlePaste as EventListener, {
      passive: true,
    });
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste as EventListener);
    };
  }, [buildEvent]);

  // --- 4. Tab visibility patterns (tab-away count + durations) ---
  useEffect(() => {
    let tabAwayCount = 0;
    let tabAwayStart = 0;
    const tabAwayDurations: number[] = [];

    function handleVisibility() {
      if (document.hidden) {
        tabAwayCount++;
        tabAwayStart = Date.now();
      } else if (tabAwayStart > 0) {
        const duration = Date.now() - tabAwayStart;
        tabAwayDurations.push(duration);
        tabAwayStart = 0;

        enqueueEvent(
          buildEvent("tab_visibility", "tab_return", {
            tab_away_count: tabAwayCount,
            away_duration_ms: duration,
            avg_away_duration_ms:
              tabAwayDurations.reduce((a, b) => a + b, 0) /
              tabAwayDurations.length,
            total_tab_switches: tabAwayCount,
            likely_comparison_shopping: tabAwayCount >= 3,
          }),
        );
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [buildEvent]);

  // --- 5. Device orientation change tracking ---
  useEffect(() => {
    let orientationChanges = 0;

    function handleOrientation() {
      orientationChanges++;
      const orientation =
        typeof screen !== "undefined" && screen.orientation
          ? screen.orientation.type
          : window.innerWidth > window.innerHeight
            ? "landscape"
            : "portrait";

      enqueueEvent(
        buildEvent("device_orientation", "orientation_change", {
          orientation,
          change_count: orientationChanges,
          page: window.location.pathname,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
        }),
      );
    }

    // Modern API
    if (typeof screen !== "undefined" && screen.orientation) {
      screen.orientation.addEventListener("change", handleOrientation);
    }
    // Fallback
    window.addEventListener("resize", () => {
      // Only fire on significant resize (orientation change, not keyboard)
      const isLandscape = window.innerWidth > window.innerHeight;
      const wasLandscape =
        (window as unknown as { __prevLandscape?: boolean }).__prevLandscape;
      if (wasLandscape !== undefined && wasLandscape !== isLandscape) {
        handleOrientation();
      }
      (window as unknown as { __prevLandscape: boolean }).__prevLandscape =
        isLandscape;
    });

    return () => {
      if (typeof screen !== "undefined" && screen.orientation) {
        screen.orientation.removeEventListener("change", handleOrientation);
      }
    };
  }, [buildEvent]);

  // --- 6. Scroll velocity tracking (reading vs scanning) ---
  useEffect(() => {
    let lastScrollY = 0;
    let lastScrollTime = 0;
    let velocitySamples: number[] = [];
    const SAMPLE_INTERVAL_MS = 200;

    function handleScroll() {
      const now = Date.now();
      if (now - lastScrollTime < SAMPLE_INTERVAL_MS) return;

      const dy = Math.abs(window.scrollY - lastScrollY);
      const dt = now - lastScrollTime;

      if (dt > 0 && lastScrollTime > 0) {
        const velocity = dy / dt; // px/ms
        velocitySamples.push(velocity);

        // Emit summary every 20 samples
        if (velocitySamples.length >= 20) {
          const avg =
            velocitySamples.reduce((a, b) => a + b, 0) /
            velocitySamples.length;
          const max = Math.max(...velocitySamples);
          const min = Math.min(...velocitySamples);

          // Classify behavior
          let behavior: "reading" | "scanning" | "searching" | "idle";
          if (avg < 0.3) behavior = "reading";
          else if (avg < 1.0) behavior = "scanning";
          else behavior = "searching";
          if (max < 0.05) behavior = "idle";

          enqueueEvent(
            buildEvent("scroll_velocity", "velocity_summary", {
              avg_velocity: Math.round(avg * 1000) / 1000,
              max_velocity: Math.round(max * 1000) / 1000,
              min_velocity: Math.round(min * 1000) / 1000,
              behavior,
              samples: velocitySamples.length,
              page: window.location.pathname,
            }),
          );

          velocitySamples = [];
        }
      }

      lastScrollY = window.scrollY;
      lastScrollTime = now;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [buildEvent]);

  // --- 7. Time-to-first-interaction ---
  useEffect(() => {
    const loadTime = Date.now();
    let tracked = false;

    function handleFirstInteraction(e: Event) {
      if (tracked) return;
      tracked = true;

      const ttfi = Date.now() - loadTime;
      const interactionType =
        e.type === "click"
          ? "click"
          : e.type === "scroll"
            ? "scroll"
            : e.type === "keydown"
              ? "keypress"
              : e.type;

      enqueueEvent(
        buildEvent("time_to_first_interaction", "first_interaction", {
          ttfi_ms: ttfi,
          interaction_type: interactionType,
          page: window.location.pathname,
          // Classify user intent
          intent:
            ttfi < 2000
              ? "purposeful"
              : ttfi < 5000
                ? "browsing"
                : "undecided",
        }),
      );

      // Remove all listeners after first fire
      cleanup();
    }

    function cleanup() {
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("scroll", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    }

    document.addEventListener("click", handleFirstInteraction, {
      passive: true,
      once: true,
    });
    document.addEventListener("scroll", handleFirstInteraction, {
      passive: true,
      once: true,
    });
    document.addEventListener("keydown", handleFirstInteraction, {
      passive: true,
      once: true,
    });

    return cleanup;
  }, [buildEvent]);

  // --- 9. Return visit attribution ---
  useEffect(() => {
    const RETURN_VISIT_KEY = "wolfpack_visit_history";
    try {
      const now = Date.now();
      const page = window.location.pathname;
      const raw = localStorage.getItem(RETURN_VISIT_KEY);
      const history: { page: string; ts: number }[] = raw
        ? JSON.parse(raw)
        : [];

      // Find previous visits
      const prevVisits = history.filter((h) => h.page === page);
      const isReturn = prevVisits.length > 0;

      if (isReturn) {
        const lastVisit = prevVisits[prevVisits.length - 1];
        const daysSinceLastVisit = Math.round(
          (now - lastVisit.ts) / (1000 * 60 * 60 * 24),
        );

        enqueueEvent(
          buildEvent("return_visit", "page_revisit", {
            page,
            visit_count: prevVisits.length + 1,
            days_since_last_visit: daysSinceLastVisit,
            ms_since_last_visit: now - lastVisit.ts,
            first_visit_page:
              history.length > 0 ? history[0].page : page,
            sticky_page: prevVisits.length >= 2, // visited 3+ times = "sticky"
          }),
        );
      }

      // Record this visit (keep last 50 entries)
      history.push({ page, ts: now });
      const trimmed = history.slice(-50);
      localStorage.setItem(RETURN_VISIT_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage unavailable — skip silently
    }
  }, [buildEvent]);

  // --- 10. Cross-page element interaction correlation ---
  useEffect(() => {
    const INTERACTION_KEY = "wolfpack_interaction_chain";

    function recordInteraction(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const clickable = target.closest("a, button, [data-track]");
      if (!clickable) return;

      try {
        const raw = sessionStorage.getItem(INTERACTION_KEY);
        const chain: {
          page: string;
          element: string;
          text: string;
          ts: number;
        }[] = raw ? JSON.parse(raw) : [];

        const entry = {
          page: window.location.pathname,
          element:
            clickable.getAttribute("data-track") ||
            clickable.tagName.toLowerCase(),
          text: (clickable.textContent ?? "").trim().slice(0, 60),
          ts: Date.now(),
        };

        chain.push(entry);

        // When chain has 5+ interactions across 2+ pages, emit correlation event
        const uniquePages = new Set(chain.map((c) => c.page));
        if (chain.length >= 5 && uniquePages.size >= 2) {
          enqueueEvent(
            buildEvent(
              "cross_page_correlation",
              "interaction_chain",
              {
                chain_length: chain.length,
                unique_pages: uniquePages.size,
                pages: [...uniquePages],
                interactions: chain.slice(-10).map((c) => ({
                  page: c.page,
                  element: c.element,
                  text: c.text,
                })),
                first_page: chain[0].page,
                current_page: window.location.pathname,
                journey_duration_ms:
                  Date.now() - chain[0].ts,
              },
            ),
          );
        }

        // Keep last 30 interactions
        const trimmed = chain.slice(-30);
        sessionStorage.setItem(
          INTERACTION_KEY,
          JSON.stringify(trimmed),
        );
      } catch {
        // sessionStorage unavailable — skip
      }
    }

    document.addEventListener("click", recordInteraction, {
      passive: true,
    });
    return () =>
      document.removeEventListener("click", recordInteraction);
  }, [buildEvent]);

  // ================================================================
  // TIER 2 — INDUSTRY-CHANGING SIGNALS (no competitor captures these)
  // ================================================================

  // --- 11. Rage clicks (3+ rapid clicks on same element within 1s) ---
  useEffect(() => {
    const clickLog: { target: string; time: number }[] = [];

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const cls = typeof target.className === "string" ? target.className : "";
      const id = target.getAttribute("data-track") || target.id || cls.slice(0, 40) || target.tagName;
      const now = Date.now();
      clickLog.push({ target: id, time: now });

      // Keep only last 1s of clicks
      while (clickLog.length > 0 && now - clickLog[0].time > 1000) clickLog.shift();

      const sameTarget = clickLog.filter((c) => c.target === id);
      if (sameTarget.length >= 3) {
        enqueueEvent(buildEvent("rage_click", "rage_click_detected", {
          element: id,
          element_tag: target.tagName.toLowerCase(),
          element_text: (target.textContent ?? "").trim().slice(0, 80),
          click_count: sameTarget.length,
          window_ms: now - sameTarget[0].time,
        }));
        clickLog.length = 0; // reset to avoid duplicate fires
      }
    }

    document.addEventListener("click", handleClick, { passive: true });
    return () => document.removeEventListener("click", handleClick);
  }, [buildEvent]);

  // --- 12. Dead clicks (clicks on non-interactive elements) ---
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const interactive = target.closest("a, button, input, select, textarea, [role='button'], [tabindex], label, [data-track], [onclick]");
      if (!interactive && target.tagName !== "HTML" && target.tagName !== "BODY") {
        enqueueEvent(buildEvent("dead_click", "non_interactive_click", {
          element_tag: target.tagName.toLowerCase(),
          element_text: (target.textContent ?? "").trim().slice(0, 100),
          element_class: (typeof target.className === "string" ? target.className : "").slice(0, 80),
          x: e.clientX,
          y: e.clientY,
          page: window.location.pathname,
        }));
      }
    }

    document.addEventListener("click", handleClick, { passive: true });
    return () => document.removeEventListener("click", handleClick);
  }, [buildEvent]);

  // --- 13. Form abandonment with field-level attribution ---
  useEffect(() => {
    let lastFocusedField: string | null = null;
    let formStarted = false;

    function handleFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
        lastFocusedField = t.name || t.id || t.tagName.toLowerCase();
        formStarted = true;
      }
    }

    function handleBeforeUnload() {
      if (formStarted && lastFocusedField) {
        enqueueEvent(buildEvent("form_abandonment", "form_abandoned", {
          last_field: lastFocusedField,
          page: window.location.pathname,
        }));
      }
    }

    function handleSubmit() { formStarted = false; }

    document.addEventListener("focusin", handleFocusIn, { passive: true });
    document.addEventListener("submit", handleSubmit, { passive: true });
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [buildEvent]);

  // --- 14. Exit intent detection ---
  useEffect(() => {
    let fired = false;

    function handleMouseLeave(e: MouseEvent) {
      if (fired) return;
      // Mouse left viewport toward top (back/close button area)
      if (e.clientY <= 5 && e.movementY < -5) {
        fired = true;
        enqueueEvent(buildEvent("exit_intent", "exit_intent_detected", {
          page: window.location.pathname,
          time_on_page_ms: Date.now() - pageEnteredAt.current,
          exit_x: e.clientX,
        }));
        // Reset after 10s so it can fire again if they stay
        setTimeout(() => { fired = false; }, 10000);
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [buildEvent]);

  // --- 15. Navigation hesitation (hover 500ms+ on nav link without click) ---
  useEffect(() => {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let hoveredLink: string | null = null;

    function handleMouseEnter(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("header a");
      if (!target) return;
      const href = (target as HTMLAnchorElement).href;
      hoveredLink = href;
      hoverTimer = setTimeout(() => {
        enqueueEvent(buildEvent("nav_hesitation", "nav_hover_no_click", {
          href,
          link_text: (target.textContent ?? "").trim(),
          hover_duration_ms: 500,
        }));
      }, 500);
    }

    function handleMouseLeave(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("header a");
      if (target && hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    }

    function handleClick() {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    }

    const header = document.querySelector("header");
    if (header) {
      header.addEventListener("mouseover", handleMouseEnter, { passive: true });
      header.addEventListener("mouseout", handleMouseLeave, { passive: true });
      header.addEventListener("click", handleClick, { passive: true });
    }
    return () => {
      if (header) {
        header.removeEventListener("mouseover", handleMouseEnter);
        header.removeEventListener("mouseout", handleMouseLeave);
        header.removeEventListener("click", handleClick);
      }
    };
  }, [buildEvent]);

  // --- 16. Price anchor trajectory ---
  useEffect(() => {
    const PRICE_KEY = "wolfpack_price_trajectory";
    // Detect prices on vehicle pages
    const priceEl = document.querySelector("[data-track-price], .text-2xl, .text-3xl");
    if (!priceEl) return;

    const priceText = priceEl.textContent ?? "";
    const priceMatch = priceText.match(/\$?([\d,]+)/);
    if (!priceMatch) return;

    const price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (price < 1000) return;

    try {
      const raw = sessionStorage.getItem(PRICE_KEY);
      const trajectory: number[] = raw ? JSON.parse(raw) : [];
      trajectory.push(price);

      if (trajectory.length >= 2) {
        const first = trajectory[0];
        const last = trajectory[trajectory.length - 1];
        const direction = last > first ? "anchoring_up" : last < first ? "anchoring_down" : "stable";
        const avgPrice = Math.round(trajectory.reduce((a, b) => a + b, 0) / trajectory.length);

        enqueueEvent(buildEvent("price_trajectory", "price_viewed", {
          price,
          trajectory_length: trajectory.length,
          direction,
          avg_price: avgPrice,
          min_price: Math.min(...trajectory),
          max_price: Math.max(...trajectory),
          price_range: Math.max(...trajectory) - Math.min(...trajectory),
        }));
      }

      sessionStorage.setItem(PRICE_KEY, JSON.stringify(trajectory.slice(-20)));
    } catch { /* sessionStorage unavailable */ }
  }, [buildEvent]);

  // --- 17. Calculator input analysis ---
  useEffect(() => {
    function handleChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!target || !target.form) return;

      const formAction = target.form.action || target.form.id || "";
      const isCalculator = formAction.includes("calc") || formAction.includes("financ") ||
        target.form.querySelector("[data-track*='calc']") !== null ||
        target.name?.match(/price|payment|down|term|rate|trade/i);

      if (!isCalculator) return;

      enqueueEvent(buildEvent("calculator_input", "calc_value_entered", {
        field_name: target.name || target.id || "unknown",
        value_type: target.type,
        // Store ranges not exact values for privacy
        value_range: categorizeValue(target.value),
      }));

      // Feed calculator usage into journey stitcher
      try {
        const calcEvents = journeyRecordCalculatorUsed();
        for (const evt of calcEvents) {
          enqueueEvent(buildEvent(evt.type.split(".")[0], evt.type, evt.data));
        }
      } catch { /* journey analytics must never break */ }
    }

    document.addEventListener("change", handleChange, { passive: true });
    return () => document.removeEventListener("change", handleChange);
  }, [buildEvent]);

  // --- 18. Viewport attention mapping (IntersectionObserver) ---
  useEffect(() => {
    const sectionTimes = new Map<string, number>();
    const sectionVisible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).getAttribute("aria-labelledby") ||
            (entry.target as HTMLElement).id ||
            entry.target.tagName + "_" + Array.from(entry.target.parentElement?.children ?? []).indexOf(entry.target);

          if (entry.isIntersecting) {
            sectionVisible.set(id, now);
          } else {
            const startTime = sectionVisible.get(id);
            if (startTime) {
              const duration = now - startTime;
              sectionTimes.set(id, (sectionTimes.get(id) ?? 0) + duration);
              sectionVisible.delete(id);

              if (duration > 2000) {
                enqueueEvent(buildEvent("viewport_attention", "section_viewed", {
                  section_id: id,
                  visible_duration_ms: duration,
                  total_duration_ms: sectionTimes.get(id),
                }));
              }
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    // Observe all section elements
    const sections = document.querySelectorAll("section, article, [role='region']");
    sections.forEach((s) => observer.observe(s));

    return () => observer.disconnect();
  }, [buildEvent]);

  // --- 19. Touch gesture analysis (mobile) ---
  useEffect(() => {
    if (!("ontouchstart" in window)) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let initialDistance = 0;

    function getDistance(t1: Touch, t2: Touch): number {
      return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }

    function handleTouchStart(e: TouchEvent) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      if (e.touches.length === 2) {
        initialDistance = getDistance(e.touches[0], e.touches[1]);
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      const duration = Date.now() - touchStartTime;

      // Long press detection (500ms+)
      if (duration > 500 && e.changedTouches.length === 1) {
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dx < 10 && dy < 10) {
          const target = document.elementFromPoint(touchStartX, touchStartY);
          enqueueEvent(buildEvent("touch_gesture", "long_press", {
            duration_ms: duration,
            element_tag: target?.tagName.toLowerCase() ?? "unknown",
            element_text: (target?.textContent ?? "").trim().slice(0, 60),
          }));
        }
      }

      // Swipe detection
      if (e.changedTouches.length === 1 && duration < 500) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx > 60 && absDx > absDy * 1.5) {
          enqueueEvent(buildEvent("touch_gesture", "swipe", {
            direction: dx > 0 ? "right" : "left",
            distance_px: Math.round(absDx),
            velocity: Math.round(absDx / duration * 1000),
          }));
        }
      }
    }

    // Pinch-zoom detection
    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && initialDistance > 0) {
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialDistance;

        if (Math.abs(scale - 1) > 0.3) {
          enqueueEvent(buildEvent("touch_gesture", "pinch_zoom", {
            scale: Math.round(scale * 100) / 100,
            direction: scale > 1 ? "zoom_in" : "zoom_out",
            page: window.location.pathname,
          }));
          initialDistance = currentDistance; // prevent rapid re-fires
        }
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [buildEvent]);

  // --- 20. Session momentum scoring ---
  useEffect(() => {
    const EVENT_WINDOW_MS = 10000; // 10s windows
    const eventTimestamps: number[] = [];

    function recordEvent() {
      const now = Date.now();
      eventTimestamps.push(now);

      // Trim to last 60s
      while (eventTimestamps.length > 0 && now - eventTimestamps[0] > 60000) {
        eventTimestamps.shift();
      }

      // Need at least 2 windows of data
      if (eventTimestamps.length < 5) return;

      // Split into first half and second half
      const mid = Math.floor(eventTimestamps.length / 2);
      const firstHalf = eventTimestamps.slice(0, mid);
      const secondHalf = eventTimestamps.slice(mid);

      const firstRate = firstHalf.length / ((firstHalf[firstHalf.length - 1] - firstHalf[0]) / 1000 || 1);
      const secondRate = secondHalf.length / ((secondHalf[secondHalf.length - 1] - secondHalf[0]) / 1000 || 1);

      // Only emit when momentum shifts significantly
      if (eventTimestamps.length % 10 === 0) {
        const momentum = secondRate > firstRate * 1.3 ? "accelerating" : secondRate < firstRate * 0.7 ? "decelerating" : "steady";
        enqueueEvent(buildEvent("session_momentum", "momentum_update", {
          momentum,
          first_half_rate: Math.round(firstRate * 100) / 100,
          second_half_rate: Math.round(secondRate * 100) / 100,
          total_events_60s: eventTimestamps.length,
        }));
      }
    }

    document.addEventListener("click", recordEvent, { passive: true });
    document.addEventListener("scroll", recordEvent, { passive: true });
    return () => {
      document.removeEventListener("click", recordEvent);
      document.removeEventListener("scroll", recordEvent);
    };
  }, [buildEvent]);

  // --- 21. Referrer behavior correlation ---
  useEffect(() => {
    const referrer = document.referrer;
    if (!referrer) return;

    // Classify referrer source.
    //
    // Use registrable-domain matching, not substring `.includes()`, so an
    // attacker-controlled referrer like `evil-google.com` cannot spoof
    // "google_organic". CodeQL js/incomplete-url-substring-sanitization.
    const matchesDomain = (host: string, domains: string[]): boolean =>
      domains.some((d) => host === d || host.endsWith("." + d));

    let source = "direct";
    try {
      const url = new URL(referrer);
      const host = url.hostname.toLowerCase();
      if (matchesDomain(host, ["google.com", "google.co.uk", "google.ca"])) source = "google_organic";
      else if (matchesDomain(host, ["facebook.com", "fb.com", "fb.me"])) source = "facebook";
      else if (matchesDomain(host, ["instagram.com"])) source = "instagram";
      else if (matchesDomain(host, ["tiktok.com"])) source = "tiktok";
      else if (matchesDomain(host, ["youtube.com", "youtu.be"])) source = "youtube";
      else if (matchesDomain(host, ["bing.com"])) source = "bing";
      else if (matchesDomain(host, ["twitter.com", "x.com"])) source = "twitter";
      else source = host;
    } catch { /* invalid URL */ }

    // Capture UTM params
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const val = params.get(key);
      if (val) utm[key] = val;
    }

    enqueueEvent(buildEvent("referrer_correlation", "session_source", {
      referrer_source: source,
      referrer_full: referrer.slice(0, 200),
      landing_page: window.location.pathname,
      ...utm,
    }));
  }, [buildEvent]);

  // --- 22. Error recovery patterns ---
  useEffect(() => {
    let lastError: { time: number; type: string } | null = null;

    // Track validation errors
    function handleInvalid(e: Event) {
      const target = e.target as HTMLInputElement;
      lastError = { time: Date.now(), type: "validation" };
      enqueueEvent(buildEvent("error_event", "validation_error", {
        field_name: target.name || target.id || "unknown",
        field_type: target.type,
        page: window.location.pathname,
      }));
    }

    // Track recovery: next interaction after an error
    function handleRecoveryClick() {
      if (!lastError) return;
      const recoveryTime = Date.now() - lastError.time;
      if (recoveryTime > 60000) { lastError = null; return; } // stale

      enqueueEvent(buildEvent("error_recovery", "recovery_action", {
        error_type: lastError.type,
        recovery_time_ms: recoveryTime,
        recovery_action: "click",
        recovered: recoveryTime < 10000, // quick recovery = user retried
      }));
      lastError = null;
    }

    document.addEventListener("invalid", handleInvalid, { capture: true });
    document.addEventListener("click", handleRecoveryClick, { passive: true });
    return () => {
      document.removeEventListener("invalid", handleInvalid, { capture: true });
      document.removeEventListener("click", handleRecoveryClick);
    };
  }, [buildEvent]);

  // --- 23. Social proof dwell time ---
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const key = `_proofStart_${el.dataset.proofId || "unknown"}`;

          if (entry.isIntersecting) {
            (el as unknown as Record<string, number>)[key] = Date.now();
          } else {
            const start = (el as unknown as Record<string, number>)[key];
            if (start) {
              const dwell = Date.now() - start;
              if (dwell > 1000) {
                enqueueEvent(buildEvent("social_proof_dwell", "proof_viewed", {
                  proof_type: el.dataset.proofType || "testimonial",
                  proof_id: el.dataset.proofId || el.textContent?.trim().slice(0, 40),
                  dwell_ms: dwell,
                  read_fully: dwell > 5000,
                }));
              }
            }
          }
        }
      },
      { threshold: 0.6 },
    );

    // Observe testimonials, reviews, star ratings
    const proofElements = document.querySelectorAll(
      "[data-proof], [class*='testimonial'], [class*='review'], [class*='rating'], blockquote",
    );
    proofElements.forEach((el, i) => {
      (el as HTMLElement).dataset.proofId = (el as HTMLElement).dataset.proofId || `proof_${i}`;
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [buildEvent]);

  // ================================================================
  // TIER 3 — DATA MOAT SIGNALS (compositions that require full-stack)
  // ================================================================

  // --- 24. Page performance (Navigation Timing API) ---
  useEffect(() => {
    // Wait for page to fully load before measuring
    function measurePerformance() {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return;

      const loadTime = nav.loadEventEnd - nav.startTime;
      const ttfb = nav.responseStart - nav.requestStart;
      const domInteractive = nav.domInteractive - nav.startTime;
      const domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;

      // Only emit if we have valid timing (loadEventEnd > 0 means page finished loading)
      if (nav.loadEventEnd <= 0) return;

      enqueueEvent(buildEvent("page_performance", "timing_measured", {
        load_time_ms: Math.round(loadTime),
        ttfb_ms: Math.round(ttfb),
        dom_interactive_ms: Math.round(domInteractive),
        dom_content_loaded_ms: Math.round(domContentLoaded),
        transfer_size_kb: Math.round((nav.transferSize ?? 0) / 1024),
        page: window.location.pathname,
        connection_type: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? "unknown",
      }));

      // Also track Largest Contentful Paint if available
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            enqueueEvent(buildEvent("page_performance", "lcp_measured", {
              lcp_ms: Math.round(lastEntry.startTime),
              element: (lastEntry as unknown as { element?: Element }).element?.tagName.toLowerCase() ?? "unknown",
              page: window.location.pathname,
            }));
          }
          lcpObserver.disconnect();
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      } catch { /* PerformanceObserver not available */ }

      // Track First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entry = list.getEntries()[0] as PerformanceEventTiming | undefined;
          if (entry) {
            enqueueEvent(buildEvent("page_performance", "fid_measured", {
              fid_ms: Math.round(entry.processingStart - entry.startTime),
              event_type: entry.name,
              page: window.location.pathname,
            }));
          }
          fidObserver.disconnect();
        });
        fidObserver.observe({ type: "first-input", buffered: true });
      } catch { /* PerformanceObserver not available */ }
    }

    // Measure after load completes
    if (document.readyState === "complete") {
      setTimeout(measurePerformance, 100);
    } else {
      window.addEventListener("load", () => setTimeout(measurePerformance, 100), { once: true });
    }
  }, [buildEvent]);

  // --- 25. CTA visibility tracking (which CTAs are actually seen) ---
  useEffect(() => {
    const ctaTimers = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ctaTimers.set(entry.target, now);
          } else {
            const startTime = ctaTimers.get(entry.target);
            if (startTime) {
              const visibleDuration = now - startTime;
              const el = entry.target as HTMLElement;
              const rect = el.getBoundingClientRect();
              const docHeight = document.documentElement.scrollHeight;
              const ctaPositionPct = Math.round(((rect.top + window.scrollY) / docHeight) * 100);

              enqueueEvent(buildEvent("cta_visibility", "cta_seen", {
                cta_text: (el.textContent ?? "").trim().slice(0, 80),
                cta_tag: el.tagName.toLowerCase(),
                cta_href: (el as HTMLAnchorElement).href || el.getAttribute("data-track") || "none",
                visible_duration_ms: visibleDuration,
                position_pct: ctaPositionPct,
                page: window.location.pathname,
                was_clicked: false, // updated by click handler
              }));
              ctaTimers.delete(entry.target);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    // Observe all CTA elements
    const ctas = document.querySelectorAll(
      'a[href*="contact"], a[href*="schedule"], a[href*="financing"], ' +
      'button[type="submit"], [data-track*="cta"], [data-track*="convert"], ' +
      '[class*="cta"], a[href^="tel:"], a[href^="mailto:"]',
    );
    ctas.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [buildEvent]);

  // --- 26. Cross-session buyer lifecycle data collection ---
  useEffect(() => {
    const LIFECYCLE_KEY = "wolfpack_buyer_lifecycle";
    try {
      const now = Date.now();
      const page = window.location.pathname;
      const raw = localStorage.getItem(LIFECYCLE_KEY);
      const lifecycle: {
        visits: { ts: number; pages: string[]; vehicles: string[]; searched: string[]; converted: boolean; duration_ms: number }[];
        first_seen: number;
      } = raw ? JSON.parse(raw) : { visits: [], first_seen: now };

      // Record current visit start — we'll update on unload
      const currentVisit = {
        ts: now,
        pages: [page],
        vehicles: [] as string[],
        searched: [] as string[],
        converted: false,
        duration_ms: 0,
      };

      // Push this visit
      lifecycle.visits.push(currentVisit);

      // Emit lifecycle event for the brain
      const visitCount = lifecycle.visits.length;
      const daysSinceFirst = Math.round((now - lifecycle.first_seen) / (1000 * 60 * 60 * 24));

      // Analyze vehicle narrowing across visits
      const allVehicles = lifecycle.visits.flatMap((v) => v.vehicles);
      const vehicleMakes = allVehicles.map((v) => v.split("|")[0]).filter(Boolean);
      const uniqueMakes = new Set(vehicleMakes);
      const recentMakes = new Set(vehicleMakes.slice(-5));

      // Analyze price trajectory across visits
      const allSearches = lifecycle.visits.flatMap((v) => v.searched);

      enqueueEvent(buildEvent("buyer_lifecycle", "lifecycle_snapshot", {
        visit_count: visitCount,
        days_since_first_visit: daysSinceFirst,
        total_vehicles_viewed: allVehicles.length,
        unique_makes_explored: uniqueMakes.size,
        recent_makes: [...recentMakes],
        is_narrowing: uniqueMakes.size > recentMakes.size && visitCount > 2,
        total_searches: allSearches.length,
        visit_frequency_days: visitCount > 1
          ? Math.round(daysSinceFirst / (visitCount - 1))
          : 0,
        lifecycle_stage: visitCount === 1 ? "awareness" :
          visitCount <= 3 ? "consideration" :
          visitCount <= 6 ? "evaluation" : "decision",
      }));

      // Save — keep last 30 visits
      lifecycle.visits = lifecycle.visits.slice(-30);
      localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(lifecycle));

      // Update current visit on unload
      function updateOnUnload() {
        const current = lifecycle.visits[lifecycle.visits.length - 1];
        if (current) {
          current.duration_ms = Date.now() - now;
          localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(lifecycle));
        }
      }
      window.addEventListener("beforeunload", updateOnUnload);
      return () => window.removeEventListener("beforeunload", updateOnUnload);
    } catch { /* localStorage unavailable */ }
  }, [buildEvent]);

  // --- 27. Network quality detection ---
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    } }).connection;
    if (!conn) return;

    enqueueEvent(buildEvent("network_quality", "connection_detected", {
      effective_type: conn.effectiveType ?? "unknown",
      downlink_mbps: conn.downlink ?? 0,
      rtt_ms: conn.rtt ?? 0,
      save_data: conn.saveData ?? false,
      page: window.location.pathname,
    }));

    function handleChange() {
      enqueueEvent(buildEvent("network_quality", "connection_changed", {
        effective_type: conn!.effectiveType ?? "unknown",
        downlink_mbps: conn!.downlink ?? 0,
        rtt_ms: conn!.rtt ?? 0,
        save_data: conn!.saveData ?? false,
      }));
    }

    (conn as unknown as EventTarget).addEventListener?.("change", handleChange);
    return () => (conn as unknown as EventTarget).removeEventListener?.("change", handleChange);
  }, [buildEvent]);


  // --- 28. Price range dwell tracking (IntersectionObserver on vehicle cards) ---
  useEffect(() => {
    const cards = document.querySelectorAll("[data-price]");
    if (cards.length === 0) return;

    type BracketKey = "0_15K" | "15K_25K" | "25K_35K" | "35K_50K" | "50K_plus";

    function priceToBracket(price: number): BracketKey {
      if (price < 15000) return "0_15K";
      if (price < 25000) return "15K_25K";
      if (price < 35000) return "25K_35K";
      if (price < 50000) return "35K_50K";
      return "50K_plus";
    }

    const bracketDwell = new Map<BracketKey, number>();
    const bracketVehicles = new Map<BracketKey, Set<string>>();
    const visibleSince = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const priceVal = parseInt(el.getAttribute("data-price") ?? "0", 10);
          if (priceVal <= 0) continue;
          const bracket = priceToBracket(priceVal);

          if (entry.isIntersecting) {
            visibleSince.set(entry.target, now);
          } else {
            const startTime = visibleSince.get(entry.target);
            if (startTime) {
              const duration = now - startTime;
              bracketDwell.set(bracket, (bracketDwell.get(bracket) ?? 0) + duration);
              const vin = el.getAttribute("data-vin") ?? el.getAttribute("href")?.split("/").pop() ?? "unknown";
              if (!bracketVehicles.has(bracket)) bracketVehicles.set(bracket, new Set());
              bracketVehicles.get(bracket)!.add(vin);
              visibleSince.delete(entry.target);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    cards.forEach((card) => observer.observe(card));

    function emitDwellSummary() {
      const now = Date.now();
      for (const [el, startTime] of visibleSince.entries()) {
        const htmlEl = el as HTMLElement;
        const priceVal = parseInt(htmlEl.getAttribute("data-price") ?? "0", 10);
        if (priceVal <= 0) continue;
        const bracket = priceToBracket(priceVal);
        bracketDwell.set(bracket, (bracketDwell.get(bracket) ?? 0) + (now - startTime));
        const vin = htmlEl.getAttribute("data-vin") ?? htmlEl.getAttribute("href")?.split("/").pop() ?? "unknown";
        if (!bracketVehicles.has(bracket)) bracketVehicles.set(bracket, new Set());
        bracketVehicles.get(bracket)!.add(vin);
      }

      for (const [bracket, ms] of bracketDwell.entries()) {
        if (ms < 500) continue;
        const vehicles = bracketVehicles.get(bracket);
        enqueueEvent(
          buildEvent("price_range_dwell", "bracket_dwell_summary", {
            bracket,
            seconds: Math.round(ms / 100) / 10,
            vehicles_viewed: vehicles?.size ?? 0,
            page: window.location.pathname,
          }),
        );
      }
    }

    window.addEventListener("beforeunload", emitDwellSummary);
    const handleVisDwell = () => { if (document.hidden) emitDwellSummary(); };
    document.addEventListener("visibilitychange", handleVisDwell);

    return () => {
      observer.disconnect();
      window.removeEventListener("beforeunload", emitDwellSummary);
      document.removeEventListener("visibilitychange", handleVisDwell);
    };
  }, [buildEvent]);
  // ================================================================
  // TIER 4 — SEARCH INTENT + SCROLL BEHAVIOR SIGNALS
  // ================================================================

  // --- 29. Search intent classification on page load ---
  useEffect(() => {
    import("@/lib/search-intent-classifier").then(({ classifySearchIntent }) => {
      try {
        const intent = classifySearchIntent();
        enqueueEvent(
          buildEvent("search_intent", "search_intent.classified", {
            source: intent.source,
            medium: intent.medium,
            campaign: intent.campaign,
            content: intent.content,
            term: intent.term,
            intent_category: intent.intent_category,
            landing_page: intent.landing_page,
            ...(intent.raw_query ? { raw_query: intent.raw_query } : {}),
          }),
        );
      } catch {
        /* search intent classification failed — skip silently */
      }
    }).catch(() => { /* module load failed — skip silently */ });
  }, [buildEvent]);

  // --- 30. Scroll velocity & hesitation tracker (section-level) ---
  useEffect(() => {
    // VDP section boundaries (identified by data attributes or selectors)
    const VDP_SECTIONS = [
      { id: "hero", selector: "[data-section='hero'], .hero, section:first-of-type" },
      { id: "photos", selector: "[data-section='photos'], .photos, .gallery, .carousel" },
      { id: "details", selector: "[data-section='details'], .details, .vehicle-details, .specifications" },
      { id: "pricing", selector: "[data-section='pricing'], .pricing, [data-track-price]" },
      { id: "payment_calculator", selector: "[data-section='payment_calculator'], .calculator, [data-track*='calc']" },
      { id: "vehicle_history", selector: "[data-section='vehicle_history'], .vehicle-history, .carfax" },
      { id: "similar_vehicles", selector: "[data-section='similar_vehicles'], .similar-vehicles, .recommendations" },
    ];

    // State tracking
    let lastScrollY = window.scrollY;
    let lastScrollTime = Date.now();
    const sectionVelocities = new Map<string, number[]>();
    const hesitationTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const sectionLastSeen = new Map<string, number>(); // highest scroll position where section was passed
    const sectionRevisitCount = new Map<string, number>();

    const HESITATION_MS = 1500; // 1.5s pause = reading/hesitating
    const FAST_SCROLL_THRESHOLD = 2000; // px/s = skipping content
    const SAMPLE_INTERVAL_MS = 150;

    /** Identify which section the user is currently viewing. */
    function getCurrentSection(): string | null {
      const viewportMid = window.scrollY + window.innerHeight / 2;

      for (const sec of VDP_SECTIONS) {
        const el = document.querySelector(sec.selector);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const bottom = top + rect.height;
        if (viewportMid >= top && viewportMid <= bottom) {
          return sec.id;
        }
      }

      // Fallback: classify by scroll position percentage
      const docHeight = document.documentElement.scrollHeight;
      const pct = (window.scrollY / docHeight) * 100;
      if (pct < 15) return "hero";
      if (pct < 35) return "photos";
      if (pct < 55) return "details";
      if (pct < 70) return "pricing";
      if (pct < 85) return "payment_calculator";
      return "similar_vehicles";
    }

    /** Classify velocity into a human-readable bucket. */
    function classifyVelocity(pxPerSec: number): "slow" | "medium" | "fast" | "skip" {
      if (pxPerSec < 200) return "slow";
      if (pxPerSec < 800) return "medium";
      if (pxPerSec < FAST_SCROLL_THRESHOLD) return "fast";
      return "skip";
    }

    function handleScroll() {
      if (!hasFullConsent()) return;
      const now = Date.now();
      const dt = now - lastScrollTime;
      if (dt < SAMPLE_INTERVAL_MS) return;

      const dy = window.scrollY - lastScrollY;
      const absDy = Math.abs(dy);
      const velocityPxPerSec = (absDy / dt) * 1000;
      const section = getCurrentSection();

      if (section) {
        // --- Track velocity per section ---
        if (!sectionVelocities.has(section)) sectionVelocities.set(section, []);
        sectionVelocities.get(section)!.push(velocityPxPerSec);

        // --- Hesitation detection: scroll stopped ---
        if (hesitationTimers.has(section)) {
          clearTimeout(hesitationTimers.get(section)!);
        }
        const hesitationStart = now;
        hesitationTimers.set(
          section,
          setTimeout(() => {
            // Scroll didn't move for HESITATION_MS — user is reading
            const hDuration = Date.now() - hesitationStart;
            enqueueEvent(
              buildEvent("scroll_behavior", "scroll.hesitation", {
                section,
                duration_ms: hDuration,
                scroll_y: window.scrollY,
                page: window.location.pathname,
              }),
            );
          }, HESITATION_MS),
        );

        // --- Fast scroll-past detection ---
        if (velocityPxPerSec > FAST_SCROLL_THRESHOLD && dy > 0) {
          enqueueEvent(
            buildEvent("scroll_behavior", "scroll.fast_skip", {
              section,
              velocity_px_per_sec: Math.round(velocityPxPerSec),
              page: window.location.pathname,
            }),
          );
        }

        // --- Scroll-back (revisit) detection ---
        if (dy < -50) {
          // Scrolling upward — check if returning to a previously passed section
          const prevHighest = sectionLastSeen.get(section) ?? 0;
          if (prevHighest > 0 && window.scrollY < prevHighest) {
            const count = (sectionRevisitCount.get(section) ?? 0) + 1;
            sectionRevisitCount.set(section, count);

            enqueueEvent(
              buildEvent("scroll_behavior", "scroll.revisit", {
                section,
                revisit_count: count,
                page: window.location.pathname,
              }),
            );
          }
        }

        // Track the furthest scroll position per section
        if (dy > 0) {
          const prev = sectionLastSeen.get(section) ?? 0;
          if (window.scrollY > prev) {
            sectionLastSeen.set(section, window.scrollY);
          }
        }
      }

      lastScrollY = window.scrollY;
      lastScrollTime = now;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Emit velocity profile summary on page exit
    function emitVelocityProfile() {
      if (sectionVelocities.size === 0) return;

      const profile: Record<string, string> = {};
      const sectionDetails: Record<string, { avg: number; samples: number }> = {};
      let slowestSection = "";
      let slowestAvg = Infinity;

      for (const [section, velocities] of sectionVelocities.entries()) {
        if (velocities.length === 0) continue;
        const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
        profile[section] = classifyVelocity(avg);
        sectionDetails[section] = { avg: Math.round(avg), samples: velocities.length };

        if (avg < slowestAvg) {
          slowestAvg = avg;
          slowestSection = section;
        }
      }

      // Infer buyer type from where they spent the most time (slowest scroll)
      let buyer_type = "general";
      if (slowestSection === "pricing" || slowestSection === "payment_calculator") {
        buyer_type = "price_buyer";
      } else if (slowestSection === "vehicle_history") {
        buyer_type = "trust_buyer";
      } else if (slowestSection === "photos") {
        buyer_type = "visual_buyer";
      } else if (slowestSection === "details") {
        buyer_type = "research_buyer";
      }

      enqueueEvent(
        buildEvent("scroll_behavior", "scroll.velocity_profile", {
          profile: JSON.stringify(profile),
          section_details: JSON.stringify(sectionDetails),
          buyer_type,
          slowest_section: slowestSection,
          total_revisits: Array.from(sectionRevisitCount.values()).reduce((a, b) => a + b, 0),
          page: window.location.pathname,
        }),
      );
    }

    window.addEventListener("beforeunload", emitVelocityProfile);
    const handleVisChange = () => {
      if (document.hidden) emitVelocityProfile();
    };
    document.addEventListener("visibilitychange", handleVisChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", emitVelocityProfile);
      document.removeEventListener("visibilitychange", handleVisChange);
      for (const timer of hesitationTimers.values()) clearTimeout(timer);
    };
  }, [buildEvent]);

  // ================================================================
  // ANONYMOUS HEATMAP — cookieless, aggregate-only, no identity/PII
  // ================================================================
  //
  // This layer fires on ALL pages (public + admin) without consent because
  // it carries zero identity: session_id and user_fingerprint are the
  // literal string "anon", metadata contains only normalized page-relative
  // coordinates (0..1) and viewport width — no element text, no href, no
  // real session/fingerprint, no cookie reads.
  //
  // Legal basis: legitimate-interest essential analytics (same posture as
  // cookieless Plausible / Fathom). The events bypass the consent gate via
  // ESSENTIAL_EVENT_TYPES so DO NOT add any identity to this handler.
  //
  // Move throttle: at most 1 sample per 2 000 ms (mirrors EMIT_INTERVAL_MS
  // of the consent-gated cursor_heatmap above). Skipped on touch devices
  // to avoid flooding from scroll-triggered mousemove emulation.
  // Heavy throttle is intentional: see the FLUSH_INTERVAL_MS comment about
  // the 2026-05-19 Neon data-transfer quota incident.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const ANON_MOVE_INTERVAL_MS = 2000;
    let lastMoveEmit = 0;

    /** Build a minimal anonymous event directly — intentionally does NOT
     *  call buildEvent() because buildEvent() injects the real session_id
     *  and user_fingerprint from refs. Constructing the object here
     *  ensures those fields are always "anon" regardless of future
     *  refactors to buildEvent. */
    function anonEvent(
      event_type: "heatmap_click" | "heatmap_move",
      action: "click" | "move",
      pageX: number,
      pageY: number,
    ): AnalyticsEvent {
      const scrollW = document.documentElement.scrollWidth || 1;
      const scrollH = document.documentElement.scrollHeight || 1;
      const xp = Math.min(1, Math.max(0, pageX / scrollW));
      const yp = Math.min(1, Math.max(0, pageY / scrollH));
      return {
        event_type,
        action,
        page: window.location.pathname,
        session_id: "anon",
        user_fingerprint: "anon",
        timestamp: new Date().toISOString(),
        // metadata: ONLY normalized coords + viewport width.
        // NEVER add text, href, tagName, id, or any identifier.
        metadata: { xp, yp, vw: window.innerWidth, src: "anon_heatmap" },
      };
    }

    function handleAnonClick(e: MouseEvent) {
      try {
        enqueueEvent(anonEvent("heatmap_click", "click", e.pageX, e.pageY));
      } catch {
        // analytics must never crash the app
      }
    }

    function handleAnonMove(e: MouseEvent) {
      try {
        const now = Date.now();
        if (now - lastMoveEmit < ANON_MOVE_INTERVAL_MS) return;
        lastMoveEmit = now;
        enqueueEvent(anonEvent("heatmap_move", "move", e.pageX, e.pageY));
      } catch {
        // analytics must never crash the app
      }
    }

    document.addEventListener("click", handleAnonClick, { passive: true });

    // Touch devices skip mousemove — no meaningful cursor data on touch.
    const isTouch = "ontouchstart" in window;
    if (!isTouch) {
      document.addEventListener("mousemove", handleAnonMove, { passive: true });
    }

    return () => {
      document.removeEventListener("click", handleAnonClick);
      if (!isTouch) {
        document.removeEventListener("mousemove", handleAnonMove);
      }
    };
  }, []); // no deps — must not re-register on buildEvent identity change

  // --- Flush on page unload ---
  useEffect(() => {
    function handleUnload() {
      // Send final time_on_page
      const duration = Date.now() - pageEnteredAt.current;
      enqueueEvent(
        buildEvent("time_on_page", "page_unload", {
          duration_ms: duration,
          page: currentPage.current,
        }),
      );
      flushEvents();
    }

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [buildEvent]);

  // --- Session heartbeat (every 30s) ---
  useEffect(() => {
    const interval = setInterval(() => {
      enqueueEvent(
        buildEvent("heartbeat", "session_alive", {
          page: currentPage.current,
          session_duration_ms: Date.now() - pageEnteredAt.current,
        }),
      );
    }, 30_000);

    return () => clearInterval(interval);
  }, [buildEvent]);

  // --- Periodic flush timer ---
  useEffect(() => {
    const interval = setInterval(flushEvents, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const value: AnalyticsContextValue = {
    track,
    trackChat,
    trackVehicleView,
    trackSearch,
    trackConversion,
    trackVideo,
    trackComparison,
    trackABAssignment,
    trackABConversion,
    trackPushEvent,
    getSessionId: getSessionIdFn,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  useVideoTracking — standalone hook for video analytics             */
/* ------------------------------------------------------------------ */

/**
 * Hook that attaches play/pause/progress/complete/replay tracking to a
 * <video> element ref. Call once per video; milestones fire only once
 * per session per video.
 *
 * Usage:
 *   const videoRef = useRef<HTMLVideoElement>(null);
 *   useVideoTracking(videoRef, "walkaround-123", "2024 Ford F-150 Walkaround");
 *   return <video ref={videoRef} src="..." />;
 */
export function useVideoTracking(
  ref: RefObject<HTMLVideoElement | null>,
  videoId: string,
  title: string,
): void {
  const { trackVideo } = useAnalytics();

  useEffect(() => {
    trackVideo(ref, videoId, title);
    // Only re-attach if videoId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
}

/* ------------------------------------------------------------------ */
/*  VideoTracker — wrapper component for auto-tracking <video> children */
/* ------------------------------------------------------------------ */

/**
 * Wraps a <video> element and automatically tracks all playback events.
 *
 * Usage:
 *   <VideoTracker videoId="walk-123" title="2024 F-150 Walkaround">
 *     <video src="/videos/walkaround.mp4" controls />
 *   </VideoTracker>
 */
export function VideoTracker({
  videoId,
  title,
  children,
}: {
  videoId: string;
  title: string;
  children: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { trackVideo } = useAnalytics();

  useEffect(() => {
    // Find the <video> element inside the container
    const container = containerRef.current;
    if (!container) return;
    const videoEl = container.querySelector("video");
    if (videoEl) {
      videoRef.current = videoEl;
      trackVideo(videoRef, videoId, title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return <div ref={containerRef}>{children}</div>;
}
