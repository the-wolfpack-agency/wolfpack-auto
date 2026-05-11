/**
 * POST /api/leads/intake — modern lead intake endpoint.
 *
 * Public + rate-limited. Accepts either:
 *   - X-Webhook-Signature header (HMAC-SHA256 over the raw body) +
 *     X-Lead-Source-Id header pointing at a row in `lead_sources`, OR
 *   - X-API-Key header carrying a hashed key (back-compat path).
 *
 * On success, persists the lead synchronously and kicks off
 * enrichment + scoring + routing via `waitUntil` so the response
 * returns immediately with a 201.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { trackLead, trackLeadIngestion } from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";
import {
  ingestLead,
  IntakeValidationFailure,
  type DedupCandidate,
} from "@/lib/leads/intake";
import {
  enrichLead,
  MockEnrichmentProvider,
} from "@/lib/leads/enrichment";
import { scoreLead } from "@/lib/leads/scoring";
import { routeLead } from "@/lib/leads/routing";
import type { DealerUser, LeadIntakePayload, NormalizedLead } from "@/lib/leads/types";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const intakeSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(40).nullable().optional().default(null),
  vehicle_interest: z.string().min(1).max(500),
  source_name: z.string().min(1).max(120).default("default"),
  raw: z.record(z.unknown()).optional(),
});

const DEFAULT_DEALER_ID = process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

interface AuthedSource {
  dealer_id: string;
  source_name: string;
  source_type: LeadIntakePayload["source_type"];
}

async function authenticateRequest(
  request: NextRequest,
  rawBody: string,
): Promise<{ ok: true; source: AuthedSource } | { ok: false; status: number; error: string }> {
  const sig = request.headers.get("x-webhook-signature");
  const sourceId = request.headers.get("x-lead-source-id");
  const apiKey = request.headers.get("x-api-key");

  // Path 1: webhook signature + source id
  if (sig && sourceId) {
    if (!process.env.DATABASE_URL) {
      // shadow mode — accept and use defaults
      return {
        ok: true,
        source: { dealer_id: DEFAULT_DEALER_ID, source_name: sourceId, source_type: "webhook" },
      };
    }
    try {
      const { query } = await import("@/lib/db");
      const row = await query<{
        id: string;
        dealer_id: string;
        source_name: string;
        source_type: AuthedSource["source_type"];
        signing_secret: string | null;
        active: boolean;
      }>(
        `SELECT id, dealer_id, source_name, source_type, signing_secret, active
           FROM lead_sources WHERE id = $1`,
        [sourceId],
      );
      const src = row.rows[0];
      if (!src || !src.active) return { ok: false, status: 401, error: "Unknown or inactive lead source" };
      if (!src.signing_secret) return { ok: false, status: 401, error: "Source has no signing secret" };
      if (!verifyWebhookSignature(rawBody, sig, src.signing_secret)) {
        return { ok: false, status: 401, error: "Invalid webhook signature" };
      }
      return {
        ok: true,
        source: {
          dealer_id: src.dealer_id,
          source_name: src.source_name,
          source_type: src.source_type,
        },
      };
    } catch (err) {
      console.error("[leads/intake] auth lookup failed:", err);
      return { ok: false, status: 401, error: "Unable to verify signature" };
    }
  }

  // Path 2: API key
  if (apiKey) {
    if (!process.env.DATABASE_URL) {
      return {
        ok: true,
        source: { dealer_id: DEFAULT_DEALER_ID, source_name: "api-default", source_type: "api" },
      };
    }
    try {
      const { query } = await import("@/lib/db");
      const row = await query<{ dealer_id: string }>(
        `SELECT dealer_id FROM api_keys WHERE key_hash = $1 AND active = true LIMIT 1`,
        [apiKey],
      );
      if (row.rows.length === 0) return { ok: false, status: 401, error: "Invalid API key" };
      return {
        ok: true,
        source: { dealer_id: row.rows[0].dealer_id, source_name: "api-default", source_type: "api" },
      };
    } catch (err) {
      console.error("[leads/intake] API key lookup failed:", err);
      return { ok: false, status: 401, error: "Unable to verify API key" };
    }
  }

  return { ok: false, status: 401, error: "Missing webhook signature or API key" };
}

/* -------------------------------------------------------------------------- */
/* Background enrichment + scoring + routing                                  */
/* -------------------------------------------------------------------------- */

