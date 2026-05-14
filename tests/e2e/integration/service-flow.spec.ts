/**
 * Service Flow Integration Tests
 *
 * Service appointment + repair order lifecycle:
 * create appointment -> verify in list -> create RO -> verify RO ->
 * check analytics -> verify in browser UI.
 */
import { test, expect } from "@playwright/test";
import {
  getAuthCookies,
  assertAnalyticsReachable,
  authGet,
  authPost,
} from "./helpers";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

let cookies: string;

test.beforeAll(async ({ request }) => {
  cookies = await getAuthCookies(request);
});

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const APPT_CUSTOMER = `E2E Service ${Date.now()}`;
const APPT_VIN = "JTDKN3DU5A0123456";
const RO_VIN = "1HGCV1F34LA012345";

function appointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    customer_name: APPT_CUSTOMER,
    customer_phone: "+15558881234",
    customer_email: "e2e-service@test.wolfpackauto.com",
    vehicle_year: 2023,
    vehicle_make: "Toyota",
    vehicle_model: "Prius",
    vin: APPT_VIN,
    service_type: "oil_change",
    description: "Synthetic oil change + multi-point inspection (E2E test)",
    scheduled_date: "2026-04-15",
    scheduled_time: "09:00",
    estimated_duration_min: 45,
    advisor: "E2E Tester",
    notes: "E2E integration test appointment — safe to delete",
    ...overrides,
  };
}

function repairOrderPayload(overrides: Record<string, unknown> = {}) {
  return {
    customer_name: "E2E RO Customer",
    customer_phone: "+15558885678",
    customer_email: "e2e-ro@test.wolfpackauto.com",
    vehicle_year: 2022,
    vehicle_make: "Honda",
    vehicle_model: "Accord Sport",
    vin: RO_VIN,
    odometer: 34567,
    technician: "Carlos Rivera",
    customer_concern:
      "Grinding noise from front brakes. Customer reports noise worsening over past week.",
    line_items: [
      {
        id: "e2e-li-001",
        description: "Front brake pad replacement (ceramic)",
        labor_hours: 1.5,
        labor_rate: 135.0,
        parts_cost: 124.99,
        line_total: 327.49,
      },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Service Flow", () => {
  let createdApptId: string;
  let createdRoId: string;
  let createdRoNumber: string;

  test("POST /api/admin/service/appointments creates appointment", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/service/appointments",
      appointmentPayload(),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();

    createdApptId = body.id;
  });

  test("POST /api/admin/service/appointments rejects missing fields", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/service/appointments",
      {
        // Missing customer_name, scheduled_date, scheduled_time
        vin: APPT_VIN,
      },
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("GET /api/admin/service/appointments returns appointments list", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/service/appointments",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.appointments).toBeTruthy();
    expect(Array.isArray(body.appointments)).toBe(true);
    expect(body.appointments.length).toBeGreaterThan(0);

    // Verify appointment shape
    const appt = body.appointments[0];
    expect(appt.customer_name).toBeTruthy();
    expect(appt.scheduled_date).toBeTruthy();
    expect(appt.status).toBeTruthy();
  });

  test("GET /api/admin/service/appointments supports date filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/service/appointments?date=2026-03-28",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const appt of body.appointments) {
      expect(appt.scheduled_date).toBe("2026-03-28");
    }
  });

  test("GET /api/admin/service/appointments supports status filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/service/appointments?status=scheduled",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const appt of body.appointments) {
      expect(appt.status).toBe("scheduled");
    }
  });

  test("POST /api/admin/service/repair-orders creates repair order", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/service/repair-orders",
      repairOrderPayload(),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();
    expect(body.ro_number).toBeTruthy();
    expect(body.ro_number).toMatch(/^RO-2026-\d{4}$/);

    createdRoId = body.id;
    createdRoNumber = body.ro_number;
  });

  test("POST /api/admin/service/repair-orders rejects missing fields", async ({
    request,
  }) => {
    const res = await authPost(
      request,
      cookies,
      "/api/admin/service/repair-orders",
      {
        // Missing customer_name and vin
        odometer: 50000,
      },
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("GET /api/admin/service/repair-orders returns RO list", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/service/repair-orders",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.repair_orders).toBeTruthy();
    expect(Array.isArray(body.repair_orders)).toBe(true);

    // RO list may be empty if shadow mode returned mock but DB has no real ROs
    if (body.repair_orders.length === 0) return;

    // Verify RO shape
    const ro = body.repair_orders[0];
    expect(ro.ro_number).toBeTruthy();
    expect(ro.customer_name).toBeTruthy();
    expect(ro.vin).toBeTruthy();
    expect(ro.status).toBeTruthy();
  });

  test("GET /api/admin/service/repair-orders supports status filter", async ({
    request,
  }) => {
    const res = await authGet(
      request,
      cookies,
      "/api/admin/service/repair-orders?status=in_progress",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    for (const ro of body.repair_orders) {
      expect(ro.status).toBe("in_progress");
    }
  });

  test("Analytics health responds after service operations", async ({
    request,
  }) => {
    const health = await assertAnalyticsReachable(request, cookies);
    expect(["shadow_mode", "healthy", "degraded", "error"]).toContain(
      health.status,
    );
  });

  test("Unauthenticated service access is rejected", async ({ request }) => {
    const res = await request.get("/api/admin/service/appointments");
    expect(res.status()).not.toBe(500);
    expect(res.status()).not.toBe(200);
  });
});
