/**
 * Triple-Write Tests
 *
 * Verifies that analytics events are written to all 3 stores
 * (PostgreSQL, Qdrant, Neo4j) independently and gracefully.
 *
 * Run with: npx jest --no-coverage src/lib/__tests__/triple-write.test.ts
 */

import type { AnalyticsEvent } from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  Mocks — intercept all external store calls                         */
/* ------------------------------------------------------------------ */

const mockUpsertPoints = jest.fn().mockResolvedValue(true);
const mockCreateCollection = jest.fn().mockResolvedValue(true);
const mockHealthCheck = jest.fn().mockResolvedValue(true);

jest.mock("@/lib/qdrant-client", () => ({
  upsertPoints: (...args: unknown[]) => mockUpsertPoints(...args),
  createCollection: (...args: unknown[]) => mockCreateCollection(...args),
  healthCheck: (...args: unknown[]) => mockHealthCheck(...args),
}));

const mockExecuteNeo4jQueries = jest
  .fn()
  .mockResolvedValue({ executed: 1, failed: 0 });
const mockNeo4jHealthCheck = jest.fn().mockResolvedValue(true);

jest.mock("@/lib/neo4j-client", () => ({
  executeNeo4jQueries: (...args: unknown[]) =>
    mockExecuteNeo4jQueries(...args),
  neo4jHealthCheck: (...args: unknown[]) => mockNeo4jHealthCheck(...args),
}));

const mockQuery = jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });

jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    event_type: "page_view",
    action: "view",
    page: "/inventory",
    session_id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    user_fingerprint: `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    metadata: { dealer_id: "dealer-123" },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Import the module under test (after mocks are set up)              */
/* ------------------------------------------------------------------ */

import {
  writeEventToQdrant,
  writeEventToNeo4j,
  writeEventsToSecondaryStores,
  getTripleWriteStatus,
} from "@/lib/triple-write";

/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */

const originalEnv = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  // Restore default resolved values after reset
  mockUpsertPoints.mockResolvedValue(true);
  mockCreateCollection.mockResolvedValue(true);
  mockHealthCheck.mockResolvedValue(true);
  mockExecuteNeo4jQueries.mockResolvedValue({ executed: 1, failed: 0 });
  mockNeo4jHealthCheck.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

/* ------------------------------------------------------------------ */
/*  Qdrant write tests                                                 */
/* ------------------------------------------------------------------ */

describe("writeEventToQdrant", () => {
  test("writes event to Qdrant when QDRANT_URL is set", async () => {
    process.env.QDRANT_URL = "http://localhost:6333";
    const event = makeEvent();

    const result = await writeEventToQdrant(event);

    expect(result).toBe(true);
    expect(mockCreateCollection).toHaveBeenCalledWith(
      "wolfpack_analytics_events",
      4,
    );
    expect(mockUpsertPoints).toHaveBeenCalledWith(
      "wolfpack_analytics_events",
      expect.arrayContaining([
        expect.objectContaining({
          vector: [0, 0, 0, 0],
          payload: expect.objectContaining({
            event_type: event.event_type,
            action: event.action,
            page: event.page,
            session_id: event.session_id,
          }),
        }),
      ]),
    );
  });

  test("skips gracefully when QDRANT_URL is not set", async () => {
    delete process.env.QDRANT_URL;
    const event = makeEvent();

    const result = await writeEventToQdrant(event);

    expect(result).toBe(false);
    expect(mockUpsertPoints).not.toHaveBeenCalled();
  });

  test("returns false on Qdrant error without throwing", async () => {
    process.env.QDRANT_URL = "http://localhost:6333";
    mockUpsertPoints.mockRejectedValueOnce(new Error("connection refused"));
    const event = makeEvent();

    const result = await writeEventToQdrant(event);

    expect(result).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Neo4j write tests                                                  */
/* ------------------------------------------------------------------ */

describe("writeEventToNeo4j", () => {
  test("writes event to Neo4j when NEO4J_URI is set", async () => {
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";
    const event = makeEvent();

    const result = await writeEventToNeo4j(event);

    expect(result).toBe(true);
    expect(mockExecuteNeo4jQueries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          statement: expect.stringContaining(":AnalyticsEvent"),
          parameters: expect.objectContaining({
            eventType: event.event_type,
            action: event.action,
            page: event.page,
            sessionId: event.session_id,
          }),
        }),
      ]),
    );
  });

  test("writes event to Neo4j when NEO4J_URL is set (fallback)", async () => {
    delete process.env.NEO4J_URI;
    process.env.NEO4J_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "test";
    const event = makeEvent();

    const result = await writeEventToNeo4j(event);

    expect(result).toBe(true);
    expect(mockExecuteNeo4jQueries).toHaveBeenCalled();
  });

  test("skips gracefully when neither NEO4J_URI nor NEO4J_URL is set", async () => {
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_URL;
    const event = makeEvent();

    const result = await writeEventToNeo4j(event);

    expect(result).toBe(false);
    expect(mockExecuteNeo4jQueries).not.toHaveBeenCalled();
  });

  test("returns false on Neo4j error without throwing", async () => {
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";
    mockExecuteNeo4jQueries.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const event = makeEvent();

    const result = await writeEventToNeo4j(event);

    expect(result).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Independence: one failing store does not block others              */
/* ------------------------------------------------------------------ */

describe("writeEventsToSecondaryStores — independence", () => {
  test("Qdrant failure does not block Neo4j write", async () => {
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    mockUpsertPoints.mockRejectedValue(new Error("qdrant down"));

    const events = [makeEvent(), makeEvent()];
    const result = await writeEventsToSecondaryStores(events);

    // Qdrant failed, Neo4j succeeded
    expect(result.qdrant).toBe(0);
    expect(result.neo4j).toBe(2);
  });

  test("Neo4j failure does not block Qdrant write", async () => {
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    mockExecuteNeo4jQueries.mockRejectedValue(new Error("neo4j down"));

    const events = [makeEvent(), makeEvent()];
    const result = await writeEventsToSecondaryStores(events);

    // Qdrant succeeded, Neo4j failed
    expect(result.qdrant).toBe(2);
    expect(result.neo4j).toBe(0);
  });

  test("both stores write successfully in parallel", async () => {
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    const events = [makeEvent(), makeEvent(), makeEvent()];
    const result = await writeEventsToSecondaryStores(events);

    expect(result.qdrant).toBe(3);
    expect(result.neo4j).toBe(3);
  });

  test("both stores skip when not configured", async () => {
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_URL;

    const events = [makeEvent()];
    const result = await writeEventsToSecondaryStores(events);

    expect(result.qdrant).toBe(0);
    expect(result.neo4j).toBe(0);
    expect(mockUpsertPoints).not.toHaveBeenCalled();
    expect(mockExecuteNeo4jQueries).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  getTripleWriteStatus                                               */
/* ------------------------------------------------------------------ */

describe("getTripleWriteStatus", () => {
  test("returns all true when all stores are reachable", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(true);
    expect(status.qdrant).toBe(true);
    expect(status.neo4j).toBe(true);
  });

  test("returns false for PG when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(false);
    expect(status.qdrant).toBe(true);
    expect(status.neo4j).toBe(true);
  });

  test("returns false for Qdrant when QDRANT_URL is missing", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    delete process.env.QDRANT_URL;
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(true);
    expect(status.qdrant).toBe(false);
    expect(status.neo4j).toBe(true);
  });

  test("returns false for Neo4j when NEO4J_URI is missing", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.QDRANT_URL = "http://localhost:6333";
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_URL;

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(true);
    expect(status.qdrant).toBe(true);
    expect(status.neo4j).toBe(false);
  });

  test("returns all false when no env vars are set", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_URL;

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(false);
    expect(status.qdrant).toBe(false);
    expect(status.neo4j).toBe(false);
  });

  test("handles health check failure gracefully", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    process.env.QDRANT_URL = "http://localhost:6333";
    process.env.NEO4J_URI = "neo4j+s://test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "test";

    mockQuery.mockRejectedValueOnce(new Error("pg down"));
    mockHealthCheck.mockRejectedValueOnce(new Error("qdrant down"));
    mockNeo4jHealthCheck.mockRejectedValueOnce(new Error("neo4j down"));

    const status = await getTripleWriteStatus();

    expect(status.pg).toBe(false);
    expect(status.qdrant).toBe(false);
    expect(status.neo4j).toBe(false);
  });
});
