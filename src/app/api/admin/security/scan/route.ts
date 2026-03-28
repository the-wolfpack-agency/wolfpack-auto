/**
 * GET  /api/admin/security/scan — Return last scan results (or mock results in shadow mode)
 * POST /api/admin/security/scan — Run the security hardening scanner
 */
import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mode mock results                                                   */
/* -------------------------------------------------------------------------- */

const MOCK_SCAN_RESULT = {
  timestamp: new Date().toISOString(),
  duration_ms: 247,
  total_findings: 14,
  by_severity: { critical: 1, high: 3, medium: 4, low: 4, info: 2 },
  by_category: {
    hardcoded_secrets: 1,
    rate_limiting: 3,
    input_validation: 2,
    shadow_mode: 2,
    ssrf: 0,
    auth_guard: 0,
    csrf: 4,
    content_length: 2,
    sql_injection: 0,
    sensitive_data: 0,
  },
  findings: [
    {
      category: "hardcoded_secrets",
      severity: "critical",
      file: "lib/auth.ts",
      line: 153,
      description: "NEXTAUTH_SECRET has a hardcoded fallback value",
      recommendation:
        "Move secrets to environment variables. Use process.env and Vercel env var management.",
    },
    {
      category: "rate_limiting",
      severity: "medium",
      file: "app/api/admin/deals/route.ts",
      line: 1,
      description: "Mutation endpoint (POST) has no rate limiting",
      recommendation:
        'Import checkRateLimit from "@/lib/rate-limit" and apply before processing.',
    },
    {
      category: "rate_limiting",
      severity: "medium",
      file: "app/api/admin/service/appointments/route.ts",
      line: 1,
      description: "Mutation endpoint (POST) has no rate limiting",
      recommendation:
        'Import checkRateLimit from "@/lib/rate-limit" and apply before processing.',
    },
    {
      category: "rate_limiting",
      severity: "medium",
      file: "app/api/admin/comms/send/route.ts",
      line: 1,
      description: "Mutation endpoint (POST) has no rate limiting",
      recommendation:
        'Import checkRateLimit from "@/lib/rate-limit" and apply before processing.',
    },
    {
      category: "input_validation",
      severity: "high",
      file: "app/api/admin/analytics/query/route.ts",
      line: 22,
      description:
        "Route parses request.json() without Zod or manual validation",
      recommendation:
        "Add Zod schema validation at the top of the handler.",
    },
    {
      category: "input_validation",
      severity: "high",
      file: "app/api/admin/pricing/[vehicleId]/route.ts",
      line: 18,
      description:
        "Route parses request.json() without Zod or manual validation",
      recommendation:
        "Add Zod schema validation at the top of the handler.",
    },
    {
      category: "shadow_mode",
      severity: "info",
      file: "app/api/admin/settings/mfa/route.ts",
      line: 1,
      description: "Auth'd route does not check DATABASE_URL",
      recommendation:
        "Add shadow/mock fallback mode for demo environments.",
    },
    {
      category: "shadow_mode",
      severity: "info",
      file: "app/api/admin/reviews/route.ts",
      line: 1,
      description: "Auth'd route does not check DATABASE_URL",
      recommendation:
        "Add shadow/mock fallback mode for demo environments.",
    },
    {
      category: "csrf",
      severity: "low",
      file: "app/api/admin/deals/route.ts",
      line: 1,
      description: "Mutation route (POST) has no CSRF token validation",
      recommendation:
        "For browser-facing routes, validate X-CSRF-Token header.",
    },
    {
      category: "csrf",
      severity: "low",
      file: "app/api/admin/service/appointments/route.ts",
      line: 1,
      description: "Mutation route (POST) has no CSRF token validation",
      recommendation:
        "For browser-facing routes, validate X-CSRF-Token header.",
    },
    {
      category: "csrf",
      severity: "low",
      file: "app/api/admin/comms/send/route.ts",
      line: 1,
      description: "Mutation route (POST) has no CSRF token validation",
      recommendation:
        "For browser-facing routes, validate X-CSRF-Token header.",
    },
    {
      category: "csrf",
      severity: "low",
      file: "app/api/admin/documents/route.ts",
      line: 1,
      description: "Mutation route (POST) has no CSRF token validation",
      recommendation:
        "For browser-facing routes, validate X-CSRF-Token header.",
    },
    {
      category: "content_length",
      severity: "high",
      file: "app/api/admin/deals/route.ts",
      line: 1,
      description: "Route parses request body without Content-Length limit",
      recommendation:
        'Use parseBody() from "@/lib/request-guard" for size-limited parsing.',
    },
    {
      category: "content_length",
      severity: "high",
      file: "app/api/admin/documents/route.ts",
      line: 1,
      description: "Route parses request body without Content-Length limit",
      recommendation:
        'Use parseBody() from "@/lib/request-guard" for size-limited parsing.',
    },
  ],
  files_scanned: 87,
};

/** In-memory cache for last scan result */
let lastScanResult: typeof MOCK_SCAN_RESULT | null = null;

/* -------------------------------------------------------------------------- */
/* GET /api/admin/security/scan                                               */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Return last real scan result if available
  if (lastScanResult) {
    return NextResponse.json({ scan: lastScanResult });
  }

  // Shadow mode: return realistic mock results
  return NextResponse.json({ scan: MOCK_SCAN_RESULT });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/security/scan — trigger a new scan                         */
/* -------------------------------------------------------------------------- */

export async function POST() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  // Attempt real scan (requires fs access — works in Node runtime, not Edge)
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      // Dynamic import to avoid Edge Runtime issues
      const { runSecurityScan } = await import("@/lib/security-hardening-scanner");
      const path = await import("path");
      const scanRoot = path.resolve(process.cwd(), "src");
      const result = runSecurityScan(scanRoot);

      lastScanResult = result as typeof MOCK_SCAN_RESULT;

      try {
        trackSecurity("security.scan_completed", dealerId, {
          total_findings: result.total_findings,
          critical: result.by_severity.critical,
          high: result.by_severity.high,
          files_scanned: result.files_scanned,
          duration_ms: result.duration_ms,
        });
      } catch { /* swallow */ }

      return NextResponse.json({ scan: result, live: true }, { status: 200 });
    } catch (err) {
      console.error("[security/scan] Scanner error, falling back to mock:", err);
    }
  }

  // Shadow mode fallback
  const shadowResult = {
    ...MOCK_SCAN_RESULT,
    timestamp: new Date().toISOString(),
  };
  lastScanResult = shadowResult;

  try {
    trackSecurity("security.scan_completed", dealerId, {
      total_findings: shadowResult.total_findings,
      critical: shadowResult.by_severity.critical,
      high: shadowResult.by_severity.high,
      files_scanned: shadowResult.files_scanned,
      duration_ms: shadowResult.duration_ms,
      mode: "shadow",
    });
  } catch { /* swallow */ }

  return NextResponse.json({ scan: shadowResult, live: false }, { status: 200 });
}
