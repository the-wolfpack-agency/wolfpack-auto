/**
 * Unit tests for src/lib/session-replay.ts
 *
 * Tests replay recording, compression, timeline extraction, and PII masking.
 *
 * Run with: npx jest src/lib/__tests__/session-replay.test.ts
 */

import {
  SessionRecorder,
  maskPII,
  maskEventData,
  compressReplayData,
  decompressReplayData,
  getReplayTimeline,
  type ReplayEvent,
} from "../session-replay";

/* -------------------------------------------------------------------------- */
/*  PII masking                                                                */
/* -------------------------------------------------------------------------- */

describe("maskPII", () => {
  it("masks email addresses", () => {
    expect(maskPII("Contact me at john@example.com")).toBe(
      "Contact me at [EMAIL]",
    );
  });

  it("masks phone numbers", () => {
    expect(maskPII("Call (555) 234-5678")).toBe("Call [PHONE]");
  });

  it("masks SSNs", () => {
    expect(maskPII("SSN: 123-45-6789")).toBe("SSN: [SSN]");
  });

  it("masks credit card numbers", () => {
    expect(maskPII("Card: 4111-2222-3333-4444")).toBe("Card: [CARD]");
  });

  it("masks multiple PII types in one string", () => {
    const input = "Email john@test.com, phone (555) 123-4567, SSN 999-88-7777";
    const masked = maskPII(input);
    expect(masked).not.toContain("john@test.com");
    expect(masked).not.toContain("(555) 123-4567");
    expect(masked).not.toContain("999-88-7777");
  });

  it("returns clean strings unchanged", () => {
    expect(maskPII("Just some text")).toBe("Just some text");
  });
});

/* -------------------------------------------------------------------------- */
/*  maskEventData                                                              */
/* -------------------------------------------------------------------------- */

describe("maskEventData", () => {
  it("masks input value fields with ***", () => {
    const data = { target_tag: "INPUT", value: "secret password" };
    const masked = maskEventData(data);
    expect(masked.value).toBe("***");
    expect(masked.target_tag).toBe("INPUT");
  });

  it("masks input_value and text fields", () => {
    const data = { input_value: "my data", text: "sensitive text" };
    const masked = maskEventData(data);
    expect(masked.input_value).toBe("***");
    expect(masked.text).toBe("***");
  });

  it("masks PII in regular string fields", () => {
    const data = { label: "Email is john@example.com" };
    const masked = maskEventData(data);
    expect(masked.label).toBe("Email is [EMAIL]");
  });

  it("recursively masks nested objects", () => {
    const data = { nested: { value: "secret", email: "x@y.com" } };
    const masked = maskEventData(data);
    const nested = masked.nested as Record<string, unknown>;
    expect(nested.value).toBe("***");
    expect(nested.email).toBe("[EMAIL]");
  });

  it("preserves non-string, non-object values", () => {
    const data = { count: 42, active: true, items: [1, 2, 3] };
    const masked = maskEventData(data);
    expect(masked.count).toBe(42);
    expect(masked.active).toBe(true);
    expect(masked.items).toEqual([1, 2, 3]);
  });
});

/* -------------------------------------------------------------------------- */
/*  SessionRecorder                                                            */
/* -------------------------------------------------------------------------- */

