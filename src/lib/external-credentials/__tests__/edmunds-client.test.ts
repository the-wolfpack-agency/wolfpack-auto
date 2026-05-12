/**
 * Unit tests for the Edmunds valuation client.
 *
 *  - cache hit short-circuits the fetch.
 *  - 200 path produces normalized cents values.
 *  - 404 / 429 / 5xx / network error each map to a typed IntegrationError.
 *  - synthetic mode (EDMUNDS_DISABLE_NETWORK=true) returns deterministic
 *    isMock=true valuations without touching fetch.
 *  - VIN validation (length, missing) is enforced before any fetch.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockTrack = jest.fn();

jest.mock("@/lib/cache", () => ({
  cacheGet: (...args: any[]) => mockGet(...args),
  cacheSet: (...args: any[]) => mockSet(...args),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackCredentials: (...args: any[]) => mockTrack(...args),
  trackInventoryMarketIntel: (...args: any[]) => mockTrack(...args),
}));

import {
  EDMUNDS_CACHE_TTL_SECONDS,
  getValuation,
} from "@/lib/external-credentials/edmunds-client";

const VIN = "1HGCM82633A123456";

const origFetch = global.fetch;

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockTrack.mockReset();
  delete process.env.EDMUNDS_DISABLE_NETWORK;
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = origFetch;
});

describe("getValuation: validation", () => {
  it("400-equivalent (invalid_input) when VIN is empty", async () => {
    const res = await getValuation({ vin: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invalid_input");
    }
  });

  it("invalid_input when VIN is wrong length", async () => {
    const res = await getValuation({ vin: "ABC123" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invalid_input");
    }
  });
});

describe("getValuation: caching", () => {
  it("returns the cached value without hitting fetch", async () => {
    mockGet.mockResolvedValueOnce({
      vin: VIN,
      providerLabel: "Edmunds (public)",
      tradeInValueCents: 1_000_000,
      privatePartyValueCents: 1_100_000,
      dealerRetailValueCents: 1_200_000,
      marketAverageCents: 1_100_000,
      capturedAt: "2026-05-12T00:00:00Z",
      isMock: false,
    });
    const res = await getValuation({ vin: VIN }, "dealer-1");
    expect(res.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      "market_intel.edmunds_valuation_fetched",
      "dealer-1",
      expect.objectContaining({ cached: true }),
    );
  });

  it("writes to cache with the 24h TTL on a cold fetch", async () => {
    mockGet.mockResolvedValueOnce(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        vin: VIN,
        tmv: {
          tradeIn: { average: 12000 },
          privateParty: { average: 13000 },
          dealerRetail: { average: 15000 },
        },
      }),
    });
    const res = await getValuation({ vin: VIN }, "dealer-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.tradeInValueCents).toBe(1_200_000);
      expect(res.value.dealerRetailValueCents).toBe(1_500_000);
      expect(res.value.marketAverageCents).toBe(1_350_000);
      expect(res.value.isMock).toBe(false);
    }
    expect(mockSet).toHaveBeenCalled();
    expect(mockSet.mock.calls[0][2]).toBe(EDMUNDS_CACHE_TTL_SECONDS);
  });
});

describe("getValuation: error mapping", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(null);
  });

  it("maps 404 to not_found", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });
    const res = await getValuation({ vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });

  it("maps 429 to rate_limited", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });
    const res = await getValuation({ vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("rate_limited");
  });

  it("maps 503 to upstream_unavailable", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503 });
    const res = await getValuation({ vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("upstream_unavailable");
  });

  it("maps timeout to timeout", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new DOMException("aborted", "AbortError"),
    );
    const res = await getValuation({ vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("timeout");
  });

  it("maps JSON parse failures to parse_error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    const res = await getValuation({ vin: VIN });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("parse_error");
  });
});

describe("getValuation: synthetic mode", () => {
  it("returns isMock=true deterministic values when EDMUNDS_DISABLE_NETWORK=true", async () => {
    process.env.EDMUNDS_DISABLE_NETWORK = "true";
    mockGet.mockResolvedValue(null);
    const a = await getValuation({ vin: VIN });
    const b = await getValuation({ vin: VIN });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.isMock).toBe(true);
      expect(a.value.dealerRetailValueCents).toBe(b.value.dealerRetailValueCents);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
