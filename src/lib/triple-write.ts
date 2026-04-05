/**
 * Triple-Write — ensures every analytics event is written to all 3 stores.
 *
 * PostgreSQL: primary relational store (existing path, not modified here)
 * Qdrant: vector store for metadata-based retrieval
 * Neo4j: graph store for event relationship traversal
 *
 * All writes are fire-and-forget. Failures are logged but never block
 * the primary PG write or the HTTP response.
 */

import type { AnalyticsEvent } from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EVENTS_COLLECTION = "wolfpack_analytics_events";
/** Qdrant requires a vector — use a fixed-dimension zero vector for metadata-only points. */
const METADATA_VECTOR_DIM = 4;

/* ------------------------------------------------------------------ */
/*  Qdrant event write                                                 */
/* ------------------------------------------------------------------ */

/**
 * Write an analytics event to Qdrant as a metadata point.
 * Uses a deterministic numeric ID derived from the event's key fields.
 * Skips gracefully when QDRANT_URL is not configured.
 */
export async function writeEventToQdrant(
  event: AnalyticsEvent,
): Promise<boolean> {
  if (!process.env.QDRANT_URL) return false;

  try {
    const { upsertPoints, createCollection } = await import(
      "@/lib/qdrant-client"
    );

    // Ensure collection exists (idempotent)
    await createCollection(EVENTS_COLLECTION, METADATA_VECTOR_DIM);

    const pointId = hashEventId(event);
    const success = await upsertPoints(EVENTS_COLLECTION, [
      {
        id: pointId,
        vector: [0, 0, 0, 0], // metadata-only point — no real embedding needed
        payload: {
          event_type: event.event_type,
          action: event.action,
          page: event.page,
          session_id: event.session_id,
          dealer_id:
            (event.metadata?.dealer_id as string) ?? "unknown",
          timestamp: event.timestamp || new Date().toISOString(),
          metadata: JSON.stringify(event.metadata ?? {}),
        },
      },
    ]);

    return success;
  } catch (err) {
    console.warn(
      "[triple-write] Qdrant write failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Neo4j event write                                                  */
/* ------------------------------------------------------------------ */

/**
 * Write an analytics event as a :AnalyticsEvent node in Neo4j.
 * Creates relationships to :Session and :Page nodes.
 * Skips gracefully when NEO4J_URI/NEO4J_URL is not configured.
 */
export async function writeEventToNeo4j(
  event: AnalyticsEvent,
): Promise<boolean> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return false;

  try {
    const { executeNeo4jQueries } = await import("@/lib/neo4j-client");

    const result = await executeNeo4jQueries([
      {
        statement: `
          MERGE (e:AnalyticsEvent {event_id: $eventId})
          SET e.event_type  = $eventType,
              e.action      = $action,
              e.page        = $page,
              e.session_id  = $sessionId,
              e.timestamp   = datetime($timestamp),
              e.dealer_id   = $dealerId
          WITH e
          MERGE (s:Session {id: $sessionId})
          MERGE (e)-[:BELONGS_TO]->(s)
          WITH e
          MERGE (p:Page {path: $page})
          MERGE (e)-[:OCCURRED_ON]->(p)
        `,
        parameters: {
          eventId: `${event.session_id}_${event.timestamp}_${event.action}`,
          eventType: event.event_type,
          action: event.action,
          page: event.page,
          sessionId: event.session_id,
          timestamp: event.timestamp || new Date().toISOString(),
          dealerId:
            (event.metadata?.dealer_id as string) ?? "unknown",
        },
      },
    ]);

    return result.executed > 0;
  } catch (err) {
    console.warn(
      "[triple-write] Neo4j write failed (non-blocking):",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Batch triple-write (fire-and-forget)                               */
/* ------------------------------------------------------------------ */

/**
 * Fire-and-forget writes to Qdrant and Neo4j for a batch of events.
 * Each write is independent — one store failing does not affect the others.
 * Returns immediately; callers should NOT await this.
 */
export async function writeEventsToSecondaryStores(
  events: AnalyticsEvent[],
): Promise<{ qdrant: number; neo4j: number }> {
  let qdrantOk = 0;
  let neo4jOk = 0;

  const qdrantPromises = events.map(async (e) => {
    const ok = await writeEventToQdrant(e);
    if (ok) qdrantOk++;
  });

  const neo4jPromises = events.map(async (e) => {
    const ok = await writeEventToNeo4j(e);
    if (ok) neo4jOk++;
  });

  // Settle all — never throw
  await Promise.allSettled([...qdrantPromises, ...neo4jPromises]);

  return { qdrant: qdrantOk, neo4j: neo4jOk };
}

/* ------------------------------------------------------------------ */
/*  Triple-write status                                                */
/* ------------------------------------------------------------------ */

/**
 * Check connectivity to all 3 stores.
 * Returns booleans indicating whether each store is reachable.
 */
export async function getTripleWriteStatus(): Promise<{
  pg: boolean;
  qdrant: boolean;
  neo4j: boolean;
}> {
  const [pg, qdrant, neo4j] = await Promise.allSettled([
    checkPgConnectivity(),
    checkQdrantConnectivity(),
    checkNeo4jConnectivity(),
  ]);

  return {
    pg: pg.status === "fulfilled" && pg.value,
    qdrant: qdrant.status === "fulfilled" && qdrant.value,
    neo4j: neo4j.status === "fulfilled" && neo4j.value,
  };
}

async function checkPgConnectivity(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { query } = await import("@/lib/db");
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function checkQdrantConnectivity(): Promise<boolean> {
  if (!process.env.QDRANT_URL) return false;
  try {
    const { healthCheck } = await import("@/lib/qdrant-client");
    return await healthCheck();
  } catch {
    return false;
  }
}

async function checkNeo4jConnectivity(): Promise<boolean> {
  const neo4jUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (!neo4jUrl) return false;
  try {
    const { neo4jHealthCheck } = await import("@/lib/neo4j-client");
    return await neo4jHealthCheck();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Simple numeric hash from event fields for Qdrant point IDs. */
function hashEventId(event: AnalyticsEvent): number {
  const raw = `${event.session_id}|${event.timestamp}|${event.action}|${event.page}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
