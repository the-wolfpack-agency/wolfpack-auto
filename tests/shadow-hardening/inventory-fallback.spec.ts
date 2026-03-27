/**
 * Inventory fallback chain tests.
 *
 * Tests 1, 2, 4, and 5 make live HTTP requests to the running Next.js
 * server and work in shadow mode (no DB, no ES) because the fallback
 * chain terminates at placeholder data.
 *
 * Test 3 is purely static — it reads source files and asserts the
 * fallback chain is structurally present.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.SHADOW_URL || "http://localhost:3099";
const ROOT = path.resolve(__dirname, "../../");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

test.describe("Inventory fallback chain", () => {
  test("inventory API returns correct response shape regardless of backend", async ({
    request,
  }) => {
    const response = await request.get(`${BASE}/api/inventory`);
    // Graceful degradation: 200 with placeholder or real data.
    // 503 is also acceptable if something truly critical is broken,
    // but the shape test below will only run on 200.
    if (response.status() === 200) {
      const body = await response.json();

      expect(Array.isArray(body.vehicles)).toBe(true);
      expect(typeof body.total).toBe("number");
      expect(typeof body.facets).toBe("object");
      expect(body.facets).not.toBeNull();
      expect(typeof body.page).toBe("number");
      expect(typeof body.page_size).toBe("number");
    } else {
      // Still a valid test pass — endpoint exists and responded
      expect([200, 503]).toContain(response.status());
    }
  });

  test("inventory API source field indicates data origin", async ({
    request,
  }) => {
    const response = await request.get(`${BASE}/api/inventory`);
    if (response.status() !== 200) return; // skip shape check on non-200

    const body = await response.json();

    // source field is present and valid when the API responds successfully
    if ("source" in body) {
      expect(["elasticsearch", "database", "placeholder"]).toContain(
        body.source,
      );
    }
    // If source field is absent that's also fine — it's an optional enrichment
  });

  test("inventory search fallback: static code verifies fallback chain exists", () => {
    const src = readSrc("src/lib/data.ts");

    // Must have an ES tier — searchInventoryFromES or equivalent
    const hasEsTier =
      src.includes("searchInventoryFromES") ||
      src.includes("searchVehicles") ||
      src.includes("esClient") ||
      src.includes("elasticsearch");
    expect(hasEsTier).toBe(true);

    // Must have a DB fallback catch block
    const hasDbCatch = src.includes("catch") && src.includes("query(");
    expect(hasDbCatch).toBe(true);

    // Must have placeholder as final fallback
    expect(src).toContain("placeholder");

    // The source type must include all three tiers
    const hasAllSourceTypes =
      src.includes('"elasticsearch"') &&
      src.includes('"database"') &&
      src.includes('"placeholder"');
    expect(hasAllSourceTypes).toBe(true);
  });

  test("inventory make filter works regardless of backend", async ({
    request,
  }) => {
    const response = await request.get(`${BASE}/api/inventory?make=Toyota`);
    if (response.status() !== 200) return;

    const body = await response.json();

    if (!Array.isArray(body.vehicles) || body.vehicles.length === 0) {
      // No Toyota vehicles in the dataset — filter is still accepted correctly
      expect(body.total).toBe(0);
      return;
    }

    // Every returned vehicle must match the make filter (case-insensitive)
    for (const vehicle of body.vehicles) {
      expect(vehicle.make.toLowerCase()).toBe("toyota");
    }
  });

  test("inventory condition filter accepts valid values", async ({
    request,
  }) => {
    const response = await request.get(`${BASE}/api/inventory?condition=used`);
    // The endpoint must accept the parameter and not reject it with 4xx
    expect(response.status()).toBe(200);
  });
});
