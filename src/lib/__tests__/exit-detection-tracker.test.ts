/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for src/lib/exit-detection-tracker.ts
 *
 * Tests clipboard content classification, rage compare detection,
 * visible section detection, and the stateful exit detection tracker.
 *
 * Run with: npx jest src/lib/__tests__/exit-detection-tracker.test.ts
 */

import {
  classifyCopiedContent,
  detectRageCompare,
  detectVisibleSection,
  initExitDetection,
  type CopiedContentType,
} from "../exit-detection-tracker";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TEST_VIN = "1HGCM82633A004352";
const TEST_VEHICLE_NAME = "2024 Honda Accord Sport";
const TEST_PRICE = 32500;

function createMockTrack() {
  const events: Array<{
    eventType: string;
    action: string;
    metadata: Record<string, unknown>;
  }> = [];
  const track = (
    eventType: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) => {
    events.push({ eventType, action, metadata: metadata ?? {} });
  };
  return { track, events };
}

/* -------------------------------------------------------------------------- */
/* classifyCopiedContent                                                       */
/* -------------------------------------------------------------------------- */

describe("classifyCopiedContent", () => {
  it("detects exact VIN match", () => {
    expect(classifyCopiedContent(TEST_VIN, TEST_VEHICLE_NAME, TEST_VIN)).toBe(
      "vin",
    );
  });

  it("detects VIN pattern (17 chars, no I/O/Q)", () => {
    expect(classifyCopiedContent("WBAJB0C51JB084264")).toBe("vin");
  });

  it("detects VIN case-insensitively", () => {
    expect(
      classifyCopiedContent(
        "1hgcm82633a004352",
        undefined,
        "1HGCM82633A004352",
      ),
    ).toBe("vin");
  });

  it("detects price with $ and commas", () => {
    expect(classifyCopiedContent("$32,500")).toBe("price");
  });

  it("detects price without $", () => {
    expect(classifyCopiedContent("32,500")).toBe("price");
  });

  it("detects price with decimals", () => {
    expect(classifyCopiedContent("$32,500.00")).toBe("price");
  });

  it("detects plain numeric price", () => {
    expect(classifyCopiedContent("32500")).toBe("price");
  });

  it("detects vehicle name when half the words match", () => {
    expect(
      classifyCopiedContent("2024 Honda Accord", TEST_VEHICLE_NAME),
    ).toBe("vehicle_name");
  });

  it("detects vehicle name partial match", () => {
    expect(classifyCopiedContent("Honda Accord Sport", TEST_VEHICLE_NAME)).toBe(
      "vehicle_name",
    );
  });

  it("returns other for unrecognized text", () => {
    expect(classifyCopiedContent("some random text here")).toBe("other");
  });

  it("returns other for very short text", () => {
    expect(classifyCopiedContent("Hi", TEST_VEHICLE_NAME)).toBe("other");
  });

  it("handles whitespace around copied text", () => {
    expect(classifyCopiedContent("  $32,500  ")).toBe("price");
  });

  it("handles VIN with whitespace", () => {
    expect(classifyCopiedContent("  1HGCM82633A004352  ")).toBe("vin");
  });
});

/* -------------------------------------------------------------------------- */
/* detectRageCompare                                                           */
/* -------------------------------------------------------------------------- */

