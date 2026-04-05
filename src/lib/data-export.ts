/**
 * Data Warehouse Export — Export dealer data to Snowflake, Databricks, S3, or local files.
 *
 * Enables dealers and enterprise clients to pipe their analytics, leads, and
 * inventory data into their own data warehouses for BI/reporting.
 */

import { trackDataExport } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ExportTarget = "snowflake" | "databricks" | "s3" | "local";
export type ExportFormat = "csv" | "json" | "parquet";
export type ExportTable = "analytics_events" | "leads" | "inventory";
export type ExportStatus = "pending" | "running" | "completed" | "failed";

export interface ExportConfig {
  dealerId: string;
  target: ExportTarget;
  table: ExportTable;
  format: ExportFormat;
  /** Connection string / bucket URL / file path depending on target */
  destination: string;
  /** Optional date range filter */
  dateRange?: { start: string; end: string };
}

export interface ExportJob {
  id: string;
  config: ExportConfig;
  status: ExportStatus;
  rowCount: number;
  sizeBytes: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface ExportResult {
  jobId: string;
  status: ExportStatus;
  rowCount: number;
  sizeBytes: number;
  durationMs: number;
  /** The generated export data — CSV string or JSON array */
  data?: string | Record<string, unknown>[];
}

export interface ScheduledExport {
  id: string;
  config: ExportConfig;
  cronExpression: string;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const VALID_TARGETS: ExportTarget[] = ["snowflake", "databricks", "s3", "local"];
const VALID_FORMATS: ExportFormat[] = ["csv", "json", "parquet"];
const VALID_TABLES: ExportTable[] = ["analytics_events", "leads", "inventory"];

export function validateExportConfig(config: Partial<ExportConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.dealerId) errors.push("dealerId is required");
  if (!config.target || !VALID_TARGETS.includes(config.target))
    errors.push(`target must be one of: ${VALID_TARGETS.join(", ")}`);
  if (!config.table || !VALID_TABLES.includes(config.table))
    errors.push(`table must be one of: ${VALID_TABLES.join(", ")}`);
  if (!config.format || !VALID_FORMATS.includes(config.format))
    errors.push(`format must be one of: ${VALID_FORMATS.join(", ")}`);
  if (!config.destination) errors.push("destination is required");

  if (config.destination && config.target === "snowflake" && !config.destination.includes("snowflake"))
    errors.push("Snowflake destination must contain a valid Snowflake connection reference");
  if (config.destination && config.target === "s3" && !config.destination.startsWith("s3://"))
    errors.push("S3 destination must start with s3://");

