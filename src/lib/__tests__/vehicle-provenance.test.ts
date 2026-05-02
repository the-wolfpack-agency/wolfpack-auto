/**
 * vehicle-provenance — unit tests
 *
 * Covers:
 *   - canonical JSON is key-order stable (chain integrity)
 *   - leaf-hash computation matches the spec for genesis + extension
 *   - merkle root is stable, deterministic, and verifies the same leaves
 *   - in-memory chain: good chain verifies, tampered payload fails,
 *     broken hash fails, missing signature fails
 *   - triple-write degrades gracefully when secondary stores throw
 *
 * The DB-bound paths (recordEvent / verifyChain / anchorRange against real
 * Postgres) are exercised by the contract + E2E layers per the repo
 * directive — unit tests here keep the logic-level invariants honest.
 */

jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

const mockTrackProvenance = jest.fn();
const mockTrackSystem = jest.fn();
jest.mock("@/lib/analytics-hooks", () => ({
  trackProvenance: (...args: unknown[]) => mockTrackProvenance(...args),
  trackSystem: (...args: unknown[]) => mockTrackSystem(...args),
}));

import crypto from "node:crypto";
import {
  canonicalJson,
  computeLeafHash,
  merkleRoot,
  verifyChain,
  type ProvenanceEventRow,
} from "../vehicle-provenance";
import { signBytes, verifyBytes } from "../crypto/sign";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-unit-tests";
});

beforeEach(() => {
  mockTrackProvenance.mockClear();
});

/* -------------------------------------------------------------------------- */
/* canonicalJson — key-order stability                                         */
/* -------------------------------------------------------------------------- */

