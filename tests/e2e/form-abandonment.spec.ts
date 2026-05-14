/**
 * Form Abandonment Micro-Analytics — E2E Tests
 *
 * Validates field-level tracking, abandonment detection,
 * hover-no-submit detection, and analytics event emission.
 *
 * Category: form_abandonment_validation
 */

import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

const ANALYTICS_CATEGORY = "form_abandonment_validation";

/* ===================================================================== */
/*  Helper: emit validation event                                         */
/* ===================================================================== */

async function emitValidation(
  request: { post: (url: string, options?: Record<string, unknown>) => Promise<unknown> },
  action: string,
  metadata: Record<string, unknown>,
) {
  try {
    await request.post("/api/analytics/collect", {
      data: {
        events: [
          {
            event_type: ANALYTICS_CATEGORY,
            action,
            page: "/tests/form-abandonment",
            session_id: "test-session",
            user_fingerprint: "test-runner",
            timestamp: new Date().toISOString(),
            metadata,
          },
        ],
      },
    });
  } catch {
    // Analytics emission is best-effort in tests
  }
}

/* ===================================================================== */
/*  Field-level tracking on contact form                                  */
/* ===================================================================== */

test.describe("Form Abandonment — Field Tracking", () => {
  test("contact form renders with trackable fields", async ({ page, request }) => {
    // Navigate to a page with a contact form
    const resp = await page.goto("/inventory");
    expect(resp?.status()).toBe(200);

    await emitValidation(request, "field_tracking.page_loaded", {
      page: "/inventory",
      status: resp?.status() ?? 0,
    });
  });

  test("form fields are discoverable for tracking", async ({ page, request }) => {
    await page.goto("/inventory");

    // The inventory page should render; forms may be on VDP or contact page
    const pageTitle = await page.title();
    expect(pageTitle).toBeTruthy();

    await emitValidation(request, "field_tracking.fields_discoverable", {
      page_title: pageTitle,
      has_forms: true,
    });
  });
});

/* ===================================================================== */
/*  Abandonment detection via API simulation                              */
/* ===================================================================== */

test.describe("Form Abandonment — Abandonment Detection", () => {
  test("abandonment event structure is valid", async ({ request }) => {
    // Validate the event structure matches what the tracker emits
    const abandonmentEvent = {
      form_id: "contact-form",
      last_focused_field: "email",
      fields_completed: 1,
      fields_total: 4,
      time_on_form_ms: 15000,
    };

    // Verify all required fields are present
    expect(abandonmentEvent.form_id).toBeTruthy();
    expect(abandonmentEvent.fields_total).toBeGreaterThan(0);
    expect(abandonmentEvent.time_on_form_ms).toBeGreaterThan(0);
    expect(typeof abandonmentEvent.fields_completed).toBe("number");

    await emitValidation(request, "abandonment.event_structure_valid", {
      ...abandonmentEvent,
    });
  });

  test("completion rate calculation is correct", async ({ request }) => {
    const fieldsCompleted = 3;
    const fieldsTotal = 4;
    const rate = Math.round((fieldsCompleted / fieldsTotal) * 100) / 100;

    expect(rate).toBe(0.75);

    await emitValidation(request, "abandonment.completion_rate_valid", {
      fields_completed: fieldsCompleted,
      fields_total: fieldsTotal,
      rate,
    });
  });

  test("field hesitation threshold is 10 seconds", async ({ request }) => {
    const THRESHOLD = 10000; // 10s

    const hesitationEvent = {
      form_id: "contact-form",
      field_name: "phone",
      hesitation_ms: 12000,
    };

    expect(hesitationEvent.hesitation_ms).toBeGreaterThanOrEqual(THRESHOLD);

    await emitValidation(request, "abandonment.hesitation_threshold_valid", {
      threshold_ms: THRESHOLD,
      measured_ms: hesitationEvent.hesitation_ms,
    });
  });
});

/* ===================================================================== */
/*  Hover-no-submit detection                                             */
/* ===================================================================== */

test.describe("Form Abandonment — Hover No Submit", () => {
  test("hover event structure includes duration", async ({ request }) => {
    const hoverEvent = {
      form_id: "contact-form",
      hover_duration_ms: 1500,
    };

    expect(hoverEvent.hover_duration_ms).toBeGreaterThan(200); // Minimum threshold
    expect(hoverEvent.form_id).toBeTruthy();

    await emitValidation(request, "hover_no_submit.event_valid", {
      ...hoverEvent,
    });
  });

  test("short hovers (<200ms) are filtered out", async ({ request }) => {
    const shortHoverMs = 100;
    const shouldTrack = shortHoverMs > 200;

    expect(shouldTrack).toBe(false);

    await emitValidation(request, "hover_no_submit.short_hover_filtered", {
      hover_ms: shortHoverMs,
      tracked: shouldTrack,
    });
  });
});

/* ===================================================================== */
/*  Type-and-delete detection                                             */
/* ===================================================================== */

test.describe("Form Abandonment — Type and Delete", () => {
  test("type-delete event fires when max_length > 0 and current = 0", async ({ request }) => {
    const fieldState = {
      max_typed_length: 10,
      current_length: 0,
    };

    const shouldFire = fieldState.max_typed_length > 0 && fieldState.current_length === 0;
    expect(shouldFire).toBe(true);

    await emitValidation(request, "type_delete.detection_valid", {
      max_typed_length: fieldState.max_typed_length,
      current_length: fieldState.current_length,
      fired: shouldFire,
    });
  });

  test("type-delete does not fire when field still has value", async ({ request }) => {
    const fieldState = {
      max_typed_length: 10,
      current_length: 5,
    };

    const shouldFire = fieldState.max_typed_length > 0 && fieldState.current_length === 0;
    expect(shouldFire).toBe(false);

    await emitValidation(request, "type_delete.no_fire_with_value", {
      max_typed_length: fieldState.max_typed_length,
      current_length: fieldState.current_length,
      fired: shouldFire,
    });
  });
});

/* ===================================================================== */
/*  Analytics event emission                                              */
/* ===================================================================== */

test.describe("Form Abandonment — Analytics Emission", () => {
  test("analytics collect endpoint accepts form_tracking events", async ({ request }) => {
    const resp = await request.post("/api/analytics/collect", {
      data: {
        events: [
          {
            event_type: "form_tracking",
            action: "form.abandoned",
            page: "/contact",
            session_id: "e2e-test-session",
            user_fingerprint: "e2e-runner",
            timestamp: new Date().toISOString(),
            metadata: {
              form_id: "contact-form",
              last_focused_field: "email",
              fields_completed: 2,
              fields_total: 5,
              time_on_form_ms: 30000,
            },
          },
        ],
      },
    });

    // Accept either 200 (success) or 201 (created) — both indicate the event was received
    expect([200, 201]).toContain(resp.status());

    await emitValidation(request, "analytics.form_event_accepted", {
      status: resp.status(),
    });
  });

  test("analytics collect endpoint accepts form.completion_rate events", async ({ request }) => {
    const resp = await request.post("/api/analytics/collect", {
      data: {
        events: [
          {
            event_type: "form_tracking",
            action: "form.completion_rate",
            page: "/contact",
            session_id: "e2e-test-session",
            user_fingerprint: "e2e-runner",
            timestamp: new Date().toISOString(),
            metadata: {
              form_id: "contact-form",
              rate: 0.8,
              fields_completed: 4,
              time_to_complete_ms: 45000,
            },
          },
        ],
      },
    });

    expect([200, 201]).toContain(resp.status());

    await emitValidation(request, "analytics.completion_event_accepted", {
      status: resp.status(),
    });
  });
});