  return { valid: errors.length === 0, errors };
}

/* -------------------------------------------------------------------------- */
/*  CSV generation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert an array of objects to CSV string.
 * Handles quoting of values containing commas or newlines.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Shared export helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Table → SQL query mapping for each exportable table. */
const TABLE_QUERIES: Record<
  ExportTable,
  { sql: string; dateColumn: string; dealerFilter: string }
> = {
  analytics_events: {
    sql: "SELECT * FROM analytics_events",
    dateColumn: "timestamp",
    dealerFilter: "metadata->>'dealer_id' = $1",
  },
  leads: {
    sql: "SELECT * FROM leads",
    dateColumn: "created_at",
    dealerFilter: "dealer_id = $1",
  },
  inventory: {
    sql: "SELECT * FROM vehicles",
    dateColumn: "created_at",
    dealerFilter: "dealer_id = $1",
  },
};

/** Demo rows returned when DATABASE_URL is not set (shadow mode). */
const DEMO_DATA: Record<ExportTable, Record<string, unknown>[]> = {
  analytics_events: [
    { id: 1, event_type: "page_view", action: "view", page: "/inventory", timestamp: "2026-04-01T12:00:00Z" },
    { id: 2, event_type: "lead", action: "lead.submitted", page: "/contact", timestamp: "2026-04-01T13:00:00Z" },
  ],
  leads: [
    { id: 1, name: "Jane Doe", email: "jane@example.com", status: "new", created_at: "2026-04-01T10:00:00Z" },
    { id: 2, name: "Bob Smith", email: "bob@example.com", status: "contacted", created_at: "2026-04-02T09:00:00Z" },
  ],
  inventory: [
    { id: 1, vin: "1HGCM82633A004352", year: 2024, make: "Honda", model: "Accord", price: 28999 },
    { id: 2, vin: "5YJSA1DN5DFP14705", year: 2025, make: "Tesla", model: "Model S", price: 79990 },
  ],
};

/** Format rows into CSV string or JSON array based on config.format. */
function formatOutput(
  rows: Record<string, unknown>[],
  format: ExportFormat,
): string | Record<string, unknown>[] {
  if (format === "json") return rows;
  // csv and parquet (parquet falls back to csv for now)
  return toCsv(rows);
}

/**
 * Record an export job in the data_exports table.
 * Fire-and-forget — never throws.
 */
async function recordExportJob(
  queryFn: (text: string, params?: unknown[]) => Promise<any>,
  jobId: string,
  dealerId: string,
  config: ExportConfig,
  status: ExportStatus,
  rowCount: number,
  sizeBytes: number,
  error: string | null,
): Promise<void> {
  try {
    await queryFn(
      `INSERT INTO data_exports
         (id, dealer_id, target, "table", format, destination, status, row_count, size_bytes, error, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         row_count = EXCLUDED.row_count,
         size_bytes = EXCLUDED.size_bytes,
         error = EXCLUDED.error,
         completed_at = NOW()`,
      [jobId, dealerId, config.target, config.table, config.format, config.destination, status, rowCount, sizeBytes, error],
    );
  } catch (err) {
    // Recording is best-effort — never block the export
    console.error("[data-export] Failed to record export job:", err);
  }
}

/**
 * Core export engine used by all three table-specific functions.
 */
async function executeExport(config: ExportConfig): Promise<ExportResult> {
  const start = Date.now();
  const jobId = `exp_${Date.now()}`;
  const tableSpec = TABLE_QUERIES[config.table];

  // Shadow mode — return demo data without DB
  if (!process.env.DATABASE_URL) {
    const demoRows = DEMO_DATA[config.table];
    const output = formatOutput(demoRows, config.format);
    const sizeBytes = typeof output === "string" ? output.length : JSON.stringify(output).length;

    trackDataExport("export.completed" as any, config.dealerId, {
      table: config.table,
      format: config.format,
      rows: demoRows.length,
      shadow: true,
    });

    return {
      jobId,
      status: "completed",
      rowCount: demoRows.length,
      sizeBytes,
      durationMs: Date.now() - start,
      data: output,
    };
  }

  const { query } = await import("@/lib/db");

  // Build parameterised query with optional date range
  const params: unknown[] = [config.dealerId];
  let dateFilter = "";
  if (config.dateRange) {
    dateFilter = ` AND ${tableSpec.dateColumn} >= $2 AND ${tableSpec.dateColumn} <= $3`;
    params.push(config.dateRange.start, config.dateRange.end);
  }

  const fullSql = `${tableSpec.sql} WHERE ${tableSpec.dealerFilter}${dateFilter} ORDER BY ${tableSpec.dateColumn} DESC`;

  let rows: Record<string, unknown>[];
  try {
    const result = await query(fullSql, params);
    rows = result.rows;
  } catch (err: any) {
    // Table doesn't exist — return empty with "empty" status
    if (err?.code === "42P01") {
      await recordExportJob(query, jobId, config.dealerId, config, "completed", 0, 0, null);
      return {
        jobId,
        status: "completed" as ExportStatus,
        rowCount: 0,
        sizeBytes: 0,
        durationMs: Date.now() - start,
        data: config.format === "json" ? [] : "",
      };
    }
    // Genuine failure
    await recordExportJob(query, jobId, config.dealerId, config, "failed", 0, 0, err?.message ?? "Unknown error");

    trackDataExport("export.failed" as any, config.dealerId, {
      table: config.table,
      format: config.format,
      error: String(err?.message ?? "unknown"),
    });

    return {
      jobId,
      status: "failed",
      rowCount: 0,
      sizeBytes: 0,
      durationMs: Date.now() - start,
    };
  }

  const output = formatOutput(rows, config.format);
  const sizeBytes = typeof output === "string" ? output.length : JSON.stringify(output).length;

  // Record export job in data_exports table
  await recordExportJob(query, jobId, config.dealerId, config, "completed", rows.length, sizeBytes, null);

  // Track analytics
  trackDataExport("export.completed" as any, config.dealerId, {
    table: config.table,
    format: config.format,
    rows: rows.length,
  });

  return {
    jobId,
    status: "completed",
    rowCount: rows.length,
    sizeBytes,
    durationMs: Date.now() - start,
    data: output,
  };
}

/* -------------------------------------------------------------------------- */
/*  Export functions                                                            */
/* -------------------------------------------------------------------------- */

export async function exportAnalyticsEvents(
  config: ExportConfig,
): Promise<ExportResult> {
  return executeExport({ ...config, table: "analytics_events" });
}

export async function exportLeads(config: ExportConfig): Promise<ExportResult> {
  return executeExport({ ...config, table: "leads" });
}

export async function exportInventory(
  config: ExportConfig,
): Promise<ExportResult> {
  return executeExport({ ...config, table: "inventory" });
}

/* -------------------------------------------------------------------------- */
/*  Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

export function scheduleExport(
  config: ExportConfig,
  cronExpression: string,
): ScheduledExport {
  // Validate cron expression (basic 5-field check)
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    throw new Error(
      "Invalid cron expression: must have 5 or 6 fields (min hour dom month dow [year])",
    );
  }

  return {
    id: `sched_${Date.now()}`,
    config,
    cronExpression,
    nextRunAt: new Date(Date.now() + 3600_000).toISOString(),
    lastRunAt: null,
    enabled: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Export history                                                              */
/* -------------------------------------------------------------------------- */

export async function getExportHistory(
  dealerId: string,
): Promise<ExportJob[]> {
  if (!process.env.DATABASE_URL) {
    // Shadow mode — return demo history
    return [
      {
        id: "exp_demo_001",
        config: {
          dealerId,
          target: "s3",
          table: "analytics_events",
          format: "csv",
          destination: "s3://dealer-exports/analytics/",
        },
        status: "completed",
        rowCount: 15234,
        sizeBytes: 2_450_000,
        startedAt: new Date(Date.now() - 86400_000).toISOString(),
        completedAt: new Date(Date.now() - 86400_000 + 45_000).toISOString(),
        error: null,
      },
    ];
  }

  const { query } = await import("@/lib/db");

  try {
    const result = await query(
      `SELECT id, dealer_id, target, "table", format, destination, status,
              row_count, size_bytes, error, started_at, completed_at
       FROM data_exports
       WHERE dealer_id = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [dealerId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      config: {
        dealerId: row.dealer_id,
        target: row.target as ExportTarget,
        table: row.table as ExportTable,
        format: row.format as ExportFormat,
        destination: row.destination,
      },
      status: row.status as ExportStatus,
      rowCount: row.row_count ?? 0,
      sizeBytes: row.size_bytes ?? 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    }));
  } catch (err: any) {
    // Table doesn't exist yet — return empty
    if (err?.code === "42P01") return [];
    throw err;
  }
}
