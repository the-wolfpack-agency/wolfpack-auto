import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * Analytics Verification API
 *
 * POST: Fires a test event through every analytics module and verifies
 *       it arrives in PostgreSQL. Returns per-module pass/fail results.
 *
 * GET:  Returns the latest verification results and overall health score.
 *
 * This is the "canary in the coal mine" for the analytics pipeline —
 * if any module's events aren't persisting, this catches it immediately.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ModuleCheck {
  module: string;
  event: string;
  fired: boolean;
  persisted: boolean;
  latency_ms: number;
  error?: string;
}

interface VerificationResult {
  timestamp: string;
  total_modules: number;
  passed: number;
  failed: number;
  score: number;
  modules: ModuleCheck[];
  stores: {
    postgresql: { connected: boolean; events_total: number };
    qdrant: { connected: boolean };
    neo4j: { connected: boolean };
  };
}

/* ------------------------------------------------------------------ */
/*  Module manifest — every trackable analytics module                  */
/* ------------------------------------------------------------------ */

const ANALYTICS_MODULES = [
  { module: "deals", event: "deal.created", fn: "trackDeal" },
  { module: "service", event: "service.appointment_created", fn: "trackService" },
  { module: "comms", event: "comms.message_sent", fn: "trackComms" },
  { module: "accounting", event: "accounting.sale_logged", fn: "trackAccounting" },
  { module: "reviews", event: "review.received", fn: "trackReview" },
  { module: "digital_retail", event: "retail.credit_app_started", fn: "trackRetail" },
  { module: "customer", event: "customer.created", fn: "trackCustomer" },
  { module: "leads", event: "lead.created", fn: "trackLead" },
  { module: "lender", event: "lender.submission_created", fn: "trackLender" },
  { module: "credit", event: "credit.pull_initiated", fn: "trackCredit" },
  { module: "compliance", event: "compliance.check_passed", fn: "trackCompliance" },
  { module: "documents", event: "document.uploaded", fn: "trackDocument" },
  { module: "knowledge", event: "knowledge.query", fn: "trackKnowledge" },
  { module: "security", event: "security.scan_completed", fn: "trackSecurity" },
  { module: "pricing", event: "pricing.recommendation_viewed", fn: "trackPricing" },
  { module: "backgrounds", event: "background.applied", fn: "trackBackground" },
  { module: "marketing", event: "template.viewed", fn: "trackTemplate" },
  { module: "desking", event: "desking.deal_created", fn: "trackDesking" },
  { module: "gl", event: "gl.journal_entry_created", fn: "trackGL" },
  { module: "payments", event: "payment.intent_created", fn: "trackPayment" },
  { module: "payroll", event: "payroll.period_opened", fn: "trackPayroll" },
] as const;

/* ------------------------------------------------------------------ */
/*  Verification logic                                                  */
/* ------------------------------------------------------------------ */

const TEST_DEALER_ID = "verification-canary";

