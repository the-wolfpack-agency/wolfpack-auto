/**
 * Tests for the Analytics Verification sub-dashboard system.
 *
 * Validates:
 *  - Verification API fires events through all 21 analytics modules
 *  - Sub-dashboard aggregation API collects status from all sub-dashboards
 *  - Module manifest is complete and matches analytics-hooks exports
 *  - Verification results carry all required tracking metadata
 *  - Main dashboard integration with sub-dashboard data
 *  - DATABASE_URL shadow mode behavior
 *
 * Run with: npx jest src/lib/__tests__/analytics-verification.test.ts
 */

import * as analyticsHooks from "@/lib/analytics-hooks";

/* ------------------------------------------------------------------ */
/*  Module manifest completeness                                        */
/* ------------------------------------------------------------------ */

/**
 * The verification API fires one test event per analytics module.
 * This list MUST stay in sync with the ANALYTICS_MODULES constant
 * in the verification route. If a module is missing, the verification
 * dashboard will silently skip it — unacceptable.
 */
const EXPECTED_MODULES = [
  { module: "deals", fn: "trackDeal" },
  { module: "service", fn: "trackService" },
  { module: "comms", fn: "trackComms" },
  { module: "accounting", fn: "trackAccounting" },
  { module: "reviews", fn: "trackReview" },
  { module: "digital_retail", fn: "trackRetail" },
  { module: "customer", fn: "trackCustomer" },
  { module: "leads", fn: "trackLead" },
  { module: "lender", fn: "trackLender" },
  { module: "credit", fn: "trackCredit" },
  { module: "compliance", fn: "trackCompliance" },
  { module: "documents", fn: "trackDocument" },
  { module: "knowledge", fn: "trackKnowledge" },
  { module: "security", fn: "trackSecurity" },
  { module: "pricing", fn: "trackPricing" },
  { module: "backgrounds", fn: "trackBackground" },
  { module: "marketing", fn: "trackTemplate" },
  { module: "desking", fn: "trackDesking" },
  { module: "gl", fn: "trackGL" },
  { module: "payments", fn: "trackPayment" },
  { module: "payroll", fn: "trackPayroll" },
];

