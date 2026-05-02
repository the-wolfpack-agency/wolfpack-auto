/**
 * Contract tests for POST /api/webhooks/telemetry/[provider]
 *
 *   - Valid signature → 200
 *   - Bad signature  → 401
 *   - Duplicate event id (idempotency) → 200, deduped > 0
 *   - Unknown provider → 400
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockVerifyAndIngest = jest.fn();
const mockRunRules = jest.fn().mockResolvedValue({ emitted: [], skipped: [] });

jest.mock("@/lib/connected-vehicle", () => ({
  verifyAndIngest: (...args: any[]) => mockVerifyAndIngest(...args),
  runMaintenanceRules: (...args: any[]) => mockRunRules(...args),
}));

jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/telemetry/[provider]/route";

function buildRequest(body: string, sig: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sig !== null) headers["x-telemetry-signature"] = sig;
  return new NextRequest(
    "http://localhost:3000/api/webhooks/telemetry/samsara",
    { method: "POST", headers, body },
  );
}

describe("POST /api/webhooks/telemetry/[provider]", () => {
  beforeEach(() => {
    mockVerifyAndIngest.mockReset();
    mockRunRules.mockReset().mockResolvedValue({ emitted: [], skipped: [] });
  });

  it("returns 400 for unknown provider", async () => {
    const req = buildRequest("{}", "abc");
    const res = await POST(req, {
      params: Promise.resolve({ provider: "wat" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 on a valid signed payload", async () => {
    mockVerifyAndIngest.mockResolvedValueOnce({
      inserted: 1,
      deduped: 0,
      vin: "1HGBH41JXMN109186",
    });
    const req = buildRequest("{}", "a".repeat(64));
    const res = await POST(req, {
      params: Promise.resolve({ provider: "samsara" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(mockRunRules).toHaveBeenCalledWith("1HGBH41JXMN109186");
  });

  it("returns 401 on invalid signature", async () => {
    mockVerifyAndIngest.mockResolvedValueOnce({
      inserted: 0,
      deduped: 0,
      vin: null,
      reason: "invalid_signature",
    });
    const req = buildRequest("{}", "b".repeat(64));
    const res = await POST(req, {
      params: Promise.resolve({ provider: "samsara" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature header is missing", async () => {
    mockVerifyAndIngest.mockResolvedValueOnce({
      inserted: 0,
      deduped: 0,
      vin: null,
      reason: "missing_signature",
    });
    const req = buildRequest("{}", null);
    const res = await POST(req, {
      params: Promise.resolve({ provider: "samsara" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 on duplicate (idempotent) — provider doesn't retry forever", async () => {
    mockVerifyAndIngest.mockResolvedValueOnce({
      inserted: 0,
      deduped: 3,
      vin: "1HGBH41JXMN109186",
    });
    const req = buildRequest("{}", "a".repeat(64));
    const res = await POST(req, {
      params: Promise.resolve({ provider: "samsara" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(3);
    expect(body.inserted).toBe(0);
    // Rules NOT run when nothing was inserted
    expect(mockRunRules).not.toHaveBeenCalled();
  });

  it("returns 400 when device is not registered", async () => {
    mockVerifyAndIngest.mockResolvedValueOnce({
      inserted: 0,
      deduped: 0,
      vin: null,
      reason: "device_not_registered",
    });
    const req = buildRequest("{}", "a".repeat(64));
    const res = await POST(req, {
      params: Promise.resolve({ provider: "samsara" }),
    });
    expect(res.status).toBe(400);
  });
});
