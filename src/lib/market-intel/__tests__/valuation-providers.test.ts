/**
 * Unit tests for valuation-providers.
 *
 * Asserts:
 *  - MockValuationProvider returns labeled mock data with isMock=true
 *  - Deterministic for identical inputs (same VIN/year/miles/condition)
 *  - Different conditions move the value monotonically
 *  - Higher miles strictly lowers value
 *  - KbbValuationProvider stub throws a clear "not implemented" error
 *  - chooseValuationProvider() falls back to mock when no key is set
 */

jest.mock("@/lib/cache", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import {
  KbbValuationProvider,
  MockValuationProvider,
  chooseValuationProvider,
  setValuationProviderForTest,
} from "@/lib/market-intel/valuation-providers";

const baseReq = {
  vin: "1HGCM82633A123456",
  year: 2022,
  make: "Honda",
  model: "Accord",
  miles: 30_000,
  zipCode: "10001",
  conditionGrade: "good" as const,
};

describe("MockValuationProvider", () => {
  test("returns isMock=true and a label that signals 'estimate'", async () => {
    const p = new MockValuationProvider();
    const v = await p.getMarketValue(baseReq);
    expect(v.isMock).toBe(true);
    expect(v.source).toBe("mock");
    expect(v.providerLabel.toLowerCase()).toContain("mock");
    expect(v.marketValueCents).toBeGreaterThan(0);
  });

  test("deterministic for identical inputs", async () => {
    const p = new MockValuationProvider();
    const a = await p.getMarketValue(baseReq);
    const b = await p.getMarketValue(baseReq);
    expect(a.marketValueCents).toBe(b.marketValueCents);
  });

  test("excellent > good > fair > rough condition (monotone)", async () => {
    const p = new MockValuationProvider();
    const e = await p.getMarketValue({ ...baseReq, conditionGrade: "excellent" });
    const g = await p.getMarketValue({ ...baseReq, conditionGrade: "good" });
    const f = await p.getMarketValue({ ...baseReq, conditionGrade: "fair" });
    const r = await p.getMarketValue({ ...baseReq, conditionGrade: "rough" });
    expect(e.marketValueCents).toBeGreaterThan(g.marketValueCents);
    expect(g.marketValueCents).toBeGreaterThan(f.marketValueCents);
    expect(f.marketValueCents).toBeGreaterThan(r.marketValueCents);
  });

  test("higher miles strictly lowers value", async () => {
    const p = new MockValuationProvider();
    const low = await p.getMarketValue({ ...baseReq, miles: 10_000 });
    const high = await p.getMarketValue({ ...baseReq, miles: 150_000 });
    expect(low.marketValueCents).toBeGreaterThan(high.marketValueCents);
  });

  test("luxury and economy makes bucket to different baselines", async () => {
    const p = new MockValuationProvider();
    const luxe = await p.getMarketValue({ ...baseReq, make: "Porsche", year: 2024 });
    const econ = await p.getMarketValue({ ...baseReq, make: "Hyundai", year: 2024 });
    expect(luxe.marketValueCents).toBeGreaterThan(econ.marketValueCents);
  });

  test("very old or floor cases still return a positive number", async () => {
    const p = new MockValuationProvider();
    const v = await p.getMarketValue({ ...baseReq, year: 1980, miles: 500_000 });
    expect(v.marketValueCents).toBeGreaterThan(0);
  });
});

describe("KbbValuationProvider (stub)", () => {
  test("throws a not-implemented error so the partnership gap is obvious", async () => {
    const k = new KbbValuationProvider();
    await expect(k.getMarketValue(baseReq)).rejects.toThrow(/not implemented/i);
  });

  test("declares itself non-mock (so providerLabel selection works once wired)", () => {
    const k = new KbbValuationProvider();
    expect(k.isMock).toBe(false);
    expect(k.name).toBe("kbb");
  });
});

describe("chooseValuationProvider", () => {
  const originalKey = process.env.KBB_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.KBB_API_KEY;
    else process.env.KBB_API_KEY = originalKey;
    setValuationProviderForTest(null);
  });

  test("falls back to mock when KBB_API_KEY is unset", () => {
    delete process.env.KBB_API_KEY;
    const p = chooseValuationProvider();
    expect(p.name).toBe("mock");
    expect(p.isMock).toBe(true);
  });

  test("routes to KBB when KBB_API_KEY is set", () => {
    process.env.KBB_API_KEY = "test-key";
    const p = chooseValuationProvider();
    expect(p.name).toBe("kbb");
    expect(p.isMock).toBe(false);
  });

  test("respects test-injected override", () => {
    const stub = new MockValuationProvider();
    setValuationProviderForTest(stub);
    expect(chooseValuationProvider()).toBe(stub);
  });
});
