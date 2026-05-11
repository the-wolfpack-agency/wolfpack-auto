/**
 * TSB provider abstraction.
 *
 * Manufacturer Technical Service Bulletins (TSBs) live behind paywalled
 * partnerships (ALLDATA, Mitchell1, Identifix). We do not have any of those
 * partnerships today. To keep the rest of the system honest about provenance:
 *
 *   - MockTSBProvider returns realistic synthetic TSBs labeled `source: "mock"`.
 *     The UI surfaces this label so dealer staff never confuse mock data for
 *     a real bulletin from the manufacturer.
 *   - Stubs for ALLDATA / Mitchell1 / Identifix exist for shape compatibility
 *     but THROW. Wiring them up requires a paid partnership and is not
 *     implemented.
 *
 * When a partnership lands, swap `getTSBProvider()` to return the real one.
 */

import type { TSB } from "./types";

export interface TSBProvider {
  readonly name: string;
  fetchTsbs(make: string, year: number, model: string): Promise<TSB[]>;
}

/* ------------------------------------------------------------------ */
/*  Mock provider                                                       */
/* ------------------------------------------------------------------ */

/**
 * Hand-curated synthetic TSBs for the most common dealership makes.
 * NOT REAL — never present to a customer as authoritative. The UI uses
 * the `source: "mock"` flag to surface a "synthetic / not from manufacturer"
 * badge.
 */
const SYNTHETIC_TSBS: Omit<TSB, "source">[] = [
  {
    manufacturer: "Toyota",
    bulletin_id: "T-SB-MOCK-001",
    year_from: 2018,
    year_to: 2024,
    models: ["Camry", "RAV4", "Highlander"],
    description:
      "Synthetic example: intermittent infotainment freeze during cold-start. Reproduces below 20 deg F.",
    recommended_action:
      "Reflash head unit with latest firmware. Inspect 12V auxiliary fuse.",
    published_at: "2024-01-15T00:00:00Z",
  },
  {
    manufacturer: "Ford",
    bulletin_id: "F-SB-MOCK-014",
    year_from: 2019,
    year_to: 2023,
    models: ["F-150", "Expedition"],
    description:
      "Synthetic example: rear axle vibration above 55 mph after driveshaft service.",
    recommended_action:
      "Re-torque driveshaft to 76 lb-ft. Inspect carrier bearing.",
    published_at: "2023-08-22T00:00:00Z",
  },
  {
    manufacturer: "Honda",
    bulletin_id: "H-SB-MOCK-007",
    year_from: 2020,
    year_to: 2024,
    models: ["Civic", "Accord", "CR-V"],
    description:
      "Synthetic example: power tailgate sensor learns wrong open position after battery disconnect.",
    recommended_action:
      "Run sensor relearn procedure with HDS. Verify tailgate cycles fully.",
    published_at: "2024-03-10T00:00:00Z",
  },
  {
    manufacturer: "Chevrolet",
    bulletin_id: "C-SB-MOCK-022",
    year_from: 2017,
    year_to: 2022,
    models: ["Silverado", "Tahoe", "Suburban"],
    description:
      "Synthetic example: HVAC blower motor resistor failure causing intermittent fan operation.",
    recommended_action:
      "Replace blower motor resistor pack. Inspect harness for corrosion.",
    published_at: "2022-11-30T00:00:00Z",
  },
];

export class MockTSBProvider implements TSBProvider {
  readonly name = "mock";

  async fetchTsbs(make: string, year: number, model: string): Promise<TSB[]> {
    const makeNorm = make.toLowerCase();
    const modelNorm = model.toLowerCase();
    const matches = SYNTHETIC_TSBS.filter(
      (t) =>
        t.manufacturer.toLowerCase() === makeNorm &&
        year >= t.year_from &&
        year <= t.year_to &&
        t.models.some((m) => m.toLowerCase() === modelNorm),
    );
    return matches.map((t) => ({ ...t, source: "mock" as const }));
  }
}

/* ------------------------------------------------------------------ */
/*  Paid-partnership stubs — NOT IMPLEMENTED                            */
/* ------------------------------------------------------------------ */

/**
 * ALLDATA Repair Information System.
 *
 * Wiring this up requires a paid ALLDATA partnership and ALLDATA's TSB
 * search endpoint credentials. Not implemented. The stub exists so the
 * `TSBProvider` shape stays uniform for when the partnership lands.
 */
export class AlldataTSBProvider implements TSBProvider {
  readonly name = "alldata";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchTsbs(_make: string, _year: number, _model: string): Promise<TSB[]> {
    throw new Error(
      "AlldataTSBProvider requires paid ALLDATA partnership; not implemented.",
    );
  }
}

/**
 * Mitchell1 ProDemand.
 *
 * Wiring this up requires a paid Mitchell1 partnership. Not implemented.
 */
export class Mitchell1TSBProvider implements TSBProvider {
  readonly name = "mitchell1";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchTsbs(_make: string, _year: number, _model: string): Promise<TSB[]> {
    throw new Error(
      "Mitchell1TSBProvider requires paid Mitchell1 partnership; not implemented.",
    );
  }
}

/**
 * Identifix Direct-Hit.
 *
 * Wiring this up requires a paid Identifix partnership. Not implemented.
 */
export class IdentifixTSBProvider implements TSBProvider {
  readonly name = "identifix";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchTsbs(_make: string, _year: number, _model: string): Promise<TSB[]> {
    throw new Error(
      "IdentifixTSBProvider requires paid Identifix partnership; not implemented.",
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Provider selection                                                  */
/* ------------------------------------------------------------------ */

/**
 * Pick the active TSB provider for this environment.
 *
 * Today: always returns MockTSBProvider. When/if a paid partnership lands
 * and credentials are configured, switch on the env var here.
 */
export function getTSBProvider(): TSBProvider {
  return new MockTSBProvider();
}
