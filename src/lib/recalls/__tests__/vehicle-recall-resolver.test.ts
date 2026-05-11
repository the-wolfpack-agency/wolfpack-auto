/**
 * Unit tests for the pure vehicle-recall resolver.
 *
 * Covers every match path called out in the task scope:
 *   - exact (make, model, year) match
 *   - year-range overlap (boundary inclusive)
 *   - model-list contains (case-insensitive)
 *   - no-match
 *   - multi-match
 *   - defensive cases: nullish vehicle, empty universe, malformed inputs
 */

import {
  matchRecalls,
  matchTSBs,
  resolveForVehicle,
} from "@/lib/recalls/vehicle-recall-resolver";
import type {
  RecallRecord,
  TSBRecord,
  VehicleForRecallLookup,
} from "@/lib/recalls/types";

const baseRecall = (over: Partial<RecallRecord> = {}): RecallRecord => ({
  id: "r1",
  nhtsa_campaign_id: "23V001",
  make: "Toyota",
  model: "Camry",
  year_from: 2018,
  year_to: 2020,
  description: "test",
  severity: "moderate",
  remedy_summary: "do thing",
  announced_at: null,
  fetched_at: new Date().toISOString(),
  ...over,
});

const baseTsb = (over: Partial<TSBRecord> = {}): TSBRecord => ({
  id: "t1",
  manufacturer: "Toyota",
  bulletin_id: "T-001",
  year_from: 2018,
  year_to: 2020,
  models: ["Camry"],
  description: "tsb desc",
  recommended_action: "do action",
  published_at: null,
  fetched_at: new Date().toISOString(),
  ...over,
});

const vehicle = (over: Partial<VehicleForRecallLookup> = {}): VehicleForRecallLookup => ({
  id: "v1",
  make: "Toyota",
  model: "Camry",
  year: 2019,
  ...over,
});

/* ------------------------------------------------------------------ */
/*  matchRecalls                                                       */
/* ------------------------------------------------------------------ */

describe("matchRecalls", () => {
  it("matches on exact (make, model, year)", () => {
    expect(matchRecalls(vehicle(), [baseRecall()])).toHaveLength(1);
  });

  it("matches at the year_from boundary (inclusive)", () => {
    expect(matchRecalls(vehicle({ year: 2018 }), [baseRecall()])).toHaveLength(1);
  });

  it("matches at the year_to boundary (inclusive)", () => {
    expect(matchRecalls(vehicle({ year: 2020 }), [baseRecall()])).toHaveLength(1);
  });

  it("does not match outside the year range", () => {
    expect(matchRecalls(vehicle({ year: 2017 }), [baseRecall()])).toHaveLength(0);
    expect(matchRecalls(vehicle({ year: 2021 }), [baseRecall()])).toHaveLength(0);
  });

  it("matches case-insensitively on make and model", () => {
    expect(
      matchRecalls(vehicle({ make: "TOYOTA", model: "camry" }), [baseRecall()]),
    ).toHaveLength(1);
  });

  it("does not match when make differs", () => {
    expect(
      matchRecalls(vehicle({ make: "Honda" }), [baseRecall()]),
    ).toHaveLength(0);
  });

  it("does not match when model differs", () => {
    expect(
      matchRecalls(vehicle({ model: "Corolla" }), [baseRecall()]),
    ).toHaveLength(0);
  });

  it("returns multiple recalls when several match", () => {
    const universe = [
      baseRecall({ id: "r1", nhtsa_campaign_id: "23V001" }),
      baseRecall({ id: "r2", nhtsa_campaign_id: "23V002" }),
      baseRecall({ id: "r3", nhtsa_campaign_id: "23V003", make: "Honda" }),
    ];
    const matches = matchRecalls(vehicle(), universe);
    expect(matches.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("returns empty for empty universe", () => {
    expect(matchRecalls(vehicle(), [])).toEqual([]);
  });

  it("defends against malformed inputs", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(matchRecalls(null as any, [baseRecall()])).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(matchRecalls(vehicle(), null as any)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  matchTSBs                                                          */
/* ------------------------------------------------------------------ */

describe("matchTSBs", () => {
  it("matches when model is in the models[] list", () => {
    const tsb = baseTsb({ models: ["Camry", "RAV4"] });
    expect(matchTSBs(vehicle(), [tsb])).toHaveLength(1);
  });

  it("matches case-insensitively in the models[] list", () => {
    const tsb = baseTsb({ models: ["camry"] });
    expect(matchTSBs(vehicle({ model: "CAMRY" }), [tsb])).toHaveLength(1);
  });

  it("does not match when model is not in the list", () => {
    const tsb = baseTsb({ models: ["RAV4", "Highlander"] });
    expect(matchTSBs(vehicle(), [tsb])).toHaveLength(0);
  });

  it("matches at year boundaries", () => {
    const tsb = baseTsb({ year_from: 2018, year_to: 2020 });
    expect(matchTSBs(vehicle({ year: 2018 }), [tsb])).toHaveLength(1);
    expect(matchTSBs(vehicle({ year: 2020 }), [tsb])).toHaveLength(1);
    expect(matchTSBs(vehicle({ year: 2017 }), [tsb])).toHaveLength(0);
  });

  it("returns multiple TSBs when several match", () => {
    const universe = [
      baseTsb({ id: "t1", bulletin_id: "T-001" }),
      baseTsb({ id: "t2", bulletin_id: "T-002" }),
      baseTsb({ id: "t3", bulletin_id: "T-003", models: ["RAV4"] }),
    ];
    expect(matchTSBs(vehicle(), universe)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  resolveForVehicle                                                  */
/* ------------------------------------------------------------------ */

describe("resolveForVehicle", () => {
  it("returns matching recalls + TSBs together", () => {
    const result = resolveForVehicle(vehicle(), {
      recalls: [baseRecall()],
      tsbs: [baseTsb()],
    });
    expect(result.recalls).toHaveLength(1);
    expect(result.tsbs).toHaveLength(1);
  });

  it("returns empty arrays when no matches", () => {
    const result = resolveForVehicle(vehicle({ make: "Tesla" }), {
      recalls: [baseRecall()],
      tsbs: [baseTsb()],
    });
    expect(result.recalls).toEqual([]);
    expect(result.tsbs).toEqual([]);
  });
});
