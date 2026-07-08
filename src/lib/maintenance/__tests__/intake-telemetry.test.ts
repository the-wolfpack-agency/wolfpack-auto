/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit + contract tests for the maintenance-rails intake telemetry layer.
 *
 * Strategy (mirrors src/lib/touchpoints/__tests__/dispatcher.test.ts):
 *   - Mock @/lib/analytics-hooks so we assert the exact maintenance.intake.*
 *     event + metadata shape (including the derived cycle_time_hours signal).
 *   - Mock @/lib/audit-log so we assert an append-only row is written per
 *     lifecycle event with the right action + dealer scope.
 *   - Prove graceful degradation: a throwing analytics/audit write never
 *     throws from recordIntakeEvent, it surfaces in `degraded` instead.
 */

const analyticsCalls: Array<{ event: string; dealerId: string; meta: any }> = [];
const auditCalls: Array<{
  action: string;
  details: any;
  userId: string | undefined;
  dealerId: string | undefined;
}> = [];

let analyticsShouldThrow = false;
let auditShouldThrow = false;

jest.mock("@/lib/analytics-hooks", () => ({
  trackMaintenanceIntake: jest.fn(
    (event: string, dealerId: string, meta: any) => {
      if (analyticsShouldThrow) throw new Error("analytics down");
      analyticsCalls.push({ event, dealerId, meta });
    },
  ),
}));

jest.mock("@/lib/audit-log", () => ({
  auditLog: jest.fn(
    async (action: string, details: any, userId: any, dealerId: any) => {
      if (auditShouldThrow) throw new Error("audit down");
      auditCalls.push({ action, details, userId, dealerId });
    },
  ),
}));

import {
  recordIntakeEvent,
  computeCycleTimeHours,
  MAINTENANCE_TENANT,
  type IntakeLifecycleEvent,
} from "../intake-telemetry";

beforeEach(() => {
  analyticsCalls.length = 0;
  auditCalls.length = 0;
  analyticsShouldThrow = false;
  auditShouldThrow = false;
});

const OPENED_AT = "2026-07-01T00:00:00.000Z";
const RESOLVED_AT = "2026-07-02T12:00:00.000Z"; // +36h

