/**
 * Integration tests for the NHTSA recalls client.
 *
 * `fetch` is mocked at the boundary so the test suite never hits the live
 * NHTSA API (1) for determinism, (2) for speed, (3) so a NHTSA outage cannot
 * red the CI matrix.
 *
 * Covers:
 *   - parses the canonical NHTSA shape
 *   - caches across calls within the 24h TTL
 *   - fails open (returns []) on network error / non-200
 *   - severity classifier hits critical / minor / moderate buckets
 *   - per-vehicle and per-make signatures
 */

import {
  classifySeverity,
  fetchRecallsForVehicle,
  fetchRecallsByMake,
  __resetCacheForTests,
  __cacheSizeForTests,
} from "@/lib/recalls/nhtsa-recalls-client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const sampleRecall = {
  Manufacturer: "Toyota Motor Engineering & Manufacturing",
  NHTSACampaignNumber: "23V001",
  Component: "AIR BAGS",
  Summary: "Passenger air bag may inflate improperly during a crash.",
  Consequence: "Increases the risk of injury during a crash.",
  Remedy: "Dealers will replace the inflator free of charge.",
  ReportReceivedDate: "2023-04-01T00:00:00Z",
  ModelYear: "2019",
  Make: "TOYOTA",
  Model: "CAMRY",
};

function mockFetchOk(body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("classifySeverity", () => {
  it("classifies airbag deployment failure as critical", () => {
    expect(
      classifySeverity({
        Consequence: "Air bag may not deploy properly causing injury",
        Summary: "Airbag inflator defect",
      }),
    ).toBe("critical");
  });

  it("classifies fire risk as critical", () => {
    expect(
      classifySeverity({
        Consequence: "Risk of electrical fire under the hood",
        Summary: "",
      }),
    ).toBe("critical");
  });

  it("classifies loss of control / crash as critical", () => {
    expect(
      classifySeverity({
        Consequence: "Loss of vehicle control increases crash risk",
        Summary: "",
      }),
    ).toBe("critical");
  });

  it("classifies label-only fixes as minor", () => {
    expect(
      classifySeverity({
        Consequence: "Owner notification only — placard update",
        Summary: "Tire information placard incorrect",
      }),
    ).toBe("minor");
  });

  it("falls through to moderate for everything else", () => {
    expect(
      classifySeverity({
        Consequence: "Reduced fuel efficiency over time",
        Summary: "Software update available",
      }),
    ).toBe("moderate");
  });
});

describe("fetchRecallsForVehicle", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    __resetCacheForTests();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed records on success", async () => {
    globalThis.fetch = mockFetchOk({ results: [sampleRecall] }) as any;
    const records = await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    expect(records).toHaveLength(1);
    expect(records[0]?.NHTSACampaignNumber).toBe("23V001");
  });

  it("caches across calls (only fetches once for the same (make, model, year))", async () => {
    const fetchMock = mockFetchOk({ results: [sampleRecall] });
    globalThis.fetch = fetchMock as any;

    await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    await fetchRecallsForVehicle("Toyota", "Camry", 2019);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(__cacheSizeForTests()).toBe(1);
  });

  it("returns [] on non-200 response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as Response) as any;
    const records = await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    expect(records).toEqual([]);
  });

  it("returns [] on network error (never throws)", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("boom")) as any;
    const records = await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    expect(records).toEqual([]);
  });

  it("returns [] when results array is missing", async () => {
    globalThis.fetch = mockFetchOk({ Count: 0 }) as any;
    const records = await fetchRecallsForVehicle("Toyota", "Camry", 2019);
    expect(records).toEqual([]);
  });

  it("returns [] for missing required inputs", async () => {
    expect(await fetchRecallsForVehicle("", "Camry", 2019)).toEqual([]);
    expect(await fetchRecallsForVehicle("Toyota", "", 2019)).toEqual([]);
    expect(await fetchRecallsForVehicle("Toyota", "Camry", 0)).toEqual([]);
  });
});

describe("fetchRecallsByMake", () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it("returns [] when no models supplied", async () => {
    expect(await fetchRecallsByMake("Toyota")).toEqual([]);
  });

  it("iterates the (model, year) matrix and unions results", async () => {
    const fetchMock = mockFetchOk({ results: [sampleRecall] });
    globalThis.fetch = fetchMock as any;
    const recs = await fetchRecallsByMake("Toyota", {
      yearStart: 2018,
      yearEnd: 2019,
      models: ["Camry", "RAV4"],
    });
    // 2 models * 2 years = 4 fetches
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(recs.length).toBe(4); // one record per fetch
  });
});
