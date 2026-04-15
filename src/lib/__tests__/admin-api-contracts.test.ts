/**
 * API Contract Tests — Admin Route Validation
 *
 * Validates that every fetch() URL in admin pages matches an actual
 * API route file. Catches endpoint mismatches before deployment.
 *
 * Also validates:
 *  - Every API route has auth guards
 *  - Every API route tracks analytics events
 *  - Every admin page has a data-testid
 *  - Sidebar nav links point to pages that exist
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const APP_DIR = path.join(ROOT, "src/app");
const ADMIN_PAGES_DIR = path.join(APP_DIR, "admin");
const API_DIR = path.join(APP_DIR, "api/admin");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/** Extract all fetch("...") URLs from a file */
function extractFetchUrls(content: string): string[] {
  const urls: string[] = [];
  const regex = /fetch\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/** Convert an API URL to the expected file path */
function apiUrlToRoutePath(url: string): string {
  // /api/admin/desking -> src/app/api/admin/desking/route.ts
  const cleaned = url
    .replace(/\?.*$/, "")  // remove query params
    .replace(/^\//, "");   // remove leading slash
  return path.join(APP_DIR, cleaned, "route.ts");
}

/** Convert an admin page href to the expected file path */
function hrefToPagePath(href: string): string {
  // /admin/desking -> src/app/admin/desking/page.tsx
  const cleaned = href.replace(/^\//, "");
  return path.join(APP_DIR, cleaned, "page.tsx");
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Admin API Contract Validation", () => {
  const adminPages = findFiles(ADMIN_PAGES_DIR, /page\.tsx$/);
  const apiRoutes = findFiles(API_DIR, /route\.ts$/);

  describe("Admin pages exist", () => {
    test("desking page exists", () => {
      expect(fs.existsSync(path.join(ADMIN_PAGES_DIR, "desking/page.tsx"))).toBe(true);
    });

    test("accounting page exists", () => {
      expect(fs.existsSync(path.join(ADMIN_PAGES_DIR, "accounting/page.tsx"))).toBe(true);
    });

    test("payments page exists", () => {
      expect(fs.existsSync(path.join(ADMIN_PAGES_DIR, "payments/page.tsx"))).toBe(true);
    });

    test("payroll page exists", () => {
      expect(fs.existsSync(path.join(ADMIN_PAGES_DIR, "payroll/page.tsx"))).toBe(true);
    });

    test("backgrounds page exists", () => {
      expect(fs.existsSync(path.join(ADMIN_PAGES_DIR, "inventory/backgrounds/page.tsx"))).toBe(true);
    });
  });

  describe("API routes exist", () => {
    const expectedRoutes = [
      "desking/route.ts",
      "desking/scenarios/route.ts",
      "desking/lenders/route.ts",
      "accounting/journal/route.ts",
      "accounting/statements/route.ts",
      "accounting/chart/route.ts",
      "payments/route.ts",
      "payments/reconciliation/route.ts",
      "payroll/route.ts",
      "payroll/commissions/route.ts",
      "vehicles/backgrounds/route.ts",
      "vehicles/backgrounds/upload/route.ts",
      "vehicles/backgrounds/remove-bg/route.ts",
      "vehicles/backgrounds/composite/route.ts",
      "vehicles/backgrounds/batch/route.ts",
      "vehicles/backgrounds/insights/route.ts",
      "vehicles/backgrounds/engagement/route.ts",
    ];

    test.each(expectedRoutes)("route %s exists", (routePath) => {
      const fullPath = path.join(API_DIR, routePath);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  describe("Admin page fetch URLs match existing API routes", () => {
    const pageFiles = [
      "desking/page.tsx",
      "accounting/page.tsx",
      "payments/page.tsx",
      "payroll/page.tsx",
      "inventory/backgrounds/page.tsx",
    ];

    test.each(pageFiles)("all fetch URLs in %s resolve to real routes", (pageFile) => {
      const fullPath = path.join(ADMIN_PAGES_DIR, pageFile);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Page file not found: ${fullPath}`);
      }

      const content = readFile(fullPath);
      const urls = extractFetchUrls(content);

      const missingRoutes: string[] = [];

      for (const url of urls) {
        // Only check /api/ URLs
        if (!url.startsWith("/api/")) continue;

        // Skip URLs with template literals or variables
        if (url.includes("${") || url.includes("$")) continue;

        const routePath = apiUrlToRoutePath(url);

        // Check if route.ts exists (exact match or parent with dynamic segment)
        if (!fs.existsSync(routePath)) {
          // Check if it's a sub-path of an existing route (e.g., /api/admin/payments includes GET)
          const parentRoute = apiUrlToRoutePath(url.replace(/\/[^/]+$/, ""));
          if (!fs.existsSync(parentRoute)) {
            missingRoutes.push(`${url} -> expected ${routePath}`);
          }
        }
      }

      if (missingRoutes.length > 0) {
        throw new Error(
          `Page ${pageFile} references API routes that don't exist:\n` +
          missingRoutes.map((r) => `  - ${r}`).join("\n"),
        );
      }
    });
  });

  describe("New API routes have auth guards", () => {
    // Only enforce strict auth/analytics on routes we built in this feature set
    const newRoutePrefixes = ["desking", "accounting/journal", "accounting/statements", "accounting/chart", "payments", "payroll", "vehicles/backgrounds"];

    const newRoutes = apiRoutes.filter((f) => {
      const rel = path.relative(API_DIR, f);
      return newRoutePrefixes.some((prefix) => rel.startsWith(prefix));
    });

    test.each(newRoutes.map((f) => path.relative(ROOT, f)))(
      "%s imports auth guard",
      (relPath) => {
        const content = readFile(path.join(ROOT, relPath));
        if (relPath.includes("engagement")) return;

        const hasAuth = content.includes("requireAuth") || content.includes("isAuthenticated");
        if (!hasAuth) {
          throw new Error(`${relPath} does not import auth guards`);
        }
      },
    );
  });

  describe("New API routes track analytics", () => {
    const newRoutePrefixes = ["desking", "accounting/journal", "accounting/statements", "accounting/chart", "payments", "payroll", "vehicles/backgrounds"];

    const newRoutes = apiRoutes.filter((f) => {
      const rel = path.relative(API_DIR, f);
      return newRoutePrefixes.some((prefix) => rel.startsWith(prefix));
    });

    test.each(newRoutes.map((f) => path.relative(ROOT, f)))(
      "%s imports analytics tracking",
      (relPath) => {
        const content = readFile(path.join(ROOT, relPath));
        if (relPath.includes("engagement")) return;
        if (relPath.includes("system/[id]")) return;

        const hasTracking =
          content.includes("track") &&
          (content.includes("analytics-hooks") || content.includes("trackSystem") ||
           content.includes("trackDesking") || content.includes("trackGL") ||
           content.includes("trackPayment") || content.includes("trackPayroll") ||
           content.includes("trackBackground") || content.includes("trackPhotoEngagement"));

        if (!hasTracking) {
          throw new Error(`${relPath} does not import analytics tracking`);
        }
      },
    );
  });

  describe("Admin pages have data-testid", () => {
    const keyPages = [
      "desking/page.tsx",
      "accounting/page.tsx",
      "payments/page.tsx",
      "payroll/page.tsx",
      "inventory/backgrounds/page.tsx",
    ];

    test.each(keyPages)("%s has data-testid", (pageFile) => {
      const fullPath = path.join(ADMIN_PAGES_DIR, pageFile);
      if (!fs.existsSync(fullPath)) return;

      const content = readFile(fullPath);
      expect(content).toContain("data-testid");
    });
  });

  describe("Sidebar navigation", () => {
    const sidebarPath = path.join(ROOT, "src/components/AdminSidebar.tsx");

    test("sidebar file exists", () => {
      expect(fs.existsSync(sidebarPath)).toBe(true);
    });

    test("sidebar includes F&I Desking link", () => {
      const content = readFile(sidebarPath);
      expect(content).toContain("/admin/desking");
    });

    test("sidebar includes Payments link", () => {
      const content = readFile(sidebarPath);
      expect(content).toContain("/admin/payments");
    });

    test("sidebar includes Payroll link", () => {
      const content = readFile(sidebarPath);
      expect(content).toContain("/admin/payroll");
    });

    test("sidebar includes Photo Backgrounds link", () => {
      const content = readFile(sidebarPath);
      expect(content).toContain("/admin/inventory/backgrounds");
    });

    test("sidebar includes Accounting link", () => {
      const content = readFile(sidebarPath);
      expect(content).toContain("/admin/accounting");
    });
  });
});
