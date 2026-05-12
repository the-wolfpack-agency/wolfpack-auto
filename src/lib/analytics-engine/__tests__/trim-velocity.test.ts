/**
 * Trim-velocity engine tests — pure ranking + formatting + demo data.
 *
 * DB-backed paths (getTrimVelocity / getTrimVelocityDrillDown) are exercised
 * with DATABASE_URL unset (shadow mode) so the test runs without Postgres.
 */

import {
  rankTrimRows,
  trimLabel,
  formatHeadline,
  formatSummaryHeadline,
  getDemoTrimVelocity,
  getTrimVelocity,
  getTrimVelocityDrillDown,
  type TrimVelocityRow,
} from "@/lib/analytics-engine/trim-velocity";

/* ------------------------------------------------------------------------ */
/*  Fixtures                                                                  */
/* ------------------------------------------------------------------------ */

function mkRow(over: Partial<TrimVelocityRow>): TrimVelocityRow {
  return {
    dealer_id: "demo-dealer",
    make: "Toyota",
    model: "RAV4",
    trim: "LE",
    year: 2025,
    listed_count: 5,
    funded_count: 5,
    avg_days_to_sell: 20,
    median_days_to_sell: 20,
    avg_gross_profit: 2500,
    avg_current_days_on_lot: 15,
    ...over,
  };
}

/* ------------------------------------------------------------------------ */
/*  trimLabel                                                                 */
/* ------------------------------------------------------------------------ */

describe("trimLabel", () => {
  it("combines year, make, model, and trim", () => {
    expect(trimLabel({ make: "Toyota", model: "RAV4", trim: "XLE Hybrid", year: 2026 })).toBe(
      "2026 Toyota RAV4 XLE Hybrid",
    );
  });

  it("omits empty trim cleanly", () => {
    expect(trimLabel({ make: "Honda", model: "Civic", trim: "", year: 2024 })).toBe(
      "2024 Honda Civic",
    );
  });
});

/* ------------------------------------------------------------------------ */
/*  formatHeadline — plain English copy                                       */
/* ------------------------------------------------------------------------ */

describe("formatHeadline", () => {
  it("uses funded data when available", () => {
    const row = mkRow({ trim: "XLE Hybrid", year: 2026, funded_count: 5, avg_days_to_sell: 11.4 });
    expect(formatHeadline(row)).toBe("Your 2026 Toyota RAV4 XLE Hybrid sells in 11 days.");
  });

  it("uses singular noun when 1 day", () => {
    const row = mkRow({ funded_count: 1, avg_days_to_sell: 1.2 });
    expect(formatHeadline(row)).toContain("sells in 1 day.");
  });

  it("falls back to listed-only copy when no funded deals", () => {
    const row = mkRow({ trim: "SE", year: 2024, funded_count: 0, avg_days_to_sell: null, listed_count: 4, avg_current_days_on_lot: 62 });
    expect(formatHeadline(row)).toBe(
      "Your 2024 Toyota RAV4 SE has 4 units sitting an average of 62 days.",
    );
  });

  it("handles unit singular", () => {
    const row = mkRow({ funded_count: 0, avg_days_to_sell: null, listed_count: 1, avg_current_days_on_lot: 30 });
    expect(formatHeadline(row)).toContain("1 unit sitting");
  });

  it("returns no-data message when truly empty", () => {
    const row = mkRow({ funded_count: 0, listed_count: 0, avg_days_to_sell: null, avg_current_days_on_lot: null });
    expect(formatHeadline(row)).toContain("not enough data yet");
  });
});

/* ------------------------------------------------------------------------ */
/*  formatSummaryHeadline                                                     */
/* ------------------------------------------------------------------------ */

describe("formatSummaryHeadline", () => {
  it("contrasts fastest vs slowest when both are present", () => {
    const fastest = mkRow({ trim: "XLE Hybrid", avg_days_to_sell: 11 });
    const slowest = mkRow({ trim: "XSE Premium", avg_days_to_sell: 47 });
    const out = formatSummaryHeadline(fastest, slowest);
    expect(out).toContain("fastest seller");
    expect(out).toContain("11 days");
    expect(out).toContain("47 days");
  });

  it("handles single-row case", () => {
    const only = mkRow({ avg_days_to_sell: 14 });
    expect(formatSummaryHeadline(only, only)).toContain("14 days");
  });

  it("returns a friendly fallback when there are no rows", () => {
    expect(formatSummaryHeadline(null, null)).toBe("Listing data not available yet.");
  });
});

