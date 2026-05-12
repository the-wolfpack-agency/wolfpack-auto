/**
 * Lead-source ROI engine tests — pure ranking + formatting + demo data.
 *
 * DB-backed paths (getLeadSourceRoi / getLeadSourceDrillDown) are exercised
 * with DATABASE_URL unset (shadow mode) so the test runs without Postgres.
 */

import {
  rankSourceRows,
  sourceLabel,
  formatSourceHeadline,
  formatSummaryHeadline,
  enrichWithCost,
  getDemoLeadSourceRoi,
  getLeadSourceRoi,
  getLeadSourceDrillDown,
  type LeadSourceRoiRow,
} from "@/lib/analytics-engine/lead-source-roi";

function mkRow(over: Partial<LeadSourceRoiRow>): LeadSourceRoiRow {
  return enrichWithCost({
    dealer_id: "d",
    source: "autotrader",
    total_leads: 10,
    funded_deals: 2,
    conversion_rate_pct: 20,
    total_gross_profit: 5000,
    avg_gross_per_deal: 2500,
    avg_days_to_close: 15,
    ...over,
  });
}

/* ------------------------------------------------------------------------ */
/*  sourceLabel                                                               */
/* ------------------------------------------------------------------------ */

describe("sourceLabel", () => {
  it("returns friendly names for known sources", () => {
    expect(sourceLabel("autotrader")).toBe("AutoTrader");
    expect(sourceLabel("cars_com")).toBe("Cars.com");
    expect(sourceLabel("walk_in")).toBe("Walk-in");
    expect(sourceLabel("website_form")).toBe("Website form");
  });

  it("title-cases unknown source codes", () => {
    expect(sourceLabel("my_custom_source")).toBe("My Custom Source");
  });
});

/* ------------------------------------------------------------------------ */
/*  formatSourceHeadline                                                      */
/* ------------------------------------------------------------------------ */

describe("formatSourceHeadline", () => {
  it("includes leads, funded count, and conversion rate", () => {
    const row = mkRow({ source: "autotrader", total_leads: 23, funded_deals: 6, conversion_rate_pct: 26, avg_days_to_close: 18 });
    const out = formatSourceHeadline(row);
    expect(out).toContain("AutoTrader");
    expect(out).toContain("23 leads");
    expect(out).toContain("6 funded");
    expect(out).toContain("26%");
    expect(out).toContain("18 days");
  });

  it("omits close-time when null", () => {
    const row = mkRow({ avg_days_to_close: null });
    expect(formatSourceHeadline(row)).not.toContain("close time");
  });
});

describe("formatSummaryHeadline", () => {
  it("returns fallback when there is no top source", () => {
    expect(formatSummaryHeadline(null)).toContain("Not enough");
  });

  it("highlights gross when there are funded deals", () => {
    const top = mkRow({ source: "referral", total_gross_profit: 21500, funded_deals: 7 });
    const out = formatSummaryHeadline(top);
    expect(out).toContain("Customer referral");
    expect(out).toContain("21,500");
  });

  it("falls back to leads when gross is zero", () => {
    const top = mkRow({ source: "walk_in", total_gross_profit: 0, funded_deals: 0, total_leads: 19 });
    const out = formatSummaryHeadline(top);
    expect(out).toContain("Walk-in");
    expect(out).toContain("19 leads");
  });
});

/* ------------------------------------------------------------------------ */
/*  rankSourceRows                                                            */
/* ------------------------------------------------------------------------ */

describe("rankSourceRows", () => {
  const rows: LeadSourceRoiRow[] = [
    mkRow({ source: "a", total_gross_profit: 1000, conversion_rate_pct: 10, total_leads: 30, avg_days_to_close: 30 }),
    mkRow({ source: "b", total_gross_profit: 5000, conversion_rate_pct: 25, total_leads: 10, avg_days_to_close: 12 }),
    mkRow({ source: "c", total_gross_profit: 3000, conversion_rate_pct: 50, total_leads: 5,  avg_days_to_close: 8 }),
    mkRow({ source: "d", total_leads: 0, funded_deals: 0, total_gross_profit: 0, avg_days_to_close: null }),
  ];

  it("sorts by gross profit by default", () => {
    expect(rankSourceRows(rows).map((r) => r.source)).toEqual(["b", "c", "a"]);
  });

  it("sorts by conversion rate", () => {
    expect(rankSourceRows(rows, { sortBy: "conversion" })[0].source).toBe("c");
  });

  it("sorts by total leads", () => {
    expect(rankSourceRows(rows, { sortBy: "leads" })[0].source).toBe("a");
  });

  it("sorts by time-to-close ascending", () => {
    expect(rankSourceRows(rows, { sortBy: "time-to-close" })[0].source).toBe("c");
  });

  it("filters out rows with no leads at minLeads >= 1", () => {
    expect(rankSourceRows(rows).find((r) => r.source === "d")).toBeUndefined();
  });

  it("respects limit", () => {
    expect(rankSourceRows(rows, { limit: 2 })).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(rankSourceRows([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/*  enrichWithCost                                                            */
/* ------------------------------------------------------------------------ */

describe("enrichWithCost", () => {
  it("returns null cost_per_lead and roi_ratio (no cost data yet)", () => {
    const enriched = enrichWithCost({
      dealer_id: "d", source: "x", total_leads: 5, funded_deals: 1,
      conversion_rate_pct: 20, total_gross_profit: 2000,
      avg_gross_per_deal: 2000, avg_days_to_close: 10,
    });
    expect(enriched.cost_per_lead).toBeNull();
    expect(enriched.roi_ratio).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
/*  getDemoLeadSourceRoi                                                      */
/* ------------------------------------------------------------------------ */

describe("getDemoLeadSourceRoi", () => {
  it("scopes rows to the requested dealerId", () => {
    const result = getDemoLeadSourceRoi("dealer-xyz");
    expect(result.rows.every((r) => r.dealer_id === "dealer-xyz")).toBe(true);
  });

  it("signals cost-not-configured for the demo dataset", () => {
    const result = getDemoLeadSourceRoi("d");
    expect(result.costNotConfigured).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
/*  shadow-mode lib helpers                                                   */
/* ------------------------------------------------------------------------ */

describe("getLeadSourceRoi (shadow mode)", () => {
  const originalDb = process.env.DATABASE_URL;
  beforeAll(() => { delete process.env.DATABASE_URL; });
  afterAll(() => { if (originalDb !== undefined) process.env.DATABASE_URL = originalDb; });

  it("returns rows in shadow mode", async () => {
    const result = await getLeadSourceRoi("d");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("rejects empty dealerId", async () => {
    await expect(getLeadSourceRoi("")).rejects.toThrow();
  });
});

describe("getLeadSourceDrillDown (shadow mode)", () => {
  const originalDb = process.env.DATABASE_URL;
  beforeAll(() => { delete process.env.DATABASE_URL; });
  afterAll(() => { if (originalDb !== undefined) process.env.DATABASE_URL = originalDb; });

  it("returns demo rows for a source in shadow mode", async () => {
    const result = await getLeadSourceDrillDown("d", "autotrader");
    expect(result.source).toBe("autotrader");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("rejects empty dealerId or source", async () => {
    await expect(getLeadSourceDrillDown("", "autotrader")).rejects.toThrow();
    await expect(getLeadSourceDrillDown("d", "")).rejects.toThrow();
  });
});
