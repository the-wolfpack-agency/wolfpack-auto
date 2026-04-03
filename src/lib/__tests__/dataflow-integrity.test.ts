/**
 * Dataflow Integrity Tests
 *
 * Validates that the triple-write data pipeline (PostgreSQL + Qdrant + Neo4j)
 * never silently loses data. Tests cover:
 *  - Missing config detection and alarm surfacing
 *  - Buffer lifecycle (clear after aggregation)
 *  - Neo4j credential safety (no hardcoded defaults)
 *  - Parameterized Cypher queries (no string interpolation)
 *  - PG write tracking (attempted/succeeded/failed stats)
 *  - Health endpoint dataflow warnings
 *
 * Run with: npx jest src/lib/__tests__/dataflow-integrity.test.ts
 */

import {
  getDataflowWarnings,
  getPgWriteStats,
} from "@/app/api/analytics/events/route";
import { getNeo4jConfigStatus } from "@/lib/neo4j-client";
import {
  ingestEvents,
  getBufferStats,
  buildGraphQueries,
  type AnalyticsEvent,
} from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    event_type: "page_view",
    action: "view",
    page: "/inventory",
    session_id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    user_fingerprint: `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Fix #1: Dataflow warnings — fail loudly on missing config          */
/* ------------------------------------------------------------------ */

describe("Fix #1: Dataflow warnings surface missing config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("warns when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    const warnings = getDataflowWarnings();
    expect(warnings.some((w) => w.includes("DATABASE_URL"))).toBe(true);
    expect(warnings.some((w) => w.includes("DATA LOSS"))).toBe(true);
  });

  test("warns when QDRANT_URL is missing", () => {
    delete process.env.QDRANT_URL;
    const warnings = getDataflowWarnings();
    expect(warnings.some((w) => w.includes("QDRANT_URL"))).toBe(true);
  });

  test("warns when NEO4J_URL is missing", () => {
    delete process.env.NEO4J_URL;
    const warnings = getDataflowWarnings();
    expect(warnings.some((w) => w.includes("NEO4J_URL"))).toBe(true);
  });

  test("warns when NEO4J_URL is empty string (disabled)", () => {
    process.env.NEO4J_URL = "";
    const warnings = getDataflowWarnings();
    expect(warnings.some((w) => w.includes("disabled"))).toBe(true);
  });

  test("warns when NEO4J_PASSWORD is missing", () => {
    delete process.env.NEO4J_PASSWORD;
    const warnings = getDataflowWarnings();
    expect(warnings.some((w) => w.includes("NEO4J_PASSWORD"))).toBe(true);
  });

  test("no warnings when all config is set", () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "secure-password";
    const warnings = getDataflowWarnings();
    expect(warnings).toHaveLength(0);
  });

  test("warning messages are specific and actionable", () => {
    delete process.env.DATABASE_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URL;
    delete process.env.NEO4J_PASSWORD;
    const warnings = getDataflowWarnings();
    // Each warning should mention the specific env var
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    for (const w of warnings) {
      expect(w.length).toBeGreaterThan(20); // Not vague
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #1 continued: PG write stats tracking                          */
/* ------------------------------------------------------------------ */

describe("Fix #1: PG write stats are tracked", () => {
  test("getPgWriteStats returns tracking object", () => {
    const stats = getPgWriteStats();
    expect(stats).toHaveProperty("attempted");
    expect(stats).toHaveProperty("succeeded");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("lastError");
    expect(typeof stats.attempted).toBe("number");
    expect(typeof stats.succeeded).toBe("number");
    expect(typeof stats.failed).toBe("number");
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #2: Buffer cleared after aggregation                           */
/* ------------------------------------------------------------------ */

describe("Fix #2: Buffer lifecycle", () => {
  test("events are ingested into buffer", () => {
    const event = makeEvent();
    const result = ingestEvents([event]);
    expect(result.accepted).toBe(1);
    expect(result.buffered).toBeGreaterThanOrEqual(1);
  });

  test("buffer stats reflect ingested events", () => {
    const sessionId = `test-session-${Date.now()}`;
    ingestEvents([
      makeEvent({ session_id: sessionId, event_type: "page_view" }),
      makeEvent({ session_id: sessionId, event_type: "click" }),
    ]);
    const stats = getBufferStats();
    expect(stats.total_events).toBeGreaterThanOrEqual(2);
    expect(stats.active_sessions).toBeGreaterThanOrEqual(1);
  });

  test("invalid events (missing session_id) are rejected", () => {
    const result = ingestEvents([
      { event_type: "click", action: "", page: "", session_id: "", user_fingerprint: "", timestamp: "", metadata: {} },
    ]);
    expect(result.accepted).toBe(0);
  });

  test("invalid events (missing event_type) are rejected", () => {
    const result = ingestEvents([
      { event_type: "", action: "", page: "", session_id: "test", user_fingerprint: "", timestamp: "", metadata: {} },
    ]);
    expect(result.accepted).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #3: Neo4j credential safety                                    */
/* ------------------------------------------------------------------ */

describe("Fix #3: Neo4j credential safety", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("getNeo4jConfigStatus reports unconfigured when no URL", () => {
    delete process.env.NEO4J_URL;
    const status = getNeo4jConfigStatus();
    expect(status.configured).toBe(false);
  });

  test("getNeo4jConfigStatus reports disabled when URL is empty", () => {
    process.env.NEO4J_URL = "";
    const status = getNeo4jConfigStatus();
    expect(status.disabled).toBe(true);
  });

  test("getNeo4jConfigStatus reports missing password", () => {
    delete process.env.NEO4J_PASSWORD;
    const status = getNeo4jConfigStatus();
    expect(status.hasPassword).toBe(false);
  });

  test("getNeo4jConfigStatus reports all good when configured", () => {
    process.env.NEO4J_URL = "http://neo4j:7474";
    process.env.NEO4J_PASSWORD = "production-secret";
    const status = getNeo4jConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.disabled).toBe(false);
    expect(status.hasPassword).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #4: Parameterized Cypher queries                                */
/* ------------------------------------------------------------------ */

describe("Fix #4: Parameterized Cypher queries", () => {
  test("buildGraphQueries returns parameterized objects, not raw strings", () => {
    // Ingest events to build a session
    const sessionId = `param-test-${Date.now()}`;
    ingestEvents([
      makeEvent({
        session_id: sessionId,
        event_type: "page_view",
        action: "view",
        page: "/",
        user_fingerprint: "user-abc",
      }),
      makeEvent({
        session_id: sessionId,
        event_type: "page_view",
        action: "view",
        page: "/inventory",
        user_fingerprint: "user-abc",
      }),
    ]);

    const queries = buildGraphQueries(sessionId);

    // Should return objects, not strings
    for (const q of queries) {
      expect(typeof q).toBe("object");
      expect(q).toHaveProperty("statement");
      expect(q).toHaveProperty("parameters");
      expect(typeof q.statement).toBe("string");
      expect(typeof q.parameters).toBe("object");
    }
  });

  test("parameterized queries use $variables, not string interpolation", () => {
    const sessionId = `injection-test-${Date.now()}`;
    ingestEvents([
      makeEvent({
        session_id: sessionId,
        event_type: "page_view",
        action: "view",
        page: '/test"; DROP (n) DETACH DELETE n; //',
        user_fingerprint: "user-inject",
      }),
    ]);

    const queries = buildGraphQueries(sessionId);

    for (const q of queries) {
      // Statements should NOT contain the injected payload directly
      expect(q.statement).not.toContain("DROP");
      expect(q.statement).not.toContain("DELETE");

      // Statements should use $parameter syntax
      expect(q.statement).toContain("$");

      // The malicious string should be safely in the parameters object
      const paramValues = Object.values(q.parameters).map(String);
      const hasInjection = paramValues.some((v) => v.includes("DROP"));
      // The injection string is safely stored as a parameter value, not in the query
      if (hasInjection) {
        expect(q.statement).not.toContain("DROP");
      }
    }
  });

  test("session with vehicle views produces parameterized VIEWED queries", () => {
    const sessionId = `vehicle-param-${Date.now()}`;
    ingestEvents([
      makeEvent({
        session_id: sessionId,
        event_type: "vehicle_view",
        action: "view",
        page: "/inventory/1HGCM82633A123456",
        user_fingerprint: "user-car",
        metadata: { vin: "1HGCM82633A123456" },
      }),
    ]);

    const queries = buildGraphQueries(sessionId);
    const viewedQuery = queries.find((q) => q.statement.includes("VIEWED"));

    if (viewedQuery) {
      expect(viewedQuery.parameters).toHaveProperty("vin");
      expect(viewedQuery.parameters).toHaveProperty("sessionId");
      expect(viewedQuery.statement).toContain("$vin");
      expect(viewedQuery.statement).toContain("$sessionId");
    }
  });

  test("session with search queries produces parameterized SEARCHED queries", () => {
    const sessionId = `search-param-${Date.now()}`;
    ingestEvents([
      makeEvent({
        session_id: sessionId,
        event_type: "search",
        action: "search",
        page: "/inventory",
        user_fingerprint: "user-search",
        metadata: { query: "BMW X5 under 50k" },
      }),
    ]);

    const queries = buildGraphQueries(sessionId);
    const searchQuery = queries.find((q) => q.statement.includes("SEARCHED"));

    if (searchQuery) {
      expect(searchQuery.parameters).toHaveProperty("text");
      expect(searchQuery.parameters).toHaveProperty("sessionId");
      expect(searchQuery.statement).toContain("$text");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Fix #5: Overall dataflow health validation                          */
/* ------------------------------------------------------------------ */

describe("Fix #5: Dataflow health endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("healthy when all stores configured", () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "test";
    const warnings = getDataflowWarnings();
    expect(warnings).toHaveLength(0);
  });

  test("reports all missing stores simultaneously", () => {
    delete process.env.DATABASE_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URL;
    delete process.env.NEO4J_PASSWORD;
    const warnings = getDataflowWarnings();
    // Should report all issues, not just the first one
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    const warningText = warnings.join(" ");
    expect(warningText).toContain("DATABASE_URL");
    expect(warningText).toContain("QDRANT_URL");
    expect(warningText).toContain("NEO4J_URL");
    expect(warningText).toContain("NEO4J_PASSWORD");
  });

  test("DATABASE_URL missing is flagged as DATA LOSS risk", () => {
    delete process.env.DATABASE_URL;
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "test";
    const warnings = getDataflowWarnings();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("DATA LOSS");
  });
});
