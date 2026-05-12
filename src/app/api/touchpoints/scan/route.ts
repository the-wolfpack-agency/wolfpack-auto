/**
 * POST /api/touchpoints/scan
 *
 * Public, rate-limited endpoint. Customer phones POST here when they
 * scan a QR / NFC / RFID / iBeacon. The dispatcher parses + validates
 * the payload, records the event, and returns the action slug for the
 * assistant layer to execute on the next conversational turn.
 *
 * Auth: NONE. Tenants are identified by the touchpoint payload itself
 * (the canonical `wp://qr/{tenant_id}/...` URI is the year-1 source of
 * truth) or, for unsigned URL / JSON formats, by the caller-supplied
 * `tenant_id` field in the body.
 *
 * Rate-limit: 30 / minute per IP. Public endpoint -- a hostile actor
 * spamming scan payloads cannot exhaust DB capacity.
 *
 * Response shape mirrors {@link DispatchResult}:
 *   { event_id, outcome, action_slug?, action_parameters?, detail? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";
import {
  dispatchScan,
  TOUCHPOINT_TYPES,
  type TouchpointType,
} from "@/lib/touchpoints";

const TENANT_ID_PATTERN = /^[0-9a-fA-F-]{36}$/;

const scanSchema = z.object({
  /** UUID of the tenant the scan belongs to. Required for unsigned formats. */
  tenant_id: z
    .string()
    .regex(TENANT_ID_PATTERN, "tenant_id must be a UUID"),
  /** Touchpoint type -- matches the migration 081 CHECK constraint. */
  type: z.enum(TOUCHPOINT_TYPES as unknown as [TouchpointType, ...TouchpointType[]]),
  /** Raw scan payload -- handler decides how to parse it. */
  raw: z.string().min(1, "raw payload is required").max(4096),
  /** Optional logged-in customer id. */
  customer_id: z
    .string()
    .regex(TENANT_ID_PATTERN, "customer_id must be a UUID")
    .optional(),
});

function getIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(request: NextRequest) {
  const ip = getIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  // Rate-limit: 30/min per IP.
  const rl = await checkRateLimit(`touchpoints:scan:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: rl.resetAt - Math.floor(Date.now() / 1000) },
      { status: 429 },
    );
  }

  // Parse body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const { tenant_id, type, raw, customer_id } = parsed.data;

  try {
    const result = await dispatchScan(tenant_id, type, raw, {
      customerId: customer_id,
      ip,
      ua,
    });
    return NextResponse.json(
      {
        event_id: result.eventId,
        outcome: result.outcome,
        action_slug: result.actionSlug ?? null,
        action_parameters: result.actionParameters ?? null,
        detail: result.detail ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[touchpoints/scan] dispatcher threw:", err);
    return NextResponse.json(
      { error: "dispatch_failed" },
      { status: 500 },
    );
  }
}
