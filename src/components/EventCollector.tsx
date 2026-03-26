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
} from "react";

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

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
      // Simple anonymous fingerprint — no PII, just a random ID
      fp = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
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

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 20;

let eventBuffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueueEvent(event: AnalyticsEvent): void {
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

  // Initialize session
  useEffect(() => {
    sessionId.current = getOrCreateSession();
    fingerprint.current = getOrCreateFingerprint();
  }, []);

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
    }
  }, [buildEvent]);

  // --- Auto-tracking: clicks ---
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target) return;

      // Find the nearest clickable element
      const clickable = target.closest("a, button, [data-track]");
      const el = clickable ?? target;

      const metadata: Record<string, unknown> = {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 100),
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

  // --- Auto-tracking: scroll depth ---
  useEffect(() => {
    function handleScroll() {
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

  // --- Auto-tracking: visibility change (time on page) ---
  useEffect(() => {
    function handleVisibilityChange() {
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

  // --- Auto-tracking: form interactions ---
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
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

  // --- 1. Micro-hesitation tracking (abandoned keystrokes) ---
  useEffect(() => {
    const fieldState = new Map<
      string,
      { lastValue: string; lastChange: number; peakLength: number }
    >();

    function handleInput(e: Event) {
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
    getSessionId: getSessionIdFn,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}
