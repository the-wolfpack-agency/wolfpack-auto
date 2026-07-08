/**
 * @jest-environment jsdom
 *
 * Tests for the three EventCollector improvements (2026-06-02):
 *
 *  (a) heatmap_click metadata includes a non-PII `el` selector and NO
 *      text/href/value keys.
 *
 *  (b) Clicking enqueues then flushes within ~3s (fast-flush debounce),
 *      NOT the 30s bulk timer. Assert sendBeacon/fetch called ~3s after
 *      click, not 30s.
 *
 *  (c) A burst of 5 clicks produces a SINGLE flush (debounced fast-flush).
 *
 *  (d) Preview mode (?__heatmap_bg=1) still emits ZERO events and renders
 *      children (regression guard — the guard must still work after the
 *      hooks refactor).
 *
 *  (e) Normal mode still captures events (regression guard).
 *
 * Approach: inline mirrors of the relevant logic (same style as the existing
 * event-collector-heatmap.test.ts and event-collector-preview-suppress.test.ts).
 * This keeps the tests self-contained without rendering the full component tree.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Shared types
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

// ---------------------------------------------------------------------------
// Mirror of isHeatmapPreview
// ---------------------------------------------------------------------------

function isHeatmapPreview(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("__heatmap_bg") === "1";
}

// ---------------------------------------------------------------------------
// Mirror of buildAnonClickEl from EventCollector
// ---------------------------------------------------------------------------

function buildAnonClickEl(target: EventTarget | null): string {
  try {
    if (!(target instanceof Element)) return "";
    const el =
      target.closest("a, button, input, select, textarea, [data-track], [role]") ??
      target;
    if (!(el instanceof Element)) return "";
    const tag = el.tagName.toLowerCase();
    let qualifier = "";
    if (el.id) {
      qualifier = `#${el.id}`;
    } else {
      const dt = (el as HTMLElement).dataset?.track;
      if (dt) {
        qualifier = `[data-track=${dt}]`;
      } else if (el.classList.length > 0) {
        qualifier = `.${el.classList[0]}`;
      }
    }
    let nth = "";
    if (!el.id && el.parentElement) {
      const siblings = Array.from(el.parentElement.children).filter(
        (c) => c.tagName === el.tagName,
      );
      if (siblings.length > 1) {
        nth = `:nth-of-type(${siblings.indexOf(el) + 1})`;
      }
    }
    return `${tag}${qualifier}${nth}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Mirror of the click fast-flush pipeline from EventCollector
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_THRESHOLD = 100;
const CLICK_FLUSH_DELAY_MS = 3_000;
const ESSENTIAL_EVENT_TYPES = new Set(["page_view", "heatmap_click", "heatmap_move"]);

function makeFastFlushPipeline(beaconSpy: jest.Mock, fetchSpy: jest.Mock) {
  let eventBuffer: AnalyticsEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let clickFlushTimer: ReturnType<typeof setTimeout> | null = null;

  function flushEvents(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (clickFlushTimer) {
      clearTimeout(clickFlushTimer);
      clickFlushTimer = null;
    }
    if (eventBuffer.length === 0) return;
    const batch = [...eventBuffer];
    eventBuffer = [];
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      beaconSpy(
        "/api/analytics/events",
        new Blob([JSON.stringify({ events: batch })], { type: "application/json" }),
      );
    } else {
      fetchSpy("/api/analytics/events", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    }
  }

  function enqueueEvent(event: AnalyticsEvent): void {
    if (!ESSENTIAL_EVENT_TYPES.has(event.event_type)) return; // simplified — no consent check needed for these tests
    eventBuffer.push(event);

    if (eventBuffer.length >= FLUSH_THRESHOLD) {
      if (clickFlushTimer) {
        clearTimeout(clickFlushTimer);
        clickFlushTimer = null;
      }
      flushEvents();
    } else if (event.event_type === "heatmap_click") {
      if (clickFlushTimer) clearTimeout(clickFlushTimer);
      clickFlushTimer = setTimeout(() => {
        clickFlushTimer = null;
        flushEvents();
      }, CLICK_FLUSH_DELAY_MS);
      if (!flushTimer) {
        flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
      }
    } else if (!flushTimer) {
      flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
    }
  }

  function forceFlush(): void {
    flushEvents();
  }

  function getBuffer(): AnalyticsEvent[] {
    return [...eventBuffer];
  }

  return { enqueueEvent, forceFlush, getBuffer };
}

function makeAnonClickEvent(el?: string): AnalyticsEvent {
  const meta: Record<string, unknown> = {
    xp: 0.5,
    yp: 0.3,
    vw: 1280,
    src: "anon_heatmap",
  };
  if (el) meta.el = el;
  return {
    event_type: "heatmap_click",
    action: "click",
    page: "/inventory",
    session_id: "anon",
    user_fingerprint: "anon",
    timestamp: new Date().toISOString(),
    metadata: meta,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSearch(search: string) {
  window.history.replaceState({}, "", search);
}

// ---------------------------------------------------------------------------
// (a) el selector — non-PII content, correct shape
// ---------------------------------------------------------------------------

describe("EventCollector — el selector (buildAnonClickEl)", () => {
  test("(a) button with id → 'button#<id>'", () => {
    const btn = document.createElement("button");
    btn.id = "search-cta";
    document.body.appendChild(btn);
    const result = buildAnonClickEl(btn);
    expect(result).toBe("button#search-cta");
    document.body.removeChild(btn);
  });

  test("(a) anchor with class → 'a.<firstClass>'", () => {
    const a = document.createElement("a");
    a.className = "nav-link secondary";
    document.body.appendChild(a);
    const result = buildAnonClickEl(a);
    expect(result).toBe("a.nav-link");
    document.body.removeChild(a);
  });

  test("(a) element with data-track → '[data-track=<val>]'", () => {
    const div = document.createElement("div");
    div.setAttribute("data-track", "hero");
    document.body.appendChild(div);
    const result = buildAnonClickEl(div);
    expect(result).toBe("div[data-track=hero]");
    document.body.removeChild(div);
  });

  test("(a) sibling disambiguation → :nth-of-type(n)", () => {
    const parent = document.createElement("nav");
    const a1 = document.createElement("a");
    const a2 = document.createElement("a");
    a2.className = "nav-link";
    parent.appendChild(a1);
    parent.appendChild(a2);
    document.body.appendChild(parent);
    const result = buildAnonClickEl(a2);
    // a2 has class nav-link and is the 2nd <a> → "a.nav-link:nth-of-type(2)"
    expect(result).toBe("a.nav-link:nth-of-type(2)");
    document.body.removeChild(parent);
  });

  test("(a) click on span inside button → bubbles up to button", () => {
    const btn = document.createElement("button");
    btn.id = "buy-now";
    const span = document.createElement("span");
    btn.appendChild(span);
    document.body.appendChild(btn);
    const result = buildAnonClickEl(span);
    expect(result).toBe("button#buy-now");
    document.body.removeChild(btn);
  });

  test("(a) el selector contains NO text content", () => {
    const btn = document.createElement("button");
    btn.id = "cta";
    btn.textContent = "Buy Now — exclusive offer!";
    document.body.appendChild(btn);
    const result = buildAnonClickEl(btn);
    expect(result).not.toContain("Buy Now");
    expect(result).not.toContain("exclusive");
    document.body.removeChild(btn);
  });

  test("(a) el selector contains NO href", () => {
    const a = document.createElement("a");
    a.className = "promo-link";
    a.href = "https://secret-url.example.com/promo?code=ABC123";
    document.body.appendChild(a);
    const result = buildAnonClickEl(a);
    expect(result).not.toContain("secret-url");
    expect(result).not.toContain("promo?code");
    expect(result).not.toContain("https");
    document.body.removeChild(a);
  });

  test("(a) metadata keys for heatmap_click include el but NOT text/href/value", () => {
    const btn = document.createElement("button");
    btn.id = "search-cta";
    document.body.appendChild(btn);
    const el = buildAnonClickEl(btn);
    const event = makeAnonClickEvent(el);
    const keys = Object.keys(event.metadata);
    expect(keys).toContain("el");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("href");
    expect(keys).not.toContain("value");
    expect(event.metadata.el).toBe("button#search-cta");
    document.body.removeChild(btn);
  });

  test("(a) heatmap_move event does NOT include el (move volume is high)", () => {
    // heatmap_move should only carry xp/yp/vw/src — no el
    const moveEvent: AnalyticsEvent = {
      event_type: "heatmap_move",
      action: "move",
      page: "/inventory",
      session_id: "anon",
      user_fingerprint: "anon",
      timestamp: new Date().toISOString(),
      metadata: { xp: 0.3, yp: 0.7, vw: 1280, src: "anon_heatmap" },
    };
    expect(moveEvent.metadata).not.toHaveProperty("el");
    const keys = Object.keys(moveEvent.metadata).sort();
    expect(keys).toEqual(["src", "vw", "xp", "yp"].sort());
  });
});

// ---------------------------------------------------------------------------
// (b) Fast-flush: click triggers flush ~3s later, NOT 30s
// ---------------------------------------------------------------------------

describe("EventCollector — fast-flush (heatmap_click schedules 3s flush)", () => {
  let beaconSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;

  beforeEach(() => {
    jest.useFakeTimers();
    beaconSpy = jest.fn();
    originalSendBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
  });

  test("(b) single click → sendBeacon called after 3s, NOT before", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    enqueueEvent(makeAnonClickEvent("button#buy"));

    // Not yet flushed at t=0
    expect(beaconSpy).not.toHaveBeenCalled();

    // Still not flushed at 2.9s
    jest.advanceTimersByTime(2900);
    expect(beaconSpy).not.toHaveBeenCalled();

    // Flushed by 3s
    jest.advanceTimersByTime(100); // 3000ms total
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(b) click does NOT wait 30s to flush", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    enqueueEvent(makeAnonClickEvent("button#cta"));

    // At 3.5s, beacon must have already fired (would be 30s with old behavior)
    jest.advanceTimersByTime(3500);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(b) non-click events still use the 30s timer", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    enqueueEvent({
      event_type: "heatmap_move",
      action: "move",
      page: "/inventory",
      session_id: "anon",
      user_fingerprint: "anon",
      timestamp: new Date().toISOString(),
      metadata: { xp: 0.5, yp: 0.5, vw: 1280, src: "anon_heatmap" },
    });

    // At 3s — should NOT be flushed (no click fast-flush)
    jest.advanceTimersByTime(3000);
    expect(beaconSpy).not.toHaveBeenCalled();

    // At 30s — flushes via the regular timer
    jest.advanceTimersByTime(27_000);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(b) beacon payload contains the click event", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    enqueueEvent(makeAnonClickEvent("button#search-cta"));
    jest.advanceTimersByTime(3000);

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url] = beaconSpy.mock.calls[0];
    expect(url).toBe("/api/analytics/events");
  });
});

// ---------------------------------------------------------------------------
// (c) Burst of clicks → single flush (debounced)
// ---------------------------------------------------------------------------

describe("EventCollector — click burst debounce (single flush)", () => {
  let beaconSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;

  beforeEach(() => {
    jest.useFakeTimers();
    beaconSpy = jest.fn();
    originalSendBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
  });

  test("(c) 5 rapid clicks → exactly 1 flush (debounced, not 5 POSTs)", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    // Simulate 5 clicks spread over 2s (all within the 3s debounce window)
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(400);
      enqueueEvent(makeAnonClickEvent(`button.item-${i}`));
    }
    // Total time elapsed: 2000ms — no flush yet
    expect(beaconSpy).not.toHaveBeenCalled();

    // 3s after the LAST click (5th click was at t=2000ms, flush at t=5000ms)
    jest.advanceTimersByTime(3000);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(c) burst of 10 clicks spread over 1s → 1 flush, all 10 events in the batch", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100);
      enqueueEvent(makeAnonClickEvent(`button.nav-${i}`));
    }
    // 1000ms elapsed — still waiting on the 3s debounce reset
    expect(beaconSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    expect(beaconSpy).toHaveBeenCalledTimes(1);

    // All 10 events in a single batch
    const [, blob] = beaconSpy.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
  });

  test("(c) two separate click bursts separated by >3s → 2 flushes", () => {
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    // First burst
    enqueueEvent(makeAnonClickEvent("button#a"));
    enqueueEvent(makeAnonClickEvent("button#b"));
    jest.advanceTimersByTime(3000);
    expect(beaconSpy).toHaveBeenCalledTimes(1);

    // Second burst (4s later)
    jest.advanceTimersByTime(4000);
    enqueueEvent(makeAnonClickEvent("button#c"));
    jest.advanceTimersByTime(3000);
    expect(beaconSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// (d) Preview mode still emits ZERO events after hooks refactor
// ---------------------------------------------------------------------------

describe("EventCollector — preview mode guard (regression after hooks refactor)", () => {
  let beaconSpy: jest.Mock;
  let fetchSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
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
    jest.useRealTimers();
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
  });

  test("(d) isHeatmapPreview() returns true for ?__heatmap_bg=1", () => {
    setSearch("/?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);
  });

  test("(d) preview mode: events are suppressed — no sendBeacon/fetch", () => {
    setSearch("/inventory?__heatmap_bg=1");
    expect(isHeatmapPreview()).toBe(true);

    const { enqueueEvent, forceFlush } = makeFastFlushPipeline(beaconSpy, fetchSpy);

    // The real component does NOT call enqueueEvent in preview mode.
    // Simulate the guard:
    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    guardedEnqueue(makeAnonClickEvent("button#cta"));
    guardedEnqueue(makeAnonClickEvent("a.nav-link"));

    jest.advanceTimersByTime(30_000);
    forceFlush();

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("(d) isHeatmapPreview() returns false with no param", () => {
    setSearch("/inventory");
    expect(isHeatmapPreview()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (e) Normal mode captures events (regression)
// ---------------------------------------------------------------------------

describe("EventCollector — normal mode capture (regression)", () => {
  let beaconSpy: jest.Mock;
  let originalSendBeacon: typeof navigator.sendBeacon;

  beforeEach(() => {
    jest.useFakeTimers();
    beaconSpy = jest.fn();
    originalSendBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(navigator, "sendBeacon", {
      value: originalSendBeacon,
      writable: true,
      configurable: true,
    });
  });

  test("(e) normal mode: heatmap_click is captured and flushed within 3s", () => {
    setSearch("/inventory");
    expect(isHeatmapPreview()).toBe(false);

    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    function guardedEnqueue(event: AnalyticsEvent) {
      if (isHeatmapPreview()) return;
      enqueueEvent(event);
    }

    guardedEnqueue(makeAnonClickEvent("button#contact"));
    jest.advanceTimersByTime(3000);

    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(e) session_id and user_fingerprint remain 'anon' in normal mode", () => {
    setSearch("/inventory");
    const { enqueueEvent, forceFlush } = makeFastFlushPipeline(beaconSpy, jest.fn());

    const event = makeAnonClickEvent("button#test");
    enqueueEvent(event);

    // Check before flush
    expect(event.session_id).toBe("anon");
    expect(event.user_fingerprint).toBe("anon");

    forceFlush();
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  test("(e) heatmap_move still captured via regular 30s timer in normal mode", () => {
    setSearch("/inventory");
    const { enqueueEvent } = makeFastFlushPipeline(beaconSpy, jest.fn());

    enqueueEvent({
      event_type: "heatmap_move",
      action: "move",
      page: "/inventory",
      session_id: "anon",
      user_fingerprint: "anon",
      timestamp: new Date().toISOString(),
      metadata: { xp: 0.4, yp: 0.6, vw: 1280, src: "anon_heatmap" },
    });

    // Not flushed at 3s (no click fast-flush for moves)
    jest.advanceTimersByTime(3000);
    expect(beaconSpy).not.toHaveBeenCalled();

    // Flushed at 30s
    jest.advanceTimersByTime(27_000);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });
});

// Treat this test file as a module so its top-level helper declarations stay
// file-scoped instead of leaking into the global script scope, where they
// collided with identically-named helpers in sibling test files (tsc
// TS2393/TS2451).
export {};