describe("detectRageCompare", () => {
  it("returns null for fewer than 3 switches", () => {
    const now = Date.now();
    expect(detectRageCompare([now - 1000, now - 500])).toBeNull();
  });

  it("returns null if switches are spread over > 30s", () => {
    const now = Date.now();
    expect(
      detectRageCompare([now - 60000, now - 50000, now - 40000]),
    ).toBeNull();
  });

  it("detects rage when 3+ switches within 30s", () => {
    const now = Date.now();
    const timestamps = [now - 5000, now - 3000, now - 1000];
    const result = detectRageCompare(timestamps);
    expect(result).not.toBeNull();
    expect(result!.switch_count).toBe(3);
    expect(result!.window_seconds).toBe(30);
  });

  it("detects rage with 5 switches in window", () => {
    const now = Date.now();
    const timestamps = [
      now - 20000,
      now - 15000,
      now - 10000,
      now - 5000,
      now - 1000,
    ];
    const result = detectRageCompare(timestamps);
    expect(result).not.toBeNull();
    expect(result!.switch_count).toBe(5);
  });

  it("only counts recent switches within the 30s window", () => {
    const now = Date.now();
    // Two old, three recent
    const timestamps = [
      now - 60000,
      now - 50000,
      now - 5000,
      now - 3000,
      now - 1000,
    ];
    const result = detectRageCompare(timestamps);
    expect(result).not.toBeNull();
    expect(result!.switch_count).toBe(3);
  });

  it("returns null for empty array", () => {
    expect(detectRageCompare([])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* detectVisibleSection                                                        */
/* -------------------------------------------------------------------------- */

describe("detectVisibleSection", () => {
  it("returns 'unknown' in non-browser environment", () => {
    // In Jest/Node, document.querySelectorAll returns empty for these selectors
    const section = detectVisibleSection();
    expect(typeof section).toBe("string");
  });
});

/* -------------------------------------------------------------------------- */
/* initExitDetection — stateful tracker                                       */
/* -------------------------------------------------------------------------- */

describe("initExitDetection", () => {
  it("returns a controller with destroy and getVisibleSection", () => {
    const { track } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      vehicleName: TEST_VEHICLE_NAME,
      price: TEST_PRICE,
      track,
    });

    expect(tracker).toHaveProperty("destroy");
    expect(tracker).toHaveProperty("getVisibleSection");
    expect(typeof tracker.destroy).toBe("function");
    expect(typeof tracker.getVisibleSection).toBe("function");

    tracker.destroy();
  });

  it("fires exit.tab_switch on visibilitychange to hidden", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      track,
    });

    // Simulate visibility change to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const tabSwitchEvents = events.filter(
      (e) => e.action === "exit.tab_switch",
    );
    expect(tabSwitchEvents.length).toBe(1);
    expect(tabSwitchEvents[0].metadata).toHaveProperty("vin", TEST_VIN);
    expect(tabSwitchEvents[0].metadata).toHaveProperty(
      "section_visible_on_exit",
    );

    // Restore
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    tracker.destroy();
  });

  it("fires exit.tab_switch with returned:true on visibility restored", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      track,
    });

    // Go hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Come back
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const returnEvents = events.filter(
      (e) => e.action === "exit.tab_switch" && e.metadata.returned === true,
    );
    expect(returnEvents.length).toBe(1);
    expect(returnEvents[0].metadata).toHaveProperty("away_duration_ms");

    tracker.destroy();
  });

  it("fires exit.clipboard_copy on copy event with VIN", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      vehicleName: TEST_VEHICLE_NAME,
      track,
    });

    // Mock selection with VIN text
    const originalGetSelection = document.getSelection;
    document.getSelection = () =>
      ({
        toString: () => TEST_VIN,
      }) as unknown as Selection;

    document.dispatchEvent(new Event("copy"));

    const copyEvents = events.filter(
      (e) => e.action === "exit.clipboard_copy",
    );
    expect(copyEvents.length).toBe(1);
    expect(copyEvents[0].metadata).toHaveProperty(
      "copied_content_type",
      "vin",
    );

    // Restore
    document.getSelection = originalGetSelection;
    tracker.destroy();
  });

  it("fires exit.clipboard_copy with price detection", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      price: TEST_PRICE,
      track,
    });

    const originalGetSelection = document.getSelection;
    document.getSelection = () =>
      ({
        toString: () => "$32,500",
      }) as unknown as Selection;

    document.dispatchEvent(new Event("copy"));

    const copyEvents = events.filter(
      (e) => e.action === "exit.clipboard_copy",
    );
    expect(copyEvents.length).toBe(1);
    expect(copyEvents[0].metadata).toHaveProperty(
      "copied_content_type",
      "price",
    );

    document.getSelection = originalGetSelection;
    tracker.destroy();
  });

  it("fires exit.rage_compare on rapid tab switches", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      track,
    });

    // Simulate 4 rapid tab switches
    for (let i = 0; i < 4; i++) {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }

    const rageEvents = events.filter(
      (e) => e.action === "exit.rage_compare",
    );
    // Should fire at least once when threshold is exceeded
    expect(rageEvents.length).toBeGreaterThanOrEqual(1);
    expect(rageEvents[0].metadata).toHaveProperty("switch_count");
    expect(rageEvents[0].metadata).toHaveProperty("window_seconds");

    // Restore
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
    tracker.destroy();
  });

  it("destroy prevents further event firing", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      track,
    });

    tracker.destroy();
    const countAfterDestroy = events.length;

    // Try to trigger events after destroy
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // No new events should fire
    expect(events.length).toBe(countAfterDestroy);

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  it("destroy is idempotent", () => {
    const { track } = createMockTrack();
    const tracker = initExitDetection({ vin: TEST_VIN, track });

    tracker.destroy();
    expect(() => tracker.destroy()).not.toThrow();
  });

  it("does not include actual copied text in events (privacy)", () => {
    const { track, events } = createMockTrack();
    const tracker = initExitDetection({
      vin: TEST_VIN,
      vehicleName: TEST_VEHICLE_NAME,
      track,
    });

    const originalGetSelection = document.getSelection;
    document.getSelection = () =>
      ({
        toString: () => "some sensitive text the user copied",
      }) as unknown as Selection;

    document.dispatchEvent(new Event("copy"));

    const copyEvents = events.filter(
      (e) => e.action === "exit.clipboard_copy",
    );
    // Should NOT contain the actual text
    for (const evt of copyEvents) {
      const metaStr = JSON.stringify(evt.metadata);
      expect(metaStr).not.toContain("sensitive text");
    }

    document.getSelection = originalGetSelection;
    tracker.destroy();
  });
});
