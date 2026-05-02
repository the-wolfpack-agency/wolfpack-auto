/**
 * Connected-Vehicle Telemetry Intake.
 *
 * Verifies HMAC-signed webhooks from telematics providers (Samsara, Geotab,
 * OEM-native, aftermarket dongles), persists each event, and runs a
 * declarative rule engine that emits predictive-maintenance leads.
 *
 * Routes never call into Postgres / Qdrant / Neo4j directly — they go through
 * this module so the verification + ingest + rule path stays consistent.
 */

import crypto from "crypto";
import { z } from "zod";
import { query } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";
import type { AnalyticsEvent } from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Provider = "samsara" | "geotab" | "oem_native" | "aftermarket";

export type SignalType =
  | "odometer"
  | "fault_code"
  | "fuel_level"
  | "tire_pressure"
  | "battery"
  | "oil_life"
  | "brake_wear"
  | "location"
  | "other";

export type LeadType =
  | "oil_change"
  | "brake_service"
  | "tire_replacement"
  | "battery_replacement"
  | "recall"
  | "general_dtc"
  | "mileage_milestone";

export type Urgency = "immediate" | "soon" | "scheduled" | "monitoring";
export type LeadStatus =
  | "open"
  | "contacted"
  | "scheduled"
  | "completed"
  | "dismissed";

export interface IngestResult {
  inserted: number;
  deduped: number;
  vin: string | null;
  reason?: string;
}

