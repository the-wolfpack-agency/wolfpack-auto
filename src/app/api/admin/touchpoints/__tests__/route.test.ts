/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for the admin touchpoint routes.
 *
 *   GET /api/admin/touchpoints       -- list recent scans for the tenant
 *   GET /api/admin/touchpoints/:id   -- single event by id
 *
 * Asserts 200 / 401 / 403 / 404 paths.
 */

const mockGetServerSession = jest.fn();
const mockQuery = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...a: any[]) => mockGetServerSession(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSecurity: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as listGET } from "@/app/api/admin/touchpoints/route";
import { GET as detailGET } from "@/app/api/admin/touchpoints/[id]/route";

const TENANT = "11111111-1111-4111-9111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-9222-222222222222";
const EVENT_ID = "33333333-3333-4333-9333-333333333333";

beforeEach(() => {
  mockGetServerSession.mockReset();
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

function authed() {
  mockGetServerSession.mockResolvedValue({
    user: {
      id: "u1",
      email: "u@example.com",
      name: "U",
      dealer_id: TENANT,
      role: "admin",
    },
  });
}

function listReq(): NextRequest {
  return new NextRequest("http://localhost/api/admin/touchpoints", {
    method: "GET",
  });
}

function detailReq(): NextRequest {
  return new NextRequest(`http://localhost/api/admin/touchpoints/${EVENT_ID}`, {
    method: "GET",
  });
}

describe("GET /api/admin/touchpoints", () => {
  test("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await listGET(listReq());
    expect(res.status).toBe(401);
  });

  test("returns 200 with rows for an authed admin", async () => {
    authed();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: EVENT_ID,
          tenant_id: TENANT,
          touchpoint_type: "qr",
          touchpoint_id: "tp-1",
          payload: { format: "wolfpack_uri" },
          customer_id: null,
          device_fingerprint: null,
          scanned_at: new Date().toISOString(),
          action_triggered_slug: "inventory.feature_vehicle",
          outcome: "action_triggered",
          outcome_detail: null,
          ip_address: null,
          user_agent: null,
        },
      ],
    });
    const res = await listGET(listReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].tenant_id).toBe(TENANT);

    // SQL was issued with tenant_id from the session, not from any input.
    const args = mockQuery.mock.calls[0];
    expect(args[1][0]).toBe(TENANT);
  });
});

describe("GET /api/admin/touchpoints/:id", () => {
  test("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await detailGET(detailReq(), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 on invalid id", async () => {
    authed();
    const res = await detailGET(
      new NextRequest("http://localhost/api/admin/touchpoints/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when the event is missing", async () => {
    authed();
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await detailGET(detailReq(), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  test("returns 403 when the event belongs to a different tenant", async () => {
    authed();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: EVENT_ID,
          tenant_id: OTHER_TENANT,
          touchpoint_type: "qr",
          touchpoint_id: "tp-x",
          payload: null,
          customer_id: null,
          device_fingerprint: null,
          scanned_at: new Date().toISOString(),
          action_triggered_slug: null,
          outcome: "no_match",
          outcome_detail: null,
          ip_address: null,
          user_agent: null,
        },
      ],
    });
    const res = await detailGET(detailReq(), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(403);
  });

  test("returns 200 with the event when authorised", async () => {
    authed();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: EVENT_ID,
          tenant_id: TENANT,
          touchpoint_type: "qr",
          touchpoint_id: "tp-good",
          payload: { format: "wolfpack_uri" },
          customer_id: null,
          device_fingerprint: null,
          scanned_at: new Date().toISOString(),
          action_triggered_slug: "inventory.feature_vehicle",
          outcome: "action_triggered",
          outcome_detail: null,
          ip_address: null,
          user_agent: null,
        },
      ],
    });
    const res = await detailGET(detailReq(), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.id).toBe(EVENT_ID);
    expect(body.event.tenant_id).toBe(TENANT);
  });
});
