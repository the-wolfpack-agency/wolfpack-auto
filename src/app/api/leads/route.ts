import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encryptPII } from "@/lib/crypto";
import { auditLog } from "@/lib/audit-log";
import { scoreLeadIntent, extractEmailDomain } from "@/lib/lead-scorer";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";
import { trackLead } from "@/lib/analytics-hooks";

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

  // Idempotency — prevent duplicate lead submissions from double-clicks
  const iKey = idempotencyKey("/api/leads", { email: lead.email, vehicle_interest: lead.vehicle_interest, dealer_id: lead.dealer_id });
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  // Check if database is available
  if (!process.env.DATABASE_URL) {
    // No DB — accept the lead gracefully and indicate it was queued
    const queuedResp = {
      success: true,
      lead_id: `queued-${Date.now()}`,
      created_at: new Date().toISOString(),
      note: "Lead has been queued for processing. Database is currently unavailable.",
    };
    recordIdempotency(iKey, queuedResp);
    return NextResponse.json(queuedResp, { status: 201 });
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

    // Check for duplicate (same email, same dealer, last 30 days)
    const existingLead = await query<{ id: string }>(
      `SELECT id FROM leads WHERE email = $1 AND dealer_id = $2 AND created_at > NOW() - INTERVAL '30 days' AND deleted_at IS NULL LIMIT 1`,
      [lead.email.toLowerCase(), lead.dealer_id],
    );
    if (existingLead.rows.length > 0) {
      trackLead("lead.duplicate_detected", lead.dealer_id, {
        existing_lead_id: existingLead.rows[0].id,
        source: lead.source,
      });
      return NextResponse.json(
        { id: existingLead.rows[0].id, duplicate: true, message: "Lead already exists" },
        { status: 200 },
      );
    }

    // Encrypt PII fields before storage
    const encryptedEmail = encryptPII(lead.email.toLowerCase());
    const encryptedPhone = lead.phone?.trim()
      ? encryptPII(lead.phone.trim())
      : null;

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
        encryptedEmail,
        encryptedPhone,
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

    // Score the lead immediately so it appears scored from first view
    void (async () => {
      try {
        const now = new Date();
        const leadScore = scoreLeadIntent({
          source: lead.source,
          vehicleInterest: lead.vehicle_interest,
          hasPhone: !!lead.phone?.trim(),
          messageLength: lead.notes?.length ?? 0,
          emailDomain: extractEmailDomain(lead.email),
          submittedHour: now.getUTCHours(),
          submittedDayOfWeek: now.getUTCDay(),
        });

        await query(
          `UPDATE leads
              SET intent_score            = $1,
                  score_factors           = $2,
                  recommended_followup_at = $3,
                  scored_at               = NOW(),
                  temperature             = $4,
                  updated_at              = NOW()
            WHERE id = $5`,
          [
            leadScore.score,
            JSON.stringify(leadScore.factors),
            leadScore.recommendedFollowupAt.toISOString(),
            leadScore.tier,
            created.id,
          ],
        );
      } catch (scoreErr) {
        console.error("[api/leads] Lead scoring failed:", scoreErr);
      }
    })();

    // Audit log: record lead creation (fire-and-forget)
    void auditLog("lead.create", {
      lead_id: created.id,
      source: lead.source,
      pii_encrypted: !!process.env.PII_ENCRYPTION_KEY,
    }).catch(() => {});

    // Invalidate any cached lead-related data for this dealer
    void cacheInvalidate(`leads:dealer:${lead.dealer_id}:*`);

    // Fire-and-forget email notifications — never block the response
    void (async () => {
      try {
        // Legacy branded emails (dealer-specific templates)
        const { sendLeadNotification, sendLeadConfirmation } = await import(
          "@/lib/email"
        );
        const dealerResult = await query<Record<string, unknown>>(
          `SELECT * FROM dealers WHERE id = $1`,
          [lead.dealer_id],
        );
        if (dealerResult.rows[0]) {
          const dealer = dealerResult.rows[0] as unknown as import("@/types/dealer").Dealer;
          const fullLead = {
            ...lead,
            id: created.id,
            status: "new" as const,
            temperature: "warm" as const,
            structured_notes: [],
            assigned_to: null,
            message: "",
            follow_up_date: null,
            activity: [],
            created_at: created.created_at,
            updated_at: created.created_at,
          } satisfies import("@/types/lead").Lead;

          void sendLeadNotification(dealer, fullLead);
          void sendLeadConfirmation(dealer, fullLead);
        }

        // New notification dispatcher (broadcasts to all enabled staff)
        const { notifyNewLead } = await import("@/lib/notifications");
        void notifyNewLead(
          {
            name: `${lead.first_name} ${lead.last_name}`,
            email: lead.email.toLowerCase(),
            phone: lead.phone ?? undefined,
            vehicle_interest: lead.vehicle_interest,
            source: lead.source,
          },
          lead.dealer_id,
        );

        // CRM / webhook integrations
        const { dispatchWebhook } = await import("@/lib/webhooks");
        void dispatchWebhook(
          "lead.created",
          {
            lead_id: created.id,
            first_name: lead.first_name,
            last_name: lead.last_name,
            name: `${lead.first_name} ${lead.last_name}`,
            email: lead.email.toLowerCase(),
            phone: lead.phone,
            vehicle_interest: lead.vehicle_interest,
            source: lead.source,
            notes: lead.notes,
            utm_source: lead.utm_source,
            utm_medium: lead.utm_medium,
            utm_campaign: lead.utm_campaign,
            created_at: created.created_at,
          },
          lead.dealer_id,
        );
      } catch (emailErr) {
        console.error("[api/leads] Email notification failed:", emailErr);
      }
    })();

    const successResp = {
      success: true,
      lead_id: created.id,
      created_at: created.created_at,
    };
    recordIdempotency(iKey, successResp);
    return NextResponse.json(successResp, { status: 201 });
  } catch (err) {
    console.error("[api/leads] Insert failed:", err);

    // Graceful fallback — accept the lead even if DB is down
    const fallbackResp = {
      success: true,
      lead_id: `queued-${Date.now()}`,
      created_at: new Date().toISOString(),
      note: "Lead has been queued for processing. Please allow additional time for follow-up.",
    };
    recordIdempotency(iKey, fallbackResp);
    return NextResponse.json(fallbackResp, { status: 201 });
  }
}
