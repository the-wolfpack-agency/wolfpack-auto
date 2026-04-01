/**
 * Unit tests for src/lib/photo-engagement-tracker.ts
 *
 * Tests photo category classification, swipe speed classification,
 * buyer type inference, dwell tracking, and the stateful tracker.
 *
 * Run with: npx jest src/lib/__tests__/photo-engagement-tracker.test.ts
 */

import {
  classifyPhoto,
  classifySwipeSpeed,
  inferBuyerTypeFromPhotos,
  initPhotoEngagement,
  type PhotoCategory,
  type BuyerType,
} from "../photo-engagement-tracker";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TEST_VIN = "1HGCM82633A004352";

function createMockTrack() {
  const events: Array<{ eventType: string; action: string; metadata: Record<string, unknown> }> = [];
  const track = (eventType: string, action: string, metadata?: Record<string, unknown>) => {
    events.push({ eventType, action, metadata: metadata ?? {} });
  };
  return { track, events };
}

/* -------------------------------------------------------------------------- */
/* classifyPhoto — keyword-based classification                               */
/* -------------------------------------------------------------------------- */

describe("classifyPhoto — keyword matching", () => {
  it("classifies 'front bumper view' as exterior_front", () => {
    expect(classifyPhoto(0, 10, "front bumper view")).toBe("exterior_front");
  });

  it("classifies 'side profile' as exterior_side", () => {
    expect(classifyPhoto(1, 10, "side profile")).toBe("exterior_side");
  });

  it("classifies 'rear taillight' as exterior_rear", () => {
    expect(classifyPhoto(2, 10, "rear taillight")).toBe("exterior_rear");
  });

  it("classifies 'dashboard controls' as interior_dashboard", () => {
    expect(classifyPhoto(3, 10, "dashboard controls")).toBe("interior_dashboard");
  });

  it("classifies 'leather seat detail' as interior_seats", () => {
    expect(classifyPhoto(4, 10, "leather seat detail")).toBe("interior_seats");
  });

  it("classifies 'cargo area' as interior_cargo", () => {
    expect(classifyPhoto(5, 10, "cargo area")).toBe("interior_cargo");
  });

  it("classifies 'engine bay' as engine", () => {
    expect(classifyPhoto(6, 10, "engine bay")).toBe("engine");
  });

  it("classifies 'wheel and tire' as wheels", () => {
    expect(classifyPhoto(7, 10, "wheel and tire")).toBe("wheels");
  });

  it("classifies 'damage on fender' as damage", () => {
    expect(classifyPhoto(8, 10, "damage on fender")).toBe("damage");
  });
});

/* -------------------------------------------------------------------------- */
/* classifyPhoto — positional heuristic                                       */
/* -------------------------------------------------------------------------- */

describe("classifyPhoto — positional heuristic (no label)", () => {
  it("first photo defaults to exterior_front", () => {
    expect(classifyPhoto(0, 10)).toBe("exterior_front");
  });

  it("photo at 25% defaults to exterior_side", () => {
    expect(classifyPhoto(2, 10)).toBe("exterior_side");
  });

  it("photo at 50% defaults to interior_dashboard", () => {
    expect(classifyPhoto(5, 10)).toBe("interior_dashboard");
  });

  it("photo at 80% defaults to engine", () => {
    expect(classifyPhoto(8, 10)).toBe("engine");
  });

  it("single photo always returns exterior_front", () => {
    expect(classifyPhoto(0, 1)).toBe("exterior_front");
  });
});

/* -------------------------------------------------------------------------- */
/* classifySwipeSpeed                                                          */
/* -------------------------------------------------------------------------- */

describe("classifySwipeSpeed", () => {
  it("< 800ms is browsing", () => {
    expect(classifySwipeSpeed(500)).toBe("browsing");
    expect(classifySwipeSpeed(0)).toBe("browsing");
    expect(classifySwipeSpeed(799)).toBe("browsing");
  });

  it("800-3000ms is comparing", () => {
    expect(classifySwipeSpeed(800)).toBe("comparing");
    expect(classifySwipeSpeed(1500)).toBe("comparing");
    expect(classifySwipeSpeed(3000)).toBe("comparing");
  });

  it("> 3000ms is studying", () => {
    expect(classifySwipeSpeed(3001)).toBe("studying");
    expect(classifySwipeSpeed(10000)).toBe("studying");
  });
});

/* -------------------------------------------------------------------------- */
/* inferBuyerTypeFromPhotos                                                    */
/* -------------------------------------------------------------------------- */

