/**
 * Webhook Outbound Dispatcher — fires platform events to external URLs.
 *
 * Every analytics event can trigger webhooks for subscribed dealers.
 * The dispatcher is fire-and-forget: it never blocks the main request flow.
 *
 * Payload is HMAC-SHA256 signed so receivers can verify authenticity.
 */

import { safeFetch } from "@/lib/safe-fetch";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface WebhookOutboundConfig {
  id: string;
  dealer_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookPayload {
  id: string;
  event: string;
  dealer_id: string;
  timestamp: string;
  data: Record<string, unknown>;
  api_version: "1.0.0";
}

export interface WebhookDelivery {
  id: string;
  webhook_config_id: string;
  event: string;
  payload: WebhookPayload;
  status: "pending" | "delivered" | "failed";
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  attempts: number;
  delivered_at: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Event catalog — all subscribable events                                    */
/* -------------------------------------------------------------------------- */

export const WEBHOOK_EVENT_CATALOG = [
  { event: "lead.created", description: "New lead submitted", payload: "first_name, last_name, email, phone, vehicle_interest, source" },
  { event: "lead.duplicate_detected", description: "Duplicate lead blocked", payload: "original_lead_id, email" },
  { event: "deal.created", description: "New deal worksheet", payload: "vehicle_vin, selling_price, deal_type" },
  { event: "deal.presented", description: "Deal presented to customer", payload: "deal_id, monthly_payment" },
  { event: "deal.accepted", description: "Customer accepted deal", payload: "deal_id, total_gross" },
  { event: "deal.funded", description: "Deal funded by lender", payload: "deal_id, funded_amount" },
  { event: "service.appointment_created", description: "New service booking", payload: "customer_name, vehicle, service_type, scheduled_at" },
  { event: "service.appointment_completed", description: "Service completed", payload: "appointment_id, duration" },
  { event: "service.ro_completed", description: "Repair order completed", payload: "ro_number, grand_total" },
  { event: "review.received", description: "New review posted", payload: "platform, rating, reviewer_name" },
  { event: "comms.message_sent", description: "Message sent", payload: "channel, recipient, template" },
  { event: "document.uploaded", description: "Document uploaded", payload: "doc_type, name" },
  { event: "credit.pulled", description: "Credit report pulled", payload: "bureau, score" },
  { event: "compliance.check_run", description: "Compliance check executed", payload: "check_type, result" },
] as const;

/* -------------------------------------------------------------------------- */
/* HMAC signing                                                               */
/* -------------------------------------------------------------------------- */

function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Config store                                                               */
/* -------------------------------------------------------------------------- */

/** Sample configs returned when DATABASE_URL is not set (shadow mode). */
const SAMPLE_CONFIGS: WebhookOutboundConfig[] = [
  {
    id: "whk-001",
    dealer_id: "demo-dealer",
    url: "https://hooks.example.com/crm",
    secret: "whsec_demo_abcdef123456",
    events: ["lead.created", "deal.funded"],
    active: true,
    description: "CRM lead sync",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "whk-002",
    dealer_id: "demo-dealer",
    url: "https://hooks.example.com/accounting",
    secret: "whsec_demo_ghijkl789012",
    events: ["deal.funded", "service.ro_completed"],
    active: true,
    description: "Accounting system",
    created_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
  },
  {
    id: "whk-003",
    dealer_id: "demo-dealer",
    url: "https://hooks.example.com/all-events",
    secret: "whsec_demo_mnopqr345678",
    events: ["*"],
    active: false,
    description: "Debug — all events (inactive)",
    created_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
  },
];

/**
 * Load webhook configs for a dealer. Falls back to sample data in shadow mode.
 */
export async function getWebhookOutboundConfigs(
  dealerId: string,
): Promise<WebhookOutboundConfig[]> {
  if (!process.env.DATABASE_URL) {
    return SAMPLE_CONFIGS.filter((c) => c.dealer_id === dealerId || dealerId === "demo-dealer");
  }
  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT * FROM webhook_configs WHERE dealer_id = $1 ORDER BY created_at DESC`,
      [dealerId],
    );
    return result.rows as WebhookOutboundConfig[];
  } catch (err) {
    console.error("[webhook-outbound] Failed to load configs:", err);
    return [];
  }
}

/**
 * Get a single webhook config by ID.
 */
export async function getWebhookOutboundConfig(
  id: string,
  dealerId: string,
): Promise<WebhookOutboundConfig | null> {
  if (!process.env.DATABASE_URL) {
    return SAMPLE_CONFIGS.find((c) => c.id === id) ?? null;
  }
  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT * FROM webhook_configs WHERE id = $1 AND dealer_id = $2`,
      [id, dealerId],
    );
    return (result.rows as WebhookOutboundConfig[])[0] ?? null;
  } catch (err) {
    console.error("[webhook-outbound] Failed to load config:", err);
    return null;
  }
}

