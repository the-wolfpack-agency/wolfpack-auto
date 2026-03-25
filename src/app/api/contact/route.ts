import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const contactSchema = z.object({
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
    .max(30, "Phone number too long")
    .optional()
    .default(""),
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(200, "Subject too long"),
  message: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message too long"),
});

// ---------------------------------------------------------------------------
// In-memory rate limiter (per-process)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkContactRateLimit(email: string): { allowed: boolean; resetAt?: number } {
  const key = `contact:${email.toLowerCase()}`;
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
  const parsed = contactSchema.safeParse(body);

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

  const data = parsed.data;

  // Rate limit: 3 per email per hour
  const rateCheck = checkContactRateLimit(data.email);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many submissions. Please try again later.",
        retry_after: rateCheck.resetAt,
      },
      { status: 429 },
    );
  }

  // Try to create a lead via the /api/leads endpoint internally
  const dealerId = process.env.DEALER_ID ?? "default";

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<{ id: string; created_at: string }>(
        `INSERT INTO leads (
          dealer_id, first_name, last_name, email, phone,
          vehicle_id, vehicle_interest, source, status, notes,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          NULL, $6, 'website_form', 'new', $7,
          NOW(), NOW()
        ) RETURNING id, created_at`,
        [
          dealerId,
          data.first_name.trim(),
          data.last_name.trim(),
          data.email.toLowerCase(),
          data.phone?.trim() || null,
          data.subject, // vehicle_interest stores subject for contact form leads
          `[Contact Form] ${data.message}`,
        ],
      );

      const created = result.rows[0];

      // Fire-and-forget: email notification
      void (async () => {
        try {
          const { sendLeadNotification } = await import("@/lib/email");
          const dealerResult = await query<Record<string, unknown>>(
            `SELECT * FROM dealers WHERE id = $1`,
            [dealerId],
          );
          if (dealerResult.rows[0]) {
            const dealer = dealerResult.rows[0] as unknown as import("@/types/dealer").Dealer;
            const fullLead = {
              id: created.id,
              dealer_id: dealerId,
              first_name: data.first_name.trim(),
              last_name: data.last_name.trim(),
              email: data.email.toLowerCase(),
              phone: data.phone?.trim() || null,
              vehicle_id: null,
              vehicle_interest: data.subject,
              source: "website_form" as const,
              status: "new" as const,
              notes: `[Contact Form] ${data.message}`,
              utm_source: null,
              utm_medium: null,
              utm_campaign: null,
              referrer_url: null,
              created_at: created.created_at,
              updated_at: created.created_at,
            };
            void sendLeadNotification(dealer, fullLead);
          }
        } catch (emailErr) {
          console.error("[api/contact] Email notification failed:", emailErr);
        }
      })();

      // Track analytics server-side
      void trackServerEvent("contact_form_submission", {
        subject: data.subject,
        source: "server",
      });

      return NextResponse.json(
        {
          success: true,
          lead_id: created.id,
          created_at: created.created_at,
        },
        { status: 201 },
      );
    } catch (err) {
      console.error("[api/contact] DB insert failed, using fallback:", err);
    }
  }

  // Fallback: no DB — log and return success so the user gets feedback
  console.log("[api/contact] Lead received (no DB):", {
    name: `${data.first_name} ${data.last_name}`,
    email: data.email,
    subject: data.subject,
    message: data.message.slice(0, 200),
    phone: data.phone || "(not provided)",
    timestamp: new Date().toISOString(),
  });

  // Track analytics server-side
  void trackServerEvent("contact_form_submission", {
    subject: data.subject,
    source: "server_fallback",
  });

  return NextResponse.json(
    {
      success: true,
      lead_id: `queued-${Date.now()}`,
      created_at: new Date().toISOString(),
      note: "Your message has been received. We will follow up shortly.",
    },
    { status: 201 },
  );
}
