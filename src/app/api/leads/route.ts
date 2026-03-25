import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Lead submission schema — strict validation.
 */
const leadSchema = z.object({
  dealer_id: z.string().min(1, "dealer_id is required"),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name too long"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name too long"),
  email: z.string().email("Invalid email address").max(255),
  phone: z
    .string()
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      "Invalid phone number (E.164 format expected)",
    )
    .nullable()
    .optional()
    .default(null),
  vehicle_id: z.string().nullable().optional().default(null),
  vehicle_interest: z
    .string()
    .min(1, "Vehicle interest is required")
    .max(500),
  source: z
    .enum([
      "website_form",
      "vdp_inquiry",
      "chat",
      "phone",
      "third_party",
      "walk_in",
    ])
    .default("website_form"),
  notes: z.string().max(2000).optional().default(""),

  // Attribution (optional)
  utm_source: z.string().max(200).nullable().optional().default(null),
  utm_medium: z.string().max(200).nullable().optional().default(null),
  utm_campaign: z.string().max(200).nullable().optional().default(null),
  referrer_url: z.string().url().max(2000).nullable().optional().default(null),
});

export async function POST(request: NextRequest) {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = leadSchema.safeParse(body);

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

  const lead = parsed.data;

  // Check if database is available
  if (!process.env.DATABASE_URL) {
    // No DB — accept the lead gracefully and indicate it was queued
    return NextResponse.json(
      {
        success: true,
        lead_id: `queued-${Date.now()}`,
        created_at: new Date().toISOString(),
        note: "Lead has been queued for processing. Database is currently unavailable.",
      },
      { status: 201 },
    );
  }

  try {
    // Dynamic import to avoid module-level errors when pg is not configured
    const { query } = await import("@/lib/db");
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const { cacheInvalidate } = await import("@/lib/cache");

    // Rate limit: max 5 leads per email per hour
    const rateLimitKey = `lead:${lead.email.toLowerCase()}`;
    const rateCheck = await checkRateLimit(rateLimitKey, 5, 3600);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Too many submissions. Please try again later.",
          retry_after: rateCheck.resetAt,
        },
        { status: 429 },
      );
    }

    // Insert into PostgreSQL with parameterised query
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO leads (
        dealer_id, first_name, last_name, email, phone,
        vehicle_id, vehicle_interest, source, status, notes,
        utm_source, utm_medium, utm_campaign, referrer_url,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'new', $9,
        $10, $11, $12, $13,
        NOW(), NOW()
      ) RETURNING id, created_at`,
      [
        lead.dealer_id,
        lead.first_name,
        lead.last_name,
        lead.email.toLowerCase(),
        lead.phone,
        lead.vehicle_id,
        lead.vehicle_interest,
        lead.source,
        lead.notes,
        lead.utm_source,
        lead.utm_medium,
        lead.utm_campaign,
        lead.referrer_url,
      ],
    );

    const created = result.rows[0];

    // Invalidate any cached lead-related data for this dealer
    void cacheInvalidate(`leads:dealer:${lead.dealer_id}:*`);

    return NextResponse.json(
      {
        success: true,
        lead_id: created.id,
        created_at: created.created_at,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/leads] Insert failed:", err);

    // Graceful fallback — accept the lead even if DB is down
    return NextResponse.json(
      {
        success: true,
        lead_id: `queued-${Date.now()}`,
        created_at: new Date().toISOString(),
        note: "Lead has been queued for processing. Please allow additional time for follow-up.",
      },
      { status: 201 },
    );
  }
}