function base(overrides: Partial<IntakeLifecycleEvent> = {}): IntakeLifecycleEvent {
  return {
    issueNumber: 42,
    type: "bug",
    category: "desking-fi",
    action: "opened",
    openedAt: OPENED_AT,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* computeCycleTimeHours                                               */
/* ------------------------------------------------------------------ */

describe("computeCycleTimeHours", () => {
  test("returns hours between open and resolve", () => {
    expect(computeCycleTimeHours(OPENED_AT, RESOLVED_AT)).toBe(36);
  });

  test("returns null when resolvedAt is missing", () => {
    expect(computeCycleTimeHours(OPENED_AT, undefined)).toBeNull();
  });

  test("returns null when dates are unparseable", () => {
    expect(computeCycleTimeHours("not-a-date", RESOLVED_AT)).toBeNull();
  });

  test("returns null when resolved precedes opened (no garbage signal)", () => {
    expect(computeCycleTimeHours(RESOLVED_AT, OPENED_AT)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* recordIntakeEvent — mapping + emitted shape                        */
/* ------------------------------------------------------------------ */

describe("recordIntakeEvent — action -> event mapping", () => {
  test.each([
    ["opened", "maintenance.intake.opened"],
    ["triaged", "maintenance.intake.triaged"],
    ["resolved", "maintenance.intake.resolved"],
  ] as const)("action %s maps to %s", async (action, event) => {
    const res = await recordIntakeEvent(
      base({ action, resolvedAt: action === "resolved" ? RESOLVED_AT : undefined }),
    );
    expect(res.event).toBe(event);
    expect(analyticsCalls[0].event).toBe(event);
    expect(auditCalls[0].action).toBe(event);
  });
});

describe("recordIntakeEvent — emitted analytics shape", () => {
  test("opened event carries structured metadata, no cycle time", async () => {
    const res = await recordIntakeEvent(base({ severity: "sev2-high" }));

    expect(res.ok).toBe(true);
    expect(res.degraded).toEqual([]);
    expect(res.cycleTimeHours).toBeNull();
    expect(res.dealerId).toBe(MAINTENANCE_TENANT);

    expect(analyticsCalls).toHaveLength(1);
    const call = analyticsCalls[0];
    expect(call.dealerId).toBe(MAINTENANCE_TENANT);
    expect(call.meta).toMatchObject({
      issue_number: 42,
      request_type: "bug",
      category: "desking-fi",
      action: "opened",
      opened_at: OPENED_AT,
      severity: "sev2-high",
    });
    expect(call.meta).not.toHaveProperty("cycle_time_hours");
  });

  test("resolved event carries the derived cycle_time_hours learning signal", async () => {
    const res = await recordIntakeEvent(
      base({ type: "feature", action: "resolved", resolvedAt: RESOLVED_AT }),
    );

    expect(res.cycleTimeHours).toBe(36);
    expect(analyticsCalls[0].meta).toMatchObject({
      action: "resolved",
      request_type: "feature",
      resolved_at: RESOLVED_AT,
      cycle_time_hours: 36,
    });
  });

  test("metadata values are all primitives (analytics contract)", async () => {
    await recordIntakeEvent(base({ action: "resolved", resolvedAt: RESOLVED_AT }));
    for (const v of Object.values(analyticsCalls[0].meta)) {
      expect(["string", "number", "boolean"]).toContain(typeof v);
    }
  });

  test("honors an explicit dealer scope when provided", async () => {
    const res = await recordIntakeEvent(base({ dealerId: "dealer-123" }));
    expect(res.dealerId).toBe("dealer-123");
    expect(analyticsCalls[0].dealerId).toBe("dealer-123");
    expect(auditCalls[0].dealerId).toBe("dealer-123");
  });
});

describe("recordIntakeEvent — audit row", () => {
  test("writes one audit row per event with actor + cycle time", async () => {
    await recordIntakeEvent(
      base({ action: "resolved", resolvedAt: RESOLVED_AT, actorId: "octocat" }),
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe("maintenance.intake.resolved");
    expect(auditCalls[0].userId).toBe("octocat");
    expect(auditCalls[0].details).toMatchObject({
      issue_number: 42,
      cycle_time_hours: 36,
    });
  });
});

/* ------------------------------------------------------------------ */
/* recordIntakeEvent — graceful degradation (no data lost = no throw) */
/* ------------------------------------------------------------------ */

describe("recordIntakeEvent — graceful degradation", () => {
  test("analytics failure does not throw; degrades analytics + learning", async () => {
    analyticsShouldThrow = true;
    const res = await recordIntakeEvent(
      base({ action: "resolved", resolvedAt: RESOLVED_AT }),
    );
    expect(res.ok).toBe(false);
    expect(res.degraded).toEqual(expect.arrayContaining(["analytics", "learning"]));
    // Audit still written despite analytics failure.
    expect(auditCalls).toHaveLength(1);
  });

  test("audit failure does not throw; degrades audit only", async () => {
    auditShouldThrow = true;
    const res = await recordIntakeEvent(base());
    expect(res.ok).toBe(false);
    expect(res.degraded).toEqual(["audit"]);
    // Analytics still emitted despite audit failure.
    expect(analyticsCalls).toHaveLength(1);
  });

  test("both subsystems failing still returns a typed result", async () => {
    analyticsShouldThrow = true;
    auditShouldThrow = true;
    const res = await recordIntakeEvent(base());
    expect(res.ok).toBe(false);
    expect(res.event).toBe("maintenance.intake.opened");
    expect(res.degraded).toEqual(expect.arrayContaining(["analytics", "audit"]));
  });
});
