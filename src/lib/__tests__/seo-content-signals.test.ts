/**
 * Unit tests for src/lib/seo-content-signals.ts
 *
 * Tests filter combo tracking, engagement correlation, zero-result gap
 * detection, canonical key generation, page title suggestion, and
 * low-engagement detection.
 *
 * Run with: npx jest src/lib/__tests__/seo-content-signals.test.ts
 */

import {
  canonicalFilterKey,
  suggestPageTitle,
  trackFilterCombo,
  trackFilterEngagement,
  getTopFilterCombos,
  getZeroResultGaps,
  getAllFilterCombos,
  getLowEngagementCombos,
  buildPopularComboEvents,
  clearFilterCombos,
} from "../seo-content-signals";

beforeEach(() => {
  clearFilterCombos();
});

/* -------------------------------------------------------------------------- */
/* canonicalFilterKey                                                           */
/* -------------------------------------------------------------------------- */

describe("canonicalFilterKey", () => {
  it("sorts keys alphabetically", () => {
    const key = canonicalFilterKey({ make: "Honda", body_type: "SUV" });
    expect(key).toBe("body_type=SUV&make=Honda");
  });

  it("filters out undefined and empty values", () => {
    const key = canonicalFilterKey({ make: "Honda", color: undefined, year: "" });
    expect(key).toBe("make=Honda");
  });

  it("returns empty string for empty filter set", () => {
    const key = canonicalFilterKey({});
    expect(key).toBe("");
  });

  it("produces deterministic keys regardless of insertion order", () => {
    const a = canonicalFilterKey({ z: "1", a: "2", m: "3" });
    const b = canonicalFilterKey({ a: "2", m: "3", z: "1" });
    expect(a).toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* suggestPageTitle                                                             */
/* -------------------------------------------------------------------------- */

describe("suggestPageTitle", () => {
  it("generates title for make + body_type + price", () => {
    const title = suggestPageTitle({ make: "Honda", body_type: "SUV", max_price: "25000" });
    expect(title).toContain("Honda");
    expect(title).toContain("SUV");
    expect(title).toContain("$25,000");
  });

  it("defaults to 'Used Vehicles' when no specifics", () => {
    const title = suggestPageTitle({});
    expect(title).toContain("Used");
    expect(title).toContain("Vehicles");
  });

  it("includes condition when specified", () => {
    const title = suggestPageTitle({ condition: "certified", make: "Toyota" });
    expect(title).toContain("Certified");
    expect(title).toContain("Toyota");
  });

  it("includes year range", () => {
    const title = suggestPageTitle({ year_min: "2020", body_type: "Truck" });
    expect(title).toContain("2020");
    expect(title).toContain("Newer");
  });
});

/* -------------------------------------------------------------------------- */
/* trackFilterCombo                                                            */
/* -------------------------------------------------------------------------- */

describe("trackFilterCombo", () => {
  it("creates a new entry on first search", () => {
    trackFilterCombo({ make: "Honda", body_type: "SUV" }, 10);

    const all = getAllFilterCombos();
    expect(all.length).toBe(1);
    expect(all[0].search_count).toBe(1);
    expect(all[0].filters.make).toBe("Honda");
  });

  it("increments search_count on repeated searches", () => {
    trackFilterCombo({ make: "Honda" }, 5);
    trackFilterCombo({ make: "Honda" }, 3);
    trackFilterCombo({ make: "Honda" }, 0);

    const all = getAllFilterCombos();
    expect(all.length).toBe(1);
    expect(all[0].search_count).toBe(3);
  });

  it("marks has_zero_results when result_count is 0", () => {
    trackFilterCombo({ make: "Lamborghini", body_type: "Minivan" }, 0);

    const all = getAllFilterCombos();
    expect(all[0].has_zero_results).toBe(true);
  });

  it("ignores empty filter sets", () => {
    trackFilterCombo({}, 10);

    const all = getAllFilterCombos();
    expect(all.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* trackFilterEngagement                                                       */
/* -------------------------------------------------------------------------- */

describe("trackFilterEngagement", () => {
  it("increments engagement_count", () => {
    trackFilterCombo({ make: "Toyota" }, 5);
    trackFilterEngagement({ make: "Toyota" });
    trackFilterEngagement({ make: "Toyota" });

    const all = getAllFilterCombos();
    expect(all[0].engagement_count).toBe(2);
  });

  it("updates engagement_rate", () => {
    trackFilterCombo({ make: "Honda" }, 10);
    trackFilterCombo({ make: "Honda" }, 10);
    trackFilterEngagement({ make: "Honda" });

    const all = getAllFilterCombos();
    expect(all[0].engagement_rate).toBe(0.5); // 1 engagement / 2 searches
  });

  it("no-ops for untracked filter combo", () => {
    // Should not throw
    trackFilterEngagement({ make: "Ferrari" });

    const all = getAllFilterCombos();
    expect(all.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getTopFilterCombos                                                          */
/* -------------------------------------------------------------------------- */

describe("getTopFilterCombos", () => {
  it("returns combos sorted by engagement count", () => {
    trackFilterCombo({ make: "Honda" }, 10);
    trackFilterCombo({ make: "Toyota" }, 10);
    trackFilterCombo({ make: "Ford" }, 10);

    trackFilterEngagement({ make: "Ford" });
    trackFilterEngagement({ make: "Ford" });
    trackFilterEngagement({ make: "Ford" });
    trackFilterEngagement({ make: "Toyota" });

    const top = getTopFilterCombos(3);
    expect(top[0].filters.make).toBe("Ford");
    expect(top[1].filters.make).toBe("Toyota");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      trackFilterCombo({ make: `Make${i}` }, 5);
    }

    const top = getTopFilterCombos(3);
    expect(top.length).toBe(3);
  });

  it("returns empty array when no data", () => {
    expect(getTopFilterCombos()).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* getZeroResultGaps                                                           */
/* -------------------------------------------------------------------------- */

describe("getZeroResultGaps", () => {
  it("returns only combos with zero results", () => {
    trackFilterCombo({ make: "Honda" }, 10);
    trackFilterCombo({ make: "Lamborghini" }, 0);
    trackFilterCombo({ body_type: "Flying" }, 0);

    const gaps = getZeroResultGaps();
    expect(gaps.length).toBe(2);
    expect(gaps.every((g) => g.zero_result === true)).toBe(true);
  });

  it("sorts by search_count descending (most-searched gaps first)", () => {
    trackFilterCombo({ make: "Rare1" }, 0);
    trackFilterCombo({ make: "Rare2" }, 0);
    trackFilterCombo({ make: "Rare2" }, 0); // searched twice

    const gaps = getZeroResultGaps();
    expect(gaps[0].filters.make).toBe("Rare2");
    expect(gaps[0].search_count).toBe(2);
  });

  it("includes suggested page title", () => {
    trackFilterCombo({ make: "Honda", body_type: "SUV", max_price: "25000" }, 0);

    const gaps = getZeroResultGaps();
    expect(gaps[0].suggested_page_title).toBeDefined();
    expect(gaps[0].suggested_page_title).toContain("Honda");
  });

  it("returns empty array when no zero-result combos", () => {
    trackFilterCombo({ make: "Honda" }, 10);
    expect(getZeroResultGaps()).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* getLowEngagementCombos                                                      */
/* -------------------------------------------------------------------------- */

describe("getLowEngagementCombos", () => {
  it("returns combos with high searches but low engagement", () => {
    // Honda: 10 searches, 0 engagement
    for (let i = 0; i < 10; i++) {
      trackFilterCombo({ make: "Honda" }, 5);
    }

    // Toyota: 10 searches, 5 engagements (50% rate)
    for (let i = 0; i < 10; i++) {
      trackFilterCombo({ make: "Toyota" }, 5);
    }
    for (let i = 0; i < 5; i++) {
      trackFilterEngagement({ make: "Toyota" });
    }

    const low = getLowEngagementCombos(5, 0.1);
    expect(low.length).toBe(1);
    expect(low[0].filters.make).toBe("Honda");
  });

  it("respects minSearches threshold", () => {
    trackFilterCombo({ make: "Honda" }, 5); // Only 1 search
    trackFilterCombo({ make: "Honda" }, 5); // 2 searches

    const low = getLowEngagementCombos(5, 0.1);
    expect(low.length).toBe(0); // Only 2 searches, below threshold of 5
  });
});

/* -------------------------------------------------------------------------- */
/* buildPopularComboEvents                                                     */
/* -------------------------------------------------------------------------- */

describe("buildPopularComboEvents", () => {
  it("builds event payloads with rank", () => {
    trackFilterCombo({ make: "Honda" }, 5);
    trackFilterCombo({ make: "Toyota" }, 5);
    trackFilterEngagement({ make: "Toyota" });

    const events = buildPopularComboEvents(2);
    expect(events.length).toBe(2);
    expect(events[0].rank).toBe(1);
    expect(events[1].rank).toBe(2);
    expect(events[0].filters.make).toBe("Toyota"); // Toyota has engagement
  });

  it("includes search_count in payload", () => {
    trackFilterCombo({ make: "Honda" }, 5);
    trackFilterCombo({ make: "Honda" }, 5);

    const events = buildPopularComboEvents();
    expect(events[0].search_count).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* clearFilterCombos                                                           */
/* -------------------------------------------------------------------------- */

describe("clearFilterCombos", () => {
  it("removes all stored combos", () => {
    trackFilterCombo({ make: "Honda" }, 10);
    trackFilterCombo({ make: "Toyota" }, 5);
    expect(getAllFilterCombos().length).toBe(2);

    clearFilterCombos();
    expect(getAllFilterCombos().length).toBe(0);
  });
});