/**
 * Create a new webhook config.
 */
export async function createWebhookOutboundConfig(
  dealerId: string,
  url: string,
  events: string[],
  description?: string,
): Promise<WebhookOutboundConfig> {
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    const config: WebhookOutboundConfig = {
      id,
      dealer_id: dealerId,
      url,
      secret,
      events,
      active: true,
      description: description ?? null as unknown as undefined,
      created_at: now,
      updated_at: now,
    };
    SAMPLE_CONFIGS.push(config);
    return config;
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `INSERT INTO webhook_configs (id, dealer_id, url, secret, events, active, description)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     RETURNING *`,
    [id, dealerId, url, secret, events, description ?? null],
  );
  return (result.rows as WebhookOutboundConfig[])[0];
}

/**
 * Update a webhook config.
 */
export async function updateWebhookOutboundConfig(
  id: string,
  dealerId: string,
  updates: { url?: string; events?: string[]; active?: boolean; description?: string },
): Promise<WebhookOutboundConfig | null> {
  if (!process.env.DATABASE_URL) {
    const idx = SAMPLE_CONFIGS.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    Object.assign(SAMPLE_CONFIGS[idx], updates, { updated_at: new Date().toISOString() });
    return SAMPLE_CONFIGS[idx];
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.url !== undefined) {
    setClauses.push(`url = $${paramIdx++}`);
    params.push(updates.url);
  }
  if (updates.events !== undefined) {
    setClauses.push(`events = $${paramIdx++}`);
    params.push(updates.events);
  }
  if (updates.active !== undefined) {
    setClauses.push(`active = $${paramIdx++}`);
    params.push(updates.active);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    params.push(updates.description);
  }
  setClauses.push(`updated_at = NOW()`);

  params.push(id, dealerId);

  const { query } = await import("@/lib/db");
  const result = await query(
    `UPDATE webhook_configs SET ${setClauses.join(", ")} WHERE id = $${paramIdx++} AND dealer_id = $${paramIdx} RETURNING *`,
    params,
  );
  return (result.rows as WebhookOutboundConfig[])[0] ?? null;
}

/**
 * Delete a webhook config.
 */
export async function deleteWebhookOutboundConfig(
  id: string,
  dealerId: string,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    const idx = SAMPLE_CONFIGS.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    SAMPLE_CONFIGS.splice(idx, 1);
    return true;
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `DELETE FROM webhook_configs WHERE id = $1 AND dealer_id = $2`,
    [id, dealerId],
  );
  return (result.rowCount ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/* Delivery log                                                               */
/* -------------------------------------------------------------------------- */

async function logDelivery(
  configId: string,
  event: string,
  payload: WebhookPayload,
  status: "delivered" | "failed",
  statusCode: number | null,
  responseBody: string | null,
  errorMessage: string | null,
  attempts: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO webhook_deliveries
        (id, webhook_config_id, event, payload, status, status_code, response_body, error_message, attempts, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        crypto.randomUUID(),
        configId,
        event,
        JSON.stringify(payload),
        status,
        statusCode,
        responseBody,
        errorMessage,
        attempts,
        status === "delivered" ? new Date().toISOString() : null,
      ],
    );
  } catch (err) {
    console.error("[webhook-outbound] Failed to log delivery:", err);
  }
}

/**
 * Get recent deliveries, optionally filtered by status.
 */
