/**
 * Webhook dispatcher — delivers CRM/integration events to external providers.
 *
 * Loads configs from PostgreSQL (webhooks table), falls back to empty array.
 * Fire-and-forget with error logging; retries once on failure after 5 seconds.
 */

import { formatForHubSpot } from "@/lib/webhooks/hubspot";
import { formatForSalesforce } from "@/lib/webhooks/salesforce";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  id: string;
  dealer_id: string;
  provider: "hubspot" | "salesforce" | "zapier" | "custom";
  url: string;
  api_key?: string;
  events: string[]; // ['lead.created', 'lead.status_changed', 'vehicle.added']
  active: boolean;
}

export type WebhookEvent =
  | "lead.created"
  | "lead.status_changed"
  | "vehicle.added"
  | (string & {});

// ---------------------------------------------------------------------------
// Config store (PostgreSQL with graceful fallback)
// ---------------------------------------------------------------------------

/**
 * Load all webhook configurations for a dealer.
 * Returns an empty array when the database is unavailable.
 */
export async function getWebhookConfigs(
  dealerId: string,
): Promise<WebhookConfig[]> {
  try {
    if (!process.env.DATABASE_URL) return [];

    const { query } = await import("@/lib/db");
    const result = await query<{
      id: string;
      dealer_id: string;
      provider: WebhookConfig["provider"];
      url: string;
      api_key: string | null;
      events: string[];
      active: boolean;
    }>(
      `SELECT id, dealer_id, provider, url, api_key, events, active
       FROM webhooks
       WHERE dealer_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [dealerId],
    );

    return result.rows.map((row) => ({
      ...row,
      api_key: row.api_key ?? undefined,
    }));
  } catch (err) {
    console.error("[webhooks] Failed to load configs:", err);
    return [];
  }
}

/**
 * Persist a webhook configuration (upsert by id).
 */
export async function saveWebhookConfig(
  config: WebhookConfig,
): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // audit-safe: A8 reason="literal env var NAME in message string — value is not interpolated"
    console.warn("[webhooks] No DATABASE_URL — config not persisted");
    return;
  }

  const { query } = await import("@/lib/db");

  await query(
    `INSERT INTO webhooks (id, dealer_id, provider, url, api_key, events, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       provider   = EXCLUDED.provider,
       url        = EXCLUDED.url,
       api_key    = EXCLUDED.api_key,
       events     = EXCLUDED.events,
       active     = EXCLUDED.active,
       updated_at = NOW()`,
    [
      config.id,
      config.dealer_id,
      config.provider,
      config.url,
      config.api_key ?? null,
      config.events,
      config.active,
    ],
  );
}

/**
 * Delete a webhook configuration by id.
 */
export async function deleteWebhookConfig(
  id: string,
  dealerId: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const { query } = await import("@/lib/db");
  // Soft delete — preserve for audit trail
  await query(
    `UPDATE webhooks SET deleted_at = NOW() WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
    [id, dealerId],
  );
}

// ---------------------------------------------------------------------------
// Payload formatting per provider
// ---------------------------------------------------------------------------

function formatPayload(
  provider: WebhookConfig["provider"],
  event: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  switch (provider) {
    case "hubspot":
      return formatForHubSpot(payload);

    case "salesforce":
      return formatForSalesforce(payload);

    case "zapier":
    case "custom":
    default:
      return { event, timestamp: new Date().toISOString(), data: payload };
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

async function deliverWebhook(
  config: WebhookConfig,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(formatPayload(config.provider, event, payload));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": event,
  };

  if (config.api_key) {
    // HubSpot/Salesforce use Bearer; Zapier/custom use the same convention
    headers["Authorization"] = `Bearer ${config.api_key}`;
  }

  const doFetch = () =>
    fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

  try {
    const res = await doFetch();
    if (!res.ok) {
      console.error(
        `[webhooks] ${config.provider} returned ${res.status} for event "${event}" (webhook ${config.id})`,
      );
      // Retry once after 5 seconds
      setTimeout(async () => {
        try {
          const retry = await doFetch();
          if (!retry.ok) {
            console.error(
              `[webhooks] Retry failed: ${config.provider} returned ${retry.status} (webhook ${config.id})`,
            );
          }
        } catch (retryErr) {
          console.error(
            `[webhooks] Retry error for ${config.provider} (webhook ${config.id}):`,
            retryErr,
          );
        }
      }, 5_000);
    }
  } catch (err) {
    console.error(
      `[webhooks] Delivery error for ${config.provider} (webhook ${config.id}):`,
      err,
    );
    // Retry once after 5 seconds
    setTimeout(async () => {
      try {
        await doFetch();
      } catch (retryErr) {
        console.error(
          `[webhooks] Retry error for ${config.provider} (webhook ${config.id}):`,
          retryErr,
        );
      }
    }, 5_000);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a webhook event to all active configurations matching the event
 * for the given dealer. Fire-and-forget — never blocks the caller.
 */
export async function dispatchWebhook(
  event: string,
  payload: Record<string, unknown>,
  dealerId: string,
): Promise<void> {
  try {
    const configs = await getWebhookConfigs(dealerId);
    const matching = configs.filter(
      (c) => c.active && c.events.includes(event),
    );

    if (matching.length === 0) return;

    console.info(
      `[webhooks] Dispatching "${event}" to ${matching.length} webhook(s) for dealer ${dealerId}`,
    );

    // Fire all deliveries in parallel, never await the overall result
    for (const config of matching) {
      void deliverWebhook(config, event, payload).catch((err) => {
        console.error(
          `[webhooks] Unhandled delivery error (webhook ${config.id}):`,
          err,
        );
      });
    }
  } catch (err) {
    console.error("[webhooks] dispatchWebhook failed:", err);
  }
}
