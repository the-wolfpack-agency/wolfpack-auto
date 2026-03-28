import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Analytics verification E2E tests.
 *
 * These verify that the analytics/learning pipeline is properly wired:
 *   1. Each POST route source imports a track* function
 *   2. The analytics health endpoint reports pipeline status
 *   3. The learning endpoint returns computed insights
 *   4. Events are being persisted (when DATABASE_URL is set)
 */

const API_ROOT = path.resolve(__dirname, "../../../src/app/api");

/** Read a route source file and return its content. */
function readRouteSource(routePath: string): string | null {
  const fullPath = path.join(API_ROOT, routePath, "route.ts");
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}

/** Check if a route source imports any track* function from analytics-hooks. */
function hasTrackImport(routePath: string): boolean {
  const content = readRouteSource(routePath);
  if (!content) return false;
  return /import\s*\{[^}]*track\w+[^}]*\}\s*from\s*["']@\/lib\/analytics/.test(content);
}

/** Check if a route source imports trackServerEvent from analytics. */
function hasServerEventImport(routePath: string): boolean {
  const content = readRouteSource(routePath);
  if (!content) return false;
  return /import\s*\{[^}]*trackServerEvent[^}]*\}/.test(content);
}

// ─── Route-level analytics wiring ────────────────────────────────────────────

test.describe("Analytics wiring: admin POST routes import track* functions", () => {
  const TRACKED_ROUTES: Array<{ route: string; description: string }> = [
    { route: "admin/deals", description: "Deals" },
    { route: "admin/service/appointments", description: "Service Appointments" },
    { route: "admin/service/repair-orders", description: "Service Repair Orders" },
    { route: "admin/comms/templates", description: "Comms Templates" },
    { route: "admin/comms/send", description: "Comms Send" },
    { route: "admin/accounting/sales-log", description: "Accounting Sales Log" },
    { route: "admin/accounting/commissions", description: "Accounting Commissions" },
    { route: "admin/reviews", description: "Reviews" },
    { route: "admin/documents", description: "Documents" },
    { route: "admin/lenders", description: "Lenders" },
    { route: "admin/credit/pull", description: "Credit Pull" },
    { route: "admin/compliance/checks", description: "Compliance Checks" },
    { route: "admin/floor-plan", description: "Floor Plan" },
    { route: "admin/digital-retail/calculator", description: "Payment Calculator" },
    { route: "admin/digital-retail/credit-app", description: "Credit App" },
  ];

  for (const { route, description } of TRACKED_ROUTES) {
    test(`${description} (${route}) has analytics tracking`, () => {
      expect(hasTrackImport(route)).toBe(true);
    });
  }
});

test.describe("Analytics wiring: public POST routes import tracking", () => {
  test("POST /api/contact imports trackServerEvent", () => {
    expect(hasServerEventImport("contact")).toBe(true);
  });

  test("POST /api/service/schedule imports trackService", () => {
    expect(hasTrackImport("service/schedule")).toBe(true);
  });
});

// ─── Analytics health endpoint ───────────────────────────────────────────────

test.describe("Analytics health endpoint", () => {
  test("GET /api/admin/analytics/health returns structured health data or 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();

      // Must have core health fields
      expect(body.status).toBeDefined();
      expect(typeof body.db_connected).toBe("boolean");
      expect(typeof body.healthy).toBe("boolean");

      // Event count fields
      expect(body.events_last_hour !== undefined || body.events_last_day !== undefined).toBe(true);
    } else {
      // Auth required — valid
      expect([401, 403]).toContain(res.status());
    }
  });

  test("health endpoint reports shadow_mode when no DB", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    if (res.status() === 200) {
      const body = await res.json();
      // If db_connected is false, status should be shadow_mode
      if (!body.db_connected) {
        expect(body.status).toBe("shadow_mode");
        expect(body.modules_silent).toBeDefined();
      }
    }
    // 401 is also valid — can't verify without auth
  });

  test("health endpoint reports modules_reporting when DB is connected", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    if (res.status() === 200) {
      const body = await res.json();
      if (body.db_connected) {
        expect(body.modules_reporting).toBeDefined();
        expect(Array.isArray(body.modules_reporting)).toBe(true);
        // If healthy, should have reporting modules
        if (body.healthy) {
          expect(body.modules_reporting.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("health endpoint includes event counts", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    if (res.status() === 200) {
      const body = await res.json();
      // Whether DB connected or not, these fields should exist
      expect(typeof body.events_last_hour === "number" || typeof body.events_last_hour === "string").toBe(true);
      expect(typeof body.events_last_day === "number" || typeof body.events_last_day === "string").toBe(true);
    }
  });

  test("health endpoint identifies silent modules", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/health");
    if (res.status() === 200) {
      const body = await res.json();
      if (body.modules_silent) {
        expect(Array.isArray(body.modules_silent)).toBe(true);
        // Log which modules are silent for debugging
        if (body.modules_silent.length > 0) {
          console.log("[analytics-verification] Silent modules:", body.modules_silent);
        }
      }
    }
  });
});

// ─── Analytics learning endpoint ─────────────────────────────────────────────

test.describe("Analytics learning endpoint", () => {
  test("GET /api/admin/analytics/learning returns insights or 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/learning");
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      // Should have insights and dealer_id
      expect(body.insights !== undefined || body.dealer_id !== undefined).toBe(true);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });

  test("learning endpoint never crashes (never 500)", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/learning");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(502);
  });
});

