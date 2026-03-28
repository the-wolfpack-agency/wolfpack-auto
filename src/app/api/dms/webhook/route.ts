/**
 * DMS webhook endpoint — receives inventory updates from DMS providers.
 *
 * Security:
 *  - HMAC-SHA256 signature validation
 *  - Rate limited (100 req/hr/dealer)
 *  - Returns 202 Accepted (async processing)
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/cache";
import { processFeed } from "@/lib/dms/feed-processor";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import type { DMSProvider, DMSVehicleRecord } from "@/lib/dms/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 100;

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(dealerId: string): Promise<boolean> {
  const key = `ratelimit:dms:webhook:${dealerId}`;
  const current = await cacheGet<number>(key);

  if (current !== null && current >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  await cacheSet(key, (current ?? 0) + 1, RATE_LIMIT_WINDOW_SECONDS);
  return true;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Extract dealer ID and signature from headers
  const dealerId = request.headers.get("x-dealer-id");
  const signature = request.headers.get("x-webhook-signature");

  if (!dealerId) {
    return NextResponse.json(
      { error: "Missing x-dealer-id header" },
      { status: 400 },
    );
  }

  if (!signature) {
    return NextResponse.json(
      { error: "Missing x-webhook-signature header" },
      { status: 401 },
    );
  }

  // Rate limiting
  const withinLimit = await checkRateLimit(dealerId);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 100 requests per hour per dealer." },
      { status: 429 },
    );
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  // Fetch dealer's webhook secret from feed config
  let webhookSecret: string;
  try {
    const configResult = await query<{ webhook_secret: string; provider: string }>(
      `SELECT webhook_secret, provider FROM dms_feed_configs
       WHERE dealer_id = $1 AND status = 'active'
       LIMIT 1`,
      [dealerId],
    );

    if (configResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No active DMS feed configuration found for dealer" },
        { status: 404 },
      );
    }

    const config = configResult.rows[0];

    if (!config.webhook_secret) {
      return NextResponse.json(
        { error: "Webhook secret not configured for dealer" },
        { status: 500 },
      );
    }

    webhookSecret = config.webhook_secret;
  } catch (err) {
    console.error("[dms/webhook] Config lookup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  // Verify HMAC signature using shared verification module
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // Parse payload
  let payload: { provider?: string; records?: DMSVehicleRecord[]; sync_type?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const records = payload.records;
  if (!Array.isArray(records)) {
    return NextResponse.json(
      { error: "Missing or invalid 'records' array in payload" },
      { status: 400 },
    );
  }

  const provider = (payload.provider ?? "CDK") as DMSProvider;
  const syncType = (payload.sync_type === "full" ? "full" : "incremental") as "full" | "incremental";

  // Process asynchronously — return 202 immediately
  // In production, this would be dispatched to a background job queue.
  // For now, we fire-and-forget the processing.
  processFeed(dealerId, provider, records, syncType).catch((err) => {
    console.error(`[dms/webhook] Feed processing failed for dealer ${dealerId}:`, err);
  });

  return NextResponse.json(
    {
      status: "accepted",
      message: `Processing ${records.length} vehicle records`,
      dealer_id: dealerId,
    },
    { status: 202 },
  );
}
