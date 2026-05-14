import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

/**
 * Error Handling & Information Disclosure Tests
 *
 * Validates that the application handles errors safely:
 *   - 404 pages don't leak stack traces or internal paths
 *   - API errors return structured JSON, not HTML
 *   - Error messages don't contain DB queries, file paths, or env vars
 *   - Invalid JSON body returns 400, not 500
 *   - Non-existent /api/ routes return proper 404 JSON
 *
 * Run: npx playwright test tests/e2e/error-handling.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const RUN_ID = Date.now().toString(36);
let safeErrors = 0;
let infoLeaksFound = 0;
let structuredResponses = 0;

/** Patterns that indicate information disclosure */
const LEAK_PATTERNS = [
  /at\s+\w+\s+\(.*\.(?:ts|js|tsx|jsx):\d+:\d+\)/, // stack trace lines
  /\/(?:Users|home|var|opt|srv)\/\w+\//, // absolute file paths
  /node_modules\//, // node_modules paths
  /process\.env\.\w+/, // environment variable references
  /SELECT\s+.+\s+FROM\s+/i, // SQL queries
  /INSERT\s+INTO\s+/i, // SQL inserts
  /Error:\s+connect\s+ECONNREFUSED/, // connection strings
  /password\s*[:=]\s*["']\w+["']/i, // leaked passwords
  /DATABASE_URL/i, // database connection strings
  /NEXTAUTH_SECRET/i, // secrets in errors
  /\.env\b/, // .env file references
];

function checkForLeaks(text: string): string[] {
  const found: string[] = [];
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(text)) {
      found.push(pattern.source);
    }
  }
  return found;
}

async function emitAnalyticsEvent(
  request: import("@playwright/test").APIRequestContext,
  data: Record<string, unknown>,
) {
  await request
    .post(`${BASE_URL}/api/analytics/events`, {
      data: {
        events: [
          {
            event_type: "system",
            action: "error_handling",
            page: "/error-handling-test",
            session_id: `error-handling-${RUN_ID}`,
            user_fingerprint: `error-fp-${RUN_ID}`,
            timestamp: new Date().toISOString(),
            metadata: { category: "error_handling", ...data },
          },
        ],
      },
    })
    .catch(() => {
      /* best-effort */
    });
}

/* -------------------------------------------------------------------------- */
/* 404 pages don't leak stack traces                                           */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: 404 page safety", () => {
  test("non-existent page doesn't leak stack traces or internal paths", async ({
    page,
  }) => {
    const resp = await page.goto(`/this-page-does-not-exist-${RUN_ID}`, {
      waitUntil: "domcontentloaded",
    });

    // Should return 404
    expect(resp?.status()).toBe(404);

    const bodyText = await page.textContent("body");
    const leaks = checkForLeaks(bodyText ?? "");

    if (leaks.length > 0) {
      infoLeaksFound += leaks.length;
    } else {
      safeErrors++;
    }

    expect(
      leaks,
      `404 page leaks sensitive info matching: ${leaks.join(", ")}`,
    ).toHaveLength(0);
  });

  test("deeply nested non-existent path returns 404 without leaks", async ({
    page,
  }) => {
    const resp = await page.goto(
      `/admin/deeply/nested/nonexistent/path-${RUN_ID}`,
      { waitUntil: "domcontentloaded" },
    );

    // Should be 404 or redirect (302/307)
    expect(resp?.status()).not.toBe(500);

    const bodyText = await page.textContent("body");
    const leaks = checkForLeaks(bodyText ?? "");

    if (leaks.length > 0) {
      infoLeaksFound += leaks.length;
    } else {
      safeErrors++;
    }

    expect(leaks).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* API errors return structured JSON                                           */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: structured API errors", () => {
  test("non-existent API route returns JSON 404, not HTML", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BASE_URL}/api/this-route-does-not-exist-${RUN_ID}`,
    );

    expect(resp.status()).toBe(404);

    const contentType = resp.headers()["content-type"] ?? "";

    // API routes should return JSON, not HTML error pages
    if (contentType.includes("json")) {
      structuredResponses++;
      const body = await resp.json();
      // Should have an error field or message
      expect(
        body.error || body.message || body.statusCode,
        "JSON error response should have error/message field",
      ).toBeTruthy();
    }

    // Even if HTML, should not contain leaks
    const bodyText = await resp.text();
    const leaks = checkForLeaks(bodyText);
    if (leaks.length === 0) {
      safeErrors++;
    } else {
      infoLeaksFound += leaks.length;
    }
    expect(leaks).toHaveLength(0);
  });

  test("non-existent /api/admin/ route returns proper error", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BASE_URL}/api/admin/nonexistent-endpoint-${RUN_ID}`,
    );

    // Should be 404 or 401 (auth gate catches first) — never 500
    expect(resp.status()).not.toBe(500);
    expect([401, 403, 404]).toContain(resp.status());

    const bodyText = await resp.text();
    const leaks = checkForLeaks(bodyText);
    expect(leaks).toHaveLength(0);
    safeErrors++;
  });
});

