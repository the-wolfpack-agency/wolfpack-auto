import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateTradeInValue } from "@/lib/trade-in-valuator";

/* -------------------------------------------------------------------------- */
/* Validation schema                                                          */
/* -------------------------------------------------------------------------- */

const currentYear = new Date().getFullYear();

const estimateSchema = z.object({
  year: z
    .number()
    .int()
    .min(1990, "Year must be 1990 or later")
    .max(currentYear + 1, `Year must be ${currentYear + 1} or earlier`),
  make: z.string().min(1, "Make is required").max(100),
  model: z.string().min(1, "Model is required").max(100),
  trim: z.string().max(100).optional(),
  mileage: z
    .number()
    .int()
    .min(0, "Mileage cannot be negative")
    .max(500_000, "Mileage cannot exceed 500,000"),
  condition: z.enum(["excellent", "good", "fair", "poor"]),
  accidentHistory: z.enum(["none", "minor", "major"]).default("none"),
  titleStatus: z.enum(["clean", "rebuilt", "salvage"]).default("clean"),
  previousOwners: z.number().int().min(1).max(20).default(1),
  dealer_id: z.string().uuid().optional(),
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
/* POST /api/trade-in/estimate                                                */
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

  const parsed = estimateSchema.safeParse(body);
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
        { status: 400 },
      ),
    );
  }

  const input = parsed.data;

  // Rate limit: 10 estimates per IP per hour
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (process.env.DATABASE_URL) {
    try {
      const { checkRateLimit } = await import("@/lib/rate-limit");
      const rateCheck = await checkRateLimit(
        `trade-in-estimate:${ip}`,
        10,
        3600,
      );
      if (!rateCheck.allowed) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              error: "Too many requests. Please try again later.",
              retry_after: rateCheck.resetAt,
            },
            { status: 429 },
          ),
        );
      }
    } catch {
      // Redis unavailable — fail open
    }
  }

  // Calculate valuation (pure, no I/O)
  const valuation = calculateTradeInValue({
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim,
    mileage: input.mileage,
    condition: input.condition,
    accidentHistory: input.accidentHistory,
    titleStatus: input.titleStatus,
    previousOwners: input.previousOwners,
  });

  // Persist to DB if available
  let estimateId = `est-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<{ id: string }>(
        `INSERT INTO trade_in_estimates (
          dealer_id, year, make, model, trim, mileage,
          condition, accident_history, title_status, previous_owners,
          estimated_low, estimated_high, estimated_mid, valuation_factors,
          ip_address, user_agent
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16
        ) RETURNING id`,
        [
          input.dealer_id ?? null,
          input.year,
          input.make,
          input.model,
          input.trim ?? null,
          input.mileage,
          input.condition,
          input.accidentHistory,
          input.titleStatus,
          input.previousOwners,
          valuation.estimatedLow,
          valuation.estimatedHigh,
          valuation.estimatedMid,
          JSON.stringify(valuation.factors),
          ip,
          request.headers.get("user-agent") ?? null,
        ],
      );

      estimateId = result.rows[0].id;
    } catch (err) {
      console.error("[api/trade-in/estimate] DB insert failed:", err);
      // Continue — return the valuation even if persistence fails
    }
  }

  return withSecurityHeaders(
    NextResponse.json(
      {
        id: estimateId,
        estimatedLow: valuation.estimatedLow,
        estimatedHigh: valuation.estimatedHigh,
        estimatedMid: valuation.estimatedMid,
        confidence: valuation.confidence,
        factors: valuation.factors,
        expiresAt: valuation.expiresAt.toISOString(),
      },
      { status: 200 },
    ),
  );
}
