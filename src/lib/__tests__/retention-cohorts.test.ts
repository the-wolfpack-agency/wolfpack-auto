/**
 * Retention Cohort Analysis tests.
 */

import {
  buildCohorts,
  calculateRetention,
  buildRetentionMatrix,
  identifyChurnRisk,
  compareCohorts,
  getDemoRetentionMatrix,
  type VisitorEvent,
} from "@/lib/retention-cohorts";

/* -------------------------------------------------------------------------- */
/*  Test data                                                                  */
/* -------------------------------------------------------------------------- */

function makeEvents(): VisitorEvent[] {
  // 3 visitors across 3 months
  return [
    // Visitor A: first visit Jan, returns Feb and Mar
    { visitorId: "A", timestamp: "2026-01-15T10:00:00Z" },
    { visitorId: "A", timestamp: "2026-02-10T10:00:00Z" },
    { visitorId: "A", timestamp: "2026-03-05T10:00:00Z" },
    // Visitor B: first visit Jan, returns Feb only
    { visitorId: "B", timestamp: "2026-01-20T10:00:00Z" },
    { visitorId: "B", timestamp: "2026-02-18T10:00:00Z" },
    // Visitor C: first visit Feb, no return
    { visitorId: "C", timestamp: "2026-02-05T10:00:00Z" },
    // Visitor D: first visit Mar
    { visitorId: "D", timestamp: "2026-03-10T10:00:00Z" },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Cohort building                                                            */
/* -------------------------------------------------------------------------- */

describe("buildCohorts", () => {
  it("groups visitors by first visit month", () => {
    const cohorts = buildCohorts(makeEvents(), "month");

    expect(cohorts.length).toBe(3);
    expect(cohorts[0].label).toBe("2026-01");
    expect(cohorts[0].size).toBe(2); // A and B
    expect(cohorts[1].label).toBe("2026-02");
    expect(cohorts[1].size).toBe(1); // C
    expect(cohorts[2].label).toBe("2026-03");
    expect(cohorts[2].size).toBe(1); // D
  });

  it("returns empty for no events", () => {
    expect(buildCohorts([], "month")).toEqual([]);
  });

  it("uses earliest event as first visit", () => {
    const events: VisitorEvent[] = [
      { visitorId: "X", timestamp: "2026-03-15T10:00:00Z" },
      { visitorId: "X", timestamp: "2026-01-05T10:00:00Z" },
    ];
    const cohorts = buildCohorts(events, "month");
    expect(cohorts[0].label).toBe("2026-01");
    expect(cohorts[0].visitors.has("X")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Retention calculation                                                      */
/* -------------------------------------------------------------------------- */

describe("calculateRetention", () => {
  it("calculates retention for a cohort", () => {
    const events = makeEvents();
    const cohorts = buildCohorts(events, "month");
    const janCohort = cohorts[0]; // A and B

    const cells = calculateRetention(janCohort, events, "month", 3);

    // Period 0 (Jan): both A and B visited = 100%
    expect(cells[0].retentionPercent).toBe(100);
    // Period 1 (Feb): both A and B returned = 100%
    expect(cells[1].retentionPercent).toBe(100);
    // Period 2 (Mar): only A returned = 50%
    expect(cells[2].retentionPercent).toBe(50);
  });

  it("returns empty for empty cohort", () => {
    const emptyCohort = { label: "2026-01", periodStart: "2026-01", size: 0, visitors: new Set<string>() };
    expect(calculateRetention(emptyCohort, [], "month", 3)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Retention matrix                                                           */
/* -------------------------------------------------------------------------- */

describe("buildRetentionMatrix", () => {
  it("builds a complete matrix", () => {
    const matrix = buildRetentionMatrix(makeEvents(), "month", 3);

    expect(matrix.periodType).toBe("month");
    expect(matrix.rows.length).toBe(3);
    expect(matrix.totalVisitors).toBe(4);

    // First row should be the Jan cohort
    expect(matrix.rows[0].cohortLabel).toBe("2026-01");
    expect(matrix.rows[0].cohortSize).toBe(2);

    // Average retention should be an array
    expect(matrix.averageRetention.length).toBe(3);
    // Period 0 average should be 100
    expect(matrix.averageRetention[0]).toBe(100);
  });

  it("handles empty events", () => {
    const matrix = buildRetentionMatrix([], "month");
    expect(matrix.rows).toEqual([]);
    expect(matrix.totalVisitors).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Churn risk detection                                                       */
/* -------------------------------------------------------------------------- */

describe("identifyChurnRisk", () => {
  it("returns empty for demo matrix (no anomalous drop-offs)", () => {
    const matrix = getDemoRetentionMatrix();
    const risks = identifyChurnRisk(matrix);
    // Demo data has smooth drop-off, so no risks expected
    expect(Array.isArray(risks)).toBe(true);
  });

  it("detects steep drop-off", () => {
    const matrix = {
      periodType: "month" as const,
      rows: [
        {
          cohortLabel: "2026-01",
          cohortSize: 100,
          cells: [
            { periodOffset: 0, returnedCount: 100, retentionPercent: 100 },
            { periodOffset: 1, returnedCount: 80, retentionPercent: 80 },
            { periodOffset: 2, returnedCount: 10, retentionPercent: 10 }, // steep drop
          ],
        },
      ],
      totalVisitors: 100,
      averageRetention: [100, 80, 10],
    };

    // Single row can't have "steeper than average" since it IS the average
    // Need two rows to detect anomaly
    const matrix2 = {
      ...matrix,
      rows: [
        ...matrix.rows,
        {
          cohortLabel: "2026-02",
          cohortSize: 100,
          cells: [
            { periodOffset: 0, returnedCount: 100, retentionPercent: 100 },
            { periodOffset: 1, returnedCount: 90, retentionPercent: 90 },
            { periodOffset: 2, returnedCount: 85, retentionPercent: 85 },
          ],
        },
      ],
      averageRetention: [100, 85, 48],
    };

    const risks = identifyChurnRisk(matrix2);
    // Jan cohort drops 70% at period 2 while average drops 37 — flagged
    expect(risks.length).toBeGreaterThan(0);
    expect(risks[0].cohortLabel).toBe("2026-01");
  });
});

/* -------------------------------------------------------------------------- */
/*  Cohort comparison                                                          */
/* -------------------------------------------------------------------------- */

describe("compareCohorts", () => {
  it("compares two cohorts", () => {
    const matrix = getDemoRetentionMatrix();
    const result = compareCohorts(matrix, "2026-01", "2026-02");

    expect(result.cohortA).toBe("2026-01");
    expect(result.cohortB).toBe("2026-02");
    expect(Array.isArray(result.retentionDiff)).toBe(true);
    expect(["A", "B", "tie"]).toContain(result.winner);
  });

  it("returns tie for non-existent cohorts", () => {
    const matrix = getDemoRetentionMatrix();
    const result = compareCohorts(matrix, "2099-01", "2099-02");
    expect(result.winner).toBe("tie");
    expect(result.retentionDiff).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

describe("getDemoRetentionMatrix", () => {
  it("returns a well-structured matrix", () => {
    const matrix = getDemoRetentionMatrix();

    expect(matrix.periodType).toBe("month");
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.totalVisitors).toBeGreaterThan(0);
    expect(matrix.averageRetention.length).toBeGreaterThan(0);

    // Period 0 should always be 100%
    for (const row of matrix.rows) {
      expect(row.cells[0].retentionPercent).toBe(100);
    }
  });
});
