/**
 * Unit tests for the Carfax-for-Dealers BYO client.
 *
 *  - returns `upstream_unavailable` with message "no_credential" when the
 *    dealer has no stored credential.
 *  - synthetic mode (CARFAX_DISABLE_NETWORK=true) returns isMock=true.
 *  - 401 / 403 path stamps last_error on the credential row.
 *  - validates VIN before any network call.
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

import { getCarfaxReport } from "@/lib/external-credentials/carfax-client";

const VIN = "1HGCM82633A123456";
const origFetch = global.fetch;

beforeEach(() => {
  mockLoadCred.mockReset();
  mockRecordErr.mockReset();
  mockTrack.mockReset();
  delete process.env.CARFAX_DISABLE_NETWORK;
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = origFetch;
});

describe("getCarfaxReport: validation", () => {
  it("invalid_input when VIN is wrong length", async () => {
    const res = await getCarfaxReport({ dealerId: "d1", vin: "AB" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_input");
  });
});

describe("getCarfaxReport: graceful degradation", () => {
  it("returns upstream_unavailable(no_credential) when no row stored", async () => {
    mockLoadCred.mockResolvedValueOnce(null);
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("upstream_unavailable");
      expect(res.error.message).toBe("no_credential");
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("getCarfaxReport: synthetic mode", () => {
  it("returns isMock=true synthetic report without network", async () => {
    process.env.CARFAX_DISABLE_NETWORK = "true";
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ apiKey: "k", dealerCode: "D" }),
      record: { id: "r1", dealerId: "d1", provider: "carfax" },
    });
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isMock).toBe(true);
      expect(res.value.vin).toBe(VIN);
    }
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      "carfax.report_fetched",
      "d1",
      expect.objectContaining({ vin: VIN }),
    );
  });
});

describe("getCarfaxReport: live error mapping", () => {
  it("records credential error + emits failure analytics on 401", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ apiKey: "k", dealerCode: "D" }),
      record: { id: "r1", dealerId: "d1", provider: "carfax" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("upstream_error");
    expect(mockRecordErr).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_proxy_call_failed",
      "d1",
      expect.objectContaining({ reason: "auth" }),
    );
  });

  it("maps 404 to not_found", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: "raw-token",
      record: { id: "r1", dealerId: "d1", provider: "carfax" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });

  it("maps 429 to rate_limited", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: "raw-token",
      record: { id: "r1", dealerId: "d1", provider: "carfax" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("rate_limited");
  });

  it("returns a normalized report on 200", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: JSON.stringify({ apiKey: "k", dealerCode: "D" }),
      record: { id: "r1", dealerId: "d1", provider: "carfax" },
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        owners: 2,
        accidents: 0,
        serviceRecords: 10,
        hasOpenRecall: false,
        titleBrandings: [],
        estimatedMileage: 45_000,
        summary: "Clean.",
      }),
    });
    const res = await getCarfaxReport({ dealerId: "d1", vin: VIN });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.ownerCount).toBe(2);
      expect(res.value.accidentCount).toBe(0);
      expect(res.value.isMock).toBe(false);
    }
    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_proxy_call_succeeded",
      "d1",
      expect.any(Object),
    );
  });
});