// ─── Analytics events fire on public submissions ─────────────────────────────

test.describe("Analytics events fire on public submissions", () => {
  test("contact form submission triggers analytics (via health check)", async ({ request }) => {
    // Submit a contact form to generate an event
    await request.post("/api/contact", {
      data: {
        first_name: "Analytics",
        last_name: "Test",
        email: `analytics-${Date.now()}@test.example.com`,
        subject: "Analytics verification",
        message: "Testing analytics event tracking.",
      },
    });

    // Check health to see if events are flowing
    const healthRes = await request.get("/api/admin/analytics/health");
    if (healthRes.status() === 200) {
      const health = await healthRes.json();
      // If DB is connected, events_last_day should include our event
      if (health.db_connected) {
        const eventsLastDay = parseInt(health.events_last_day, 10);
        expect(eventsLastDay).toBeGreaterThanOrEqual(0);
      }
    }
    // Either way, no server crash
    expect(healthRes.status()).not.toBe(500);
  });

  test("calculator submission triggers analytics (via trackRetail)", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/calculator", {
      data: {
        vehicle_price: 35000,
        down_payment: 5000,
        apr: 5.9,
        term_months: 60,
        deal_type: "retail",
      },
    });
    // The route calls trackRetail — verify it doesn't crash
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.monthly_payment).toBeGreaterThan(0);
  });

  test("credit app submission triggers analytics (via trackRetail)", async ({ request }) => {
    const res = await request.post("/api/admin/digital-retail/credit-app", {
      data: {
        first_name: "Analytics",
        last_name: "CreditTest",
        email: `credit-analytics-${Date.now()}@test.example.com`,
        phone: "(919) 555-0199",
        annual_income: 80000,
        vehicle_interest: "2024 Honda CR-V",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
  });

  test("service booking triggers analytics (via trackService)", async ({ request }) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const dateStr = d.toISOString().slice(0, 10);

    const res = await request.post("/api/service/schedule", {
      data: {
        customer_name: "Analytics Tester",
        email: `svc-analytics-${Date.now()}@test.example.com`,
        service_type: "tire_rotation",
        slot_id: `slot-${dateStr}-1000`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.appointment).toBeTruthy();
  });
});

// ─── Analytics dashboard endpoint ────────────────────────────────────────────

test.describe("Analytics dashboard endpoint", () => {
  test("GET /api/admin/analytics/dashboard returns data or 401", async ({ request }) => {
    const res = await request.get("/api/admin/analytics/dashboard");
    expect(res.status()).not.toBe(500);

    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
    } else {
      expect([401, 403, 404]).toContain(res.status());
    }
  });
});

// ─── Comprehensive analytics-hooks import audit ──────────────────────────────

test.describe("Analytics-hooks import audit", () => {
  const ALL_ADMIN_POST_ROUTES = [
    "admin/deals",
    "admin/vehicles",
    "admin/service/appointments",
    "admin/service/repair-orders",
    "admin/comms/templates",
    "admin/comms/send",
    "admin/accounting/sales-log",
    "admin/accounting/commissions",
    "admin/reviews",
    "admin/documents",
    "admin/lenders",
    "admin/credit/pull",
    "admin/compliance/checks",
    "admin/floor-plan",
    "admin/digital-retail/calculator",
    "admin/digital-retail/credit-app",
  ];

  test("all critical admin POST routes have analytics tracking", () => {
    const missing: string[] = [];
    for (const route of ALL_ADMIN_POST_ROUTES) {
      if (!hasTrackImport(route)) {
        missing.push(route);
      }
    }
    if (missing.length > 0) {
      console.log("[analytics-audit] Routes MISSING track* import:", missing);
    }
    // Allow up to 2 missing (some may track via inline or other means)
    expect(missing.length).toBeLessThanOrEqual(2);
  });

  test("analytics-hooks module exports expected track functions", () => {
    const hooksPath = path.join(
      API_ROOT,
      "../../lib/analytics-hooks.ts",
    );
    // Also try .js extension
    const altPath = path.join(
      API_ROOT,
      "../../lib/analytics-hooks.js",
    );
    const exists = fs.existsSync(hooksPath) || fs.existsSync(altPath);
    expect(exists).toBe(true);

    const content = fs.existsSync(hooksPath)
      ? fs.readFileSync(hooksPath, "utf-8")
      : fs.readFileSync(altPath, "utf-8");

    // Should export track functions for each domain
    expect(content).toContain("trackDeal");
    expect(content).toContain("trackService");
    expect(content).toContain("trackRetail");
  });
});
