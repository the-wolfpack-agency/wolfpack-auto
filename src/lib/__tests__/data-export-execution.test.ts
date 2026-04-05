/**
 * Data Export Execution tests — verifies real export logic,
 * CSV/JSON generation, job recording, and fallback behaviour.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ExportConfig } from "@/lib/data-export";

// ---------- mocks ----------

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({ query: mockQuery }));

const mockTrackDataExport = jest.fn();
jest.mock("@/lib/analytics-hooks", () => ({
  trackDataExport: mockTrackDataExport,
}));

// We need dynamic import to work with DATABASE_URL toggling,
// so import the module fresh each time via a helper.
function getModule() {
  // Clear cached module so DATABASE_URL changes take effect
  jest.resetModules();
  // Re-apply mocks after reset
  jest.doMock("@/lib/db", () => ({ query: mockQuery }));
  jest.doMock("@/lib/analytics-hooks", () => ({
    trackDataExport: mockTrackDataExport,
  }));
  return require("@/lib/data-export");
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const baseConfig: ExportConfig = {
  dealerId: "dealer_001",
  target: "local",
  table: "leads",
  format: "csv",
  destination: "/tmp/export",
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/*  Shadow mode (no DATABASE_URL)                                              */
/* -------------------------------------------------------------------------- */

describe("shadow mode (no DATABASE_URL)", () => {
  it("exportLeads returns demo data in CSV format", async () => {
    const mod = getModule();
    const result = await mod.exportLeads({ ...baseConfig, format: "csv" });

    expect(result.status).toBe("completed");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(typeof result.data).toBe("string");
    // CSV should have header row
    const lines = (result.data as string).split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 data row
    expect(lines[0]).toContain("id");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("exportInventory returns demo data in JSON format", async () => {
    const mod = getModule();
    const result = await mod.exportInventory({ ...baseConfig, table: "inventory", format: "json" });

    expect(result.status).toBe("completed");
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as any[]).length).toBeGreaterThan(0);
    expect((result.data as any[])[0]).toHaveProperty("vin");
  });

  it("exportAnalyticsEvents returns demo data", async () => {
    const mod = getModule();
    const result = await mod.exportAnalyticsEvents({ ...baseConfig, table: "analytics_events", format: "json" });

    expect(result.status).toBe("completed");
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as any[])[0]).toHaveProperty("event_type");
  });

  it("getExportHistory returns demo history", async () => {
    const mod = getModule();
    const history = await mod.getExportHistory("dealer_001");

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].id).toContain("demo");
    expect(history[0].config.dealerId).toBe("dealer_001");
  });

  it("tracks analytics with shadow=true", async () => {
    const mod = getModule();
    await mod.exportLeads(baseConfig);

    expect(mockTrackDataExport).toHaveBeenCalledWith(
      "export.completed",
      "dealer_001",
      expect.objectContaining({ shadow: true }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  CSV export — proper header + rows                                          */
/* -------------------------------------------------------------------------- */

describe("CSV export with DB", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("generates CSV with header row and data rows", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Alice", email: "alice@test.com", created_at: "2026-04-01" },
        { id: 2, name: "Bob", email: "bob@test.com", created_at: "2026-04-02" },
      ],
    });
    // recordExportJob INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    const result = await mod.exportLeads({ ...baseConfig, format: "csv" });

    expect(result.status).toBe("completed");
    expect(result.rowCount).toBe(2);

    const csv = result.data as string;
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,name,email,created_at");
    expect(lines[1]).toBe("1,Alice,alice@test.com,2026-04-01");
    expect(lines[2]).toBe("2,Bob,bob@test.com,2026-04-02");
  });

  it("escapes commas and quotes in CSV values", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Smith, "Jr"', city: "Dallas" }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    const result = await mod.exportLeads({ ...baseConfig, format: "csv" });
    const csv = result.data as string;

    expect(csv).toContain('"Smith, ""Jr"""');
  });
});

/* -------------------------------------------------------------------------- */
/*  JSON export — array of objects                                             */
/* -------------------------------------------------------------------------- */

describe("JSON export with DB", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("returns array of row objects", async () => {
    const dbRows = [
      { id: 1, vin: "ABC123", year: 2024, make: "Honda" },
      { id: 2, vin: "DEF456", year: 2025, make: "Tesla" },
    ];
    mockQuery.mockResolvedValueOnce({ rows: dbRows });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    const result = await mod.exportInventory({
      ...baseConfig,
      table: "inventory",
      format: "json",
    });

    expect(result.status).toBe("completed");
    expect(result.rowCount).toBe(2);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toEqual(dbRows);
  });
});

/* -------------------------------------------------------------------------- */
/*  Export records job in data_exports table                                    */
/* -------------------------------------------------------------------------- */

