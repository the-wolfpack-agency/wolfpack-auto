import { test, expect } from "@playwright/test";
import { csrfHeaders } from "../e2e/helpers/csrf";

test.describe("Contact API (/api/contact)", () => {
  const validPayload = {
    first_name: "Test",
    last_name: "User",
    email: `test-${Date.now()}@example.com`, // Unique email to avoid rate limits
    phone: "(303) 555-9999",
    subject: "General Inquiry",
    message: "This is a test message from the E2E test suite.",
  };

  test("POST with valid data returns 201", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        email: `valid-${Date.now()}@example.com`,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
    expect(body.created_at).toBeTruthy();
  });

  test("POST with missing first_name returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        first_name: "",
        email: `missing-fn-${Date.now()}@example.com`,
      },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();

    // Should flag first_name
    const firstNameError = body.details.find(
      (d: { field: string }) => d.field === "first_name",
    );
    expect(firstNameError).toBeTruthy();
  });

  test("POST with missing last_name returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        last_name: "",
        email: `missing-ln-${Date.now()}@example.com`,
      },
    });

    expect(res.status()).toBe(422);
  });

  test("POST with invalid email returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        email: "not-a-valid-email",
      },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");

    const emailError = body.details.find(
      (d: { field: string }) => d.field === "email",
    );
    expect(emailError).toBeTruthy();
  });

  test("POST with missing email returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        email: "",
      },
    });

    expect(res.status()).toBe(422);
  });

  test("POST with missing message returns 422", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        message: "",
        email: `missing-msg-${Date.now()}@example.com`,
      },
    });

    expect(res.status()).toBe(422);
  });

  test("rate limiting: 4th submission same email returns 429", async ({
    request,
  }) => {
    const headers = await csrfHeaders(request);
    const rateEmail = `ratelimit-${Date.now()}@example.com`;

    // Send 3 requests (the limit is 3 per email per hour)
    for (let i = 0; i < 3; i++) {
      const res = await request.post("/api/contact", {
        headers,
        data: {
          ...validPayload,
          email: rateEmail,
        },
      });
      expect(res.status()).toBe(201);
    }

    // 4th request should be rate limited
    const res = await request.post("/api/contact", {
      headers,
      data: {
        ...validPayload,
        email: rateEmail,
      },
    });

    expect(res.status()).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many");
  });

  test("POST with invalid JSON returns 400", async ({ request }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers: { ...headers, "Content-Type": "application/json" },
      data: "not-json{{{",
    });

    // The server should handle malformed JSON
    expect([400, 422]).toContain(res.status());
  });

  test("POST with all optional fields omitted returns 201", async ({
    request,
  }) => {
    const headers = await csrfHeaders(request);
    const res = await request.post("/api/contact", {
      headers,
      data: {
        first_name: "Minimal",
        last_name: "Test",
        email: `minimal-${Date.now()}@example.com`,
        subject: "General Inquiry",
        message: "Minimal required fields only.",
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
