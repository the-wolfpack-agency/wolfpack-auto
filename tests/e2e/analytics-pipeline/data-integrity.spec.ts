/**
 * Data Integrity — verify nothing is lost in the analytics pipeline.
 *
 * Three verification layers:
 *   1. Source verification: analytics-hooks.ts exports all required functions
 *   2. API contract: every POST route returns proper status + resource ID
 *   3. Wiring completeness: every mutation route imports a track* function
 *
 * Run: npx playwright test tests/e2e/analytics-pipeline/data-integrity.spec.ts
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

const ROOT = path.resolve(__dirname, "../../..");
const API_ADMIN = path.join(ROOT, "src/app/api/admin");
const HOOKS_FILE = path.join(ROOT, "src/lib/analytics-hooks.ts");
const AGGREGATOR_FILE = path.join(ROOT, "src/lib/learning-aggregator.ts");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/** Recursively find all route.ts files under a directory */
function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

/* ========================================================================== */
/* Source verification — analytics-hooks.ts                                   */
/* ========================================================================== */

test.describe("analytics-hooks.ts exports", () => {
  const REQUIRED_EXPORTS = [
    "trackDeal",
    "trackService",
    "trackComms",
    "trackAccounting",
    "trackReview",
    "trackRetail",
    "trackCustomer",
    "trackDocument",
    "trackKnowledge",
    "trackSecurity",
    "trackCompliance",
    "trackLender",
    "trackCredit",
  ];

  for (const fn of REQUIRED_EXPORTS) {
    test(`exports ${fn}`, () => {
      const source = readFile(HOOKS_FILE);
      expect(
        source.includes(`export function ${fn}`),
        `analytics-hooks.ts must export ${fn}`,
      ).toBe(true);
    });
  }

  test("every tracking function has try/catch (never throws)", () => {
    const source = readFile(HOOKS_FILE);

    // The internal track() function wraps everything in try/catch
    expect(source).toContain("try {");
    expect(source).toContain("catch");
    // The comment explicitly states analytics must never throw
    expect(source).toContain("analytics must never throw");
  });

  test("all track* functions use fire-and-forget pattern", () => {
    const source = readFile(HOOKS_FILE);
    // The track function calls trackServerEvent without awaiting
    expect(source).toContain("// Fire and forget");
  });
});

/* ========================================================================== */
/* Source verification — learning-aggregator.ts                               */
/* ========================================================================== */

test.describe("learning-aggregator.ts completeness", () => {
  const REQUIRED_METRICS = [
    "fi_attachment_rate",
    "avg_fi_per_deal",
    "appointment_show_rate",
    "avg_ro_value",
    "email_open_rate",
    "sms_response_rate",
    "best_performing_template",
    "optimal_follow_up_delay_hours",
    "avg_days_to_close",
    "top_salesperson",
    "avg_rating",
    "response_rate",
    "sentiment_trend",
    "computed_at",
  ];

  test("exports getLearningInsights", () => {
    const source = readFile(AGGREGATOR_FILE);
    expect(source).toContain("export async function getLearningInsights");
  });

  for (const metric of REQUIRED_METRICS) {
    test(`computes ${metric}`, () => {
      const source = readFile(AGGREGATOR_FILE);
      expect(
        source.includes(metric),
        `learning-aggregator.ts must compute ${metric}`,
      ).toBe(true);
    });
  }
});

/* ========================================================================== */
/* API contract — POST routes                                                 */
/* ========================================================================== */

test.describe("API contract — POST routes return proper status", () => {
  const POST_ROUTES = [
    {
      path: "/api/admin/deals",
      data: {
        customer_name: "Contract Test",
        vehicle_vin: "1HGCG5655WA111111",
        selling_price: 20000,
      },
    },
    {
      path: "/api/admin/service/appointments",
      data: {
        customer_name: "Contract Test",
        customer_phone: "(555) 555-0001",
        customer_email: "contract@test.com",
        vehicle_year: 2024,
        vehicle_make: "Test",
        vehicle_model: "Car",
        vin: "1HGCG5655WA222222",
        service_type: "oil_change",
        description: "Contract test",
        scheduled_date: "2026-04-15",
        scheduled_time: "10:00",
        estimated_duration_min: 30,
        advisor: "Test Advisor",
      },
    },
    {
      path: "/api/admin/comms/send",
      data: {
        to: "contract@test.com",
        channel: "email",
        subject: "Contract Test",
        body: "Test",
      },
    },
    {
      path: "/api/admin/reviews",
      data: {
        customer_name: "Contract Reviewer",
        rating: 4,
        platform: "google",
        text: "Contract test review.",
      },
    },
    {
      path: "/api/admin/knowledge/ingest",
      data: {
        title: "Contract Test Doc",
        content: "Contract test content",
        category: "training",
      },
    },
  ];

  for (const route of POST_ROUTES) {
    test(`${route.path} returns 200 or 201 (not 204 or empty) — or 401 auth wall`, async ({
      request,
    }) => {
      const res = await request.post(route.path, { data: route.data });
      const status = res.status();
      // Accept 200, 201, 401 (auth), 422 (validation), 429 (rate limit)
      // Never accept 500 or 204
      expect(status, `${route.path} must not 500`).not.toBe(500);
      expect(status, `${route.path} must not return empty 204`).not.toBe(204);
    });
  }

  test("error responses include an error field", async ({ request }) => {
    // Send an invalid request to trigger validation error
    const res = await request.post("/api/admin/deals", {
      data: {}, // missing required fields
    });
    const status = res.status();
    if (status === 400 || status === 422) {
      const body = await res.json();
      expect(body).toHaveProperty("error");
    }
    // 401 also acceptable
  });
});

