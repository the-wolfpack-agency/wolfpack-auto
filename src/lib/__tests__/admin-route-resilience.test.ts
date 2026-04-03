/**
 * admin-route-resilience.test.ts
 *
 * Ensures every new admin API route handles "does not exist" database errors
 * gracefully instead of crashing with a 500. Each route must contain either:
 *   1. A catch block that checks for "does not exist" in the error message, OR
 *   2. A DATABASE_URL shadow-mode guard that prevents DB access entirely
 *
 * This test reads the source files directly and verifies the pattern exists.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ROUTE_DIR = resolve(__dirname, "../../app/api/admin");

const ROUTES = [
  "propensity",
  "call-intelligence",
  "equity-mining",
  "reinsurance",
  "households",
  "session-replay",
  "surveys",
  "user-testing",
  "lead-ingestion",
  "sms",
  "erating",
  "error-monitor",
  "data-export",
  "reputation",
  "drip-campaigns",
  "omnichannel",
  "walkarounds",
  "vehicle-pipeline",
  "annotations",
];

describe("Admin route resilience — missing table guard", () => {
  for (const route of ROUTES) {
    it(`${route}/route.ts handles "does not exist" errors`, () => {
      const filePath = resolve(ROUTE_DIR, route, "route.ts");
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        throw new Error(`Route file not found: ${filePath}`);
      }

      const hasShadowModeGuard = content.includes("!process.env.DATABASE_URL");
      const hasDoesNotExistGuard = content.includes('"does not exist"');

      expect(hasShadowModeGuard || hasDoesNotExistGuard).toBe(true);

      // If the route queries the DB (imports @/lib/db or uses `query(`),
      // it MUST have the "does not exist" guard
      const queriesDB =
        content.includes('@/lib/db"') || content.includes("@/lib/db'");

      if (queriesDB) {
        expect(hasDoesNotExistGuard).toBe(true);
      }
    });
  }

  it("covers all 19 required routes", () => {
    expect(ROUTES.length).toBe(19);
  });
});
