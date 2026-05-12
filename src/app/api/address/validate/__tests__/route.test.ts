/**
 * Contract tests for /api/address/validate (PUBLIC + rate-limited).
 *
 *   200 — valid input + USPS responds (or graceful fallback).
 *   400 — bad JSON / missing required fields.
 *   429 — N+1 calls within the window trip the limiter.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockCheckRateLimit = jest.fn();
const mockValidateAddress = jest.fn();
const mockTrackAddressValidation = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
}));

jest.mock("@/lib/usps-address", () => ({
  validateAddress: (...args: any[]) => mockValidateAddress(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackAddressValidation: (...args: any[]) =>
    mockTrackAddressValidation(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/address/validate/route";

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/address/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockValidateAddress.mockReset();
  mockTrackAddressValidation.mockReset();
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Math.floor(Date.now() / 1000) + 60,
  });
});

describe("POST /api/address/validate", () => {
  it("returns 400 on invalid JSON", async () => {
    const req = postReq("{not json");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when street1 is missing", async () => {
    const req = postReq({ city: "Tampa" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 + fires succeeded analytics on a valid address", async () => {
    mockValidateAddress.mockResolvedValueOnce({
      validated: true,
      status: "valid",
      input_address: "123 MAIN ST, TAMPA, FL, 33601",
      canonical_address: "123 MAIN ST, TAMPA FL 33601",
      components: {
        street1: "123 MAIN ST",
        street2: null,
        city: "TAMPA",
        state: "FL",
        zip5: "33601",
        zip4: null,
        dpv_confirmation: "Y",
      },
      source: "usps",
      looked_up_at: new Date().toISOString(),
    });

    const req = postReq({
      street1: "123 Main St",
      city: "Tampa",
      state: "FL",
      zip: "33601",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("valid");
    expect(mockTrackAddressValidation).toHaveBeenCalledWith(
      "address.validation_succeeded",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns 200 + corrected analytics when USPS canonicalizes", async () => {
    mockValidateAddress.mockResolvedValueOnce({
      validated: true,
      status: "correctable",
      input_address: "123 MAIN, TAMPA, FL, 33601",
      canonical_address: "123 MAIN ST, TAMPA FL 33601",
      components: {
        street1: "123 MAIN ST",
        street2: null,
        city: "TAMPA",
        state: "FL",
        zip5: "33601",
        zip4: null,
        dpv_confirmation: "Y",
      },
      source: "usps",
      looked_up_at: new Date().toISOString(),
    });
    const req = postReq({
      street1: "123 Main",
      city: "Tampa",
      state: "FL",
      zip: "33601",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockTrackAddressValidation).toHaveBeenCalledWith(
      "address.validation_corrected",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns 200 + failed analytics on unverifiable", async () => {
    mockValidateAddress.mockResolvedValueOnce({
      validated: false,
      status: "unverifiable",
      reason: "service_not_configured",
      input_address: "FOO",
      canonical_address: null,
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "unverifiable",
      looked_up_at: new Date().toISOString(),
    });
    const req = postReq({ street1: "Foo" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe("service_not_configured");
    expect(mockTrackAddressValidation).toHaveBeenCalledWith(
      "address.validation_failed",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns 429 when rate limit trips on the next call", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    });
    const req = postReq({ street1: "123 Main St" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockValidateAddress).not.toHaveBeenCalled();
  });

  it("trips rate limit on N+1 calls (simulated)", async () => {
    // First 30 calls allowed, 31st denied.
    let count = 0;
    mockCheckRateLimit.mockImplementation(() => {
      count += 1;
      return Promise.resolve({
        allowed: count <= 30,
        remaining: Math.max(0, 30 - count),
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });
    });
    mockValidateAddress.mockResolvedValue({
      validated: true,
      status: "valid",
      input_address: "X",
      canonical_address: "X",
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "usps",
      looked_up_at: new Date().toISOString(),
    });
    for (let i = 0; i < 30; i++) {
      const ok = await POST(postReq({ street1: "123 Main St" }));
      expect(ok.status).toBe(200);
    }
    const denied = await POST(postReq({ street1: "123 Main St" }));
    expect(denied.status).toBe(429);
  });
});
