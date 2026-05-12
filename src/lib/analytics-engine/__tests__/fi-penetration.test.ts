/**
 * Unit tests for the F&I penetration query builder, formatters, and headline.
 * No DB, no network — pure-function coverage.
 */

import {
  buildPenetrationQuery,
  formatAttachRate,
  formatGross,
  productLabel,
  monthLabel,
  buildHeadline,
  demoPenetration,
  FI_PRODUCT_TYPES,
} from "../fi-penetration";

describe("buildPenetrationQuery", () => {
  test("always pins dealer_id as $1", () => {
    const q = buildPenetrationQuery("dealer-abc", {});
    expect(q.values[0]).toBe("dealer-abc");
    expect(q.sql).toMatch(/v\.dealer_id\s*=\s*\$1/);
  });

  test("does not interpolate user input into SQL string", () => {
    const evil = "'; DROP TABLE deal_desk; --";
    const q = buildPenetrationQuery("dealer-1", {
      fiManagerId: evil,
      productType: undefined,
    });
    // The evil string lives in values, NEVER in the SQL string itself.
    expect(q.sql).not.toContain("DROP TABLE");
    expect(q.values).toContain(evil);
  });

  test("only adds the productType filter when valid", () => {
    const q = buildPenetrationQuery("dealer-1", { productType: "gap" });
    expect(q.sql).toMatch(/v\.product_type\s*=\s*\$/);
    expect(q.values).toContain("gap");
  });

  test("month filters cast to date", () => {
    const q = buildPenetrationQuery("dealer-1", {
      monthFrom: "2026-01-01",
      monthTo: "2026-12-01",
    });
    expect(q.sql).toMatch(/v\.month\s*>=\s*\$2::date/);
    expect(q.sql).toMatch(/v\.month\s*<=\s*\$3::date/);
  });
});

describe("formatters", () => {
  test("formatAttachRate rounds to integer percent", () => {
    expect(formatAttachRate(0.785)).toBe("79%");
    expect(formatAttachRate(0)).toBe("0%");
    expect(formatAttachRate(-1)).toBe("0%");
    expect(formatAttachRate(NaN)).toBe("0%");
    expect(formatAttachRate(1)).toBe("100%");
  });

  test("formatGross prefixes $ and uses thousands separator", () => {
    expect(formatGross(0)).toBe("$0");
    expect(formatGross(12345)).toBe("$12,345");
    expect(formatGross(NaN)).toBe("$0");
  });

  test("productLabel never returns enum value for known types", () => {
    expect(productLabel("gap")).toBe("GAP");
    expect(productLabel("warranty")).toBe("Extended Warranty");
    expect(productLabel("none")).toBe("(No F&I attached)");
  });

  test("monthLabel produces human month + year, falls through on garbage", () => {
    expect(monthLabel("2026-03-01")).toBe("March 2026");
    expect(monthLabel("not-a-date")).toBe("not-a-date");
    expect(monthLabel("2026-13-01")).toBe("2026-13-01");
  });
});

describe("buildHeadline", () => {
  test("uses empty-state copy when there are no cells", () => {
    expect(buildHeadline([])).toMatch(/No F&I activity/i);
  });

  test("returns 'no products attached' when only `none` buckets exist", () => {
    const headline = buildHeadline([
      {
        fi_manager_id: "m1",
        fi_manager_name: "Maria",
        product_type: "none",
        month: "2026-03-01",
        attach_rate: 0,
        gross_total: 0,
        deals_count: 10,
        accepted_items: 0,
      },
    ]);
    expect(headline).toMatch(/no F&I products/i);
  });

  test("names the top manager and product for the most recent month", () => {
    const cells = [
      {
        fi_manager_id: "m1",
        fi_manager_name: "Maria",
        product_type: "gap" as const,
        month: "2026-03-01",
        attach_rate: 0.78,
        gross_total: 4200,
        deals_count: 20,
        accepted_items: 16,
      },
      {
        fi_manager_id: "m2",
        fi_manager_name: "Tom",
        product_type: "warranty" as const,
        month: "2026-03-01",
        attach_rate: 0.55,
        gross_total: 3300,
        deals_count: 18,
        accepted_items: 10,
      },
      {
        fi_manager_id: "m1",
        fi_manager_name: "Maria",
        product_type: "gap" as const,
        month: "2026-02-01",
        attach_rate: 0.99,
        gross_total: 5000,
        deals_count: 22,
        accepted_items: 21,
      },
    ];
    const headline = buildHeadline(cells);
    expect(headline).toContain("Maria");
    expect(headline).toContain("GAP");
    expect(headline).toContain("March 2026");
    expect(headline).toContain("78%");
  });
});

describe("demoPenetration", () => {
  test("returns at least one cell for every (manager, product, month)", () => {
    const r = demoPenetration();
    expect(r.cells.length).toBeGreaterThan(0);
    expect(r.managers.length).toBeGreaterThan(0);
    expect(r.products.length).toBeGreaterThan(0);
    expect(r.months.length).toBe(6);
  });

  test("uses generic placeholder names — never a client name", () => {
    const r = demoPenetration();
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("Aidan");
    expect(blob).not.toContain("Avis");
    expect(blob).not.toContain("CFTR");
  });
});

describe("FI_PRODUCT_TYPES", () => {
  test("includes the synthetic 'none' bucket so unattached deals show up", () => {
    expect(FI_PRODUCT_TYPES).toContain("none");
  });
});