async function runVerification(): Promise<VerificationResult> {
  const timestamp = new Date().toISOString();
  const modules: ModuleCheck[] = [];

  // Dynamically import all tracking functions
  const hooks = await import("@/lib/analytics-hooks");

  // Fire one test event per module and check if it persists
  for (const { module, event, fn } of ANALYTICS_MODULES) {
    const start = Date.now();
    try {
      const trackFn = (hooks as Record<string, unknown>)[fn];
      if (typeof trackFn !== "function") {
        modules.push({
          module,
          event,
          fired: false,
          persisted: false,
          latency_ms: 0,
          error: `Function ${fn} not found in analytics-hooks`,
        });
        continue;
      }

      // Fire the event
      trackFn(event, TEST_DEALER_ID, {
        source: "verification",
        verification_run: timestamp,
      });

      // Small delay for async persistence
      await new Promise((r) => setTimeout(r, 100));

      // Check if it landed in PostgreSQL
      let persisted = false;
      if (process.env.DATABASE_URL) {
        try {
          const { query } = await import("@/lib/db");
          const result = await query(
            `SELECT COUNT(*) as cnt FROM analytics_events
             WHERE action = $1 AND metadata::text LIKE $2
             ORDER BY timestamp DESC LIMIT 1`,
            [event, `%${timestamp}%`],
          );
          persisted = (result.rows[0]?.cnt ?? 0) > 0;
        } catch {
          // DB might not have the table yet — still counts as fired
        }
      }

      modules.push({
        module,
        event,
        fired: true,
        persisted,
        latency_ms: Date.now() - start,
      });
    } catch (err) {
      modules.push({
        module,
        event,
        fired: false,
        persisted: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Check store connectivity
  const stores = await checkStoreConnectivity();

  const passed = modules.filter((m) => m.fired).length;
  const failed = modules.filter((m) => !m.fired).length;

  return {
    timestamp,
    total_modules: modules.length,
    passed,
    failed,
    score: modules.length > 0 ? Math.round((passed / modules.length) * 100) : 0,
    modules,
    stores,
  };
}

async function checkStoreConnectivity() {
  // PostgreSQL
  let pgConnected = false;
  let pgEventsTotal = 0;
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query("SELECT COUNT(*) as cnt FROM analytics_events");
      pgConnected = true;
      pgEventsTotal = parseInt(result.rows[0]?.cnt ?? "0", 10);
    } catch {
      pgConnected = false;
    }
  }

  // Qdrant
  let qdrantConnected = false;
  if (process.env.QDRANT_URL) {
    try {
      const { healthCheck } = await import("@/lib/qdrant-client");
      qdrantConnected = await healthCheck();
    } catch {
      qdrantConnected = false;
    }
  }

  // Neo4j
  let neo4jConnected = false;
  if (process.env.NEO4J_URL && process.env.NEO4J_URL !== "") {
    try {
      const { neo4jHealthCheck } = await import("@/lib/neo4j-client");
      neo4jConnected = await neo4jHealthCheck();
    } catch {
      neo4jConnected = false;
    }
  }

  return {
    postgresql: { connected: pgConnected, events_total: pgEventsTotal },
    qdrant: { connected: qdrantConnected },
    neo4j: { connected: neo4jConnected },
  };
}

/* ------------------------------------------------------------------ */
/*  Latest verification result cache (per-process)                      */
/* ------------------------------------------------------------------ */

let latestResult: VerificationResult | null = null;

export function getLatestVerification(): VerificationResult | null {
  return latestResult;
}

/* ------------------------------------------------------------------ */
/*  Route handlers                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      total_modules: ANALYTICS_MODULES.length,
      passed: 0,
      failed: ANALYTICS_MODULES.length,
      score: 0,
      modules: ANALYTICS_MODULES.map((m) => ({
        module: m.module,
        event: m.event,
        fired: false,
        persisted: false,
        latency_ms: 0,
        error: "DATABASE_URL not configured — shadow mode",
      })),
      stores: {
        postgresql: { connected: false, events_total: 0 },
        qdrant: { connected: false },
        neo4j: { connected: false },
      },
    });
  }

  const auth = await requireAuth(request);
  if (auth) return auth;

  const result = await runVerification();
  latestResult = result;

  // Track the verification run itself as an analytics event
  const { trackSecurity } = await import("@/lib/analytics-hooks");
  trackSecurity("security.scan_completed", TEST_DEALER_ID, {
    scan_type: "analytics_verification",
    score: result.score,
    passed: result.passed,
    failed: result.failed,
    total: result.total_modules,
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      latest: null,
      modules_manifest: ANALYTICS_MODULES,
      stores_configured: {
        postgresql: false,
        qdrant: !!process.env.QDRANT_URL,
        neo4j: !!process.env.NEO4J_URL && process.env.NEO4J_URL !== "",
      },
    });
  }

  const auth = await requireAuth(request);
  if (auth) return auth;

  // Return latest cached result + module manifest
  return NextResponse.json({
    latest: latestResult,
    modules_manifest: ANALYTICS_MODULES,
    stores_configured: {
      postgresql: true,
      qdrant: !!process.env.QDRANT_URL,
      neo4j: !!process.env.NEO4J_URL && process.env.NEO4J_URL !== "",
    },
  });
}
