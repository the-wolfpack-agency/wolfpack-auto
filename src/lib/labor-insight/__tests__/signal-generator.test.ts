/**
 * Unit tests for the pure labor-insight generator.
 *
 * Covers the two headline insights in dealership language, plus graceful
 * degradation: no fabricated numbers when the data is thin, and the
 * "up N points" clause only when a prior period exists.
 */

import { generateLaborInsights } from "@/lib/labor-insight/signal-generator";
import type {
  LaborInsightInput,
  LaborLedgerSummary,
  LaborPersonStat,
} from "@/lib/labor-insight/types";

function person(
  i: number,
  billedHours: number,
  overtimePay = 0,
  overtimeHours = 0,
): LaborPersonStat {
  return {
    employeeId: `e${i}`,
    employeeName: `Person ${i}`,
    department: "service",
    billedHours,
    overtimeHours,
    overtimePay,
    grossPay: billedHours * 30 + overtimePay,
  };
}

const EMPTY_LEDGER: LaborLedgerSummary = {
  grossProfit: 0,
  laborCost: 0,
  overtimeCost: 0,
  headcount: 0,
  priorLaborPct: null,
  priorHeadcount: null,
};

function input(over: Partial<LaborInsightInput>): LaborInsightInput {
  return {
    dealerId: "dealer-1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-13",
    people: [],
    ledger: EMPTY_LEDGER,
    ...over,
  };
}

describe("commission / hours concentration", () => {
  test("flags a minority carrying the majority of billed hours + overtime", () => {
    // 3 of 12 carry 60% of hours (60+52+44 of 260), $610 overtime.
    const hours = [60, 52, 44, 18, 16, 14, 12, 11, 10, 9, 8, 6];
    const ot = [240, 200, 150, 20, 0, 0, 0, 0, 0, 0, 0, 0];
    const people = hours.map((h, i) => person(i, h, ot[i]));

    const insights = generateLaborInsights(input({ people }));
    const concentration = insights.find((i) => i.kind === "commission_concentration");

    expect(concentration).toBeDefined();
    expect(concentration!.insight).toBe(
      "3 of your 12 people carry 60% of billed hours and drove $610 in overtime last period.",
    );
    expect(concentration!.severity).toBe("action");
    expect(concentration!.sample_size).toBe(12);
    expect(concentration!.data.concentrated).toBe(true);
    expect((concentration!.data.top_people as unknown[]).length).toBe(3);
  });

  test("says work is spread evenly when it is (no invented skew)", () => {
    const people = Array.from({ length: 10 }, (_, i) => person(i, 20));
    const insights = generateLaborInsights(input({ people }));
    const concentration = insights.find((i) => i.kind === "commission_concentration");

    expect(concentration).toBeDefined();
    expect(concentration!.data.concentrated).toBe(false);
    expect(concentration!.severity).toBe("info");
    expect(concentration!.insight).toMatch(/spread evenly/i);
  });

  test("degrades to nothing when there are fewer than 3 people", () => {
    const insights = generateLaborInsights(input({ people: [person(1, 40), person(2, 30)] }));
    expect(insights.find((i) => i.kind === "commission_concentration")).toBeUndefined();
  });
});

describe("labor cost vs margin", () => {
  test("reports the point change and attributes it to overtime, not headcount", () => {
    const ledger: LaborLedgerSummary = {
      grossProfit: 420_000,
      laborCost: 92_400, // 22% of gross profit
      overtimeCost: 610,
      headcount: 12,
      priorLaborPct: 18, // up 4 points
      priorHeadcount: 12, // headcount flat
    };
    const insights = generateLaborInsights(input({ ledger }));
    const margin = insights.find((i) => i.kind === "labor_cost_vs_margin");

    expect(margin).toBeDefined();
    expect(margin!.insight).toBe(
      "Labor is 22% of your gross profit, up 4 points; the extra came from overtime, not headcount.",
    );
    expect(margin!.severity).toBe("action");
    expect(margin!.data.labor_pct).toBe(22);
    expect(margin!.data.delta_points).toBe(4);
  });

  test("attributes a rise to headcount when the team grew", () => {
    const ledger: LaborLedgerSummary = {
      grossProfit: 420_000,
      laborCost: 92_400,
      overtimeCost: 100,
      headcount: 15,
      priorLaborPct: 18,
      priorHeadcount: 12,
    };
    const margin = generateLaborInsights(input({ ledger })).find(
      (i) => i.kind === "labor_cost_vs_margin",
    );
    expect(margin!.insight).toMatch(/the extra came from added headcount/);
  });

  test("degrades to the current level when there is no prior period", () => {
    const ledger: LaborLedgerSummary = {
      grossProfit: 420_000,
      laborCost: 92_400,
      overtimeCost: 0,
      headcount: 12,
      priorLaborPct: null,
      priorHeadcount: null,
    };
    const margin = generateLaborInsights(input({ ledger })).find(
      (i) => i.kind === "labor_cost_vs_margin",
    );
    expect(margin).toBeDefined();
    expect(margin!.insight).toMatch(/running at 22% of your gross profit this period/);
    expect(margin!.insight).not.toMatch(/up \d/);
    expect(margin!.data.delta_points).toBeNull();
  });

  test("emits nothing when there is no margin or labor cost to cross", () => {
    expect(
      generateLaborInsights(input({ ledger: EMPTY_LEDGER })).find(
        (i) => i.kind === "labor_cost_vs_margin",
      ),
    ).toBeUndefined();
  });
});

describe("thin data overall", () => {
  test("returns an empty list (explicit empty state) when nothing is supported", () => {
    expect(generateLaborInsights(input({}))).toEqual([]);
  });
});
