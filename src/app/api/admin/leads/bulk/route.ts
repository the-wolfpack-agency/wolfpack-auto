import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";

const DEALER_ID = process.env.DEALER_ID ?? "default";

const bulkSchema = z.object({
  action: z.enum(["assign", "status"]),
  lead_ids: z.array(z.string().min(1)).min(1).max(200),
  value: z.string().min(1),
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/leads/bulk                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Rate limit: 10 bulk lead operations per IP per hour
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";
  const rateCheck = await checkRateLimit(`admin:leads:bulk:${ip}`, 10, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rateCheck.resetAt },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { action, lead_ids, value } = parsed.data;

  // Validate the value based on action
  if (action === "status") {
    const validStatuses = ["new", "contacted", "qualified", "appointment_set", "sold", "lost"];
    if (!validStatuses.includes(value)) {
      return NextResponse.json(
        { error: `Invalid status: ${value}` },
        { status: 422 },
      );
    }
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const column = action === "assign" ? "assigned_to" : "status";

      // Build parameterized IN clause
      const placeholders = lead_ids.map((_, i) => `$${i + 3}`).join(", ");
      const result = await query(
        `UPDATE leads
         SET ${column} = $1, updated_at = NOW()
         WHERE id IN (${placeholders}) AND dealer_id = $2
         RETURNING id`,
        [value, DEALER_ID, ...lead_ids],
      );

      return NextResponse.json({
        updated: (result.rows as any[]).length,
        action,
        value,
      });
    } catch (err) {
      console.error("[api/admin/leads/bulk] DB error:", err);
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 },
      );
    }
  }

  // Fallback: report success for sample data
  return NextResponse.json({
    updated: lead_ids.length,
    action,
    value,
  });
}
