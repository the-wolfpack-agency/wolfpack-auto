/**
 * Lead enrichment — fan-out across providers in parallel.
 *
 * `enrichLead` takes a normalized lead and a list of providers, runs them
 * concurrently with Promise.allSettled, then merges + scores confidence.
 *
 * Providers MUST never throw — they should return `{}` on failure.
 * `enrichLead` defends against breakage anyway.
 *
 * The production providers (Clearbit / FullContact / public property
 * records) are intentionally stubbed: they require paid API keys and a
 * legal review before going live. See `STUB_NOT_IMPLEMENTED` below.
 */

import type {
  DealerUser,
  EnrichedFields,
  EnrichmentProvider,
  EnrichmentResult,
  NormalizedLead,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Mock provider — clearly labelled synthetic data                            */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic mock — returns synthetic but plausible enriched fields.
 * Useful for demos, tests, and CI smoke runs without external billing.
 *
 * All values are labelled as mocked via `extras.mock = true`.
 */
export class MockEnrichmentProvider implements EnrichmentProvider {
  public readonly name = "mock";

  // Deterministic hash so the same email always produces the same mock data.
  private bucket(seed: string, buckets: number): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % buckets;
  }

  async fetch(lead: NormalizedLead): Promise<Partial<EnrichedFields>> {
    const seed = `${lead.email}|${lead.phone ?? ""}`;
    const incomeBands = ["<$50k", "$50-75k", "$75-100k", "$100-150k", "$150k+"];
    const creditBands = ["thin file", "subprime", "near prime", "prime", "super prime"];
    const distances = [2, 7, 14, 22, 45, 92];
    const vehicleHistory: string[][] = [
      [],
      ["2018 Honda Civic"],
      ["2019 Toyota Camry", "2014 Ford F-150"],
      ["2020 Tesla Model 3"],
    ];

    return {
      household_income_band: incomeBands[this.bucket(seed, incomeBands.length)],
      estimated_credit_band: creditBands[this.bucket(seed + "credit", creditBands.length)],
      property_owner: this.bucket(seed + "owner", 2) === 1,
      vehicle_history_owned: vehicleHistory[this.bucket(seed + "vh", vehicleHistory.length)],
      geographic_distance_miles: distances[this.bucket(seed + "dist", distances.length)],
      social_profiles: this.bucket(seed + "soc", 3) === 0 ? ["linkedin"] : [],
      extras: { mock: true, generated_at: new Date(0).toISOString() },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Stubbed production providers                                               */
/* -------------------------------------------------------------------------- */

const STUB_NOT_IMPLEMENTED = "requires paid API; not implemented";

/**
 * Clearbit-style identity resolution.
 *
 * NOTE: requires paid API; not implemented. Returns an empty result so
 * the production fan-out remains stable until the integration is wired up.
 */
export class ClearbitProviderStub implements EnrichmentProvider {
  public readonly name = "clearbit";
  async fetch(_lead: NormalizedLead): Promise<Partial<EnrichedFields>> {
    void _lead;
    void STUB_NOT_IMPLEMENTED;
    return {};
  }
}

/**
 * FullContact-style identity resolution.
 *
 * NOTE: requires paid API; not implemented. Returns empty fields by design.
 */
export class FullContactProviderStub implements EnrichmentProvider {
  public readonly name = "fullcontact";
  async fetch(_lead: NormalizedLead): Promise<Partial<EnrichedFields>> {
    void _lead;
    void STUB_NOT_IMPLEMENTED;
    return {};
  }
}

/**
 * County property-records lookup.
 *
 * NOTE: requires paid API; not implemented. Returns empty fields by design.
 */
export class PropertyRecordsProviderStub implements EnrichmentProvider {
  public readonly name = "property_records";
  async fetch(_lead: NormalizedLead): Promise<Partial<EnrichedFields>> {
    void _lead;
    void STUB_NOT_IMPLEMENTED;
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* Fan-out                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Merge enriched fragments. Later fragments override earlier ones for
 * scalar fields; arrays/sets are union-merged.
 */
function mergeEnriched(parts: Array<Partial<EnrichedFields>>): EnrichedFields {
  const out: EnrichedFields = {};
  const vehicles = new Set<string>();
  const socials = new Set<string>();
  const extras: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    if (part.household_income_band) out.household_income_band = part.household_income_band;
    if (part.estimated_credit_band) out.estimated_credit_band = part.estimated_credit_band;
    if (typeof part.property_owner === "boolean") out.property_owner = part.property_owner;
    if (Array.isArray(part.vehicle_history_owned)) {
      for (const v of part.vehicle_history_owned) vehicles.add(v);
    }
    if (typeof part.geographic_distance_miles === "number") {
      out.geographic_distance_miles = part.geographic_distance_miles;
    }
    if (Array.isArray(part.social_profiles)) {
      for (const s of part.social_profiles) socials.add(s);
    }
    if (part.extras) Object.assign(extras, part.extras);
  }
  if (vehicles.size > 0) out.vehicle_history_owned = Array.from(vehicles);
  if (socials.size > 0) out.social_profiles = Array.from(socials);
  if (Object.keys(extras).length > 0) out.extras = extras;
  return out;
}

/**
 * Confidence is the fraction of populated EnrichedFields scalar slots
 * (treating arrays as populated when non-empty). Capped at 1.0.
 */
function computeConfidence(fields: EnrichedFields): number {
  const slots = 6; // household_income_band, credit, property_owner, vehicles, distance, social
  let filled = 0;
  if (fields.household_income_band) filled++;
  if (fields.estimated_credit_band) filled++;
  if (typeof fields.property_owner === "boolean") filled++;
  if (fields.vehicle_history_owned && fields.vehicle_history_owned.length > 0) filled++;
  if (typeof fields.geographic_distance_miles === "number") filled++;
  if (fields.social_profiles && fields.social_profiles.length > 0) filled++;
  return Math.min(1, filled / slots);
}

/**
 * Run providers in parallel and return the merged enrichment.
 * Pure (no I/O outside the injected providers); never throws.
 */
export async function enrichLead(
  lead: NormalizedLead,
  providers: EnrichmentProvider[] = [new MockEnrichmentProvider()],
  now: () => Date = () => new Date(),
): Promise<EnrichmentResult> {
  const settled = await Promise.allSettled(
    providers.map(async (p) => {
      try {
        return { name: p.name, fields: await p.fetch(lead) };
      } catch {
        return { name: p.name, fields: {} as Partial<EnrichedFields> };
      }
    }),
  );

  const parts: Array<Partial<EnrichedFields>> = [];
  const sources: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      const value = r.value;
      if (value.fields && Object.keys(value.fields).length > 0) {
        parts.push(value.fields);
        sources.push(value.name);
      }
    }
  }
  const enriched = mergeEnriched(parts);

  return {
    lead_id: lead.id,
    dealer_id: lead.dealer_id,
    enriched,
    confidence: computeConfidence(enriched),
    sources,
    generated_at: now().toISOString(),
  };
}

/* Re-export so consumers don't have to dig into ./types */
export type { DealerUser, EnrichedFields, EnrichmentProvider, EnrichmentResult };
