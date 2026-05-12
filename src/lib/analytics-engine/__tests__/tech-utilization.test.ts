/**
 * Unit tests for tech utilization query builder, formatters, headline, demo.
 */

import {
  buildUtilizationQuery,
  formatUtilization,
  formatHours,
  weekLabel,
  buildUtilizationHeadline,
  demoUtilization,
} from "../tech-utilization";

describe("buildUtilizationQuery", () => {
  test("dealer_id is always $1", () => {
    const q = buildUtilizationQuery("dealer-1", {});
    expect(q.values[0]).toBe("dealer-1");
    expect(q.sql).toMatch(/v\.dealer_id\s*=\s*\$1/);
  });

  test("does not interpolate user input — payloads stay in values", () => {
    const evil = "'; DROP TABLE repair_orders; --";
    const q = buildUtilizationQuery("dealer-1", { bayId: evil });
    expect(q.sql).not.toContain("DROP TABLE");
    expect(q.values).toContain(evil);
  });

  test("filters cast week to date and tech to uuid", () => {
    const q = buildUtilizationQuery("dealer-1", {
      weekFrom: "2026-05-04",
      weekTo: "2026-05-11",
      techId: "11111111-1111-4111-a111-111111111111",
    });
    expect(q.sql).toMatch(/v\.week_start\s*>=\s*\$2::date/);
    expect(q.sql).toMatch(/v\.week_start\s*<=\s*\$3::date/);
    expect(q.sql).toMatch(/v\.tech_id\s*=\s*\$4::uuid/);
  });
});

describe("formatters", () => {
  test("formatUtilization allows >100%", () => {
    expect(formatUtilization(1.17)).toBe("117%");
    expect(formatUtilization(0)).toBe("0%");
    expect(formatUtilization(NaN)).toBe("0%");
    expect(formatUtilization(-0.2)).toBe("0%");
  });

  test("formatHours uses one decimal", () => {
    expect(formatHours(40)).toBe("40.0h");
    expect(formatHours(0)).toBe("0h");
    expect(formatHours(NaN)).toBe("0h");
  });

  test("weekLabel reads YYYY-MM-DD into 'week of Mon D'", () => {
    expect(weekLabel("2026-05-04")).toBe("week of May 4");
    expect(weekLabel("garbage")).toBe("garbage");
  });
});

describe("buildUtilizationHeadline", () => {
  test("empty-state copy when no cells", () => {
    expect(buildUtilizationHeadline([])).toMatch(/no repair orders/i);
  });

  test("clock-on-no-billed copy when techs present but zero hours", () => {
    expect(
      buildUtilizationHeadline([
        {
          tech_id: "t1",
          tech_name: "Sam",
          bay_id: "A1",
          week_start: "2026-05-04",
          hours_billed: 0,
          hours_available: 40,
          utilization: 0,
          ro_count: 0,
          labor_revenue: 0,
        },
      ]),
    ).toMatch(/on the clock but no labor hours/i);
  });

  test("names the latest-week leader by utilization", () => {
    const cells = [
      {
        tech_id: "t1",
        tech_name: "Sam",
        bay_id: "A1",
        week_start: "2026-05-04",
        hours_billed: 36,
        hours_available: 40,
        utilization: 0.9,
        ro_count: 12,
        labor_revenue: 5200,
      },
      {
        tech_id: "t2",
        tech_name: "Devon",
        bay_id: "B1",
        week_start: "2026-05-04",
        hours_billed: 28,
        hours_available: 40,
        utilization: 0.7,
        ro_count: 9,
        labor_revenue: 4060,
      },
      {
        tech_id: "t1",
        tech_name: "Sam",
        bay_id: "A1",
        week_start: "2026-04-27",
        hours_billed: 39,
        hours_available: 40,
        utilization: 0.975,
        ro_count: 14,
        labor_revenue: 5650,
      },
    ];
    const headline = buildUtilizationHeadline(cells);
    expect(headline).toContain("Sam");
    expect(headline).toContain("36.0h");
    expect(headline).toContain("90%");
    expect(headline).toContain("week of May 4");
    expect(headline).toContain("bay A1");
  });
});

describe("demoUtilization", () => {
  test("yields 3 techs * 3 bays * 8 weeks of cells", () => {
    const r = demoUtilization();
    expect(r.techs.length).toBe(3);
    expect(r.bays.filter((b) => b !== null).length).toBe(3);
    expect(r.weeks.length).toBe(8);
    expect(r.cells.length).toBe(3 * 3 * 8);
  });

  test("never embeds a client name", () => {
    const blob = JSON.stringify(demoUtilization());
    expect(blob).not.toContain("Aidan");
    expect(blob).not.toContain("CFTR");
    expect(blob).not.toContain("Avis");
  });

  test("flags hoursAvailableFromConstant=true so UI can disclose the assumption", () => {
    expect(demoUtilization().hoursAvailableFromConstant).toBe(true);
  });
});
