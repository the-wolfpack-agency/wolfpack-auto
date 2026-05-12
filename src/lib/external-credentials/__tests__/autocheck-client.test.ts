/**
 * Unit tests for AutoCheck BYO client. Symmetric coverage to carfax-client.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockLoadCred = jest.fn();
const mockRecordErr = jest.fn();
const mockTrack = jest.fn();

jest.mock("@/lib/external-credentials/index", () => ({
  loadCredential: (...args: any[]) => mockLoadCred(...args),
  recordCredentialError: (...args: any[]) => mockRecordErr(...args),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackCredentials: (...args: any[]) => mockTrack(...args),
  trackInventoryMarketIntel: (...args: any[]) => mockTrack(...args),
}));

import { getAutoCheckReport } from "@/lib/external-credentials/autocheck-client";

const VIN = "1HGCM82633A123456";
const origFetch = global.fetch;

beforeEach(() => {
  mockLoadCred.mockReset();
  mockRecordErr.mockReset();
  mockTrack.mockReset();
  delete process.env.AUTOCHECK_DISABLE_NETWORK;
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = origFetch;
});

describe("getAutoCheckReport", () => {
  it("invalid_input when VIN is wrong length", async () => {
    const res = await getAutoCheckReport({ dealerId: "d1", vin: "AB" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_input");
  });

  it("upstream_unavailable(no_credential) when no row stored", async () => {
    mockLoadCred.mockResolvedValueOnce(null);
    const res = await getAutoCheckReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("upstream_unavailable");
      expect(res.error.message).toBe("no_credential");
    }
  });

  it("synthetic report under AUTOCHECK_DISABLE_NETWORK", async () => {
    process.env.AUTOCHECK_DISABLE_NETWORK = "true";
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ username: "u", password: "p", accountId: "a" }),
      record: { id: "r1", dealerId: "d1", provider: "autocheck" },
    });
    const res = await getAutoCheckReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isMock).toBe(true);
      expect(typeof res.value.autocheckScore).toBe("number");
    }
  });

  it("401 returns upstream_error + records last_error", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ username: "u", password: "p", accountId: "a" }),
      record: { id: "r1", dealerId: "d1", provider: "autocheck" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await getAutoCheckReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("upstream_error");
    expect(mockRecordErr).toHaveBeenCalled();
  });

  it("200 path returns a normalized report", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ username: "u", password: "p", accountId: "a" }),
      record: { id: "r1", dealerId: "d1", provider: "autocheck" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        score: 88,
        segmentAverageScoreRange: [80, 92],
        owners: 1,
        accidents: 0,
        estimatedMileage: 32_500,
        hasOpenRecall: false,
      }),
    });
    const res = await getAutoCheckReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.autocheckScore).toBe(88);
      expect(res.value.segmentAverageScoreRange).toEqual([80, 92]);
      expect(res.value.isMock).toBe(false);
    }
  });
});