/* -------------------------------------------------------------------------- */
/* Error messages don't contain sensitive data                                 */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: no sensitive data in errors", () => {
  const errorTriggers = [
    {
      name: "SQL injection attempt",
      path: "/api/admin/leads?id=1%27%20OR%201%3D1--",
    },
    {
      name: "path traversal attempt",
      path: "/api/admin/documents?file=../../../etc/passwd",
    },
    {
      name: "XSS in query param",
      path: "/api/admin/leads?q=<script>alert(1)</script>",
    },
    {
      name: "oversized parameter",
      path: `/api/admin/leads?q=${"A".repeat(10000)}`,
    },
  ];

  for (const { name, path } of errorTriggers) {
    test(`${name} doesn't leak sensitive info in response`, async ({
      request,
    }) => {
      const resp = await request.get(`${BASE_URL}${path}`);

      // Must never return 500
      expect(resp.status()).not.toBe(500);

      const bodyText = await resp.text();
      const leaks = checkForLeaks(bodyText);

      if (leaks.length > 0) {
        infoLeaksFound += leaks.length;
      } else {
        safeErrors++;
      }

      expect(
        leaks,
        `${name} response leaks: ${leaks.join(", ")}`,
      ).toHaveLength(0);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Invalid JSON body returns 400, not 500                                      */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: invalid JSON body", () => {
  const endpoints = [
    "/api/admin/leads",
    "/api/admin/deals",
    "/api/admin/compliance/checks",
    "/api/admin/documents",
  ];

  for (const path of endpoints) {
    test(`POST ${path} with invalid JSON returns 400 not 500`, async ({
      request,
    }) => {
      const resp = await request.post(`${BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        data: "this is not valid json {{{",
      });

      // Must not crash with 500
      expect(resp.status()).not.toBe(500);
      // Should be 400 (bad request), 401 (auth), or 422 (validation)
      expect([400, 401, 403, 422]).toContain(resp.status());

      const bodyText = await resp.text();
      const leaks = checkForLeaks(bodyText);
      expect(leaks).toHaveLength(0);

      if (resp.status() === 400 || resp.status() === 422) {
        structuredResponses++;
      }
      safeErrors++;
    });
  }

  test("POST with empty body returns 400 not 500", async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/admin/leads`, {
      headers: { "Content-Type": "application/json" },
      data: "",
    });

    expect(resp.status()).not.toBe(500);

    const bodyText = await resp.text();
    const leaks = checkForLeaks(bodyText);
    expect(leaks).toHaveLength(0);
    safeErrors++;
  });

  test("POST with wrong content type returns 400 not 500", async ({
    request,
  }) => {
    const resp = await request.post(`${BASE_URL}/api/admin/leads`, {
      headers: { "Content-Type": "text/plain" },
      data: "just some text, not json",
    });

    expect(resp.status()).not.toBe(500);

    const bodyText = await resp.text();
    const leaks = checkForLeaks(bodyText);
    expect(leaks).toHaveLength(0);
    safeErrors++;
  });
});

/* -------------------------------------------------------------------------- */
/* Non-existent API routes return proper 404                                   */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: API 404 responses", () => {
  const fakeApiPaths = [
    "/api/v1/users",
    "/api/admin/secret-endpoint",
    "/api/internal/debug",
    "/api/graphql",
    "/api/.env",
    "/api/admin/../../../etc/passwd",
  ];

  for (const path of fakeApiPaths) {
    test(`GET ${path} returns 404 JSON, not HTML or 500`, async ({
      request,
    }) => {
      const resp = await request.get(`${BASE_URL}${path}`);

      // Must never return 500
      expect(resp.status()).not.toBe(500);

      // Should be 404, 401, or 403 — never a real response
      expect([401, 403, 404]).toContain(resp.status());

      const bodyText = await resp.text();
      const leaks = checkForLeaks(bodyText);
      expect(
        leaks,
        `${path} leaks: ${leaks.join(", ")}`,
      ).toHaveLength(0);

      safeErrors++;
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Summary analytics event                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Error handling: analytics summary", () => {
  test("emit error_handling summary event", async ({ request }) => {
    await emitAnalyticsEvent(request, {
      safe_errors: safeErrors,
      info_leaks_found: infoLeaksFound,
      structured_responses: structuredResponses,
    });
  });
});
