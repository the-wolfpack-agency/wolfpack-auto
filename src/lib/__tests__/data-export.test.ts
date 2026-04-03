/**
 * Data Warehouse Export tests.
 */

import {
  validateExportConfig,
  toCsv,
  scheduleExport,
  getExportHistory,
  exportAnalyticsEvents,
  exportLeads,
  exportInventory,
} from "@/lib/data-export";

/* -------------------------------------------------------------------------- */
/*  CSV generation                                                             */
/* -------------------------------------------------------------------------- */

describe("toCsv", () => {
  it("converts rows to CSV with headers", () => {
    const rows = [
      { name: "Alice", age: 30, city: "Austin" },
      { name: "Bob", age: 25, city: "Dallas" },
    ];
    const csv = toCsv(rows);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("name,age,city");
    expect(lines[1]).toBe("Alice,30,Austin");
    expect(lines[2]).toBe("Bob,25,Dallas");
  });

  it("handles values with commas by quoting", () => {
    const rows = [{ name: "Smith, John", value: 100 }];
    const csv = toCsv(rows);
    expect(csv).toContain('"Smith, John"');
  });

  it("handles values with double quotes by escaping", () => {
    const rows = [{ desc: 'He said "hello"' }];
    const csv = toCsv(rows);
    expect(csv).toContain('"He said ""hello"""');
  });

  it("returns empty string for empty array", () => {
    expect(toCsv([])).toBe("");
  });

  it("handles null and undefined values", () => {
    const rows = [{ a: null, b: undefined, c: "ok" }];
    const csv = toCsv(rows);
    expect(csv).toContain(",,ok");
  });
});

/* -------------------------------------------------------------------------- */
/*  Config validation                                                          */
/* -------------------------------------------------------------------------- */

describe("validateExportConfig", () => {
  const validConfig = {
    dealerId: "dealer-1",
    target: "s3" as const,
    table: "leads" as const,
    format: "csv" as const,
    destination: "s3://bucket/path/",
  };

  it("accepts valid config", () => {
    const result = validateExportConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing dealerId", () => {
    const result = validateExportConfig({ ...validConfig, dealerId: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("dealerId is required");
  });

  it("rejects invalid target", () => {
    const result = validateExportConfig({ ...validConfig, target: "bigquery" as any });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid table", () => {
    const result = validateExportConfig({ ...validConfig, table: "users" as any });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid format", () => {
    const result = validateExportConfig({ ...validConfig, format: "xml" as any });
    expect(result.valid).toBe(false);
  });

  it("requires s3:// prefix for S3 targets", () => {
    const result = validateExportConfig({ ...validConfig, destination: "bucket/path/" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("s3://"))).toBe(true);
  });

  it("rejects missing destination", () => {
    const result = validateExportConfig({ ...validConfig, destination: "" });
    expect(result.valid).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

describe("scheduleExport", () => {
  const config = {
    dealerId: "dealer-1",
    target: "s3" as const,
    table: "analytics_events" as const,
    format: "csv" as const,
    destination: "s3://bucket/",
  };

  it("creates a scheduled export with valid cron", () => {
    const result = scheduleExport(config, "0 6 * * 1");
    expect(result.id).toMatch(/^sched_/);
    expect(result.cronExpression).toBe("0 6 * * 1");
    expect(result.enabled).toBe(true);
    expect(result.lastRunAt).toBeNull();
    expect(result.config).toEqual(config);
  });

  it("throws on invalid cron expression", () => {
    expect(() => scheduleExport(config, "bad")).toThrow("Invalid cron expression");
  });

  it("accepts 6-field cron with year", () => {
    const result = scheduleExport(config, "0 6 * * 1 2026");
    expect(result.cronExpression).toBe("0 6 * * 1 2026");
  });
});

/* -------------------------------------------------------------------------- */
/*  Export history (shadow mode)                                               */
/* -------------------------------------------------------------------------- */

describe("getExportHistory", () => {
  it("returns demo data when no DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const history = await getExportHistory("dealer-1");
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty("id");
    expect(history[0]).toHaveProperty("status");
    expect(history[0]).toHaveProperty("rowCount");
    expect(history[0]).toHaveProperty("sizeBytes");
  });
});

/* -------------------------------------------------------------------------- */
/*  Export functions (shadow mode)                                             */
/* -------------------------------------------------------------------------- */

describe("export functions (shadow mode)", () => {
  beforeAll(() => {
    delete process.env.DATABASE_URL;
  });

  it("exportAnalyticsEvents returns completed result", async () => {
    const result = await exportAnalyticsEvents({
      dealerId: "dealer-1",
      target: "local",
      table: "analytics_events",
      format: "csv",
      destination: "/tmp/export.csv",
    });
    expect(result.status).toBe("completed");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.jobId).toMatch(/^exp_/);
  });

  it("exportLeads returns completed result", async () => {
    const result = await exportLeads({
      dealerId: "dealer-1",
      target: "local",
      table: "leads",
      format: "json",
      destination: "/tmp/leads.json",
    });
    expect(result.status).toBe("completed");
    expect(result.rowCount).toBeGreaterThan(0);
  });

  it("exportInventory returns completed result", async () => {
    const result = await exportInventory({
      dealerId: "dealer-1",
      target: "local",
      table: "inventory",
      format: "csv",
      destination: "/tmp/inventory.csv",
    });
    expect(result.status).toBe("completed");
    expect(result.rowCount).toBeGreaterThan(0);
  });
});
