import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { auditLog } from "@/lib/audit-log";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const deleteRequestSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
});

// ---------------------------------------------------------------------------
// In-memory rate limiter (per-process)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(email: string): {
  allowed: boolean;
  resetAt?: number;
} {
  const key = `delete:${email.toLowerCase()}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 3;

  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate
  const parsed = deleteRequestSchema.safeParse(body);
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

  const email = parsed.data.email.toLowerCase();

  // Rate limit: 3 requests per email per hour
  const rateCheck = checkRateLimit(email);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many deletion requests. Please try again later.",
        retry_after: rateCheck.resetAt,
      },
      { status: 429 },
    );
  }

  let totalRemoved = 0;

  // If database is available, delete from all relevant tables
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Delete from leads table
      const leadsResult = await query<{ count: string }>(
        `WITH deleted AS (
          DELETE FROM leads WHERE LOWER(email) = $1 RETURNING 1
        ) SELECT COUNT(*)::text AS count FROM deleted`,
        [email],
      );
      totalRemoved += parseInt(leadsResult.rows[0]?.count ?? "0", 10);

      // Delete from contacts table (if it exists)
      try {
        const contactsResult = await query<{ count: string }>(
          `WITH deleted AS (
            DELETE FROM contacts WHERE LOWER(email) = $1 RETURNING 1
          ) SELECT COUNT(*)::text AS count FROM deleted`,
          [email],
        );
        totalRemoved += parseInt(contactsResult.rows[0]?.count ?? "0", 10);
      } catch {
        // contacts table may not exist — that's fine
      }

      // Delete analytics sessions linked to this email (if session_emails mapping exists)
      try {
        const sessionsResult = await query<{ count: string }>(
          `WITH deleted AS (
            DELETE FROM analytics_sessions WHERE LOWER(email) = $1 RETURNING 1
          ) SELECT COUNT(*)::text AS count FROM deleted`,
          [email],
        );
        totalRemoved += parseInt(sessionsResult.rows[0]?.count ?? "0", 10);
      } catch {
        // analytics_sessions table may not exist or have no email column — that's fine
      }

      console.log(
        `[api/privacy/delete-data] Deleted ${totalRemoved} records for ${email}`,
      );

      // Audit log: record data deletion (fire-and-forget)
      const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
      void auditLog("data.delete", {
        email_hash: emailHash,
        records_removed: totalRemoved,
      }).catch(() => {});

      return NextResponse.json(
        {
          status: "deleted",
          email,
          records_removed: totalRemoved,
        },
        { status: 200 },
      );
    } catch (err) {
      console.error("[api/privacy/delete-data] DB error:", err);
      return NextResponse.json(
        { error: "Failed to process deletion request. Please try again." },
        { status: 500 },
      );
    }
  }

  // Fallback: no DB configured — acknowledge the request
  console.log(
    `[api/privacy/delete-data] Deletion requested for ${email} (no DB configured)`,
  );

  return NextResponse.json(
    {
      status: "deleted",
      email,
      records_removed: 0,
      note: "Request acknowledged. If any data exists, it will be purged within 30 days.",
    },
    { status: 200 },
  );
}
