/**
 * POST /api/address/validate
 *
 * PUBLIC, rate-limited endpoint. Validates + canonicalizes a US address
 * against USPS Web Tools. Used by:
 *   - lead-capture forms (pre-submit)
 *   - dealer-settings save (server-side)
 *
 * Behavior:
 *   - 200 — always returns 200 when input is well-formed. The body's
 *           `status` tells the caller whether the address validated, was
 *           corrected, or could not be verified.
 *   - 400 — body parse error or missing `street1`.
 *   - 429 — rate-limit hit (handled inside checkRateLimit caller).
 *   - 200 + { validated: false, reason: 'service_not_configured' } when
 *           USPS_USER_ID is unset (graceful no-key fallback).
 *
 * Wiring (per Stream E spec):
 *   - checkRateLimit (token bucket, in-memory fallback on Redis outage).
 *   - 24h Redis cache (via @/lib/cache) on the USPS response.
 *   - Analytics events on every outcome.
 *   - Optional dealer_id captured for analytics + persistence, but the
 *     route does NOT require auth (it's a pre-submit form helper).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateAddress } from "@/lib/usps-address";
import { trackAddressValidation } from "@/lib/analytics-hooks";

const PUBLIC_DEALER_ID = "00000000-0000-4000-a000-000000000000";

const PUBLIC_RATE_LIMIT_MAX = 30;
const PUBLIC_RATE_LIMIT_WINDOW_SEC = 60;

const BodySchema = z
  .object({
    street1: z.string().min(1, "street1 is required"),
    street2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    dealer_id: z.string().uuid().optional(),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate-limit on caller IP (works for both authenticated dealer-settings
  // posts and anonymous lead-capture submissions).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rl = await checkRateLimit(
    `address-validate:${ip}`,
    PUBLIC_RATE_LIMIT_MAX,
    PUBLIC_RATE_LIMIT_WINDOW_SEC,
  );

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { street1, street2, city, state, zip, dealer_id } = parsed.data;
  const dealerId = dealer_id ?? PUBLIC_DEALER_ID;

  try {
    const result = await validateAddress({
      street1,
      street2,
      city,
      state,
      zip,
    });

    // Analytics fire-and-forget on every outcome.
    try {
      if (result.status === "valid") {
        trackAddressValidation("address.validation_succeeded", dealerId, {
          source: result.source,
        });
      } else if (result.status === "correctable") {
        trackAddressValidation("address.validation_corrected", dealerId, {
          source: result.source,
        });
      } else {
        trackAddressValidation("address.validation_failed", dealerId, {
          source: result.source,
          reason: result.reason ?? "unknown",
        });
      }
    } catch {
      /* analytics must not throw */
    }

    return NextResponse.json(result, {
      headers: {
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.resetAt),
      },
    });
  } catch (err) {
    console.error("[POST /api/address/validate] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
