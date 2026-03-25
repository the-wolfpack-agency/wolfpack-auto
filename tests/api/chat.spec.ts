import { test, expect } from "@playwright/test";

test.describe("Chat API (/api/chat)", () => {
  test("POST with greeting returns response", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { message: "hello" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.suggested_actions).toBeDefined();
    expect(Array.isArray(body.suggested_actions)).toBe(true);
  });

  test("POST with inventory query returns vehicle results", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: { message: "do you have any SUVs?" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
    // Should mention vehicles or inventory
    expect(
      body.response.toLowerCase().includes("inventory") ||
        body.response.toLowerCase().includes("vehicle") ||
        body.response.toLowerCase().includes("match") ||
        body.vehicles,
    ).toBeTruthy();
  });

  test("POST with hours query returns business hours", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { message: "what are your hours?" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toContain("Mon");
    expect(body.response).toContain("9AM");
  });

  test("POST with financing query returns financing info", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: { message: "financing options" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response.toLowerCase()).toContain("apr");
  });

  test("POST with empty message returns 400", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { message: "" },
    });

    expect(res.status()).toBe(400);
  });

  test("POST with null message returns 400", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { message: null },
    });

    expect(res.status()).toBe(400);
  });

  test("POST with very long message returns 400", async ({ request }) => {
    const longMessage = "a".repeat(501);
    const res = await request.post("/api/chat", {
      data: { message: longMessage },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.response).toContain("500 characters");
  });

  test("POST with 500 char message is accepted", async ({ request }) => {
    const maxMessage = "a".repeat(500);
    const res = await request.post("/api/chat", {
      data: { message: maxMessage },
    });

    // Should not be 400 — either 200 or 429 (rate limit)
    expect(res.status()).not.toBe(400);
  });

  test("POST with test drive query returns scheduling info", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: { message: "I want to schedule a test drive" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response.toLowerCase()).toContain("test drive");
  });

  test("POST with history works", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        message: "hello",
        history: [
          { role: "assistant", content: "Welcome!" },
          { role: "user", content: "hi" },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
  });

  test("POST with comparison query returns comparison", async ({
    request,
  }) => {
    const res = await request.post("/api/chat", {
      data: { message: "compare Honda vs Toyota" },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
  });
});
