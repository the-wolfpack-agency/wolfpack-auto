/**
 * Unit tests for src/lib/lead-ingestion.ts
 *
 * Tests ADF parsing, normalization, dedup logic, and batch ingestion.
 *
 * Run with: npx jest src/lib/__tests__/lead-ingestion.test.ts
 */

import {
  parseADFLead,
  normalizeLeadFromSource,
  deduplicateLead,
  ingestLeadBatch,
  getDemoFeeds,
  getDemoIngestionHistory,
} from "../lead-ingestion";

/* -------------------------------------------------------------------------- */
/*  ADF Parsing                                                                */
/* -------------------------------------------------------------------------- */

describe("parseADFLead", () => {
  it("parses standard ADF XML with customer and vehicle info", () => {
    const xml = `
      <adf>
        <prospect>
          <customer>
            <contact>
              <name_first>John</name_first>
              <name_last>Doe</name_last>
              <email>john@example.com</email>
              <phone>+15551234567</phone>
            </contact>
          </customer>
          <vehicle>
            <year>2024</year>
            <make>Toyota</make>
            <model>Camry</model>
          </vehicle>
        </prospect>
      </adf>
    `;

    const result = parseADFLead(xml);
    expect(result).not.toBeNull();
    expect(result!.first_name).toBe("John");
    expect(result!.last_name).toBe("Doe");
    expect(result!.email).toBe("john@example.com");
    expect(result!.phone).toBe("+15551234567");
    expect(result!.vehicle_interest).toBe("2024 Toyota Camry");
  });

  it("handles alternative field names", () => {
    const xml = `
      <prospect>
        <firstname>Jane</firstname>
        <lastname>Smith</lastname>
        <email>jane@example.com</email>
      </prospect>
    `;
    const result = parseADFLead(xml);
    expect(result).not.toBeNull();
    expect(result!.first_name).toBe("Jane");
    expect(result!.last_name).toBe("Smith");
  });

  it("returns null for empty or invalid input", () => {
    expect(parseADFLead("")).toBeNull();
    expect(parseADFLead("<root></root>")).toBeNull();
    expect(parseADFLead(null as unknown as string)).toBeNull();
  });

  it("defaults vehicle interest to General inquiry when no vehicle", () => {
    const xml = `
      <prospect>
        <name_first>Bob</name_first>
        <email>bob@example.com</email>
      </prospect>
    `;
    const result = parseADFLead(xml);
    expect(result).not.toBeNull();
    expect(result!.vehicle_interest).toBe("General inquiry");
  });
});

/* -------------------------------------------------------------------------- */
/*  Normalization                                                              */
/* -------------------------------------------------------------------------- */

describe("normalizeLeadFromSource", () => {
  it("normalizes autotrader field names", () => {
    const raw = {
      firstName: "Alice",
      lastName: "Wong",
      emailAddress: "alice@test.com",
      phoneNumber: "+15559999999",
      vehicleInterest: "2025 Honda Civic",
    };
    const result = normalizeLeadFromSource(raw, "autotrader");
    expect(result.first_name).toBe("Alice");
    expect(result.last_name).toBe("Wong");
    expect(result.email).toBe("alice@test.com");
    expect(result.phone).toBe("+15559999999");
    expect(result.vehicle_interest).toBe("2025 Honda Civic");
    expect(result.source).toBe("autotrader");
  });

  it("normalizes cars_com field names", () => {
    const raw = {
      customer_first_name: "Bob",
      customer_last_name: "Lee",
      customer_email: "bob@cars.com",
      customer_phone: "+15551111111",
      vehicle: "2024 Ford F-150",
    };
    const result = normalizeLeadFromSource(raw, "cars_com");
    expect(result.first_name).toBe("Bob");
    expect(result.last_name).toBe("Lee");
    expect(result.email).toBe("bob@cars.com");
  });

  it("defaults missing fields", () => {
    const raw = { email: "test@test.com" };
    const result = normalizeLeadFromSource(raw, "generic_adf");
    expect(result.first_name).toBe("Unknown");
    expect(result.last_name).toBe("Unknown");
    expect(result.vehicle_interest).toBe("General inquiry");
  });

  it("preserves raw_data", () => {
    const raw = { first_name: "Test", email: "t@t.com", extra_field: "keep" };
    const result = normalizeLeadFromSource(raw, "cargurus");
    expect(result.raw_data).toEqual(raw);
  });
});

