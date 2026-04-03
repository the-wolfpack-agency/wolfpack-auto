/**
 * Third-Party Lead Ingestion — AutoTrader, Cars.com, CarGurus, ADF/XML
 *
 * Parses the industry-standard ADF (Auto Dealer Format) XML, normalizes
 * field names across providers, deduplicates by email/phone/name+vehicle,
 * and batch-ingests with scoring and notification.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LeadSource = "autotrader" | "cars_com" | "cargurus" | "generic_adf";

export interface IngestedLead {
  id: string;
  source: LeadSource;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  raw_data: Record<string, unknown>;
  ingested_at: string;
  duplicate: boolean;
  matched_lead_id: string | null;
}

export interface IngestionResult {
  total_received: number;
  created: number;
  duplicates: number;
  errors: number;
  leads: IngestedLead[];
}

export interface FeedConfig {
  id: string;
  dealer_id: string;
  source: LeadSource;
  api_key: string;
  endpoint_url: string;
  active: boolean;
  last_sync: string | null;
  leads_received: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  ADF/XML Parser                                                             */
/* -------------------------------------------------------------------------- */

interface ADFField {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
}

/**
 * Parse ADF (Auto Dealer Format) XML — the industry standard for lead exchange.
 *
 * Extracts customer name, contact info, and vehicle interest from ADF XML.
 * Uses regex-based parsing (no external XML dependency needed).
 */
export function parseADFLead(xml: string): ADFField | null {
  if (!xml || typeof xml !== "string") return null;

  const extract = (tag: string, src: string): string => {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const m = src.match(re);
    return m?.[1]?.trim() ?? "";
  };

  // ADF wraps prospect > customer > contact
  const firstName =
    extract("name_first", xml) ||
    extract("firstname", xml) ||
    extract("first_name", xml);
  const lastName =
    extract("name_last", xml) ||
    extract("lastname", xml) ||
    extract("last_name", xml);
  const email = extract("email", xml);
  const phone = extract("phone", xml) || null;

  // Vehicle of interest
  const year = extract("year", xml);
  const make = extract("make", xml);
  const model = extract("model", xml);
  const vehicleInterest = [year, make, model].filter(Boolean).join(" ") || "General inquiry";

  if (!firstName && !lastName && !email) return null;

  return {
    first_name: firstName || "Unknown",
    last_name: lastName || "Unknown",
    email,
    phone,
    vehicle_interest: vehicleInterest,
  };
}

/* -------------------------------------------------------------------------- */
/*  Normalization                                                              */
/* -------------------------------------------------------------------------- */

interface RawLead {
  [key: string]: unknown;
}

/**
 * Normalize field names across providers into a consistent shape.
 */
export function normalizeLeadFromSource(
  rawLead: RawLead,
  source: LeadSource,
): Omit<IngestedLead, "id" | "ingested_at" | "duplicate" | "matched_lead_id"> {
  const fieldMap: Record<string, string[]> = {
    first_name: ["first_name", "firstName", "fname", "customer_first_name", "name_first"],
    last_name: ["last_name", "lastName", "lname", "customer_last_name", "name_last"],
    email: ["email", "emailAddress", "customer_email", "email_address"],
    phone: ["phone", "phoneNumber", "phone_number", "customer_phone", "mobile"],
    vehicle_interest: [
      "vehicle_interest",
      "vehicleInterest",
      "vehicle",
      "vehicle_of_interest",
      "comments",
      "message",
    ],
  };

  function resolve(field: string): string {
    const candidates = fieldMap[field] ?? [field];
    for (const c of candidates) {
      const val = rawLead[c];
      if (val !== undefined && val !== null && val !== "") return String(val);
    }
    return "";
  }

  return {
    source,
    first_name: resolve("first_name") || "Unknown",
    last_name: resolve("last_name") || "Unknown",
    email: resolve("email"),
    phone: resolve("phone") || null,
    vehicle_interest: resolve("vehicle_interest") || "General inquiry",
    raw_data: rawLead,
  };
}

/* -------------------------------------------------------------------------- */
/*  Deduplication                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Check if a lead is a duplicate by email, phone, or name+vehicle combo.
 * Returns the matched lead ID if duplicate, null otherwise.
 */