describe("inferBuyerTypeFromPhotos", () => {
  it("returns family_buyer for heavy interior time", () => {
    const time: Record<string, number> = {
      interior_dashboard: 5000,
      interior_seats: 4000,
      interior_cargo: 3000,
      exterior_front: 1000,
    };
    expect(inferBuyerTypeFromPhotos(time, new Set(), 2000)).toBe("family_buyer");
  });

  it("returns appearance_buyer for heavy exterior time", () => {
    const time: Record<string, number> = {
      exterior_front: 5000,
      exterior_side: 4000,
      exterior_rear: 3000,
      interior_dashboard: 500,
    };
    expect(inferBuyerTypeFromPhotos(time, new Set(), 2000)).toBe("appearance_buyer");
  });

  it("returns mechanical_buyer for engine/wheels focus", () => {
    const time: Record<string, number> = {
      engine: 5000,
      wheels: 3000,
      exterior_front: 1000,
    };
    expect(inferBuyerTypeFromPhotos(time, new Set(), 3000)).toBe("mechanical_buyer");
  });

  it("returns casual_browser for fast transitions and low total time", () => {
    const time: Record<string, number> = {
      exterior_front: 500,
      exterior_side: 400,
      interior_dashboard: 300,
    };
    expect(inferBuyerTypeFromPhotos(time, new Set(), 400)).toBe("casual_browser");
  });

  it("returns negotiator when damage photos are zoomed and dwelled on", () => {
    const time: Record<string, number> = {
      exterior_front: 2000,
      damage: 3000,
      interior_dashboard: 1000,
    };
    const zoomed = new Set(["damage"]);
    expect(inferBuyerTypeFromPhotos(time, zoomed, 2000)).toBe("negotiator");
  });

  it("returns casual_browser when no strong signal", () => {
    const time: Record<string, number> = {
      exterior_front: 1000,
      exterior_side: 1000,
      interior_dashboard: 1000,
      engine: 1000,
    };
    expect(inferBuyerTypeFromPhotos(time, new Set(), 2000)).toBe("casual_browser");
  });
});

/* -------------------------------------------------------------------------- */
/* initPhotoEngagement — stateful tracker                                      */
/* -------------------------------------------------------------------------- */

describe("initPhotoEngagement", () => {
  it("fires photo.dwell on photo change", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    // Simulate time passing on first photo
    tracker.onPhotoChange(1);

    const dwellEvents = events.filter((e) => e.action === "photo.dwell");
    expect(dwellEvents.length).toBeGreaterThanOrEqual(1);
    expect(dwellEvents[0].metadata).toHaveProperty("vin", TEST_VIN);
    expect(dwellEvents[0].metadata).toHaveProperty("photo_index");
    expect(dwellEvents[0].metadata).toHaveProperty("category");
    expect(dwellEvents[0].metadata).toHaveProperty("dwell_ms");
    expect(dwellEvents[0].metadata).toHaveProperty("zoomed");
  });

  it("fires photo.first_clicked on first non-zero photo change", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onPhotoChange(3);

    const firstClicked = events.filter((e) => e.action === "photo.first_clicked");
    expect(firstClicked.length).toBe(1);
    expect(firstClicked[0].metadata).toHaveProperty("photo_index", 3);
  });

  it("does not fire photo.first_clicked twice", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onPhotoChange(2);
    tracker.onPhotoChange(5);

    const firstClicked = events.filter((e) => e.action === "photo.first_clicked");
    expect(firstClicked.length).toBe(1);
  });

  it("tracks zoom events", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onZoom(2);

    const zoomEvents = events.filter((e) => e.action === "photo.zoom");
    expect(zoomEvents.length).toBe(1);
    expect(zoomEvents[0].metadata).toHaveProperty("photo_index", 2);
  });

  it("fires summary events on destroy", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onPhotoChange(1);
    tracker.onPhotoChange(2);
    tracker.destroy();

    const summaryActions = events.map((e) => e.action);
    expect(summaryActions).toContain("photo.swipe_speed");
    expect(summaryActions).toContain("photo.interest_profile");
    expect(summaryActions).toContain("photo.buyer_type");
  });

  it("destroy is idempotent", () => {
    const { track, events } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onPhotoChange(1);
    tracker.destroy();
    const count1 = events.length;
    tracker.destroy();
    expect(events.length).toBe(count1);
  });

  it("getInterestProfile returns accumulated category times", () => {
    const { track } = createMockTrack();
    const categories: PhotoCategory[] = [
      "exterior_front",
      "interior_dashboard",
      "engine",
    ];
    const tracker = initPhotoEngagement({
      vin: TEST_VIN,
      track,
      photoCategories: categories,
    });

    tracker.onPhotoChange(1);
    tracker.onPhotoChange(2);

    const profile = tracker.getInterestProfile();
    expect(profile.vin).toBe(TEST_VIN);
    expect(profile).toHaveProperty("top_category");
    expect(profile).toHaveProperty("time_by_category");
  });

  it("getBuyerType returns a valid buyer type", () => {
    const { track } = createMockTrack();
    const tracker = initPhotoEngagement({ vin: TEST_VIN, track });

    tracker.onPhotoChange(1);
    tracker.onPhotoChange(2);

    const buyerType = tracker.getBuyerType();
    const validTypes: BuyerType[] = [
      "family_buyer",
      "appearance_buyer",
      "mechanical_buyer",
      "casual_browser",
      "negotiator",
    ];
    expect(validTypes).toContain(buyerType);
  });

  it("uses provided photoCategories for classification", () => {
    const { track, events } = createMockTrack();
    const categories: PhotoCategory[] = ["damage", "engine", "wheels"];
    const tracker = initPhotoEngagement({
      vin: TEST_VIN,
      track,
      photoCategories: categories,
    });

    tracker.onPhotoChange(1);

    const dwellEvents = events.filter((e) => e.action === "photo.dwell");
    expect(dwellEvents.length).toBeGreaterThanOrEqual(1);
    // First photo (index 0) should use "damage" from provided categories
    expect(dwellEvents[0].metadata.category).toBe("damage");
  });
});
