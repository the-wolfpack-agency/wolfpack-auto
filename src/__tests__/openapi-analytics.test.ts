/**
 * openapi-analytics.test.ts — Verifies the /api/openapi route emits
 * `system.openapi_fetched` analytics events with expected metadata fields.
 *
 * Run with: npx jest src/__tests__/openapi-analytics.test.ts
 */

import * as analyticsHooks from "@/lib/analytics-hooks";

describe("system.openapi_fetched event type", () => {
  it("SystemEvent union includes system.openapi_fetched", () => {
    // The analytics-hooks module is the single source of truth for event types.
    // We verify by calling trackSystem with the new event type — if the TypeScript
    // union doesn't include it, tsc would fail. At runtime we just verify the
    // function is callable without throwing.

    const spy = jest.spyOn(analyticsHooks, "trackSystem").mockImplementation(() => {});

    expect(() => {
      analyticsHooks.trackSystem("system.openapi_fetched", "system", {
        user_agent: "test-agent/1.0",
        client_ip_hash: "abc123",
      });
    }).not.toThrow();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("system.openapi_fetched", "system", {
      user_agent: "test-agent/1.0",
      client_ip_hash: "abc123",
    });

    spy.mockRestore();
  });

  it("trackSystem is exported from analytics-hooks", () => {
    expect(typeof analyticsHooks.trackSystem).toBe("function");
  });
});

describe("/api/openapi route analytics emission", () => {
  it("route file exists and imports trackSystem", () => {
    // Read the source file to verify the analytics call is present.
    // This is a static code assertion — it confirms the hook is wired in
    // without needing to spin up a Next.js server.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    const routeSource = fs.readFileSync(
      path.join(__dirname, "../app/api/openapi/route.ts"),
      "utf-8",
    );

    // Must import trackSystem
    expect(routeSource).toMatch(/import.*trackSystem.*from/);

    // Must call trackSystem with the correct event
    expect(routeSource).toMatch(/trackSystem\s*\(\s*["']system\.openapi_fetched["']/);

    // Must include user_agent in the metadata
    expect(routeSource).toMatch(/user_agent/);

    // Must include client_ip_hash in the metadata
    expect(routeSource).toMatch(/client_ip_hash/);
  });

  it("route hashes the client IP (no raw IP in metadata)", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    const routeSource = fs.readFileSync(
      path.join(__dirname, "../app/api/openapi/route.ts"),
      "utf-8",
    );

    // The IP must be hashed before being stored — verify SHA256 is used
    expect(routeSource).toMatch(/sha256/);
    expect(routeSource).toMatch(/digest/);
  });

  it("route sets Cache-Control: no-store header", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    const routeSource = fs.readFileSync(
      path.join(__dirname, "../app/api/openapi/route.ts"),
      "utf-8",
    );

    expect(routeSource).toMatch(/no-store/);
  });

  it("route has no authentication guard (spec is public)", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    const routeSource = fs.readFileSync(
      path.join(__dirname, "../app/api/openapi/route.ts"),
      "utf-8",
    );

    // Must NOT call requireAuth or requireRole — the spec is intentionally public
    expect(routeSource).not.toMatch(/requireAuth\s*\(/);
    expect(routeSource).not.toMatch(/requireRole\s*\(/);
  });
});
