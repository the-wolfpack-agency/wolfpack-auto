/**
 * Contract tests — vehicle-provenance API routes.
 *
 * Validates 200/201/400/401/403/404/429 across:
 *   POST /api/admin/vehicle-provenance/record
 *   GET  /api/admin/vehicle-provenance/[vin]
 *   POST /api/admin/vehicle-provenance/anchor
 *   GET  /api/vehicle-provenance/[vin]/verify  (PUBLIC, rate-limited)
 *
 * Real-DB integration is in the E2E layer (tests/e2e/vehicle-provenance.spec.ts).
 * Here we mock @/lib/db query so the contract surface (status codes, JSON
 * shape, auth gating) is locked in and regressions are loud.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { connect: jest.fn() },
  setTenantContext: jest.fn(),
}));

const mockRequireAuth = jest.fn();
jest.mock("@/lib/auth-guard", () => {
  const actual = jest.requireActual("@/lib/auth-guard");
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  };
});

const mockCheckRateLimit = jest.fn();
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

jest.mock("@/lib/triple-write", () => ({
  writeEventsToSecondaryStores: jest.fn(async () => ({ qdrant: 0, neo4j: 0 })),
}));

jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

import { NextRequest, NextResponse } from "next/server";
import { POST as recordPOST } from "@/app/api/admin/vehicle-provenance/record/route";
import { GET as adminGET } from "@/app/api/admin/vehicle-provenance/[vin]/route";
import { POST as anchorPOST } from "@/app/api/admin/vehicle-provenance/anchor/route";
import { GET as publicVerifyGET } from "@/app/api/vehicle-provenance/[vin]/verify/route";

const VALID_VIN = "1HGBH41JXMN109186";
const ADMIN_USER = {
  user: {
    id: "u-admin",
    email: "admin@example.com",
    name: "Admin",
    dealer_id: "00000000-0000-4000-a000-000000000001",
    role: "admin" as const,
  },
};
const STAFF_USER = {
  user: {
    id: "u-staff",
    email: "staff@example.com",
    name: "Staff",
    dealer_id: "00000000-0000-4000-a000-000000000001",
    role: "staff" as const,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret-for-unit-tests";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: 0 });
});

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicle-provenance/record                                  */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/vehicle-provenance/record", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN, event_type: "service", occurred_at: "2026-05-01T00:00:00Z" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("403 when role is staff (insufficient)", async () => {
    mockRequireAuth.mockResolvedValueOnce(STAFF_USER);
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN, event_type: "service", occurred_at: "2026-05-01T00:00:00Z" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when JSON body is malformed", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when VIN is invalid", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({ vin: "BAD VIN!!", event_type: "service", occurred_at: "2026-05-01T00:00:00Z" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when event_type is unknown", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN, event_type: "telekinesis", occurred_at: "2026-05-01T00:00:00Z" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when occurred_at is not a date", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN, event_type: "service", occurred_at: "yesterday-ish" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("201 on success and returns the signed event row", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    // recordEvent issues two queries: SELECT tip, INSERT row.
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no prior tip
      .mockResolvedValueOnce({
        rows: [
          {
            id: "row-1",
            dealer_id: ADMIN_USER.user.dealer_id,
            vin: VALID_VIN,
            event_type: "service",
            occurred_at: "2026-05-01T00:00:00.000Z",
            payload: { miles: 10000 },
            recorded_at: "2026-05-01T00:00:00.000Z",
            recorded_by_user_id: ADMIN_USER.user.id,
            prev_hash: null,
            this_hash: "hash-1",
            signature_alg: "hs256",
            signature_b64: "sig-1",
            verifying_key_id: null,
          },
        ],
      });
    const res = await recordPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/record", {
        method: "POST",
        body: JSON.stringify({
          vin: VALID_VIN,
          event_type: "service",
          occurred_at: "2026-05-01T00:00:00Z",
          payload: { miles: 10000 },
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.event.vin).toBe(VALID_VIN);
    expect(body.event.signature_b64).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicle-provenance/[vin]                                    */
/* -------------------------------------------------------------------------- */

describe("GET /api/admin/vehicle-provenance/[vin]", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await adminGET(
      makeReq(`http://localhost/api/admin/vehicle-provenance/${VALID_VIN}`),
      { params: Promise.resolve({ vin: VALID_VIN }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 on bad VIN", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await adminGET(
      makeReq("http://localhost/api/admin/vehicle-provenance/BAD"),
      { params: Promise.resolve({ vin: "BAD" }) },
    );
    expect(res.status).toBe(400);
  });

  it("200 returns summary shape on empty VIN", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    // listEvents, listAnchors, verifyChain (verifyChain calls the same query)
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEvents
      .mockResolvedValueOnce({ rows: [] }) // listAnchors
      .mockResolvedValueOnce({ rows: [] }); // verifyChain
    const res = await adminGET(
      makeReq(`http://localhost/api/admin/vehicle-provenance/${VALID_VIN}`),
      { params: Promise.resolve({ vin: VALID_VIN }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vin).toBe(VALID_VIN);
    expect(body.count).toBe(0);
    expect(body.verification.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicle-provenance/anchor                                  */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/vehicle-provenance/anchor", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await anchorPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/anchor", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("403 when role is staff (admin/owner only)", async () => {
    mockRequireAuth.mockResolvedValueOnce(STAFF_USER);
    const res = await anchorPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/anchor", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 on invalid VIN", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    const res = await anchorPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/anchor", {
        method: "POST",
        body: JSON.stringify({ vin: "BAD" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("404 when no events exist for the VIN", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    // anchorRange's "list leaves" query returns no rows
    mockQuery.mockResolvedValueOnce({ rows: [] }); // leaves query
    const res = await anchorPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/anchor", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("201 on success", async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_USER);
    // anchorRange: SELECT leaves, then INSERT anchor returning row
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "e1", this_hash: "ab".repeat(32) },
          { id: "e2", this_hash: "cd".repeat(32) },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "anchor-1",
            dealer_id: ADMIN_USER.user.dealer_id,
            vin: VALID_VIN,
            root_hash: "00".repeat(32),
            range_start_id: "e1",
            range_end_id: "e2",
            range_count: 2,
            anchored_at: "2026-05-02T00:00:00Z",
            anchor_alg: "hs256",
            anchor_signature: "sig",
            verifying_key_id: null,
          },
        ],
      });
    const res = await anchorPOST(
      makeReq("http://localhost/api/admin/vehicle-provenance/anchor", {
        method: "POST",
        body: JSON.stringify({ vin: VALID_VIN }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.anchor.range_count).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/vehicle-provenance/[vin]/verify  (PUBLIC)                         */
/* -------------------------------------------------------------------------- */

describe("GET /api/vehicle-provenance/[vin]/verify (public)", () => {
  it("400 on invalid VIN", async () => {
    const res = await publicVerifyGET(
      makeReq("http://localhost/api/vehicle-provenance/BAD/verify"),
      { params: Promise.resolve({ vin: "BAD" }) },
    );
    expect(res.status).toBe(400);
  });

  it("200 ok:true when DB has no events for the VIN", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEvents
      .mockResolvedValueOnce({ rows: [] }); // verifyChain
    const res = await publicVerifyGET(
      makeReq(`http://localhost/api/vehicle-provenance/${VALID_VIN}/verify`),
      { params: Promise.resolve({ vin: VALID_VIN }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.vin).toBe(VALID_VIN);
  });

  it("200 with ok:false when chain has been tampered", async () => {
    // Simulate a stored row whose payload doesn't match its this_hash.
    const tamperedRow = {
      id: "r1",
      dealer_id: "d1",
      vin: VALID_VIN,
      event_type: "service",
      occurred_at: "2026-05-01T00:00:00.000Z",
      payload: { miles: 99999 },
      recorded_at: "2026-05-01T00:00:00.000Z",
      recorded_by_user_id: null,
      prev_hash: null,
      this_hash: "deadbeef".repeat(8),
      signature_alg: "hs256",
      signature_b64: "AAAA",
      verifying_key_id: null,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [tamperedRow] })
      .mockResolvedValueOnce({ rows: [tamperedRow] });
    const res = await publicVerifyGET(
      makeReq(`http://localhost/api/vehicle-provenance/${VALID_VIN}/verify`),
      { params: Promise.resolve({ vin: VALID_VIN }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBeTruthy();
  });

  it("429 on rate-limit excess", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });
    const res = await publicVerifyGET(
      makeReq(`http://localhost/api/vehicle-provenance/${VALID_VIN}/verify`),
      { params: Promise.resolve({ vin: VALID_VIN }) },
    );
    expect(res.status).toBe(429);
  });
});