export function deduplicateLead(
  lead: Pick<IngestedLead, "email" | "phone" | "first_name" | "last_name" | "vehicle_interest">,
  existingLeads: Array<{ id: string; email: string; phone: string | null; first_name: string; last_name: string; vehicle_interest: string }>,
): string | null {
  const normalEmail = lead.email.toLowerCase().trim();
  const normalPhone = lead.phone?.replace(/\D/g, "") ?? "";

  for (const existing of existingLeads) {
    // Match by email
    if (normalEmail && existing.email.toLowerCase().trim() === normalEmail) {
      return existing.id;
    }

    // Match by phone (digits only)
    if (normalPhone && normalPhone.length >= 7) {
      const existingPhone = existing.phone?.replace(/\D/g, "") ?? "";
      if (existingPhone && existingPhone === normalPhone) {
        return existing.id;
      }
    }

    // Match by name + vehicle
    if (
      lead.first_name.toLowerCase() === existing.first_name.toLowerCase() &&
      lead.last_name.toLowerCase() === existing.last_name.toLowerCase() &&
      lead.vehicle_interest.toLowerCase() === existing.vehicle_interest.toLowerCase()
    ) {
      return existing.id;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Batch Ingestion                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Batch ingest leads with deduplication and analytics tracking.
 */
export function ingestLeadBatch(
  leads: Array<Omit<IngestedLead, "id" | "ingested_at" | "duplicate" | "matched_lead_id">>,
  dealerId: string,
  source: LeadSource,
  existingLeads: Array<{ id: string; email: string; phone: string | null; first_name: string; last_name: string; vehicle_interest: string }> = [],
): IngestionResult {
  const now = new Date().toISOString();
  const results: IngestedLead[] = [];
  let created = 0;
  let duplicates = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const matchedId = deduplicateLead(lead, existingLeads);
      const isDuplicate = matchedId !== null;

      const ingested: IngestedLead = {
        id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone,
        vehicle_interest: lead.vehicle_interest,
        raw_data: lead.raw_data,
        ingested_at: now,
        duplicate: isDuplicate,
        matched_lead_id: matchedId,
      };

      results.push(ingested);

      if (isDuplicate) {
        duplicates++;
      } else {
        created++;
        // Add to existing leads for subsequent dedup checks within the batch
        existingLeads.push({
          id: ingested.id,
          email: ingested.email,
          phone: ingested.phone,
          first_name: ingested.first_name,
          last_name: ingested.last_name,
          vehicle_interest: ingested.vehicle_interest,
        });
      }
    } catch {
      errors++;
    }
  }

  // Fire analytics (fire-and-forget)
  import("@/lib/analytics-hooks")
    .then(({ trackLead }) => {
      trackLead("lead.created", dealerId, {
        source,
        batch_size: leads.length,
        created,
        duplicates,
        errors,
      });
    })
    .catch(() => {});

  return {
    total_received: leads.length,
    created,
    duplicates,
    errors,
    leads: results,
  };
}

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

export function getDemoFeeds(): FeedConfig[] {
  return [
    {
      id: "feed-autotrader",
      dealer_id: "demo-dealer",
      source: "autotrader",
      api_key: "at-***-demo",
      endpoint_url: "https://api.autotrader.com/leads/v1",
      active: true,
      last_sync: new Date(Date.now() - 3600_000).toISOString(),
      leads_received: 142,
      created_at: "2026-01-15T00:00:00Z",
    },
    {
      id: "feed-cargurus",
      dealer_id: "demo-dealer",
      source: "cargurus",
      api_key: "cg-***-demo",
      endpoint_url: "https://api.cargurus.com/dealer/leads",
      active: true,
      last_sync: new Date(Date.now() - 7200_000).toISOString(),
      leads_received: 89,
      created_at: "2026-02-01T00:00:00Z",
    },
    {
      id: "feed-carscom",
      dealer_id: "demo-dealer",
      source: "cars_com",
      api_key: "cc-***-demo",
      endpoint_url: "https://api.cars.com/dealer-api/leads",
      active: false,
      last_sync: null,
      leads_received: 0,
      created_at: "2026-03-01T00:00:00Z",
    },
  ];
}

export function getDemoIngestionHistory(): IngestedLead[] {
  const now = Date.now();
  return [
    {
      id: "ing-demo-1",
      source: "autotrader",
      first_name: "Sarah",
      last_name: "Johnson",
      email: "sarah.j@example.com",
      phone: "+15551234567",
      vehicle_interest: "2024 Toyota Camry",
      raw_data: {},
      ingested_at: new Date(now - 1800_000).toISOString(),
      duplicate: false,
      matched_lead_id: null,
    },
    {
      id: "ing-demo-2",
      source: "cargurus",
      first_name: "Mike",
      last_name: "Chen",
      email: "mike.chen@example.com",
      phone: "+15559876543",
      vehicle_interest: "2025 Honda CR-V",
      raw_data: {},
      ingested_at: new Date(now - 3600_000).toISOString(),
      duplicate: false,
      matched_lead_id: null,
    },
    {
      id: "ing-demo-3",
      source: "autotrader",
      first_name: "Sarah",
      last_name: "Johnson",
      email: "sarah.j@example.com",
      phone: "+15551234567",
      vehicle_interest: "2024 Toyota Camry",
      raw_data: {},
      ingested_at: new Date(now - 900_000).toISOString(),
      duplicate: true,
      matched_lead_id: "ing-demo-1",
    },
  ];
}
