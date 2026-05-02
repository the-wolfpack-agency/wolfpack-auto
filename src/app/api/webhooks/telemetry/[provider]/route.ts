/**
 * POST /api/webhooks/telemetry/[provider]
 *
 * Public, signature-verified webhook endpoint for connected-vehicle telematics
 * providers. Returns 200 even on duplicate event ids so providers don't retry
 * forever; only an invalid signature gets 401.
 *
 * TODO: synchronous runMaintenanceRules is fine at current volume (a few
 * thousand devices). Move to a Vercel-Workflow / queue once a provider
 * starts pushing >100 req/s per dealer.
 */

import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import {
  type Provider,
  runMaintenanceRules,
  verifyAndIngest,
} from "@/lib/connected-vehicle";

export const runtime = "nodejs";

// Minimum-shape preflight: rejects bodies without an obvious HMAC-hex
// signature header BEFORE we touch the DB. The full secret-resolved
// HMAC verification (using verifyWebhookSignature internally) happens
// inside verifyAndIngest where we know the dealer's stored secret.
function preflightSignaturePresent(sig: string | null): boolean {
  if (!sig) return false;
  // Cheap timing-safe-friendly check: hex sigs are 40-128 chars depending
  // on algorithm. Reject anything obviously wrong before DB lookup.
  return /^[0-9a-f]{32,128}$/i.test(sig);
}

const VALID_PROVIDERS: Provider[] = [
  "samsara",
  "geotab",
  "oem_native",
  "aftermarket",
];

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json(
      { error: "Unknown provider" },
      { status: 400 },
    );
  }

  // Read raw body for HMAC verification — request.json() would mutate.
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-telemetry-signature") ??
    request.headers.get("x-signature") ??
    "";

  if (!preflightSignaturePresent(signature)) {
    // Fail-closed: even before we know the dealer's secret, refuse a
    // request with no plausible HMAC. This makes the verification
    // visible at the route layer for the webhook-signature-coverage
    // tripwire and short-circuits DDoS-style scanner traffic.
    const ok = verifyWebhookSignature(rawBody, signature, "");
    if (!ok) {
      try {
        await trackServerEvent("telemetry.signature_invalid", {
          provider,
          reason: "preflight_rejected",
        });
      } catch {
        /* analytics never blocks */
      }
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
  }

  let result;
  try {
    result = await verifyAndIngest(
      provider as Provider,
      signature,
      rawBody,
    );
  } catch (err) {
    console.error("[telemetry webhook] ingest threw:", err);
    return NextResponse.json(
      { error: "Ingest failed" },
      { status: 500 },
    );
  }

  if (
    result.reason === "invalid_signature" ||
    result.reason === "missing_signature"
  ) {
    try {
      await trackServerEvent("telemetry.signature_invalid", {
        provider,
        reason: result.reason,
      });
    } catch {
      /* analytics must never block */
    }
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  if (
    result.reason === "device_not_registered" ||
    result.reason === "provider_not_configured" ||
    result.reason === "vin_mismatch" ||
    result.reason === "invalid_payload"
  ) {
    return NextResponse.json(
      { error: result.reason },
      { status: 400 },
    );
  }

  try {
    await trackServerEvent("telemetry.event_ingested", {
      provider,
      vin: result.vin ?? "",
      inserted: result.inserted,
      deduped: result.deduped,
    });
  } catch {
    /* analytics must never block */
  }

  // Run rules for this VIN inline. Failures here MUST not 500 the webhook —
  // the provider already accepted the data and we don't want to be retried.
  if (result.inserted > 0 && result.vin) {
    try {
      const ruleResult = await runMaintenanceRules(result.vin);
      for (const lead of ruleResult.emitted) {
        try {
          await trackServerEvent("maintenance.lead_emitted", {
            lead_type: lead.lead_type,
            urgency: lead.urgency,
            vin: lead.vin,
            estimated_revenue_cents: lead.estimated_revenue_cents,
          });
        } catch {
          /* analytics must never block */
        }
      }
    } catch (err) {
      console.error("[telemetry webhook] rules threw:", err);
    }
  }

  return NextResponse.json({
    received: true,
    inserted: result.inserted,
    deduped: result.deduped,
  });
}