/* ------------------------------------------------------------------------ */
/*  rankTrimRows                                                              */
/* ------------------------------------------------------------------------ */

describe("rankTrimRows", () => {
  const rows: TrimVelocityRow[] = [
    mkRow({ trim: "A", avg_days_to_sell: 30, funded_count: 2 }),
    mkRow({ trim: "B", avg_days_to_sell: 10, funded_count: 5 }),
    mkRow({ trim: "C", avg_days_to_sell: 20, funded_count: 8 }),
    mkRow({ trim: "D", avg_days_to_sell: null, funded_count: 0 }),
  ];

  it("sorts fastest first by default", () => {
    const ranked = rankTrimRows(rows);
    expect(ranked.map((r) => r.trim)).toEqual(["B", "C", "A"]);
  });

  it("sorts slowest when asked", () => {
    const ranked = rankTrimRows(rows, { sortBy: "slowest" });
    expect(ranked[0].trim).toBe("A");
  });

  it("sorts by funded count", () => {
    const ranked = rankTrimRows(rows, { sortBy: "most-sold" });
    expect(ranked[0].trim).toBe("C");
  });

  it("filters by minFundedCount", () => {
    const ranked = rankTrimRows(rows, { minFundedCount: 6 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].trim).toBe("C");
  });

  it("respects limit", () => {
    const ranked = rankTrimRows(rows, { limit: 2 });
    expect(ranked).toHaveLength(2);
  });

  it("filters out rows with no funded deals (minFunded defaults to 1)", () => {
    const ranked = rankTrimRows(rows);
    expect(ranked.find((r) => r.trim === "D")).toBeUndefined();
  });

  it("returns empty array on empty input", () => {
    expect(rankTrimRows([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/*  getDemoTrimVelocity                                                       */
/* ------------------------------------------------------------------------ */

describe("getDemoTrimVelocity", () => {
  it("returns rows scoped to the requested dealerId", () => {
    const result = getDemoTrimVelocity("dealer-abc");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.dealer_id === "dealer-abc")).toBe(true);
  });

  it("includes a non-empty plain-English headline", () => {
    const result = getDemoTrimVelocity("demo");
    expect(result.headline.length).toBeGreaterThan(0);
    expect(result.headline).toMatch(/seller|day/i);
  });
});

/* ------------------------------------------------------------------------ */
/*  getTrimVelocity — shadow mode                                             */
/* ------------------------------------------------------------------------ */

describe("getTrimVelocity (shadow mode)", () => {
  const originalDb = process.env.DATABASE_URL;
  beforeAll(() => { delete process.env.DATABASE_URL; });
  afterAll(() => { if (originalDb !== undefined) process.env.DATABASE_URL = originalDb; });

  it("returns demo data when DATABASE_URL is unset", async () => {
    const result = await getTrimVelocity("dealer-shadow");
    expect(result.isEmpty).toBe(false);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("throws when dealerId is empty", async () => {
    await expect(getTrimVelocity("")).rejects.toThrow();
  });
});

describe("getTrimVelocityDrillDown (shadow mode)", () => {
  const originalDb = process.env.DATABASE_URL;
  beforeAll(() => { delete process.env.DATABASE_URL; });
  afterAll(() => { if (originalDb !== undefined) process.env.DATABASE_URL = originalDb; });

  it("returns demo drill rows in shadow mode", async () => {
    const result = await getTrimVelocityDrillDown("d", {
      make: "Toyota", model: "RAV4", trim: "XLE Hybrid", year: 2026,
    });
    expect(result.make).toBe("Toyota");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("rejects empty dealerId", async () => {
    await expect(
      getTrimVelocityDrillDown("", { make: "a", model: "b", trim: "c", year: 2025 }),
    ).rejects.toThrow();
  });
});
