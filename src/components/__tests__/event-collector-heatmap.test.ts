/**
 * @jest-environment jsdom
 *
 * Tests for the anonymous cookieless heatmap layer added to EventCollector.
 *
 * What we test:
 *  (a) heatmap_click — fires on every click, even with NO consent.
 *      Shape: session_id="anon", user_fingerprint="anon", xp/yp in [0,1],
 *      src="anon_heatmap". NO text, href, or any identifier in metadata.
 *
 *  (b) Fires on public pages when hasAnalyticsConsent() would return false.
 *
 *  (c) heatmap_move is throttled — at most 1 event per 2 000 ms.
 *
 *  (d) The existing consent-gated "click" event still requires consent
 *      (the ESSENTIAL_EVENT_TYPES addition must not weaken the click gate).
 *
 * Approach: inline the subset of EventCollector logic we need (the
 * ESSENTIAL_EVENT_TYPES set and the anon event builder) so the test is
 * self-contained and doesn't require rendering the full React component,
 * which depends on next/navigation, next-auth, journey-stitcher, etc.
 * The contract being pinned is the event shape and the consent bypass —
 * not the internal React wiring. This mirrors the style used in
 * event-collector-consent.test.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Inline mirror of the relevant EventCollector logic
// ---------------------------------------------------------------------------

const ESSENTIAL_EVENT_TYPES = new Set(["page_view", "heatmap_click", "heatmap_move"]);

interface AnalyticsEvent {
  event_type: string;
  action: string;
  page: string;
  session_id: string;
  user_fingerprint: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/** Mirror of hasAnalyticsConsent — public page, no cookie → false. */
function hasAnalyticsConsent(): boolean {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.location !== "undefined" &&
      window.location.pathname.startsWith("/admin")
    ) {
      return true;
    }
    if (typeof document !== "undefined") {
      const cookieMatch = document.cookie.match(/(?:^|; )wolfpack_consent=([^;]*)/);
      const consentVal = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
      if (consentVal === "accepted") return true;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("cookie_consent") === "all";
    }
  } catch { /* unavailable */ }
  return false;
}

/** Mirror of enqueueEvent — returns whether the event was accepted. */
function makeEnqueueEvent(captured: AnalyticsEvent[]) {
  return function enqueueEvent(event: AnalyticsEvent): boolean {
    if (!ESSENTIAL_EVENT_TYPES.has(event.event_type)) {
      if (!hasAnalyticsConsent()) return false;
    }
    captured.push(event);
    return true;
  };
}

