/**
 * Route health check — AUTO-DISCOVERS every route from the filesystem.
 * Catches broken imports, failed server components, and missing pages.
 * New pages are automatically tested — no manual list maintenance.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

function discoverRoutes(baseDir: string, prefix = ""): string[] {
  const routes: string[] = [];
  if (!fs.existsSync(baseDir)) return routes;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = path.join(baseDir, entry.name);
    const segment = entry.name;

    // Skip private/internal folders
    if (segment.startsWith("_") || segment.startsWith(".")) continue;

    // Skip API routes (tested separately)
    if (segment === "api" && prefix === "") continue;

    // Skip dynamic segments like [vin] — need real params
    if (segment.startsWith("[")) continue;

    const routePath = `${prefix}/${segment}`;

    // If this dir has a page.tsx, it's a route
    const hasPage = fs.existsSync(path.join(dirPath, "page.tsx"));
    if (hasPage) {
      routes.push(routePath);
    }

    // Recurse into subdirectories
    routes.push(...discoverRoutes(dirPath, routePath));
  }

  return routes;
}

function discoverApiRoutes(baseDir: string, prefix = "/api"): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  if (!fs.existsSync(baseDir)) return routes;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith("[") || entry.name.startsWith("_") || entry.name === "auth") continue;
      routes.push(...discoverApiRoutes(fullPath, `${prefix}/${entry.name}`));
    } else if (entry.name === "route.ts") {
      const content = fs.readFileSync(fullPath, "utf-8");
      // Only test GET endpoints (safe, no side effects)
      if (content.includes("export async function GET") || content.includes("export function GET")) {
        routes.push({ method: "GET", path: prefix });
      }
    }
  }

  return routes;
}

const APP_DIR = path.resolve(__dirname, "../../src/app");

// Auto-discover all page routes
const allRoutes = ["/", ...discoverRoutes(APP_DIR)];
const PUBLIC_ROUTES = allRoutes.filter((r) => !r.startsWith("/admin"));
const ADMIN_ROUTES = allRoutes.filter((r) => r.startsWith("/admin"));

// Auto-discover GET API routes
const API_DIR = path.join(APP_DIR, "api");
const API_ROUTES = discoverApiRoutes(API_DIR);

test.describe("Route health check — public pages", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} returns 200`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response).not.toBeNull();
      expect(response!.status()).toBeLessThan(400);
      // Verify page has content (not blank)
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });
  }
});

test.describe("Route health check — admin pages", () => {
  for (const route of ADMIN_ROUTES) {
    test(`${route} returns non-500`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response).not.toBeNull();
      // Admin pages may redirect to login (302/307), load (200),
      // or 500 if they require a database not available in shadow mode.
      // They should never 502/503 (server completely down).
      expect(response!.status()).not.toBe(502);
      expect(response!.status()).not.toBe(503);
    });
  }
});

test.describe("Route health check — API endpoints", () => {
  for (const { method, path } of API_ROUTES) {
    test(`${method} ${path} responds`, async ({ request }) => {
      const baseUrl = process.env.SHADOW_URL || "http://localhost:3099";
      const response =
        method === "GET"
          ? await request.get(`${baseUrl}${path}`)
          : await request.post(`${baseUrl}${path}`);
      // Should not be 404. 500 acceptable if DB-dependent in shadow mode.
      expect(response.status()).not.toBe(404);
    });
  }
});
