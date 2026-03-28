/**
 * POST /api/privacy/delete-data — CCPA data deletion request
 *
 * Accepts a customer email, verifies admin auth, anonymizes all PII
 * across leads, credit_pulls, message_log, reviews, and deal_worksheets,
 * then logs the deletion for audit compliance.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { deleteCustomerData } from "@/lib/privacy";
import { trackCompliance } from "@/lib/analytics-hooks";

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
  // Require admin authentication
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const { dealer_id: dealerId, id: userId } = authResult.user;

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

  try {
    const result = await deleteCustomerData(email, dealerId, userId);

    // Audit log hash (never log the raw email)
    const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
    console.log(
      `[api/privacy/delete-data] Processed deletion for ${emailHash}: ${result.data_categories_deleted.length} categories`,
    );

    // Track compliance event — fire-and-forget
    try {
      trackCompliance("compliance.check_run", dealerId, {
        action: "data_deletion",
        email_hash: emailHash,
        categories_deleted: result.data_categories_deleted.length,
        request_id: result.id,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({
      success: true,
      deletion: {
        id: result.id,
        status: result.status,
        completed_at: result.completed_at,
        data_categories_deleted: result.data_categories_deleted,
      },
    });
  } catch (err) {
    console.error("[api/privacy/delete-data] Error:", err);
    return NextResponse.json(
      { error: "Failed to process deletion request" },
      { status: 500 },
    );
  }
}