export interface MaintenanceLead {
  id: string;
  dealer_id: string;
  vin: string;
  customer_id: string;
  lead_type: LeadType;
  urgency: Urgency;
  confidence: number;
  evidence_event_ids: string[];
  suggested_action: string;
  estimated_revenue_cents: number;
  status: LeadStatus;
  created_at: string;
  last_updated_at: string;
  dismissed_at: string | null;
  dismissal_reason?: string | null;
  outcome?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Webhook payload schema                                              */
/* ------------------------------------------------------------------ */

const SignalEnum = z.enum([
  "odometer",
  "fault_code",
  "fuel_level",
  "tire_pressure",
  "battery",
  "oil_life",
  "brake_wear",
  "location",
  "other",
]);

const TelemetrySignalSchema = z.object({
  event_id: z.string().min(1).optional(),
  recorded_at: z.string().min(1),
  signal_type: SignalEnum,
  value: z.number().nullable().optional(),
  value_text: z.string().nullable().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

const TelemetryWebhookSchema = z.object({
  vin: z.string().min(11).max(17),
  provider_device_id: z.string().min(1),
  signals: z.array(TelemetrySignalSchema).min(1),
});

export type TelemetryWebhookPayload = z.infer<typeof TelemetryWebhookSchema>;

/* ------------------------------------------------------------------ */
/*  verifyAndIngest — public entrypoint for webhook routes              */
/* ------------------------------------------------------------------ */

/**
 * Verify the webhook signature with the provider's stored secret, parse the
 * body, then INSERT each signal as a vehicle_telemetry_events row.
 *
 * Idempotent on (provider, provider_event_id): a duplicate event_id from the
 * same provider will dedupe to a single row, so providers that retry on
 * timeout don't double-count.
 */
export async function verifyAndIngest(
  provider: Provider,
  signatureHeader: string | null,
  rawBody: string,
  opts: { dealerIdHint?: string } = {},
): Promise<IngestResult> {
  if (!signatureHeader) {
    return { inserted: 0, deduped: 0, vin: null, reason: "missing_signature" };
  }

  // Parse first so we can resolve the connected vehicle (and its dealer) by
  // provider_device_id even before signature verification — but the secret
  // we sign-check with comes from telemetry_provider_credentials, NOT user
  // input.
  let parsed: TelemetryWebhookPayload;
  try {
    parsed = TelemetryWebhookSchema.parse(JSON.parse(rawBody));
  } catch {
    return { inserted: 0, deduped: 0, vin: null, reason: "invalid_payload" };
  }

  const link = await resolveConnectedVehicle(
    provider,
    parsed.provider_device_id,
    opts.dealerIdHint,
  );
  if (!link) {
    return {
      inserted: 0,
      deduped: 0,
      vin: parsed.vin,
      reason: "device_not_registered",
    };
  }

  // Confirm VIN matches the registered VIN — providers occasionally swap
  // device-VIN bindings on hardware reuse and we never want to silently
  // attribute events to the wrong customer.
  if (link.vin && link.vin !== parsed.vin) {
    return {
      inserted: 0,
      deduped: 0,
      vin: parsed.vin,
      reason: "vin_mismatch",
    };
  }

  const secret = await loadProviderSecret(link.dealer_id, provider);
  if (!secret) {
    return {
      inserted: 0,
      deduped: 0,
      vin: parsed.vin,
      reason: "provider_not_configured",
    };
  }

  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    return {
      inserted: 0,
      deduped: 0,
      vin: parsed.vin,
      reason: "invalid_signature",
    };
  }

  // Insert every signal. ON CONFLICT (provider, provider_event_id) DO NOTHING
  // makes duplicate event ids dedupe; we count inserted vs deduped from the
  // RETURNING result.
  let inserted = 0;
  let deduped = 0;
  for (const sig of parsed.signals) {
    const result = await query<{ id: string }>(
      `INSERT INTO vehicle_telemetry_events
         (dealer_id, connected_vehicle_id, vin, recorded_at, signal_type,
          value, value_text, raw_payload, provider, provider_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (provider, provider_event_id)
         WHERE provider_event_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        link.dealer_id,
        link.id,
        parsed.vin,
        sig.recorded_at,
        sig.signal_type,
        sig.value ?? null,
        sig.value_text ?? null,
        JSON.stringify(sig.raw ?? {}),
        provider,
        sig.event_id ?? null,
      ],
    );
    if (result.rows.length > 0) {
      inserted++;
    } else {
      deduped++;
    }
  }

  // Touch last_seen_at + ingestion log (best-effort).
  try {
    await query(
      `UPDATE connected_vehicles SET last_seen_at = NOW() WHERE id = $1`,
      [link.id],
    );
    await query(
      `INSERT INTO telemetry_ingestion_log
         (dealer_id, provider, last_success_at, last_success_event_id,
          total_events)
       VALUES ($1, $2, NOW(), $3, $4)
       ON CONFLICT (dealer_id, provider) DO UPDATE SET
         last_success_at = NOW(),
         last_success_event_id = EXCLUDED.last_success_event_id,
         total_events = telemetry_ingestion_log.total_events + EXCLUDED.total_events,
         updated_at = NOW()`,
      [
        link.dealer_id,
        provider,
        parsed.signals[parsed.signals.length - 1]?.event_id ?? null,
        inserted,
      ],
    );
  } catch {
    /* operational log is best-effort */
  }

  return { inserted, deduped, vin: parsed.vin };
}

/* ------------------------------------------------------------------ */
/*  Rule engine — runMaintenanceRules(vin)                              */
/* ------------------------------------------------------------------ */

interface LatestSignals {
  oil_life?: { value: number; event_id: string; recorded_at: string };
  brake_wear?: { value: number; event_id: string; recorded_at: string };
  battery?: { value: number; event_id: string; recorded_at: string };
  odometer?: { value: number; event_id: string; recorded_at: string };
  fault_codes: Array<{
    code: string;
    event_id: string;
    recorded_at: string;
  }>;
  low_tires: Array<{ event_id: string; recorded_at: string }>;
}

const REVENUE_BY_LEAD_TYPE: Record<LeadType, number> = {
  oil_change: 8_900,
  brake_service: 45_000,
  tire_replacement: 80_000,
  battery_replacement: 28_000,
  recall: 0,
  general_dtc: 25_000,
  mileage_milestone: 35_000,
};

export interface RunMaintenanceRulesResult {
  emitted: MaintenanceLead[];
  skipped: Array<{ lead_type: LeadType; urgency: Urgency; reason: string }>;
}

/**
 * Scan the latest events for one VIN and emit predictive_maintenance_leads.
 *
 * Dedupe rule: if an open lead of the same (vin, lead_type, urgency) exists
 * within the last 30 days, skip emission. This stops a noisy provider that
 * re-sends an oil_life=12% reading every 60 seconds from spamming the dealer.
 */
export async function runMaintenanceRules(
  vin: string,
): Promise<RunMaintenanceRulesResult> {
  const link = await loadVehicleByVin(vin);
  if (!link) return { emitted: [], skipped: [] };

  const latest = await loadLatestSignals(vin);

  const emitted: MaintenanceLead[] = [];
  const skipped: RunMaintenanceRulesResult["skipped"] = [];
  const recallCodes = await loadKnownRecallCodes();

  async function maybeEmit(args: {
    lead_type: LeadType;
    urgency: Urgency;
    suggested_action: string;
    evidence_event_ids: string[];
    confidence: number;
  }) {
    const dup = await hasOpenLead(vin, args.lead_type, args.urgency);
    if (dup) {
      skipped.push({
        lead_type: args.lead_type,
        urgency: args.urgency,
        reason: "duplicate_within_30d",
      });
      return;
    }
    const lead = await insertLead({
      dealer_id: link!.dealer_id,
      vin,
      customer_id: link!.customer_id,
      lead_type: args.lead_type,
      urgency: args.urgency,
      suggested_action: args.suggested_action,
      evidence_event_ids: args.evidence_event_ids,
      confidence: args.confidence,
      estimated_revenue_cents: REVENUE_BY_LEAD_TYPE[args.lead_type],
    });
    if (lead) emitted.push(lead);
  }

  // Rule: oil life < 15% → oil_change / soon
  if (latest.oil_life && latest.oil_life.value < 15) {
    await maybeEmit({
      lead_type: "oil_change",
      urgency: "soon",
      suggested_action: `Oil life is at ${latest.oil_life.value}%. Schedule an oil change in the next 2 weeks.`,
      evidence_event_ids: [latest.oil_life.event_id],
      confidence: 0.9,
    });
  }

  // Rule: brake wear < 20% → brake_service / soon
  if (latest.brake_wear && latest.brake_wear.value < 20) {
    await maybeEmit({
      lead_type: "brake_service",
      urgency: "soon",
      suggested_action: `Brake pads are at ${latest.brake_wear.value}%. Schedule a brake inspection.`,
      evidence_event_ids: [latest.brake_wear.event_id],
      confidence: 0.85,
    });
  }

  // Rule: battery health < 60% → battery_replacement / soon
  if (latest.battery && latest.battery.value < 60) {
    await maybeEmit({
      lead_type: "battery_replacement",
      urgency: "soon",
      suggested_action: `Battery health is at ${latest.battery.value}%. Replace before the next cold snap.`,
      evidence_event_ids: [latest.battery.event_id],
      confidence: 0.8,
    });
  }

  // Rule: tire pressure low across 2+ tires → tire_replacement / monitoring
  if (latest.low_tires.length >= 2) {
    await maybeEmit({
      lead_type: "tire_replacement",
      urgency: "monitoring",
      suggested_action: `Multiple tires reading low pressure. Inspect for a slow leak or replacement.`,
      evidence_event_ids: latest.low_tires.map((t) => t.event_id),
      confidence: 0.6,
    });
  }

  // Rule: any active fault code → general_dtc / immediate (+ recall)
  for (const fc of latest.fault_codes) {
    const isRecall = recallCodes.has(fc.code.toUpperCase());
    if (isRecall) {
      await maybeEmit({
        lead_type: "recall",
        urgency: "immediate",
        suggested_action: `Open recall detected (DTC ${fc.code}). Contact the customer to schedule the recall service.`,
        evidence_event_ids: [fc.event_id],
        confidence: 0.95,
      });
    }
    await maybeEmit({
      lead_type: "general_dtc",
      urgency: "immediate",
      suggested_action: `Active diagnostic trouble code ${fc.code}. Recommend a service appointment.`,
      evidence_event_ids: [fc.event_id],
      confidence: 0.85,
    });
  }

  // Rule: odometer > previous_mileage + 5000 since last service
  if (latest.odometer) {
    const last = await loadLastServiceMileage(vin);
    if (last !== null && latest.odometer.value > last + 5000) {
      await maybeEmit({
        lead_type: "mileage_milestone",
        urgency: "monitoring",
        suggested_action: `Odometer is ${latest.odometer.value} mi (${latest.odometer.value - last} since last service). Time for a multi-point inspection.`,
        evidence_event_ids: [latest.odometer.event_id],
        confidence: 0.7,
      });
    }
  }

  return { emitted, skipped };
}

/* ------------------------------------------------------------------ */
/*  Lead admin operations                                                */
/* ------------------------------------------------------------------ */

export interface ListLeadsOptions {
  status?: LeadStatus;
  urgency?: Urgency;
  lead_type?: LeadType;
  limit?: number;
}

export async function listLeadsForDealer(
  dealerId: string,
  opts: ListLeadsOptions = {},
): Promise<MaintenanceLead[]> {
  const where: string[] = ["dealer_id = $1"];
  const params: unknown[] = [dealerId];
  let i = 2;
  if (opts.status) {
    where.push(`status = $${i++}`);
    params.push(opts.status);
  }
  if (opts.urgency) {
    where.push(`urgency = $${i++}`);
    params.push(opts.urgency);
  }
  if (opts.lead_type) {
    where.push(`lead_type = $${i++}`);
    params.push(opts.lead_type);
  }
  const limit = Math.min(opts.limit ?? 200, 500);
  const r = await query<MaintenanceLead>(
    `SELECT id, dealer_id, vin, customer_id, lead_type, urgency, confidence,
            evidence_event_ids, suggested_action, estimated_revenue_cents,
            status, created_at, last_updated_at, dismissed_at, dismissal_reason,
            outcome
       FROM predictive_maintenance_leads
      WHERE ${where.join(" AND ")}
   ORDER BY CASE urgency
              WHEN 'immediate' THEN 1
              WHEN 'soon' THEN 2
              WHEN 'scheduled' THEN 3
              WHEN 'monitoring' THEN 4
              ELSE 5
            END,
            created_at DESC
      LIMIT ${limit}`,
    params,
  );
  return r.rows;
}

export async function dismissLead(
  id: string,
  reason: string,
): Promise<MaintenanceLead | null> {
  const r = await query<MaintenanceLead>(
    `UPDATE predictive_maintenance_leads
        SET status = 'dismissed',
            dismissal_reason = $2,
            dismissed_at = NOW(),
            last_updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, reason],
  );
  return r.rows[0] ?? null;
}

export async function markLeadCompleted(
  id: string,
  outcome: string,
): Promise<MaintenanceLead | null> {
  const r = await query<MaintenanceLead>(
    `UPDATE predictive_maintenance_leads
        SET status = 'completed',
            outcome = $2,
            last_updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, outcome],
  );
  return r.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Manual provisioning (admin override + tests)                        */
/* ------------------------------------------------------------------ */

export async function connectVehicle(args: {
  dealer_id: string;
  customer_id: string;
  vin: string;
  provider: Provider;
  provider_device_id: string;
}): Promise<{ id: string }> {
  const r = await query<{ id: string }>(
    `INSERT INTO connected_vehicles
       (dealer_id, customer_id, vin, provider, provider_device_id, connected_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (provider, provider_device_id)
       DO UPDATE SET
         dealer_id = EXCLUDED.dealer_id,
         customer_id = EXCLUDED.customer_id,
         vin = EXCLUDED.vin,
         active = TRUE,
         updated_at = NOW()
     RETURNING id`,
    [
      args.dealer_id,
      args.customer_id,
      args.vin,
      args.provider,
      args.provider_device_id,
    ],
  );
  return { id: r.rows[0]!.id };
}

export async function listConnectedVehiclesForDealer(
  dealerId: string,
): Promise<
  Array<{
    id: string;
    vin: string;
    customer_id: string;
    provider: Provider;
    provider_device_id: string;
    connected_at: string;
    last_seen_at: string | null;
    active: boolean;
  }>
> {
  const r = await query<{
    id: string;
    vin: string;
    customer_id: string;
    provider: Provider;
    provider_device_id: string;
    connected_at: string;
    last_seen_at: string | null;
    active: boolean;
  }>(
    `SELECT id, vin, customer_id, provider, provider_device_id,
            connected_at, last_seen_at, active
       FROM connected_vehicles
      WHERE dealer_id = $1
      ORDER BY active DESC, connected_at DESC
      LIMIT 500`,
    [dealerId],
  );
  return r.rows;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

interface ConnectedVehicleLink {
  id: string;
  dealer_id: string;
  customer_id: string;
  vin: string;
}

async function resolveConnectedVehicle(
  provider: Provider,
  provider_device_id: string,
  _dealerIdHint?: string,
): Promise<ConnectedVehicleLink | null> {
  const r = await query<ConnectedVehicleLink>(
    `SELECT id, dealer_id, customer_id, vin
       FROM connected_vehicles
      WHERE provider = $1 AND provider_device_id = $2 AND active = TRUE
      LIMIT 1`,
    [provider, provider_device_id],
  );
  return r.rows[0] ?? null;
}

async function loadProviderSecret(
  dealerId: string,
  provider: Provider,
): Promise<string | null> {
  const r = await query<{ webhook_secret_encrypted: string }>(
    `SELECT webhook_secret_encrypted
       FROM telemetry_provider_credentials
      WHERE dealer_id = $1 AND provider = $2 AND active = TRUE
      LIMIT 1`,
    [dealerId, provider],
  );
  const enc = r.rows[0]?.webhook_secret_encrypted;
  if (!enc) return null;
  return decryptPII(enc);
}

async function loadVehicleByVin(
  vin: string,
): Promise<ConnectedVehicleLink | null> {
  const r = await query<ConnectedVehicleLink>(
    `SELECT id, dealer_id, customer_id, vin
       FROM connected_vehicles
      WHERE vin = $1 AND active = TRUE
      ORDER BY connected_at DESC
      LIMIT 1`,
    [vin],
  );
  return r.rows[0] ?? null;
}

interface LatestRow {
  id: string;
  signal_type: SignalType;
  value: string | number | null;
  value_text: string | null;
  recorded_at: string;
  raw_payload: Record<string, unknown> | string | null;
}

async function loadLatestSignals(vin: string): Promise<LatestSignals> {
  const r = await query<LatestRow>(
    `SELECT DISTINCT ON (signal_type, COALESCE((raw_payload->>'tire_position'), ''))
            id, signal_type, value, value_text, recorded_at, raw_payload
       FROM vehicle_telemetry_events
      WHERE vin = $1
        AND recorded_at > NOW() - INTERVAL '60 days'
      ORDER BY signal_type, COALESCE((raw_payload->>'tire_position'), ''),
               recorded_at DESC`,
    [vin],
  );

  const out: LatestSignals = { fault_codes: [], low_tires: [] };
  for (const row of r.rows) {
    const num = row.value === null ? NaN : Number(row.value);
    const event_id = String(row.id);
    if (row.signal_type === "oil_life" && Number.isFinite(num)) {
      out.oil_life = { value: num, event_id, recorded_at: row.recorded_at };
    } else if (row.signal_type === "brake_wear" && Number.isFinite(num)) {
      out.brake_wear = { value: num, event_id, recorded_at: row.recorded_at };
    } else if (row.signal_type === "battery" && Number.isFinite(num)) {
      out.battery = { value: num, event_id, recorded_at: row.recorded_at };
    } else if (row.signal_type === "odometer" && Number.isFinite(num)) {
      out.odometer = { value: num, event_id, recorded_at: row.recorded_at };
    } else if (row.signal_type === "fault_code") {
      out.fault_codes.push({
        code: row.value_text ?? "UNKNOWN",
        event_id,
        recorded_at: row.recorded_at,
      });
    } else if (
      row.signal_type === "tire_pressure" &&
      Number.isFinite(num) &&
      num < 28
    ) {
      out.low_tires.push({ event_id, recorded_at: row.recorded_at });
    }
  }
  return out;
}

async function hasOpenLead(
  vin: string,
  lead_type: LeadType,
  urgency: Urgency,
): Promise<boolean> {
  const r = await query<{ id: string }>(
    `SELECT id FROM predictive_maintenance_leads
      WHERE vin = $1 AND lead_type = $2 AND urgency = $3
        AND status = 'open'
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 1`,
    [vin, lead_type, urgency],
  );
  return r.rows.length > 0;
}

async function insertLead(args: {
  dealer_id: string;
  vin: string;
  customer_id: string;
  lead_type: LeadType;
  urgency: Urgency;
  suggested_action: string;
  evidence_event_ids: string[];
  confidence: number;
  estimated_revenue_cents: number;
}): Promise<MaintenanceLead | null> {
  const r = await query<MaintenanceLead>(
    `INSERT INTO predictive_maintenance_leads
       (dealer_id, vin, customer_id, lead_type, urgency, confidence,
        evidence_event_ids, suggested_action, estimated_revenue_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
     RETURNING *`,
    [
      args.dealer_id,
      args.vin,
      args.customer_id,
      args.lead_type,
      args.urgency,
      args.confidence,
      args.evidence_event_ids,
      args.suggested_action,
      args.estimated_revenue_cents,
    ],
  );
  const lead = r.rows[0] ?? null;
  if (lead) {
    // Triple-write fan-out — fire-and-forget. Failures here MUST not throw
    // because the lead is already durable in Postgres.
    void fanOutLeadToSecondaryStores(lead).catch((err) => {
      console.warn(
        "[connected-vehicle] secondary-store fan-out failed (non-blocking):",
        err instanceof Error ? err.message : String(err),
      );
    });
  }
  return lead;
}

async function fanOutLeadToSecondaryStores(
  lead: MaintenanceLead,
): Promise<void> {
  const event: AnalyticsEvent = {
    event_type: "maintenance_lead",
    action: `lead.${lead.lead_type}`,
    page: `/admin/maintenance-leads/${lead.id}`,
    session_id: `lead_${lead.id}`,
    user_fingerprint: "server",
    timestamp: lead.created_at,
    metadata: {
      dealer_id: lead.dealer_id,
      vin: lead.vin,
      lead_type: lead.lead_type,
      urgency: lead.urgency,
      suggested_action: lead.suggested_action,
      estimated_revenue_cents: lead.estimated_revenue_cents,
    },
  };
  await writeEventsToSecondaryStores([event]);

  // Neo4j: explicit (:Vehicle)-[:HAS_LEAD]->(:MaintenanceLead) edge.
  // Ignore if Neo4j is not configured — the writeEventsToSecondaryStores
  // call already covered the AnalyticsEvent node; this adds the domain
  // shape the analytics brain expects.
  if (process.env.NEO4J_URI || process.env.NEO4J_URL) {
    try {
      const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
      await executeNeo4jQueries([
        {
          statement: `
            MERGE (v:Vehicle {vin: $vin})
            MERGE (l:MaintenanceLead {id: $id})
            SET l.lead_type = $leadType,
                l.urgency = $urgency,
                l.suggested_action = $suggestedAction,
                l.dealer_id = $dealerId,
                l.created_at = datetime($createdAt)
            MERGE (v)-[:HAS_LEAD]->(l)
          `,
          parameters: {
            vin: lead.vin,
            id: lead.id,
            leadType: lead.lead_type,
            urgency: lead.urgency,
            suggestedAction: lead.suggested_action,
            dealerId: lead.dealer_id,
            createdAt: lead.created_at,
          },
        },
      ]);
    } catch {
      /* graph fan-out is best-effort */
    }
  }
}

async function loadLastServiceMileage(vin: string): Promise<number | null> {
  // service repair_orders carry mileage_in. If the table or column is missing
  // (older deployments), fall back to "mileage at last lead emission".
  try {
    const r = await query<{ mileage: number }>(
      `SELECT COALESCE(MAX(mileage_in), 0) AS mileage
         FROM repair_orders
        WHERE vin = $1
          AND completed_at IS NOT NULL`,
      [vin],
    );
    const m = r.rows[0]?.mileage;
    return typeof m === "number" && m > 0 ? m : null;
  } catch {
    return null;
  }
}

async function loadKnownRecallCodes(): Promise<Set<string>> {
  // TODO: integrate with a recall-list lib once it exists. Returning an
  // empty set means the recall rule is dormant until that data lands —
  // safer than hand-rolling DTC→recall mappings here.
  return new Set<string>();
}

export const __testing = {
  TelemetryWebhookSchema,
  signRawBody(secret: string, raw: string): string {
    return crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  },
};
