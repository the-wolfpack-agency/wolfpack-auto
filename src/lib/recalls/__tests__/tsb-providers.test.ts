/**
 * Unit tests for the TSB provider abstraction.
 *
 * Honesty rule: paid providers must throw (NOT implemented) until a real
 * partnership lands. Mock provider must label its output `source: "mock"`
 * so the UI can never confuse it for authoritative data.
 */

import {
  AlldataTSBProvider,
  IdentifixTSBProvider,
  Mitchell1TSBProvider,
  MockTSBProvider,
  getTSBProvider,
} from "@/lib/recalls/tsb-providers";

describe("MockTSBProvider", () => {
  const provider = new MockTSBProvider();

  it('labels every result with source: "mock"', async () => {
    const tsbs = await provider.fetchTsbs("Toyota", 2020, "Camry");
    expect(tsbs.length).toBeGreaterThan(0);
    for (const t of tsbs) {
      expect(t.source).toBe("mock");
    }
  });

  it("matches case-insensitively on make and model", async () => {
    const a = await provider.fetchTsbs("toyota", 2020, "camry");
    const b = await provider.fetchTsbs("TOYOTA", 2020, "CAMRY");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("returns [] for unmatched make", async () => {
    expect(await provider.fetchTsbs("Tesla", 2020, "Model 3")).toEqual([]);
  });

  it("returns [] for year outside the range", async () => {
    expect(await provider.fetchTsbs("Toyota", 1999, "Camry")).toEqual([]);
  });

  it("returns [] for unmatched model within a matched make", async () => {
    expect(await provider.fetchTsbs("Toyota", 2020, "Yaris")).toEqual([]);
  });

  it("synthetic TSBs are labeled MOCK in their bulletin id (for honest UI rendering)", async () => {
    const tsbs = await provider.fetchTsbs("Toyota", 2020, "Camry");
    for (const t of tsbs) {
      expect(t.bulletin_id).toMatch(/MOCK/);
    }
  });
});

describe("Paid-partnership stubs", () => {
  it("AlldataTSBProvider throws clearly until a partnership lands", async () => {
    await expect(
      new AlldataTSBProvider().fetchTsbs("Toyota", 2020, "Camry"),
    ).rejects.toThrow(/paid ALLDATA partnership/);
  });

  it("Mitchell1TSBProvider throws clearly until a partnership lands", async () => {
    await expect(
      new Mitchell1TSBProvider().fetchTsbs("Toyota", 2020, "Camry"),
    ).rejects.toThrow(/paid Mitchell1 partnership/);
  });

  it("IdentifixTSBProvider throws clearly until a partnership lands", async () => {
    await expect(
      new IdentifixTSBProvider().fetchTsbs("Toyota", 2020, "Camry"),
    ).rejects.toThrow(/paid Identifix partnership/);
  });
});

describe("getTSBProvider", () => {
  it("returns a MockTSBProvider in the current environment", () => {
    expect(getTSBProvider().name).toBe("mock");
  });
});