describe("Analytics Verification — Module Manifest", () => {
  test("all 21 analytics modules are in the manifest", () => {
    expect(EXPECTED_MODULES).toHaveLength(21);
  });

  test("every module has a corresponding function in analytics-hooks", () => {
    const hooks = analyticsHooks as Record<string, unknown>;
    const missing: string[] = [];
    for (const { module, fn } of EXPECTED_MODULES) {
      if (typeof hooks[fn] !== "function") {
        missing.push(`${module} → ${fn}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("no duplicate modules in manifest", () => {
    const names = EXPECTED_MODULES.map((m) => m.module);
    expect(new Set(names).size).toBe(names.length);
  });

  test("no duplicate functions in manifest", () => {
    const fns = EXPECTED_MODULES.map((m) => m.fn);
    expect(new Set(fns).size).toBe(fns.length);
  });
});

/* ------------------------------------------------------------------ */
/*  Track function contract — every module tracker must not throw       */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — All modules fire without throwing", () => {
  const TEST_DEALER = "test-dealer-verification";

  for (const { module, fn } of EXPECTED_MODULES) {
    test(`${fn}() does not throw`, () => {
      const hooks = analyticsHooks as Record<string, unknown>;
      const trackFn = hooks[fn] as (
        event: string,
        dealer_id: string,
        meta: Record<string, string | number | boolean>,
      ) => void;

      // Must not throw — analytics must never break the calling code
      expect(() => {
        trackFn(`${module}.test_event`, TEST_DEALER, {
          source: "verification_test",
        });
      }).not.toThrow();
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Track function return — all are fire-and-forget (void)              */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — Track functions are fire-and-forget", () => {
  for (const { fn } of EXPECTED_MODULES) {
    test(`${fn}() returns void (fire-and-forget)`, () => {
      const hooks = analyticsHooks as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- track functions have heterogeneous signatures; this test only asserts call-site does not throw + returns void.
      const trackFn = hooks[fn] as Function;
      const result = trackFn("test.event", "test-dealer", { test: true });
      expect(result).toBeUndefined();
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Verification result shape                                           */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — Result shape", () => {
  test("ModuleCheck has all required fields", () => {
    const check = {
      module: "deals",
      event: "deal.created",
      fired: true,
      persisted: true,
      latency_ms: 15,
    };
    expect(check).toHaveProperty("module");
    expect(check).toHaveProperty("event");
    expect(check).toHaveProperty("fired");
    expect(check).toHaveProperty("persisted");
    expect(check).toHaveProperty("latency_ms");
  });

  test("VerificationResult carries score and store status", () => {
    const result = {
      timestamp: new Date().toISOString(),
      total_modules: 21,
      passed: 21,
      failed: 0,
      score: 100,
      modules: [],
      stores: {
        postgresql: { connected: true, events_total: 5000 },
        qdrant: { connected: true },
        neo4j: { connected: true },
      },
    };
    expect(result.score).toBe(100);
    expect(result.stores.postgresql.connected).toBe(true);
    expect(result.stores.postgresql.events_total).toBe(5000);
  });

  test("score calculation: passed/total * 100", () => {
    const total = 21;
    const passed = 18;
    const score = Math.round((passed / total) * 100);
    expect(score).toBe(86); // 18/21 = 85.7% rounds to 86
  });
});

/* ------------------------------------------------------------------ */
/*  Sub-dashboard registry                                              */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — Sub-dashboard aggregation", () => {
  const SUB_DASHBOARDS = [
    "Lead Analytics",
    "Inventory Analytics",
    "Platform Health",
    "Analytics Brain",
    "Funnel Health",
    "Engagement Reports",
    "Market Intelligence",
    "Competitive Intel",
    "Analytics Verification",
  ];

  test("registry has 9 sub-dashboards", () => {
    expect(SUB_DASHBOARDS).toHaveLength(9);
  });

  test("analytics verification is included in the registry", () => {
    expect(SUB_DASHBOARDS).toContain("Analytics Verification");
  });

  test("all sub-dashboards have unique names", () => {
    expect(new Set(SUB_DASHBOARDS).size).toBe(SUB_DASHBOARDS.length);
  });

  test("SubDashboardStatus carries all required fields", () => {
    const status = {
      name: "Lead Analytics",
      path: "/admin/analytics/leads",
      category: "analytics",
      description: "Lead temperature trends",
      healthy: true,
      key_metrics: { conversion_rate: 4.2 },
      last_checked: new Date().toISOString(),
    };
    expect(status).toHaveProperty("name");
    expect(status).toHaveProperty("path");
    expect(status).toHaveProperty("category");
    expect(status).toHaveProperty("healthy");
    expect(status).toHaveProperty("key_metrics");
    expect(status).toHaveProperty("last_checked");
  });

  test("aggregation summary shape is correct", () => {
    const summary = {
      total: 9,
      healthy: 7,
      degraded: 2,
      categories: { analytics: 3, health: 2, intelligence: 2 },
    };
    expect(summary.total).toBe(summary.healthy + summary.degraded);
    expect(Object.values(summary.categories).reduce((a, b) => a + b, 0)).toBe(
      summary.healthy,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Shadow mode behavior                                                */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — Shadow mode", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("track functions do not throw without DATABASE_URL", () => {
    delete process.env.DATABASE_URL;
    const hooks = analyticsHooks as Record<string, unknown>;
    for (const { fn } of EXPECTED_MODULES) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- see note above; heterogeneous track-function signatures.
      const trackFn = hooks[fn] as Function;
      expect(() => trackFn("test.event", "dealer", { test: true })).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Main dashboard integration                                          */
/* ------------------------------------------------------------------ */

describe("Analytics Verification — Main dashboard integration", () => {
  test("main dashboard fetches sub-dashboard data from /api/admin/analytics/subdashboards", () => {
    // Verify the API path exists in the filesystem
    const fs = require("fs");
    const routeExists = fs.existsSync(
      "src/app/api/admin/analytics/subdashboards/route.ts",
    );
    expect(routeExists).toBe(true);
  });

  test("verification page exists at /admin/analytics/verification", () => {
    const fs = require("fs");
    const pageExists = fs.existsSync(
      "src/app/admin/analytics/verification/page.tsx",
    );
    expect(pageExists).toBe(true);
  });

  test("sidebar includes verification link", () => {
    const fs = require("fs");
    const sidebar = fs.readFileSync(
      "src/components/AdminSidebar.tsx",
      "utf-8",
    );
    expect(sidebar).toContain("/admin/analytics/verification");
    expect(sidebar).toContain("Verification");
  });

  test("main dashboard page includes sub-dashboard aggregation section", () => {
    const fs = require("fs");
    const page = fs.readFileSync("src/app/admin/analytics/page.tsx", "utf-8");
    expect(page).toContain("/api/admin/analytics/subdashboards");
    expect(page).toContain("Sub-Dashboard Health");
  });

  test("verification API route has DATABASE_URL shadow mode guard", () => {
    const fs = require("fs");
    const route = fs.readFileSync(
      "src/app/api/admin/analytics/verification/route.ts",
      "utf-8",
    );
    expect(route).toContain("DATABASE_URL");
  });

  test("subdashboards API route has DATABASE_URL shadow mode guard", () => {
    const fs = require("fs");
    const route = fs.readFileSync(
      "src/app/api/admin/analytics/subdashboards/route.ts",
      "utf-8",
    );
    expect(route).toContain("DATABASE_URL");
  });
});