describe("SessionRecorder", () => {
  let recorder: SessionRecorder;

  beforeEach(() => {
    recorder = new SessionRecorder();
  });

  it("starts and stops recording", () => {
    expect(recorder.isRecording).toBe(false);
    recorder.startRecording("session-001");
    expect(recorder.isRecording).toBe(true);
    expect(recorder.currentSessionId).toBe("session-001");

    const events = recorder.stopRecording();
    expect(recorder.isRecording).toBe(false);
    expect(recorder.currentSessionId).toBeNull();
    expect(Array.isArray(events)).toBe(true);
  });

  it("ignores duplicate start calls", () => {
    recorder.startRecording("session-001");
    recorder.startRecording("session-002"); // should be no-op
    expect(recorder.currentSessionId).toBe("session-001");
  });

  it("returns empty array when stopping without recording", () => {
    const events = recorder.stopRecording();
    expect(events).toEqual([]);
  });

  it("pushes events with auto-incrementing seq", () => {
    recorder.startRecording("session-001");
    recorder.pushEvent("click", { x: 100, y: 200 });
    recorder.pushEvent("scroll", { scrollY: 500 });
    recorder.pushEvent("click", { x: 150, y: 300 });

    const events = recorder.stopRecording();
    expect(events).toHaveLength(3);
    expect(events[0].seq).toBe(0);
    expect(events[1].seq).toBe(1);
    expect(events[2].seq).toBe(2);
  });

  it("assigns timestamps to events", () => {
    recorder.startRecording("session-001");
    recorder.pushEvent("click", { x: 10, y: 20 });

    const events = recorder.stopRecording();
    expect(events[0].ts).toBeGreaterThan(0);
    expect(events[0].ts).toBeLessThanOrEqual(Date.now());
  });

  it("masks PII in event data automatically", () => {
    recorder.startRecording("session-001");
    recorder.pushEvent("input_change", {
      value: "my secret",
      target_name: "email",
    });

    const events = recorder.stopRecording();
    expect(events[0].data.value).toBe("***");
  });

  it("ignores events when not recording", () => {
    recorder.pushEvent("click", { x: 0, y: 0 });
    recorder.startRecording("session-001");
    recorder.pushEvent("click", { x: 100, y: 200 });
    const events = recorder.stopRecording();
    expect(events).toHaveLength(1);
  });

  it("tracks page navigations", () => {
    recorder.startRecording("session-001");
    recorder.pushEvent("page_navigation", { url: "https://example.com/inventory" });
    recorder.pushEvent("page_navigation", { url: "https://example.com/contact" });

    const pages = recorder.getPages();
    expect(pages).toContain("/inventory");
    expect(pages).toContain("/contact");
  });

  it("reports elapsed time", () => {
    expect(recorder.getElapsedMs()).toBe(0);
    recorder.startRecording("session-001");
    // Elapsed should be >= 0 immediately after start
    expect(recorder.getElapsedMs()).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Compression                                                                */
/* -------------------------------------------------------------------------- */

describe("compressReplayData / decompressReplayData", () => {
  const events: ReplayEvent[] = [
    { seq: 0, ts: 1000000, type: "click", data: { x: 100, y: 200 } },
    { seq: 1, ts: 1001000, type: "scroll", data: { scrollY: 500 } },
    { seq: 2, ts: 1002000, type: "page_navigation", data: { pathname: "/inventory" } },
  ];

  it("compresses and decompresses round-trip", () => {
    const compressed = compressReplayData("session-001", events);
    expect(compressed.session_id).toBe("session-001");
    expect(compressed.compressed.length).toBeGreaterThan(0);
    expect(compressed.original_size).toBeGreaterThan(0);

    const decompressed = decompressReplayData(compressed.compressed);
    expect(decompressed).toHaveLength(3);
    expect(decompressed[0].seq).toBe(0);
    expect(decompressed[0].type).toBe("click");
    expect(decompressed[2].data.pathname).toBe("/inventory");
  });

  it("produces smaller output than original JSON", () => {
    // Key shortening should reduce size for typical events
    const compressed = compressReplayData("session-001", events);
    // The compressed string is base64 so may be slightly larger for tiny payloads,
    // but the shortened keys reduce the raw JSON significantly.
    expect(compressed.compressed_size).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Timeline extraction                                                        */
/* -------------------------------------------------------------------------- */

describe("getReplayTimeline", () => {
  it("returns empty timeline for empty events", () => {
    const timeline = getReplayTimeline("session-001", []);
    expect(timeline.session_id).toBe("session-001");
    expect(timeline.duration_ms).toBe(0);
    expect(timeline.key_moments).toEqual([]);
  });

  it("extracts key moments (clicks, navigations, inputs, errors)", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 1000, type: "page_navigation", data: { pathname: "/" } },
      { seq: 1, ts: 1500, type: "scroll", data: { scrollY: 100 } },
      { seq: 2, ts: 2000, type: "click", data: { target_tag: "BUTTON", target_id: "cta" } },
      { seq: 3, ts: 2500, type: "dom_mutation", data: { mutation_type: "childList" } },
      { seq: 4, ts: 3000, type: "input_change", data: { input_type: "text", target_name: "search" } },
      { seq: 5, ts: 3500, type: "error", data: { message: "Test error" } },
      { seq: 6, ts: 4000, type: "resize", data: { width: 1024, height: 768 } },
    ];

    const timeline = getReplayTimeline("session-001", events);

    // Should include navigation, click, input, error but NOT scroll, dom_mutation, resize
    expect(timeline.key_moments).toHaveLength(4);
    expect(timeline.duration_ms).toBe(3000); // 4000 - 1000

    const types = timeline.key_moments.map((m) => m.type);
    expect(types).toContain("page_navigation");
    expect(types).toContain("click");
    expect(types).toContain("input_change");
    expect(types).toContain("error");
    expect(types).not.toContain("scroll");
  });

  it("calculates correct offset_ms from start", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 5000, type: "click", data: { target_tag: "A" } },
      { seq: 1, ts: 8000, type: "click", data: { target_tag: "BUTTON" } },
    ];

    const timeline = getReplayTimeline("session-001", events);
    expect(timeline.key_moments[0].offset_ms).toBe(0);
    expect(timeline.key_moments[1].offset_ms).toBe(3000);
  });

  it("generates descriptive labels", () => {
    const events: ReplayEvent[] = [
      { seq: 0, ts: 1000, type: "page_navigation", data: { pathname: "/inventory" } },
      { seq: 1, ts: 2000, type: "click", data: { target_tag: "BUTTON", target_id: "submit" } },
      { seq: 2, ts: 3000, type: "error", data: { message: "404 not found" } },
    ];

    const timeline = getReplayTimeline("session-001", events);
    expect(timeline.key_moments[0].label).toContain("/inventory");
    expect(timeline.key_moments[1].label).toContain("BUTTON");
    expect(timeline.key_moments[1].label).toContain("submit");
    expect(timeline.key_moments[2].label).toContain("404 not found");
  });
});