/* -------------------------------------------------------------------------- */
/*  Deduplication                                                              */
/* -------------------------------------------------------------------------- */

describe("deduplicateLead", () => {
  const existing = [
    { id: "lead-1", email: "john@example.com", phone: "+15551234567", first_name: "John", last_name: "Doe", vehicle_interest: "2024 Toyota Camry" },
    { id: "lead-2", email: "jane@example.com", phone: "+15559876543", first_name: "Jane", last_name: "Smith", vehicle_interest: "2025 Honda CR-V" },
  ];

  it("matches by email", () => {
    const result = deduplicateLead(
      { email: "john@example.com", phone: null, first_name: "Different", last_name: "Name", vehicle_interest: "Other" },
      existing,
    );
    expect(result).toBe("lead-1");
  });

  it("matches by phone", () => {
    const result = deduplicateLead(
      { email: "new@example.com", phone: "+15551234567", first_name: "X", last_name: "Y", vehicle_interest: "Z" },
      existing,
    );
    expect(result).toBe("lead-1");
  });

  it("matches by name + vehicle", () => {
    const result = deduplicateLead(
      { email: "new@example.com", phone: null, first_name: "Jane", last_name: "Smith", vehicle_interest: "2025 Honda CR-V" },
      existing,
    );
    expect(result).toBe("lead-2");
  });

  it("returns null for no match", () => {
    const result = deduplicateLead(
      { email: "unique@example.com", phone: "+15550000000", first_name: "New", last_name: "Person", vehicle_interest: "2024 Tesla" },
      existing,
    );
    expect(result).toBeNull();
  });

  it("is case-insensitive for email matching", () => {
    const result = deduplicateLead(
      { email: "JOHN@EXAMPLE.COM", phone: null, first_name: "X", last_name: "Y", vehicle_interest: "Z" },
      existing,
    );
    expect(result).toBe("lead-1");
  });
});

/* -------------------------------------------------------------------------- */
/*  Batch Ingestion                                                            */
/* -------------------------------------------------------------------------- */

describe("ingestLeadBatch", () => {
  it("ingests a batch with dedup", () => {
    const leads = [
      { source: "autotrader" as const, first_name: "Alice", last_name: "Wong", email: "alice@test.com", phone: null, vehicle_interest: "2024 Camry", raw_data: {} },
      { source: "autotrader" as const, first_name: "Alice", last_name: "Wong", email: "alice@test.com", phone: null, vehicle_interest: "2024 Camry", raw_data: {} },
    ];

    const result = ingestLeadBatch(leads, "dealer-1", "autotrader");
    expect(result.total_received).toBe(2);
    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.leads).toHaveLength(2);
    expect(result.leads[0].duplicate).toBe(false);
    expect(result.leads[1].duplicate).toBe(true);
  });

  it("handles empty batch", () => {
    const result = ingestLeadBatch([], "dealer-1", "autotrader");
    expect(result.total_received).toBe(0);
    expect(result.created).toBe(0);
    expect(result.leads).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

describe("Demo data", () => {
  it("getDemoFeeds returns valid feeds", () => {
    const feeds = getDemoFeeds();
    expect(feeds.length).toBeGreaterThan(0);
    expect(feeds[0].source).toBeDefined();
    expect(feeds[0].dealer_id).toBeDefined();
  });

  it("getDemoIngestionHistory returns leads", () => {
    const leads = getDemoIngestionHistory();
    expect(leads.length).toBeGreaterThan(0);
    expect(leads.some((l) => l.duplicate)).toBe(true);
    expect(leads.some((l) => !l.duplicate)).toBe(true);
  });
});