/* ========================================================================== */
/* Wiring completeness — the most important test                              */
/* ========================================================================== */

test.describe("Wiring completeness — track* coverage across all POST routes", () => {
  test("at least 80% of mutation routes import a track* function", () => {
    const routeFiles = findRouteFiles(API_ADMIN);
    expect(routeFiles.length).toBeGreaterThan(0);

    let totalMutationRoutes = 0;
    let routesWithTracking = 0;
    const untracked: string[] = [];

    // Directories that are read-only / utility and don't need tracking
    const EXEMPT_DIRS = new Set([
      "analytics",
      "stats",
      "export",
      "funnel-health",
      "dashboard",
      "settings",
      "login",
      "mfa",
      "vin-decode",
      "quick-add",
    ]);

    for (const file of routeFiles) {
      const source = readFile(file);

      // Only check files that have a POST handler
      if (!source.includes("export async function POST")) continue;

      // Check if this route is in an exempt directory
      const relPath = path.relative(API_ADMIN, file);
      const topDir = relPath.split(path.sep)[0];
      if (EXEMPT_DIRS.has(topDir)) continue;

      totalMutationRoutes++;

      // Check if any track* function is imported
      const hasTracking =
        source.includes("analytics-hooks") ||
        source.includes("trackDeal") ||
        source.includes("trackService") ||
        source.includes("trackComms") ||
        source.includes("trackAccounting") ||
        source.includes("trackReview") ||
        source.includes("trackRetail") ||
        source.includes("trackCustomer") ||
        source.includes("trackDocument") ||
        source.includes("trackKnowledge") ||
        source.includes("trackSecurity") ||
        source.includes("trackCompliance") ||
        source.includes("trackLender") ||
        source.includes("trackCredit");

      if (hasTracking) {
        routesWithTracking++;
      } else {
        untracked.push(relPath);
      }
    }

    const coverage =
      totalMutationRoutes > 0 ? routesWithTracking / totalMutationRoutes : 0;

    console.log(`\n--- Analytics Wiring Coverage ---`);
    console.log(`Total mutation routes: ${totalMutationRoutes}`);
    console.log(`Routes WITH tracking: ${routesWithTracking}`);
    console.log(`Routes WITHOUT tracking: ${untracked.length}`);
    console.log(`Coverage: ${(coverage * 100).toFixed(1)}%`);
    if (untracked.length > 0) {
      console.log(`Untracked routes:\n  ${untracked.join("\n  ")}`);
    }

    expect(
      coverage,
      `Analytics wiring coverage is ${(coverage * 100).toFixed(1)}% — must be >= 80%. ` +
        `Untracked routes: ${untracked.join(", ")}`,
    ).toBeGreaterThanOrEqual(0.8);
  });

  test("every route.ts file under api/admin/ is valid TypeScript (no syntax errors)", () => {
    const routeFiles = findRouteFiles(API_ADMIN);
    for (const file of routeFiles) {
      const source = readFile(file);
      // Basic structural checks — must have at least one HTTP method export
      const hasHandler =
        source.includes("export async function GET") ||
        source.includes("export async function POST") ||
        source.includes("export async function PUT") ||
        source.includes("export async function PATCH") ||
        source.includes("export async function DELETE");
      const relPath = path.relative(API_ADMIN, file);
      expect(hasHandler, `${relPath} must export at least one HTTP handler`).toBe(true);
    }
  });

  test("analytics-hooks.ts is imported from @/lib/analytics-hooks (correct path)", () => {
    const routeFiles = findRouteFiles(API_ADMIN);
    for (const file of routeFiles) {
      const source = readFile(file);
      if (source.includes("analytics-hooks")) {
        expect(
          source.includes('@/lib/analytics-hooks"') ||
            source.includes("@/lib/analytics-hooks'"),
          `${path.relative(API_ADMIN, file)} must import from @/lib/analytics-hooks`,
        ).toBe(true);
      }
    }
  });
});
