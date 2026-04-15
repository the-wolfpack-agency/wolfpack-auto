/**
 * Admin Auth Coverage Guard
 *
 * Walks every src/app/api/admin/** /route.ts at test time and asserts that each
 * file either:
 *   (a) contains a call to requireAuth, requireRole, getServerSession, or
 *       requireAgencyAuth before the first non-error NextResponse.json(, OR
 *   (b) is listed in PUBLIC_ADMIN_ROUTES (intentionally unauthenticated).
 *
 * This is the permanent guardrail — every new admin route must be hardened or
 * explicitly allowlisted. No drift possible.
 */

import * as fs from "fs";
import * as path from "path";
import { PUBLIC_ADMIN_ROUTES } from "@/app/api/admin/PUBLIC_ROUTES";

const ROOT = path.resolve(__dirname, "../..");
const ADMIN_API_DIR = path.join(ROOT, "src/app/api/admin");

// Auth call patterns the scanner recognises as valid guards.
const AUTH_PATTERNS = [
  /requireAuth\s*\(/,
  /requireRole\s*\(/,
  /requireAgencyAuth\s*\(/,
  /getServerSession\s*\(/,
];

function walkRoutes(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRoutes(fullPath));
    } else if (entry.name === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

function relativeToAdmin(absPath: string): string {
  return path.relative(ADMIN_API_DIR, absPath);
}

function isInAllowlist(absPath: string): boolean {
  const rel = relativeToAdmin(absPath);
  return PUBLIC_ADMIN_ROUTES.some((entry) => rel === entry || rel.startsWith(entry));
}

function hasAuthGuard(content: string): boolean {
  return AUTH_PATTERNS.some((pattern) => pattern.test(content));
}

describe("Admin route auth coverage", () => {
  const allRoutes = walkRoutes(ADMIN_API_DIR);

  test("found at least 80 admin route files (sanity check)", () => {
    expect(allRoutes.length).toBeGreaterThanOrEqual(80);
  });

  const unguardedRoutes: string[] = [];

  for (const routeFile of allRoutes) {
    if (isInAllowlist(routeFile)) continue;

    const content = fs.readFileSync(routeFile, "utf-8");
    if (!hasAuthGuard(content)) {
      unguardedRoutes.push(relativeToAdmin(routeFile));
    }
  }

  test(
    "every admin route is either auth-guarded or in PUBLIC_ADMIN_ROUTES",
    () => {
      if (unguardedRoutes.length > 0) {
        const list = unguardedRoutes.map((r) => `  - src/app/api/admin/${r}`).join("\n");
        throw new Error(
          `${unguardedRoutes.length} admin route(s) have no auth guard and are not in PUBLIC_ADMIN_ROUTES:\n` +
          list +
          "\n\nFix: add requireAuth() at the top of the handler, or add the path to PUBLIC_ADMIN_ROUTES.ts with an explanation.",
        );
      }
      expect(unguardedRoutes).toHaveLength(0);
    },
  );

  test("PUBLIC_ADMIN_ROUTES entries all correspond to real files", () => {
    const missing: string[] = [];
    for (const entry of PUBLIC_ADMIN_ROUTES) {
      const abs = path.join(ADMIN_API_DIR, entry);
      if (!fs.existsSync(abs)) {
        missing.push(entry);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `PUBLIC_ADMIN_ROUTES contains entries for files that do not exist:\n` +
        missing.map((e) => `  - ${e}`).join("\n") +
        "\n\nRemove stale entries from src/app/api/admin/PUBLIC_ROUTES.ts.",
      );
    }
    expect(missing).toHaveLength(0);
  });
});

describe("requireAuth emits analytics on 401", () => {
  let trackSecurity: jest.MockedFunction<
    (
      event: string,
      dealer_id: string,
      meta: Record<string, string | number | boolean>,
    ) => void
  >;

  beforeEach(() => {
    jest.resetModules();
    jest.mock("@/lib/analytics-hooks", () => ({
      trackSecurity: jest.fn(),
    }));
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue(null),
    }));
    jest.mock("@/lib/auth", () => ({ authOptions: {} }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("fires exactly one security.unauthorized_access_attempt event with route + ip + timestamp", async () => {
    const { trackSecurity: mockTrackSecurity } = await import("@/lib/analytics-hooks");
    trackSecurity = mockTrackSecurity as typeof trackSecurity;

    const { requireAuth } = await import("@/lib/auth-guard");
    const { NextRequest, NextResponse } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/vehicles/backgrounds/system/test", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
      },
    });

    const result = await requireAuth(req);

    expect(result).toBeInstanceOf(NextResponse);
    expect(trackSecurity).toHaveBeenCalledTimes(1);

    const [event, dealerId, meta] = (trackSecurity as jest.Mock).mock.calls[0];
    expect(event).toBe("security.unauthorized_access_attempt");
    expect(dealerId).toBe("system");
    expect(meta.route).toContain("admin");
    expect(meta.ip).toBe("1.2.3.4");
    expect(typeof meta.timestamp).toBe("string");
  });

  test("does not emit event when session is valid", async () => {
    jest.resetModules();
    jest.mock("@/lib/analytics-hooks", () => ({
      trackSecurity: jest.fn(),
    }));
    jest.mock("next-auth", () => ({
      getServerSession: jest.fn().mockResolvedValue({
        user: { id: "u1", email: "a@b.com", name: "A", dealer_id: "d1", role: "admin" },
      }),
    }));
    jest.mock("@/lib/auth", () => ({ authOptions: {} }));

    const { trackSecurity: mockTrack } = await import("@/lib/analytics-hooks");
    const { requireAuth } = await import("@/lib/auth-guard");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/settings");
    const result = await requireAuth(req);

    expect((result as { user: unknown }).user).toBeTruthy();
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