/**
 * Loads dealer users for routing. Returns an empty list when DB is absent
 * or the query fails — routing then returns chosen_user_id: null.
 */
async function loadDealerUsers(dealerId: string): Promise<DealerUser[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const { query } = await import("@/lib/db");
    const res = await query<{
      id: string;
      name: string;
      active: boolean;
      specializations: string[] | null;
      current_load: number | null;
      conversion_rate: number | null;
    }>(
      `SELECT id::text AS id,
              COALESCE(name, email, 'rep') AS name,
              COALESCE(active, true) AS active,
              COALESCE(specializations, ARRAY[]::TEXT[]) AS specializations,
              COALESCE(current_load, 0) AS current_load,
              COALESCE(conversion_rate, 0) AS conversion_rate
         FROM dealer_users
        WHERE dealer_id = $1`,
      [dealerId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      specializations: r.specializations ?? [],
      current_load: r.current_load ?? 0,
      conversion_rate: r.conversion_rate ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Run enrichment + scoring + routing and persist results. Never throws.
 * Not exported (Next.js route files only permit route-handler exports).
 */
async function processLeadInBackground(lead: NormalizedLead): Promise<void> {
  try {
    const enriched = await enrichLead(lead, [new MockEnrichmentProvider()]);
    trackLead("lead.enriched", lead.dealer_id, {
      lead_id: lead.id,
      sources: enriched.sources.join(","),
      confidence: enriched.confidence,
    });

    const score = scoreLead(lead, enriched);
    trackLead("lead.scored", lead.dealer_id, {
      lead_id: lead.id,
      score: score.score,
      tier: score.tier,
    });

    const users = await loadDealerUsers(lead.dealer_id);
    const decision = routeLead(lead, enriched, score, users);
    trackLead("lead.routed", lead.dealer_id, {
      lead_id: lead.id,
      chosen_user_id: decision.chosen_user_id ?? "",
      candidates: decision.candidate_user_ids.length,
    });

    // Best-effort persistence; in shadow mode just emit analytics.
    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        await query(
          `INSERT INTO lead_enrichment
             (lead_id, dealer_id, enriched_data, confidence, sources, generated_at)
           VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5, $6::timestamptz)
           ON CONFLICT (lead_id)
             DO UPDATE SET enriched_data = EXCLUDED.enriched_data,
                           confidence = EXCLUDED.confidence,
                           sources = EXCLUDED.sources,
                           generated_at = EXCLUDED.generated_at`,
          [
            lead.id,
            lead.dealer_id,
            JSON.stringify(enriched.enriched),
            enriched.confidence,
            enriched.sources,
            enriched.generated_at,
          ],
        );
        await query(
          `INSERT INTO lead_routing_decisions
             (lead_id, dealer_id, candidate_users, chosen_user_id, decision_factors)
           VALUES ($1::uuid, $2::uuid, $3::uuid[], $4::uuid, $5::jsonb)`,
          [
            lead.id,
            lead.dealer_id,
            decision.candidate_user_ids,
            decision.chosen_user_id,
            JSON.stringify({ score, factors: decision.factors, reason: decision.reason }),
          ],
        );
      } catch (err) {
        console.warn("[leads/intake] background persistence failed:", err);
      }
    }

    // Triple-write — analytics events into Qdrant/Neo4j alongside Postgres.
    try {
      const { writeEventsToSecondaryStores } = await import("@/lib/triple-write");
      void writeEventsToSecondaryStores([
        {
          event_type: "leads",
          action: "lead.intake_received",
          page: lead.dealer_id,
          session_id: "intake",
          user_fingerprint: "intake",
          metadata: { dealer_id: lead.dealer_id, lead_id: lead.id, source: lead.source_type },
          timestamp: new Date().toISOString(),
        },
        {
          event_type: "leads",
          action: "lead.enriched",
          page: lead.dealer_id,
          session_id: "intake",
          user_fingerprint: "intake",
          metadata: { dealer_id: lead.dealer_id, lead_id: lead.id, confidence: enriched.confidence },
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      /* triple-write is best-effort */
    }
  } catch (err) {
    console.error("[leads/intake] background processing failed:", err);
  }
}

/* -------------------------------------------------------------------------- */
/* POST handler                                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  // Rate-limit by IP — public endpoint MUST gate.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit(`lead-intake:${ip}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions; please retry later", retry_after: rl.resetAt },
      { status: 429 },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Unable to read body" }, { status: 400 });
  }

  const auth = await authenticateRequest(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const payload: LeadIntakePayload = {
    ...parsed.data,
    phone: parsed.data.phone ?? null,
    source_name: parsed.data.source_name ?? auth.source.source_name,
    source_type: auth.source.source_type,
    dealer_id: auth.source.dealer_id,
  };

  // Fetch dedup candidates — last 30 days of leads for this dealer.
  const fetchCandidates = async (): Promise<DedupCandidate[]> => {
    if (!process.env.DATABASE_URL) return [];
    try {
      const { query } = await import("@/lib/db");
      const res = await query<{
        id: string;
        email: string;
        phone: string | null;
        vehicle_interest: string;
      }>(
        `SELECT id::text AS id, email, phone, vehicle_interest
           FROM leads
          WHERE dealer_id = $1
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 500`,
        [auth.source.dealer_id],
      );
      return res.rows;
    } catch {
      return [];
    }
  };

  const persist = async (
    lead: NormalizedLead,
  ): Promise<{ id: string; created_at: string }> => {
    if (!process.env.DATABASE_URL) {
      return { id: lead.id, created_at: lead.created_at };
    }
    const { query } = await import("@/lib/db");
    const res = await query<{ id: string; created_at: string }>(
      `INSERT INTO leads
         (dealer_id, first_name, last_name, email, phone,
          vehicle_interest, source, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'new', NOW(), NOW())
       RETURNING id::text AS id, created_at::text AS created_at`,
      [
        lead.dealer_id,
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        lead.vehicle_interest,
        lead.source_type === "manual" ? "walk_in" : "third_party",
      ],
    );
    return res.rows[0];
  };

  let result;
  try {
    result = await ingestLead(payload, {
      dealerId: auth.source.dealer_id,
      fetchCandidates,
      persist,
    });
  } catch (err) {
    if (err instanceof IntakeValidationFailure) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    console.error("[leads/intake] ingest failed:", err);
    return NextResponse.json({ error: "Unable to persist lead" }, { status: 500 });
  }

  // Analytics + audit (fire-and-forget)
  trackLead("lead.intake_received", auth.source.dealer_id, {
    lead_id: result.lead.id,
    source_name: result.lead.source_name,
    source_type: result.lead.source_type,
    duplicate: result.duplicate,
  });
  trackLeadIngestion("lead_ingestion.batch_received", auth.source.dealer_id, {
    source_name: result.lead.source_name,
    duplicate: result.duplicate,
  });
  void auditLog(
    "lead.intake",
    {
      lead_id: result.lead.id,
      source_name: result.lead.source_name,
      source_type: result.lead.source_type,
      duplicate: result.duplicate,
    },
    undefined,
    auth.source.dealer_id,
    ip,
  );

  // Background: enrichment + scoring + routing.
  if (!result.duplicate) {
    const ctx = request as unknown as { waitUntil?: (p: Promise<unknown>) => void };
    const task = processLeadInBackground(result.lead);
    if (typeof ctx.waitUntil === "function") {
      ctx.waitUntil(task);
    } else {
      void task;
    }
  }

  return NextResponse.json(
    {
      id: result.lead.id,
      duplicate: result.duplicate,
      matched_lead_id: result.matched_lead_id,
      created_at: result.lead.created_at,
    },
    { status: 201 },
  );
}