describe("canonicalJson", () => {
  it("sorts keys recursively so equivalent objects serialize identically", () => {
    const a = canonicalJson({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalJson({ a: { x: 1, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("preserves array order (arrays are ordered values)", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles primitives + null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson(true)).toBe("true");
  });
});

/* -------------------------------------------------------------------------- */
/* computeLeafHash                                                             */
/* -------------------------------------------------------------------------- */

describe("computeLeafHash", () => {
  it("matches SHA-256 of (prevHash || canonical_json(payload) || occurred_at)", () => {
    const prevHash = null;
    const payload = { miles: 12000, station: "ACME" };
    const occurredAt = "2026-05-01T12:00:00.000Z";

    const expected = crypto
      .createHash("sha256")
      .update(`||${canonicalJson(payload)}||${occurredAt}`, "utf8")
      .digest("hex");

    expect(computeLeafHash({ prevHash, payload, occurredAt })).toBe(expected);
  });

  it("changes when payload changes (tamper detection foundation)", () => {
    const a = computeLeafHash({
      prevHash: null,
      payload: { miles: 12000 },
      occurredAt: "2026-05-01T00:00:00Z",
    });
    const b = computeLeafHash({
      prevHash: null,
      payload: { miles: 12001 }, // off by one
      occurredAt: "2026-05-01T00:00:00Z",
    });
    expect(a).not.toBe(b);
  });

  it("is stable under benign key reordering", () => {
    const a = computeLeafHash({
      prevHash: "abc",
      payload: { miles: 1, station: "X" },
      occurredAt: "2026-05-01T00:00:00Z",
    });
    const b = computeLeafHash({
      prevHash: "abc",
      payload: { station: "X", miles: 1 },
      occurredAt: "2026-05-01T00:00:00Z",
    });
    expect(a).toBe(b);
  });
});

/* -------------------------------------------------------------------------- */
/* merkleRoot                                                                  */
/* -------------------------------------------------------------------------- */

describe("merkleRoot", () => {
  it("is deterministic across runs", () => {
    const leaves = ["00".repeat(32), "11".repeat(32), "22".repeat(32)];
    expect(merkleRoot(leaves)).toBe(merkleRoot(leaves));
  });

  it("changes when any leaf changes", () => {
    const leaves = ["00".repeat(32), "11".repeat(32), "22".repeat(32)];
    const tampered = [...leaves];
    tampered[1] = "ff".repeat(32);
    expect(merkleRoot(leaves)).not.toBe(merkleRoot(tampered));
  });

  it("for a single leaf, root = sha256(leaf || leaf) (odd-leaf duplication)", () => {
    const leaf = "ab".repeat(32);
    const buf = Buffer.from(leaf, "hex");
    const expected = crypto
      .createHash("sha256")
      .update(Buffer.concat([buf, buf]))
      .digest("hex");
    expect(merkleRoot([leaf])).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */
/* In-memory chain verification (no DB)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a synthetic, fully-formed chain row for use against a stubbed
 * `query`. Mirrors the shape returned by Postgres for vehicle_provenance_events.
 */
function buildRow(args: {
  id: string;
  vin: string;
  prevHash: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  recordedAt: string;
}): ProvenanceEventRow {
  const thisHash = computeLeafHash({
    prevHash: args.prevHash,
    payload: args.payload,
    occurredAt: args.occurredAt,
  });
  const { signatureB64, algorithm } = signBytes(thisHash, { algorithm: "hs256" });
  return {
    id: args.id,
    dealer_id: "00000000-0000-4000-a000-000000000001",
    vin: args.vin,
    event_type: "service",
    occurred_at: args.occurredAt,
    payload: args.payload,
    recorded_at: args.recordedAt,
    recorded_by_user_id: null,
    prev_hash: args.prevHash,
    this_hash: thisHash,
    signature_alg: algorithm,
    signature_b64: signatureB64,
    verifying_key_id: null,
  };
}

/**
 * Mock the `@/lib/db` `query` function so verifyChain can read a fake chain
 * without a Postgres connection. Call `setRows()` from each test.
 */
let mockRows: ProvenanceEventRow[] = [];
jest.mock("@/lib/db", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: jest.fn(async (_text: string, _params?: unknown[]) => ({
    rows: mockRows,
  })),
  pool: { connect: jest.fn() },
  setTenantContext: jest.fn(),
}));

describe("verifyChain", () => {
  it("returns ok:true for an empty chain (count: 0)", async () => {
    mockRows = [];
    const result = await verifyChain("VIN_NONE");
    expect(result).toEqual({ ok: true, count: 0 });
  });

  it("verifies a well-formed multi-row chain", async () => {
    const occurredA = "2026-05-01T00:00:00.000Z";
    const occurredB = "2026-05-02T00:00:00.000Z";
    const a = buildRow({
      id: "r1",
      vin: "1HGBH41JXMN109186",
      prevHash: null,
      payload: { miles: 10000 },
      occurredAt: occurredA,
      recordedAt: occurredA,
    });
    const b = buildRow({
      id: "r2",
      vin: "1HGBH41JXMN109186",
      prevHash: a.this_hash,
      payload: { miles: 12000 },
      occurredAt: occurredB,
      recordedAt: occurredB,
    });
    mockRows = [a, b];
    const result = await verifyChain("1HGBH41JXMN109186");
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
  });

  it("rejects a tampered payload (this_hash will not recompute)", async () => {
    const occurredA = "2026-05-01T00:00:00.000Z";
    const a = buildRow({
      id: "r1",
      vin: "VIN_TAMPER",
      prevHash: null,
      payload: { miles: 10000 },
      occurredAt: occurredA,
      recordedAt: occurredA,
    });
    // Mutate the payload AFTER signing — simulating a row tamper at rest.
    const tampered = { ...a, payload: { miles: 99999 } };
    mockRows = [tampered];
    const result = await verifyChain("VIN_TAMPER");
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe("r1");
    expect(result.reason).toMatch(/tamper|recomputed/i);
  });

  it("rejects a row whose prev_hash does not link", async () => {
    const occurredA = "2026-05-01T00:00:00.000Z";
    const occurredB = "2026-05-02T00:00:00.000Z";
    const a = buildRow({
      id: "r1",
      vin: "VIN_BROKEN",
      prevHash: null,
      payload: { x: 1 },
      occurredAt: occurredA,
      recordedAt: occurredA,
    });
    // b.prev_hash claims to follow a row that doesn't exist
    const b = buildRow({
      id: "r2",
      vin: "VIN_BROKEN",
      prevHash: "ff".repeat(32),
      payload: { x: 2 },
      occurredAt: occurredB,
      recordedAt: occurredB,
    });
    mockRows = [a, b];
    const result = await verifyChain("VIN_BROKEN");
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe("r2");
    expect(result.reason).toMatch(/prev_hash mismatch/);
  });

  it("rejects a row with a missing / corrupted signature", async () => {
    const occurredA = "2026-05-01T00:00:00.000Z";
    const a = buildRow({
      id: "r1",
      vin: "VIN_BADSIG",
      prevHash: null,
      payload: { x: 1 },
      occurredAt: occurredA,
      recordedAt: occurredA,
    });
    // Replace the signature with garbage
    const corrupted = { ...a, signature_b64: "AAAA" };
    mockRows = [corrupted];
    const result = await verifyChain("VIN_BADSIG");
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe("r1");
    expect(result.reason).toMatch(/signature/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Sign / verify roundtrip — guards the registry-routed signer                */
/* -------------------------------------------------------------------------- */

describe("signBytes / verifyBytes — provenance chain leaves", () => {
  it("signs a hex hash and round-trips via verifyBytes", () => {
    const leaf = "ab".repeat(32);
    const { signatureB64, algorithm } = signBytes(leaf);
    expect(verifyBytes(leaf, signatureB64, algorithm)).toBe(true);
  });

  it("fails to verify a tampered hash", () => {
    const leaf = "ab".repeat(32);
    const { signatureB64, algorithm } = signBytes(leaf);
    expect(verifyBytes("cd".repeat(32), signatureB64, algorithm)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Triple-write graceful degradation                                          */
/* -------------------------------------------------------------------------- */

describe("triple-write graceful degradation", () => {
  it("writeEventsToSecondaryStores resolves even when both stores throw", async () => {
    // Force triple-write to attempt secondary writes by setting the env vars,
    // then mock the underlying clients to throw. The outer call must not
    // throw and must resolve to numeric counters.
    process.env.QDRANT_URL = "http://qdrant:6333";
    process.env.NEO4J_URI = "bolt://neo4j:7687";

    jest.doMock("@/lib/qdrant-client", () => ({
      upsertPoints: () => { throw new Error("qdrant down"); },
      createCollection: () => { throw new Error("qdrant down"); },
      healthCheck: () => false,
    }));
    jest.doMock("@/lib/neo4j-client", () => ({
      executeNeo4jQueries: () => { throw new Error("neo4j down"); },
      neo4jHealthCheck: () => false,
    }));

    // Re-import after mocks are registered
    jest.resetModules();
    const { writeEventsToSecondaryStores } = await import("@/lib/triple-write");

    const result = await writeEventsToSecondaryStores([
      {
        event_type: "provenance",
        action: "provenance.event_recorded",
        page: "/api/admin/vehicle-provenance/X",
        session_id: "provenance:X",
        user_fingerprint: "system",
        timestamp: new Date().toISOString(),
        metadata: { dealer_id: "d1", vin: "X", event_type: "service" },
      },
    ]);

    expect(result).toEqual({ qdrant: 0, neo4j: 0 });
  });
});