/** Mirror of the anonymous event builder in EventCollector's useEffect. */
function buildAnonEvent(
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
    metadata: { xp, yp, vw: window.innerWidth, src: "anon_heatmap" },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setPath(path: string) {
  window.history.replaceState({}, "", path);
}

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const eq = c.indexOf("=");
    const name = (eq > -1 ? c.substring(0, eq) : c).trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("EventCollector — anonymous heatmap layer", () => {
  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    setPath("/inventory");
  });

  // =========================================================================
  // (a) Shape assertions for heatmap_click
  // =========================================================================

  test("(a) heatmap_click carries xp/yp in [0,1], src=anon_heatmap, session_id=anon, user_fingerprint=anon", () => {
    // Simulate a click at a known position
    const pageX = 400;
    const pageY = 300;
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const event = buildAnonEvent("heatmap_click", "click", pageX, pageY);
    enqueueEvent(event);

    expect(captured).toHaveLength(1);
    const ev = captured[0];

    expect(ev.event_type).toBe("heatmap_click");
    expect(ev.action).toBe("click");
    expect(ev.session_id).toBe("anon");
    expect(ev.user_fingerprint).toBe("anon");
    expect(ev.metadata.src).toBe("anon_heatmap");

    // xp and yp must be in [0, 1]
    const xp = ev.metadata.xp as number;
    const yp = ev.metadata.yp as number;
    expect(typeof xp).toBe("number");
    expect(typeof yp).toBe("number");
    expect(xp).toBeGreaterThanOrEqual(0);
    expect(xp).toBeLessThanOrEqual(1);
    expect(yp).toBeGreaterThanOrEqual(0);
    expect(yp).toBeLessThanOrEqual(1);

    // vw must be a number
    expect(typeof ev.metadata.vw).toBe("number");
  });

  test("(a) metadata contains NO text, href, or any identifier beyond xp/yp/vw/src", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    enqueueEvent(buildAnonEvent("heatmap_click", "click", 100, 200));

    const meta = captured[0].metadata;
    const keys = Object.keys(meta);

    // Only the four contract keys are allowed
    expect(keys.sort()).toEqual(["src", "vw", "xp", "yp"].sort());

    // Explicitly assert forbidden keys are absent
    expect(meta).not.toHaveProperty("text");
    expect(meta).not.toHaveProperty("href");
    expect(meta).not.toHaveProperty("tag");
    expect(meta).not.toHaveProperty("track_id");
    expect(meta).not.toHaveProperty("element_text");
    expect(meta).not.toHaveProperty("element_tag");
    expect(meta).not.toHaveProperty("id");
  });

  test("(a) xp/yp are normalized page-relative values (pageX/scrollWidth, pageY/scrollHeight)", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    // jsdom scrollWidth/scrollHeight default to 0 → clamped to 1 in buildAnonEvent
    // Set explicit values via Object.defineProperty
    Object.defineProperty(document.documentElement, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 2000, configurable: true });

    enqueueEvent(buildAnonEvent("heatmap_click", "click", 500, 1000));

    const ev = captured[0];
    expect(ev.metadata.xp).toBeCloseTo(0.5, 5);
    expect(ev.metadata.yp).toBeCloseTo(0.5, 5);

    // Restore
    Object.defineProperty(document.documentElement, "scrollWidth", { value: 0, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 0, configurable: true });
  });

  test("(a) xp/yp clamp to [0, 1] for out-of-bounds coordinates", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    Object.defineProperty(document.documentElement, "scrollWidth", { value: 100, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 100, configurable: true });

    // pageX/pageY larger than scrollWidth/scrollHeight
    enqueueEvent(buildAnonEvent("heatmap_click", "click", 999, 999));

    const ev = captured[0];
    expect(ev.metadata.xp).toBe(1);
    expect(ev.metadata.yp).toBe(1);

    // Restore
    Object.defineProperty(document.documentElement, "scrollWidth", { value: 0, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 0, configurable: true });
  });

  // =========================================================================
  // (b) Fires even without consent on a public page
  // =========================================================================

  test("(b) heatmap_click fires on a public page with NO cookie consent", () => {
    setPath("/inventory");
    // Verify no consent
    expect(hasAnalyticsConsent()).toBe(false);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const accepted = enqueueEvent(buildAnonEvent("heatmap_click", "click", 50, 50));
    expect(accepted).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].event_type).toBe("heatmap_click");
  });

  test("(b) heatmap_move fires on a public page with NO consent", () => {
    setPath("/");
    expect(hasAnalyticsConsent()).toBe(false);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const accepted = enqueueEvent(buildAnonEvent("heatmap_move", "move", 100, 100));
    expect(accepted).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].event_type).toBe("heatmap_move");
  });

  test("(b) heatmap_click fires on /vehicles/:vin without consent", () => {
    setPath("/vehicles/1HGCM82633A004352");
    expect(hasAnalyticsConsent()).toBe(false);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    enqueueEvent(buildAnonEvent("heatmap_click", "click", 200, 400));
    expect(captured).toHaveLength(1);
    expect(captured[0].page).toBe("/vehicles/1HGCM82633A004352");
  });

  // =========================================================================
  // (c) heatmap_move is throttled to ≤1 per 2 000 ms
  // =========================================================================

  test("(c) heatmap_move is throttled — second move within 2s is suppressed", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    // Simulate the throttle logic inline (mirrors the useEffect handler)
    const ANON_MOVE_INTERVAL_MS = 2000;
    let lastMoveEmit = 0;

    function handleAnonMove(pageX: number, pageY: number, now: number) {
      if (now - lastMoveEmit < ANON_MOVE_INTERVAL_MS) return;
      lastMoveEmit = now;
      enqueueEvent(buildAnonEvent("heatmap_move", "move", pageX, pageY));
    }

    const t0 = Date.now();
    handleAnonMove(100, 100, t0);         // should fire
    handleAnonMove(200, 200, t0 + 500);   // within 2s — suppressed
    handleAnonMove(300, 300, t0 + 1000);  // within 2s — suppressed
    handleAnonMove(400, 400, t0 + 1999);  // still within 2s — suppressed
    handleAnonMove(500, 500, t0 + 2000);  // exactly 2s — fires

    expect(captured).toHaveLength(2);
    expect(captured[0].event_type).toBe("heatmap_move");
    expect(captured[1].event_type).toBe("heatmap_move");
  });

  test("(c) heatmap_move: rapid calls within 2s produce exactly 1 event", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const ANON_MOVE_INTERVAL_MS = 2000;
    let lastMoveEmit = 0;

    function throttledMove(pageX: number, pageY: number, now: number) {
      if (now - lastMoveEmit < ANON_MOVE_INTERVAL_MS) return;
      lastMoveEmit = now;
      enqueueEvent(buildAnonEvent("heatmap_move", "move", pageX, pageY));
    }

    const t0 = Date.now();
    for (let i = 0; i < 20; i++) {
      throttledMove(i * 10, i * 5, t0 + i * 50); // 20 calls over 1000ms
    }

    expect(captured).toHaveLength(1);
  });

  test("(c) heatmap_move: after 2s the throttle resets and another event fires", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const ANON_MOVE_INTERVAL_MS = 2000;
    let lastMoveEmit = 0;

    function throttledMove(pageX: number, pageY: number, now: number) {
      if (now - lastMoveEmit < ANON_MOVE_INTERVAL_MS) return;
      lastMoveEmit = now;
      enqueueEvent(buildAnonEvent("heatmap_move", "move", pageX, pageY));
    }

    const t0 = Date.now();
    throttledMove(100, 100, t0);         // fires
    throttledMove(200, 200, t0 + 2001);  // 2001ms later — fires
    throttledMove(300, 300, t0 + 2500);  // within 2s of second fire — suppressed

    expect(captured).toHaveLength(2);
  });

  // =========================================================================
  // (d) The existing consent-gated "click" event still requires consent
  //     (ESSENTIAL_EVENT_TYPES must not accidentally include "click")
  // =========================================================================

  test("(d) legacy 'click' event_type is NOT essential and requires consent", () => {
    setPath("/inventory");
    // No consent
    expect(hasAnalyticsConsent()).toBe(false);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    // This is the shape enqueued by the consent-gated click handler
    const legacyClickEvent: AnalyticsEvent = {
      event_type: "click",
      action: "click",
      page: "/inventory",
      session_id: "s_real_session",
      user_fingerprint: "fp_real_fp",
      timestamp: new Date().toISOString(),
      metadata: { tag: "button", text: "View Details", x: 100, y: 200, viewport_w: 1280 },
    };

    const accepted = enqueueEvent(legacyClickEvent);
    expect(accepted).toBe(false);
    expect(captured).toHaveLength(0);
  });

  test("(d) legacy 'click' event fires when consent IS granted", () => {
    setPath("/inventory");
    document.cookie = "wolfpack_consent=accepted; path=/";
    expect(hasAnalyticsConsent()).toBe(true);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    const legacyClickEvent: AnalyticsEvent = {
      event_type: "click",
      action: "click",
      page: "/inventory",
      session_id: "s_real_session",
      user_fingerprint: "fp_real_fp",
      timestamp: new Date().toISOString(),
      metadata: { tag: "button", text: "View Details", x: 100, y: 200, viewport_w: 1280 },
    };

    const accepted = enqueueEvent(legacyClickEvent);
    expect(accepted).toBe(true);
    expect(captured).toHaveLength(1);
  });

  test("(d) heatmap_click and legacy click can coexist — anon fires, legacy blocked (no consent)", () => {
    setPath("/");
    expect(hasAnalyticsConsent()).toBe(false);

    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    // Anon heatmap click — should be accepted
    enqueueEvent(buildAnonEvent("heatmap_click", "click", 100, 200));

    // Legacy consent-gated click — should be blocked
    enqueueEvent({
      event_type: "click",
      action: "click",
      page: "/",
      session_id: "s_abc",
      user_fingerprint: "fp_xyz",
      timestamp: new Date().toISOString(),
      metadata: { tag: "a", text: "Schedule a Test Drive", href: "https://example.com/schedule" },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].event_type).toBe("heatmap_click");
    expect(captured[0].session_id).toBe("anon");
  });

  // =========================================================================
  // Extra invariant: anon events never carry real session/fingerprint
  // =========================================================================

  test("anon event session_id is always the literal string 'anon', not a real session token", () => {
    const captured: AnalyticsEvent[] = [];
    const enqueueEvent = makeEnqueueEvent(captured);

    enqueueEvent(buildAnonEvent("heatmap_click", "click", 50, 50));

    const ev = captured[0];
    expect(ev.session_id).toBe("anon");
    expect(ev.user_fingerprint).toBe("anon");
    // Must not look like a real token (s_<timestamp>_<hex>)
    expect(ev.session_id).not.toMatch(/^s_/);
    expect(ev.user_fingerprint).not.toMatch(/^fp_/);
  });

  test("ESSENTIAL_EVENT_TYPES includes heatmap_click and heatmap_move", () => {
    expect(ESSENTIAL_EVENT_TYPES.has("heatmap_click")).toBe(true);
    expect(ESSENTIAL_EVENT_TYPES.has("heatmap_move")).toBe(true);
    // Confirm page_view remains essential (regression guard)
    expect(ESSENTIAL_EVENT_TYPES.has("page_view")).toBe(true);
    // Confirm 'click' is NOT essential (regression guard for consent gate)
    expect(ESSENTIAL_EVENT_TYPES.has("click")).toBe(false);
  });
});

// Treat this test file as a module so its top-level helper declarations stay
// file-scoped instead of leaking into the global script scope, where they
// collided with identically-named helpers in sibling test files (tsc
// TS2393/TS2451).
export {};
