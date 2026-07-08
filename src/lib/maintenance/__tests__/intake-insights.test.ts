/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for getMaintenanceIntakeInsights — the learning-aggregator
 * reader that consumes the maintenance.intake.* cycle-time signal from
 * analytics_events. Mocks @/lib/db to pin the SQL scope + result mapping
 * without a live Postgres, and proves the shadow fallback path.
 */

const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));

import { getMaintenanceIntakeInsights } from "@/lib/learning-aggregator";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("getMaintenanceIntakeInsights — DB-backed", () => {
  test("maps aggregate rows into insights + floors open at 0", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          opened: "15",
          resolved: "12",
          avg_cycle: "18.5",
          opened_bugs: "9",
          opened_features: "6",
        },
      ],
    });

    const insights = await getMaintenanceIntakeInsights("wolfpack-maintenance");

    expect(insights.open_requests).toBe(3);
    expect(insights.resolved_requests).toBe(12);
    expect(insights.avg_cycle_time_hours).toBe(18.5);
    expect(insights.by_type).toEqual({ bug: 9, feature: 6 });
    expect(typeof insights.computed_at).toBe("string");

    // Query is scoped to the maintenance module + the passed tenant.
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("event_type = 'maintenance'");
    expect(sql).toContain("cycle_time_hours");
    expect(params).toEqual(["wolfpack-maintenance"]);
  });

  test("never reports negative open backlog", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { opened: "2", resolved: "5", avg_cycle: "0", opened_bugs: "2", opened_features: "0" },
      ],
    });
    const insights = await getMaintenanceIntakeInsights();
    expect(insights.open_requests).toBe(0);
  });

  test("falls back to shadow insights when the query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    const insights = await getMaintenanceIntakeInsights();
    expect(insights.resolved_requests).toBeGreaterThan(0);
    expect(insights.by_type).toHaveProperty("bug");
  });
});

describe("getMaintenanceIntakeInsights — shadow mode", () => {
  test("returns shadow insights without querying when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const insights = await getMaintenanceIntakeInsights();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(insights.avg_cycle_time_hours).toBeGreaterThan(0);
  });
});