describe("job recording", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("inserts a record into data_exports on success", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, event_type: "page_view" }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT into data_exports

    const mod = getModule();
    const result = await mod.exportAnalyticsEvents({
      ...baseConfig,
      table: "analytics_events",
      format: "json",
    });

    expect(result.status).toBe("completed");
    // Second query call should be the INSERT into data_exports
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO data_exports");
    expect(insertCall[1]).toContain(result.jobId); // jobId param
    expect(insertCall[1]).toContain("dealer_001"); // dealer_id param
  });

  it("records failed status when query errors non-42P01", async () => {
    const dbError = new Error("connection refused");
    (dbError as any).code = "08006";
    mockQuery.mockRejectedValueOnce(dbError);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // recordExportJob

    const mod = getModule();
    const result = await mod.exportLeads(baseConfig);

    expect(result.status).toBe("failed");
    expect(result.rowCount).toBe(0);

    // Should have tried to record the failure
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO data_exports");
    expect(insertCall[1]).toContain("failed");
  });
});

/* -------------------------------------------------------------------------- */
/*  Empty table (42P01 — relation does not exist)                              */
/* -------------------------------------------------------------------------- */

describe("empty table fallback", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("returns empty result with status completed when table missing", async () => {
    const tableError = new Error('relation "leads" does not exist');
    (tableError as any).code = "42P01";
    mockQuery.mockRejectedValueOnce(tableError);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // recordExportJob

    const mod = getModule();
    const result = await mod.exportLeads({ ...baseConfig, format: "json" });

    expect(result.status).toBe("completed");
    expect(result.rowCount).toBe(0);
    expect(result.data).toEqual([]);
  });

  it("returns empty CSV string when table missing and format is csv", async () => {
    const tableError = new Error('relation "vehicles" does not exist');
    (tableError as any).code = "42P01";
    mockQuery.mockRejectedValueOnce(tableError);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    const result = await mod.exportInventory({
      ...baseConfig,
      table: "inventory",
      format: "csv",
    });

    expect(result.status).toBe("completed");
    expect(result.rowCount).toBe(0);
    expect(result.data).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/*  Date range filtering                                                       */
/* -------------------------------------------------------------------------- */

describe("date range filtering", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("includes date range params in SQL when dateRange specified", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    await mod.exportLeads({
      ...baseConfig,
      dateRange: { start: "2026-01-01", end: "2026-03-31" },
    });

    const selectCall = mockQuery.mock.calls[0];
    expect(selectCall[0]).toContain("created_at >= $2");
    expect(selectCall[0]).toContain("created_at <= $3");
    expect(selectCall[1]).toEqual(["dealer_001", "2026-01-01", "2026-03-31"]);
  });

  it("uses timestamp column for analytics_events date range", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    await mod.exportAnalyticsEvents({
      ...baseConfig,
      table: "analytics_events",
      dateRange: { start: "2026-04-01", end: "2026-04-04" },
    });

    const selectCall = mockQuery.mock.calls[0];
    expect(selectCall[0]).toContain("timestamp >= $2");
    expect(selectCall[0]).toContain("timestamp <= $3");
  });

  it("omits date filter when no dateRange", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mod = getModule();
    await mod.exportLeads(baseConfig);

    const selectCall = mockQuery.mock.calls[0];
    expect(selectCall[0]).not.toContain("$2");
    expect(selectCall[1]).toEqual(["dealer_001"]);
  });
});

/* -------------------------------------------------------------------------- */
/*  getExportHistory with DB                                                   */
/* -------------------------------------------------------------------------- */

describe("getExportHistory with DB", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/test";
  });

  it("queries data_exports table and maps rows", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "exp_100",
          dealer_id: "dealer_001",
          target: "s3",
          table: "leads",
          format: "csv",
          destination: "s3://bucket/leads/",
          status: "completed",
          row_count: 500,
          size_bytes: 12000,
          error: null,
          started_at: "2026-04-01T00:00:00Z",
          completed_at: "2026-04-01T00:01:00Z",
        },
      ],
    });

    const mod = getModule();
    const history = await mod.getExportHistory("dealer_001");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM data_exports"),
      ["dealer_001"],
    );
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("exp_100");
    expect(history[0].config.target).toBe("s3");
    expect(history[0].rowCount).toBe(500);
  });

  it("returns empty array when data_exports table missing", async () => {
    const tableError = new Error('relation "data_exports" does not exist');
    (tableError as any).code = "42P01";
    mockQuery.mockRejectedValueOnce(tableError);

    const mod = getModule();
    const history = await mod.getExportHistory("dealer_001");

    expect(history).toEqual([]);
  });
});
