/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for POST /api/leads/intake
 *
 * Validates:
 *   - 201 on valid signed payload
 *   - 401 on missing / bad signature
 *   - 429 when rate-limit trips
 *   - 400 on invalid JSON / schema
 */

import crypto from "crypto";

const mockCheckRateLimit = jest.fn();
const mockVerify = jest.fn();
const mockTrackLead = jest.fn();
const mockTrackIngestion = jest.fn();
const mockAuditLog = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: any[]) => mockCheckRateLimit(...a),
}));
jest.mock("@/lib/webhook-verify", () => ({
  verifyWebhookSignature: (...a: any[]) => mockVerify(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackLead: (...a: any[]) => mockTrackLead(...a),
  trackLeadIngestion: (...a: any[]) => mockTrackIngestion(...a),
}));
jest.mock("@/lib/audit-log", () => ({
  auditLog: (...a: any[]) => mockAuditLog(...a),
}));

beforeEach(() => {
  delete process.env.DATABASE_URL;
  mockCheckRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 59, resetAt: 0 });
  mockVerify.mockReset().mockReturnValue(true);
  mockTrackLead.mockReset();
  mockTrackIngestion.mockReset();
  mockAuditLog.mockReset();
});

import { NextRequest } from "next/server";
import { POST } from "../route";

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://x.test/api/leads/intake", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": "deadbeef",
      "x-lead-source-id": "ls-1",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  first_name: "Alex",
  last_name: "Rivera",
  email: "alex@example.com",
  phone: "+15551234567",
  vehicle_interest: "2024 Toyota Camry",
  source_name: "Website",
};

describe("POST /api/leads/intake", () => {
  test("201 + lead id on a well-formed signed payload", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeTruthy();
    expect(json.duplicate).toBe(false);
    expect(mockTrackLead).toHaveBeenCalledWith(
      "lead.intake_received",
      expect.any(String),
      expect.objectContaining({ duplicate: false }),
    );
    expect(mockAuditLog).toHaveBeenCalled();
  });

  test("401 when signature verification fails", async () => {
    mockVerify.mockReturnValueOnce(false);
    process.env.DATABASE_URL = "postgres://test";
    jest.doMock("@/lib/db", () => ({
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "ls-1",
            dealer_id: "00000000-0000-4000-a000-000000000001",
            source_name: "Web",
            source_type: "webhook",
            signing_secret: "secret",
            active: true,
          },
        ],
      }),
    }));
    // Re-import POST so the jest.doMock above takes effect for the db client.
    jest.resetModules();
    const { POST: PostReimport } = await import("../route");
    const res = await PostReimport(makeRequest(validBody));
    expect(res.status).toBe(401);
    delete process.env.DATABASE_URL;
  });

  test("401 when no signature and no API key provided", async () => {
    const req = new NextRequest("https://x.test/api/leads/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("429 when rate-limit blocks", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  test("400 on invalid JSON body", async () => {
    const res = await POST(makeRequest("not json{"));
    expect(res.status).toBe(400);
  });

  test("400 on schema-invalid payload (missing email)", async () => {
    const bad = { ...validBody, email: undefined };
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Validation/);
  });

  test("uses HMAC SHA-256 over the raw body when verifying", async () => {
    process.env.DATABASE_URL = "postgres://test";
    const realVerify = jest.requireActual<typeof import("@/lib/webhook-verify")>("@/lib/webhook-verify");
    mockVerify.mockImplementation((...args) => (realVerify.verifyWebhookSignature as any)(...args));

    const secret = "s3cr3t";
    const body = JSON.stringify(validBody);
    const sig = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");

    const queryMock = jest.fn().mockImplementation((sql: string) => {
      if (/FROM lead_sources/.test(sql)) {
        return Promise.resolve({
          rows: [
            {
              id: "ls-1",
              dealer_id: "00000000-0000-4000-a000-000000000001",
              source_name: "Web",
              source_type: "webhook",
              signing_secret: secret,
              active: true,
            },
          ],
        });
      }
      if (/FROM leads\b/.test(sql)) return Promise.resolve({ rows: [] });
      if (/INSERT INTO leads/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "db-id", created_at: "2026-05-11T00:00:00.000Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });
    jest.doMock("@/lib/db", () => ({ query: queryMock }));
    jest.resetModules();
    const { POST: PostReimport } = await import("../route");
    const req = new NextRequest("https://x.test/api/leads/intake", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": sig,
        "x-lead-source-id": "ls-1",
      },
      body,
    });
    const res = await PostReimport(req);
    expect(res.status).toBe(201);
    delete process.env.DATABASE_URL;
  });
});
