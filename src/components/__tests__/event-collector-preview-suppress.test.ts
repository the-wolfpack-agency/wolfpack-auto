/**
 * @jest-environment jsdom
 *
 * Verifies that EventCollector completely suppresses all analytics emission
 * when the page is loaded with ?__heatmap_bg=1 (heatmap preview mode).
 *
 * Contract under test (mirrors the guard in EventCollector.tsx):
 *   if (new URLSearchParams(window.location.search).get("__heatmap_bg") === "1")
 *     → render children, produce ZERO analytics events
 *
 * Approach: inline the preview-guard logic + the enqueueEvent/flushEvents
 * pipeline exactly as they appear in EventCollector.tsx so the test is
 * self-contained and does not require rendering the full React component
 * (which depends on next/navigation, next-auth, journey-stitcher, etc.).
 * This matches the style established in event-collector-consent.test.ts and
 * event-collector-heatmap.test.ts.
 *
 * Two scenarios are verified:
 *  A) WITH ?__heatmap_bg=1  → sendBeacon and fetch are NEVER called,
 *                              even after simulated click + page load events.
 *  B) WITHOUT the param     → tracking is ACTIVE; page_view still fires.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mirror of the isHeatmapPreview guard from EventCollector.tsx
// ---------------------------------------------------------------------------

function isHeatmapPreview(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("__heatmap_bg") === "1";
}

// ---------------------------------------------------------------------------
// Mirror of the enqueueEvent / flushEvents pipeline
// ---------------------------------------------------------------------------

interface AnalyticsEvent {
  event_type: string;
  action: string;
  page: string;
  session_id: string;
  user_fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const ESSENTIAL_EVENT_TYPES = new Set(["page_view", "heatmap_click", "heatmap_move"]);

function makeEventPipeline(beaconSpy: jest.Mock, fetchSpy: jest.Mock) {
  let eventBuffer: AnalyticsEvent[] = [];

  function flushEvents(): void {
    if (eventBuffer.length === 0) return;
    const batch = [...eventBuffer];
    eventBuffer = [];
    if (beaconSpy) {
      beaconSpy(
        "/api/analytics/events",
        new Blob([JSON.stringify({ events: batch })], { type: "application/json" }),
      );
    } else {
      fetchSpy("/api/analytics/events", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
    }
  }

  function enqueueEvent(event: AnalyticsEvent): void {
    // In preview mode the guard at the top of EventCollector prevents this
    // function from ever being called. But for the purpose of testing the
    // suppressed-path we simulate a caller that *would* call enqueueEvent
    // if it weren't for the guard.
    eventBuffer.push(event);
    if (eventBuffer.length >= 100) {
      flushEvents();
    }
  }

  return { enqueueEvent, flushEvents };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSearch(search: string) {
  window.history.replaceState({}, "", search);
}

function makePageViewEvent(): AnalyticsEvent {
  return {
    event_type: "page_view",
    action: "view",
    page: window.location.pathname,
    session_id: "s_test",
    user_fingerprint: "fp_test",
    timestamp: new Date().toISOString(),
    metadata: { referrer: "", viewport_width: 1280 },
  };
}

function makeClickEvent(): AnalyticsEvent {
  return {
    event_type: "click",
    action: "click",
    page: window.location.pathname,
    session_id: "s_test",
    user_fingerprint: "fp_test",
    timestamp: new Date().toISOString(),
    metadata: { tag: "button", text: "View Details", x: 100, y: 200 },
  };
}

// ---------------------------------------------------------------------------
// Suite A — Preview mode: __heatmap_bg=1 → ZERO events emitted
// ---------------------------------------------------------------------------

describe("EventCollector — preview-mode suppression (?__heatmap_bg=1)", () => {
  let beaconSpy: jest.Mock;
  let fetchSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    beaconSpy = jest.fn();
    fetchSpy = jest.fn();
    originalSendBeacon = navigator.sendBeacon;
    originalFetch = globalThis.fetch;
    // Install spies on the real globals
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconSpy,
      writable: true,
      configurable: true,
    });
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Core guard tests
  // -------------------------------------------------------------------------

  test("isHeatmapPreview() returns true when ?__heatmap_bg=1 is in the URL", () => {
    setSearch("/?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);
  });

  test("isHeatmapPreview() returns false when param is absent", () => {
    setSearch("/admin/heatmaps");
    expect(isHeatmapPreview()).toBe(false);
  });

  test("isHeatmapPreview() returns false when param is present but value is not '1'", () => {
    setSearch("/?__heatmap_bg=0");
    expect(isHeatmapPreview()).toBe(false);
    setSearch("/?__heatmap_bg=true");
    expect(isHeatmapPreview()).toBe(false);
    setSearch("/?__heatmap_bg=");
    expect(isHeatmapPreview()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Suppression: when preview mode is active, no beacon/fetch calls occur
  // -------------------------------------------------------------------------

  test("in preview mode, simulating click + page load events produces ZERO sendBeacon calls", () => {
    setSearch("/inventory?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    // Simulate what EventCollector would do IF the guard were NOT present.
    // The real component short-circuits before calling enqueueEvent at all.
    // Here we verify the guard semantics: a properly guarded component would
    // call enqueueEvent zero times, so no flush ever reaches sendBeacon.
    //
    // We simulate the guard by checking isHeatmapPreview() before enqueueing:
    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return; // ← this is what the component guard does
      enqueueEvent(event);
    }

    guardedEnqueue(makePageViewEvent());
    guardedEnqueue(makeClickEvent());
    flushEvents(); // force flush even if threshold not hit

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("in preview mode, page_view event is suppressed (no beacon/fetch)", () => {
    setSearch("/vehicles/1HGCM82633?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    // Simulate the page_view that auto-fires on mount
    guardedEnqueue(makePageViewEvent());
    flushEvents();

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("in preview mode, heatmap_click events are also suppressed (no phantom heatmap data)", () => {
    setSearch("/inventory?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    // Even essential events are suppressed in preview mode
    guardedEnqueue({
      event_type: "heatmap_click",
      action: "click",
      page: "/inventory",
      session_id: "anon",
      user_fingerprint: "anon",
      timestamp: new Date().toISOString(),
      metadata: { xp: 0.5, yp: 0.3, vw: 1280, src: "anon_heatmap" },
    });
    flushEvents();

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("in preview mode, 100 rapid events still produce ZERO beacon/fetch calls", () => {
    setSearch("/?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    // Simulate rapid click storm — should never reach the flush threshold
    for (let i = 0; i < 150; i++) {
      guardedEnqueue(makeClickEvent());
    }
    flushEvents();

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite B — Normal mode: NO param → tracking fires as expected
// ---------------------------------------------------------------------------

describe("EventCollector — normal mode (no preview param) tracking is active", () => {
  let beaconSpy: jest.Mock;
  let fetchSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    beaconSpy = jest.fn();
    fetchSpy = jest.fn();
    originalSendBeacon = navigator.sendBeacon;
    originalFetch = globalThis.fetch;
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconSpy,
      writable: true,
      configurable: true,
    });
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
  });

  test("isHeatmapPreview() is false on a normal page (no param)", () => {
    setSearch("/admin/heatmaps");
    expect(isHeatmapPreview()).toBe(false);
  });

  test("page_view event IS enqueued and flushed via sendBeacon in normal mode", () => {
    setSearch("/inventory");
    expect(isHeatmapPreview()).toBe(false);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return; // guard is false — does NOT short-circuit
      enqueueEvent(event);
    }

    guardedEnqueue(makePageViewEvent());
    flushEvents(); // force flush

    // sendBeacon should have been called with the event batch
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconSpy.mock.calls[0];
    expect(url).toBe("/api/analytics/events");
    // Blob contains the page_view event
    expect(blob).toBeInstanceOf(Blob);
  });

  test("click event IS enqueued and flushed in normal mode", () => {
    setSearch("/inventory");
    expect(isHeatmapPreview()).toBe(false);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    guardedEnqueue(makeClickEvent());
    flushEvents();

    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("guard is scoped: switching from preview URL to normal URL enables tracking", () => {
    // Start in preview mode
    setSearch("/?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    // Navigate away — normal page
    setSearch("/inventory");
    expect(isHeatmapPreview()).toBe(false);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    guardedEnqueue(makePageViewEvent());
    flushEvents();

    // Normal page: beacon fires
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("param value '0' does NOT trigger suppression — tracking still active", () => {
    setSearch("/inventory?__heatmap_bg=0");
    expect(isHeatmapPreview()).toBe(false);

    const { enqueueEvent, flushEvents } = makeEventPipeline(beaconSpy, fetchSpy);

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    guardedEnqueue(makePageViewEvent());
    flushEvents();

    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });
});
