import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Validation schema                                                          */
/* -------------------------------------------------------------------------- */

const submitSchema = z.object({
  estimate_id: z.string().min(1, "estimate_id is required"),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address").max(255),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
    .nullable()
    .optional()
    .default(null),
});

/* -------------------------------------------------------------------------- */
/* Security headers helper                                                    */
/* -------------------------------------------------------------------------- */

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

/* -------------------------------------------------------------------------- */
/* POST /api/trade-in/submit                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withSecurityHeaders(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 422 },
      ),
    );
  }

  const data = parsed.data;

  // No DB — graceful fallback
  if (!process.env.DATABASE_URL) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          lead_id: `queued-${Date.now()}`,
          message: "We'll be in touch within 24 hours",
        },
        { status: 200 },
      ),
    );
  }

  try {
    const { query } = await import("@/lib/db");
    const { checkRateLimit } = await import("@/lib/rate-limit");

    // Rate limit: 5 submissions per email per hour
    const rateCheck = await checkRateLimit(
      `trade-in-submit:${data.email.toLowerCase()}`,
      5,
      3600,
    );
    if (!rateCheck.allowed) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            error: "Too many submissions. Please try again later.",
            retry_after: rateCheck.resetAt,
          },
          { status: 429 },
        ),
      );
    }

    // Fetch the estimate record
    const estimateResult = await query<{
      id: string;
      dealer_id: string | null;
      year: number;
      make: string;
      model: string;
      estimated_low: number;
      estimated_high: number;
      lead_captured: boolean;
    }>(
      `SELECT id, dealer_id, year, make, model, estimated_low, estimated_high, lead_captured
         FROM trade_in_estimates
        WHERE id = $1`,
      [data.estimate_id],
    );

    if (estimateResult.rows.length === 0) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "Estimate not found. Please complete a valuation first." },
          { status: 404 },
        ),
      );
    }

    const estimate = estimateResult.rows[0];

    // Update estimate with lead info
    await query(
      `UPDATE trade_in_estimates
          SET first_name    = $1,
              last_name     = $2,
              email         = $3,
              phone         = $4,
              lead_captured = true
        WHERE id = $5`,
      [
        data.first_name,
        data.last_name,
        data.email.toLowerCase(),
        data.phone ?? null,
        estimate.id,
      ],
    );

    // Create a lead record
    const vehicleInterest = `${estimate.year} ${estimate.make} ${estimate.model}`;
    const leadMessage = `Trade-in inquiry: estimated value $${estimate.estimated_low.toLocaleString()}-$${estimate.estimated_high.toLocaleString()}`;

    const leadResult = await query<{ id: string }>(
      `INSERT INTO leads (
        dealer_id, first_name, last_name, email, phone,
        vehicle_interest, source, status, notes,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, 'trade_in', 'new', $7,
        NOW(), NOW()
      ) RETURNING id`,
      [
        estimate.dealer_id,
        data.first_name,
        data.last_name,
        data.email.toLowerCase(),
        data.phone ?? null,
        vehicleInterest,
        leadMessage,
      ],
    );

    const leadId = leadResult.rows[0].id;

    // Link lead back to estimate
    await query(
      `UPDATE trade_in_estimates SET converted_to_lead_id = $1 WHERE id = $2`,
      [leadId, estimate.id],
    );

    // Fire-and-forget email notification
    void (async () => {
      try {
        const { sendLeadNotification } = await import("@/lib/email");
        if (estimate.dealer_id) {
          const dealerResult = await query<Record<string, unknown>>(
            `SELECT * FROM dealers WHERE id = $1`,
            [estimate.dealer_id],
          );
          if (dealerResult.rows[0]) {
            const dealer =
              dealerResult.rows[0] as unknown as import("@/types/dealer").Dealer;
            const fakeLead = {
              id: leadId,
              dealer_id: estimate.dealer_id ?? "",
              first_name: data.first_name,
              last_name: data.last_name,
              email: data.email.toLowerCase(),
              phone: data.phone ?? null,
              vehicle_id: null,
              vehicle_interest: vehicleInterest,
              source: "trade_in" as const,
              status: "new" as const,
              temperature: "warm" as const,
              notes: leadMessage,
              structured_notes: [],
              assigned_to: null,
              message: leadMessage,
              follow_up_date: null,
              activity: [],
              utm_source: null,
              utm_medium: null,
              utm_campaign: null,
              referrer_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } satisfies import("@/types/lead").Lead;
            void sendLeadNotification(dealer, fakeLead);
          }
        }
      } catch (emailErr) {
        console.error("[api/trade-in/submit] Email notification failed:", emailErr);
      }
    })();

    return withSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          lead_id: leadId,
          message: "We'll be in touch within 24 hours",
        },
        { status: 200 },
      ),
    );
  } catch (err) {
    console.error("[api/trade-in/submit] Failed:", err);
    return withSecurityHeaders(
      NextResponse.json(
        {
          success: true,
          lead_id: `queued-${Date.now()}`,
          message: "We'll be in touch within 24 hours",
        },
        { status: 200 },
      ),
    );
  }
}