export async function getWebhookDeliveries(
  dealerId: string,
  opts?: { status?: string; limit?: number; configId?: string },
): Promise<WebhookDelivery[]> {
  if (!process.env.DATABASE_URL) {
    // Shadow mode — return sample deliveries
    return [
      {
        id: "del-001",
        webhook_config_id: "whk-001",
        event: "lead.created",
        payload: { id: "del-001", event: "lead.created", dealer_id: dealerId, timestamp: "2026-03-27T10:00:00Z", data: { first_name: "Jane", last_name: "Doe" }, api_version: "1.0.0" },
        status: "delivered",
        status_code: 200,
        response_body: '{"ok":true}',
        error_message: null,
        attempts: 1,
        delivered_at: "2026-03-27T10:00:01Z",
        created_at: "2026-03-27T10:00:00Z",
      },
      {
        id: "del-002",
        webhook_config_id: "whk-002",
        event: "deal.funded",
        payload: { id: "del-002", event: "deal.funded", dealer_id: dealerId, timestamp: "2026-03-27T11:00:00Z", data: { deal_id: "d-99", funded_amount: 28500 }, api_version: "1.0.0" },
        status: "delivered",
        status_code: 200,
        response_body: '{"received":true}',
        error_message: null,
        attempts: 1,
        delivered_at: "2026-03-27T11:00:01Z",
        created_at: "2026-03-27T11:00:00Z",
      },
      {
        id: "del-003",
        webhook_config_id: "whk-001",
        event: "lead.created",
        payload: { id: "del-003", event: "lead.created", dealer_id: dealerId, timestamp: "2026-03-27T12:00:00Z", data: { first_name: "John", last_name: "Smith" }, api_version: "1.0.0" },
        status: "failed",
        status_code: 503,
        response_body: null,
        error_message: "Service Unavailable",
        attempts: 2,
        delivered_at: null,
        created_at: "2026-03-27T12:00:00Z",
      },
    ];
  }

  try {
    const { query } = await import("@/lib/db");
    const conditions = ["wc.dealer_id = $1"];
    const params: unknown[] = [dealerId];
    let paramIdx = 2;

    if (opts?.status) {
      conditions.push(`wd.status = $${paramIdx++}`);
      params.push(opts.status);
    }
    if (opts?.configId) {
      conditions.push(`wd.webhook_config_id = $${paramIdx++}`);
      params.push(opts.configId);
    }

    const limit = opts?.limit ?? 50;
    params.push(limit);

    const result = await query(
      `SELECT wd.* FROM webhook_deliveries wd
       JOIN webhook_configs wc ON wc.id = wd.webhook_config_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY wd.created_at DESC
       LIMIT $${paramIdx}`,
      params,
    );
    return result.rows as WebhookDelivery[];
  } catch (err) {
    console.error("[webhook-outbound] Failed to load deliveries:", err);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Deliver a webhook payload to a single URL. Retries once after 5s on failure.
 */
async function deliverWebhook(
  config: WebhookOutboundConfig,
  payload: WebhookPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, config.secret);
  let attempts = 0;
  let lastStatusCode: number | null = null;
  let lastResponseBody: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    try {
      const response = await safeFetch(config.url, {
        method: "POST",
        timeoutMs: 10_000,
        retries: 0, // We handle retries ourselves
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-ID": payload.id,
          "X-Webhook-Event": payload.event,
        },
        body,
      });

      lastStatusCode = response.status;
      try {
        lastResponseBody = await response.text();
      } catch {
        lastResponseBody = null;
      }

      if (response.ok) {
        await logDelivery(config.id, payload.event, payload, "delivered", lastStatusCode, lastResponseBody, null, attempts);
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Retry after 5s delay (only on first failure)
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  // All attempts exhausted
  await logDelivery(config.id, payload.event, payload, "failed", lastStatusCode, lastResponseBody, lastError, attempts);
  console.error(`[webhook-outbound] Failed to deliver ${payload.event} to ${config.url}: ${lastError}`);
}

/**
 * Dispatch webhooks for a platform event to all subscribed configs.
 *
 * This is fire-and-forget — it never throws and never blocks the caller.
 * Call this after every analytics event to push real-time data to CRM integrations.
 */
export async function dispatchWebhooks(
  event: string,
  dealerId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const configs = await getWebhookOutboundConfigs(dealerId);
    const activeConfigs = configs.filter(
      (c) => c.active && (c.events.includes("*") || c.events.includes(event)),
    );

    if (activeConfigs.length === 0) return;

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      dealer_id: dealerId,
      timestamp: new Date().toISOString(),
      data: metadata,
      api_version: "1.0.0",
    };

    // Fire all deliveries in parallel — do not await in the main request
    await Promise.allSettled(
      activeConfigs.map((config) => deliverWebhook(config, payload)),
    );
  } catch (err) {
    console.error("[webhook-outbound] Dispatch error:", err);
    // Never throw — webhooks must not break the platform
  }
}

/**
 * Send a test webhook with sample data to verify the URL works.
 */
export async function sendTestWebhook(
  config: WebhookOutboundConfig,
): Promise<{ success: boolean; status_code: number | null; error?: string }> {
  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    event: "webhook.test",
    dealer_id: config.dealer_id,
    timestamp: new Date().toISOString(),
    data: {
      message: "This is a test webhook from Wolfpack Auto",
      config_id: config.id,
      subscribed_events: config.events,
    },
    api_version: "1.0.0",
  };

  const body = JSON.stringify(payload);
  const signature = signPayload(body, config.secret);

  try {
    const response = await safeFetch(config.url, {
      method: "POST",
      timeoutMs: 10_000,
      retries: 0,
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-ID": payload.id,
        "X-Webhook-Event": payload.event,
      },
      body,
    });

    const status = response.status;
    await logDelivery(
      config.id,
      "webhook.test",
      payload,
      response.ok ? "delivered" : "failed",
      status,
      null,
      response.ok ? null : `HTTP ${status}`,
      1,
    );

    return { success: response.ok, status_code: status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await logDelivery(config.id, "webhook.test", payload, "failed", null, null, error, 1);
    return { success: false, status_code: null, error };
  }
}
