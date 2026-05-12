/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for POST /api/touchpoints/scan.
 *
 *   - 200 happy path with action_triggered
 *   - 400 on invalid JSON / validation failure
 *   - 429 on rate-limit exhaustion
 *   - shape of the 200 response body (event_id, outcome, action_slug)
 */

const mockCheckRateLimit = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: any[]) => mockCheckRateLimit(...a),
}));

jest.mock("@/lib/touchpoints", () => {
  const actual = jest.requireActual("@/lib/touchpoints");
  return {
    ...actual,
    dispatchScan: (...a: any[]) => mockDispatch(...a),
  };
});

import { NextRequest } from "next/server";
import { POST } from "@/app/api/touchpoints/scan/route";

const TENANT = "11111111-1111-4111-9111-111111111111";

function buildRequest(body: unknown, ip = "9.9.9.9"): NextRequest {
  return new NextRequest("http://localhost:3000/api/touchpoints/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "jest",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockDispatch.mockReset();
  // Default to allow + happy-path dispatch.
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Math.floor(Date.now() / 1000) + 60,
  });
  mockDispatch.mockResolvedValue({
    eventId: "00000000-0000-4000-a000-000000000099",
    outcome: "action_triggered",
    actionSlug: "inventory.feature_vehicle",
    actionParameters: { vin: "VIN123" },
  });
});

describe("POST /api/touchpoints/scan", () => {
  test("returns 200 + dispatch result on the happy path", async () => {
    const res = await POST(
      buildRequest({
        tenant_id: TENANT,
        type: "qr",
        raw: `wp://qr/${TENANT}/walkaround-VIN123`,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("action_triggered");
    expect(body.action_slug).toBe("inventory.feature_vehicle");
    expect(body.event_id).toMatch(/[0-9a-f-]{36}/);

    // dispatchScan was called with the IP + UA forwarded from the request.
    expect(mockDispatch).toHaveBeenCalledWith(
      TENANT,
      "qr",
      `wp://qr/${TENANT}/walkaround-VIN123`,
      expect.objectContaining({ ip: "9.9.9.9", ua: "jest" }),
    );
  });

  test("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 30,
    });
    const res = await POST(
      buildRequest({ tenant_id: TENANT, type: "qr", raw: "any" }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test("returns 400 on invalid JSON", async () => {
    const res = await POST(buildRequest("not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  test("returns 400 on validation failure (missing tenant_id)", async () => {
    const res = await POST(buildRequest({ type: "qr", raw: "x" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  test("returns 400 on validation failure (unknown touchpoint type)", async () => {
    const res = await POST(
      buildRequest({ tenant_id: TENANT, type: "bluetooth", raw: "x" }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 when raw is empty", async () => {
    const res = await POST(
      buildRequest({ tenant_id: TENANT, type: "qr", raw: "" }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 500 when dispatcher throws", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(
      buildRequest({ tenant_id: TENANT, type: "qr", raw: "anything" }),
    );
    expect(res.status).toBe(500);
  });
});
