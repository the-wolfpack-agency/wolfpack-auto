/**
 * GET  /api/admin/compliance  — return the latest compliance score for the current dealer
 * POST /api/admin/compliance  — run a fresh compliance check and persist the result
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { query } from "@/lib/db";
import { scoreDealerCompliance } from "@/lib/compliance-scorer";
import { checkRateLimit } from "@/lib/rate-limit";
import { SECURITY_HEADERS } from "@/lib/security-headers";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const { key, value } of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  return res;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/compliance                                                   */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id ?? DEALER_ID;

  try {
    const { rows } = await query<{
      score: number;
      grade: string;
      category_scores: Record<string, number>;
      violations: unknown[];
      checked_at: string;
    }>(
      `SELECT score, grade, category_scores, violations, checked_at
       FROM compliance_scores
       WHERE dealer_id = $1
       ORDER BY checked_at DESC
       LIMIT 1`,
      [dealerId],
    );

    if (rows.length === 0) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            score: null,
            grade: null,
            categoryScores: null,
            violations: [],
            checkedAt: null,
            message: "No compliance check has been run yet. POST to run one.",
          },
          { status: 200 },
        ),
      );
    }

    const row = rows[0];
    return withSecurityHeaders(
      NextResponse.json({
        score: row.score,
        grade: row.grade,
        categoryScores: row.category_scores,
        violations: row.violations,
        checkedAt: row.checked_at,
      }),
    );
  } catch (err) {
    console.error("[GET /api/admin/compliance] error:", err);
    // Graceful fallback — table may not yet be migrated
    return withSecurityHeaders(
      NextResponse.json(
        {
          score: null,
          grade: null,
          categoryScores: null,
          violations: [],
          checkedAt: null,
          message:
            "Compliance data unavailable. Run migration 006_compliance.sql and POST to generate a score.",
        },
        { status: 200 },
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/compliance                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Rate limit: 10 checks per hour per IP
  const ip = clientIp(req);
  const rl = await checkRateLimit(`compliance:${ip}`, 10, 3600);
  if (!rl.allowed) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          error: "Rate limit exceeded. Maximum 10 compliance checks per hour.",
          resetAt: rl.resetAt,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.resetAt - Math.floor(Date.now() / 1000)),
          },
        },
      ),
    );
  }

  const dealerId = authResult.user.dealer_id ?? DEALER_ID;

  // Run the scorer
  const result = await scoreDealerCompliance(dealerId);

  // Persist result (best-effort — don't fail if migration hasn't run)
  try {
    await query(
      `INSERT INTO compliance_scores
         (dealer_id, score, grade, category_scores, violations, checked_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [
        dealerId,
        result.score,
        result.grade,
        JSON.stringify(result.categoryScores),
        JSON.stringify(result.violations),
      ],
    );
  } catch (err) {
    console.warn(
      "[POST /api/admin/compliance] Could not persist score (migration may be pending):",
      err,
    );
  }

  return withSecurityHeaders(
    NextResponse.json(
      {
        score: result.score,
        grade: result.grade,
        categoryScores: result.categoryScores,
        violations: result.violations,
        checkedAt: new Date().toISOString(),
      },
      { status: 200 },
    ),
  );
}
