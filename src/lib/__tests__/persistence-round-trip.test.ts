/**
 * Persistence Round-Trip Tests
 *
 * Verifies that data actually lands in the database and can be read back.
 * These tests set DATABASE_URL, configure the mock DB to capture INSERT
 * params and return them on SELECT, then verify the full write → read cycle.
 *
 * This catches the failure mode where features appear to work but silently
 * lose data by falling back to in-memory storage.
 */

/* ------------------------------------------------------------------ */
/*  Shared mock DB infrastructure                                      */
/* ------------------------------------------------------------------ */

/**
 * Creates a mock query function that stores rows per table and returns
 * them on SELECT, simulating real Postgres round-trip behavior.
 */
function createMockDb() {
  const tables: Record<string, Record<string, unknown>[]> = {};

  function getTable(name: string): Record<string, unknown>[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function parseTableName(sql: string): string {
    // Match INSERT INTO <table>, SELECT ... FROM <table>, UPDATE <table>, DELETE FROM <table>
    const insertMatch = sql.match(/INSERT INTO\s+(\w+)/i);
    if (insertMatch) return insertMatch[1];
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (fromMatch) return fromMatch[1];
    const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) return updateMatch[1];
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch) return deleteMatch[1];
    return "unknown";
  }

  function parseColumns(sql: string): string[] {
    const match = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!match) return [];
    return match[1].split(",").map((c) => c.trim().replace(/"/g, ""));
  }

  const queryFn = jest.fn(async (sql: string, params?: unknown[]) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const tableName = parseTableName(normalizedSql);

    if (normalizedSql.toUpperCase().startsWith("INSERT")) {
      const columns = parseColumns(normalizedSql);
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = params?.[i] ?? null;
      });
      getTable(tableName).push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (normalizedSql.toUpperCase().startsWith("SELECT")) {
      let rows = [...getTable(tableName)];

      // Apply WHERE filters from params
      if (params && params.length > 0) {
        // Extract WHERE conditions: column = $N
        const whereMatch = normalizedSql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const conditions = whereMatch[1];
          // Match patterns like "column = $1" or "table.column = $1"
          const conditionParts = conditions.split(/\s+AND\s+/i);
          for (const part of conditionParts) {
            const paramMatch = part.match(/(?:\w+\.)?(\w+)\s*=\s*\$(\d+)/);
            if (paramMatch) {
              const col = paramMatch[1];
              const paramIdx = parseInt(paramMatch[2]) - 1;
              const paramVal = params[paramIdx];
              rows = rows.filter((r) => r[col] === paramVal);
            }
          }
        }
      }

      return { rows, rowCount: rows.length };
    }

    if (normalizedSql.toUpperCase().startsWith("UPDATE")) {
      // Parse SET clause and WHERE clause
      const setMatch = normalizedSql.match(/SET\s+(.+?)\s+WHERE/i);
      const whereMatch = normalizedSql.match(/WHERE\s+(.+?)$/i);
      if (whereMatch && params) {
        const idParamMatch = whereMatch[1].match(/(\w+)\s*=\s*\$(\d+)/);
        if (idParamMatch) {
          const idCol = idParamMatch[1];
          const idIdx = parseInt(idParamMatch[2]) - 1;
          const idVal = params[idIdx];
          const table = getTable(tableName);
          const row = table.find((r) => r[idCol] === idVal);
          if (row && setMatch) {
            // Apply SET assignments
            const assignments = setMatch[1].split(",");
            for (const assign of assignments) {
              const assignMatch = assign.trim().match(/(\w+)\s*=\s*(?:COALESCE\(\$(\d+),\s*\w+\)|\$(\d+))/);
              if (assignMatch) {
                const col = assignMatch[1];
                const paramIdx = parseInt(assignMatch[2] || assignMatch[3]) - 1;
                if (params[paramIdx] !== undefined && params[paramIdx] !== null) {
                  row[col] = params[paramIdx];
                }
              }
            }
            return { rows: [row], rowCount: 1 };
          }
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalizedSql.toUpperCase().startsWith("DELETE")) {
      if (params && params.length > 0) {
        const table = getTable(tableName);
        const whereMatch = normalizedSql.match(/WHERE\s+(\w+)\s*=\s*\$1/i);
        if (whereMatch) {
          const col = whereMatch[1];
          const before = table.length;
          const remaining = table.filter((r) => r[col] !== params[0]);
          tables[tableName] = remaining;
          return { rows: [], rowCount: before - remaining.length };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  });

  return { queryFn, tables, getTable };
}

/* ------------------------------------------------------------------ */
/*  Module-level mock setup                                            */
/* ------------------------------------------------------------------ */

const mockDb = createMockDb();

jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockDb.queryFn(...(args as [string, unknown[]])),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackAnnotation: jest.fn(),
  trackDripCampaign: jest.fn(),
  trackOmnichannel: jest.fn(),
  trackVehiclePipeline: jest.fn(),
  trackWalkaround: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Reset all mock table data
  for (const key of Object.keys(mockDb.tables)) {
    delete mockDb.tables[key];
  }
  // Enable DB mode
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

/* ================================================================== */
/*  1. Dashboard Annotations — Persistence Round-Trip                  */
/* ================================================================== */

import {
  createAnnotation,
  getAnnotation,
  getAnnotationsForDashboard,
  updateAnnotation,
  deleteAnnotation,
  _resetForTesting as resetAnnotations,
} from "@/lib/dashboard-annotations";

describe("Dashboard Annotations — DB Persistence", () => {
  beforeEach(() => resetAnnotations());

  test("createAnnotation writes to DB with correct params", async () => {
    const ann = await createAnnotation(
      { dashboardId: "main", date: "2026-04-01", text: "Campaign launch", type: "campaign", createdBy: "admin" },
      "dealer-001",
    );

    // Verify INSERT was called
    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO dashboard_annotations"),
      expect.arrayContaining([ann.id, "dealer-001", "main", "2026-04-01", "Campaign launch", "campaign", "admin"]),
    );

    // Verify data landed in mock DB
    const table = mockDb.getTable("dashboard_annotations");
    expect(table).toHaveLength(1);
    expect(table[0].dealer_id).toBe("dealer-001");
    expect(table[0].text).toBe("Campaign launch");
    expect(table[0].type).toBe("campaign");
  });

  test("getAnnotation reads from DB, not in-memory", async () => {
    // Write to DB
    const ann = await createAnnotation(
      { dashboardId: "main", date: "2026-04-01", text: "Test", type: "note" },
      "dealer-001",
    );

    // Clear in-memory to prove DB is being used
    resetAnnotations();

    // Read should come from mock DB
    const found = await getAnnotation(ann.id);
    expect(found).not.toBeNull();
    expect(found!.text).toBe("Test");
    expect(found!.dashboardId).toBe("main");
  });

  test("updateAnnotation persists changes to DB", async () => {
    const ann = await createAnnotation(
      { dashboardId: "main", date: "2026-04-01", text: "Original", type: "note" },
      "dealer-001",
    );

    await updateAnnotation(ann.id, { text: "Updated", type: "milestone" });

    // Verify UPDATE was called
    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE dashboard_annotations"),
      expect.arrayContaining(["Updated", "milestone"]),
    );
  });

  test("deleteAnnotation removes from DB", async () => {
    const ann = await createAnnotation(
      { dashboardId: "main", date: "2026-04-01", text: "To delete", type: "note" },
      "dealer-001",
    );

    const deleted = await deleteAnnotation(ann.id);
    expect(deleted).toBe(true);

    // Verify DELETE was called
    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM dashboard_annotations"),
      [ann.id],
    );
  });

  test("falls back to in-memory when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    mockDb.queryFn.mockClear();

    const ann = await createAnnotation(
      { dashboardId: "main", date: "2026-04-01", text: "Shadow", type: "note" },
    );

    // DB should NOT have been called
    expect(mockDb.queryFn).not.toHaveBeenCalled();

    // But data should still be retrievable (from memory)
    const found = await getAnnotation(ann.id);
    expect(found).not.toBeNull();
    expect(found!.text).toBe("Shadow");
  });
});

/* ================================================================== */
/*  2. Vehicle Delivery Tracker — Persistence Round-Trip               */
/* ================================================================== */

import {
  acquireVehicle,
  updateMilestone,
  getVehiclePipeline,
  getVehicleStatus,
  _resetForTesting as resetTracker,
} from "@/lib/vehicle-delivery-tracker";

describe("Vehicle Delivery Tracker — DB Persistence", () => {
  beforeEach(() => resetTracker());

  test("acquireVehicle writes to DB with VIN and dealer_id", async () => {
    const vehicle = await acquireVehicle("VIN-DB-001", "dealer-001", {
      year: 2025, make: "Honda", model: "Accord",
    });

    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO vehicle_delivery_tracker"),
      expect.arrayContaining(["VIN-DB-001", "dealer-001", "acquired"]),
    );

    const table = mockDb.getTable("vehicle_delivery_tracker");
    expect(table).toHaveLength(1);
    expect(table[0].vin).toBe("VIN-DB-001");
    expect(table[0].current_stage).toBe("acquired");
  });

  test("updateMilestone persists stage progression to DB", async () => {
    await acquireVehicle("VIN-DB-002", "dealer-001");

    const updated = await updateMilestone("VIN-DB-002", "inspection");
    expect(updated).not.toBeNull();
    expect(updated!.currentStage).toBe("inspection");

    // Verify UPDATE was called with new stage
    const updateCalls = mockDb.queryFn.mock.calls.filter(
      (call: unknown[]) => (call[0] as string).includes("UPDATE vehicle_delivery_tracker"),
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("getVehicleStatus reads from DB after in-memory clear", async () => {
    await acquireVehicle("VIN-DB-003", "dealer-001", { year: 2024, make: "Toyota", model: "Camry" });

    // Clear in-memory
    resetTracker();

    const status = await getVehicleStatus("VIN-DB-003");
    expect(status).not.toBeNull();
    expect(status!.vin).toBe("VIN-DB-003");
  });

  test("falls back to in-memory when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    mockDb.queryFn.mockClear();

    await acquireVehicle("VIN-SHADOW", "dealer-001");
    expect(mockDb.queryFn).not.toHaveBeenCalled();

    const status = await getVehicleStatus("VIN-SHADOW");
    expect(status).not.toBeNull();
  });
});

/* ================================================================== */
/*  3. Video Walkaround — Persistence Round-Trip                       */
/* ================================================================== */

import {
  createWalkaround,
  addSegment,
  publishWalkaround,
  listWalkarounds,
  getWalkaround,
  _resetForTesting as resetWalkarounds,
} from "@/lib/video-walkaround";

describe("Video Walkaround — DB Persistence", () => {
  beforeEach(() => resetWalkarounds());

  test("createWalkaround writes to walkarounds table", async () => {
    const wk = await createWalkaround("VIN-WK-001", "dealer-001", "admin");

    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO walkarounds"),
      expect.arrayContaining(["VIN-WK-001", "dealer-001", "draft"]),
    );

    const table = mockDb.getTable("walkarounds");
    expect(table).toHaveLength(1);
    expect(table[0].vin).toBe("VIN-WK-001");
    expect(table[0].status).toBe("draft");
  });

  test("addSegment writes to walkaround_segments table", async () => {
    const wk = await createWalkaround("VIN-WK-002", "dealer-001");
    await addSegment(wk.id, "exterior_front", "/vid/front.mp4", 30);

    const segTable = mockDb.getTable("walkaround_segments");
    expect(segTable.length).toBeGreaterThanOrEqual(1);

    const seg = segTable.find((r) => r.segment_type === "exterior_front");
    expect(seg).toBeTruthy();
    expect(seg!.url).toBe("/vid/front.mp4");
    expect(seg!.duration_seconds).toBe(30);
  });

  test("falls back to in-memory when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    mockDb.queryFn.mockClear();

    const wk = await createWalkaround("VIN-SHADOW", "dealer-001");
    expect(mockDb.queryFn).not.toHaveBeenCalled();
    expect(wk.vin).toBe("VIN-SHADOW");
  });
});

/* ================================================================== */
/*  4. Drip Campaigns — Persistence Round-Trip                         */
/* ================================================================== */

import {
  createCampaign,
  listCampaigns,
  getCampaign,
  enrollLead,
  _resetForTesting as resetCampaigns,
} from "@/lib/drip-campaigns";

describe("Drip Campaigns — DB Persistence", () => {
  beforeEach(() => resetCampaigns());

  test("createCampaign writes to drip_campaigns table", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-001",
      name: "Welcome Sequence",
      trigger: "lead_created",
      steps: [
        { stepNumber: 1, subject: "Welcome!", bodyTemplate: "Hi {{name}}", delayHours: 0 },
      ],
    });

    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO drip_campaigns"),
      expect.arrayContaining(["dealer-001", "Welcome Sequence", "lead_created"]),
    );

    const table = mockDb.getTable("drip_campaigns");
    expect(table).toHaveLength(1);
    expect(table[0].name).toBe("Welcome Sequence");
    expect(table[0].active).toBe(true);
  });

  test("enrollLead writes to campaign_enrollments table", async () => {
    const campaign = await createCampaign({
      dealerId: "dealer-001",
      name: "Test",
      trigger: "lead_created",
      steps: [{ stepNumber: 1, subject: "Hi", bodyTemplate: "Hello", delayHours: 0 }],
    });

    const enrollment = await enrollLead(campaign.id, "lead-001", "test@example.com");

    const table = mockDb.getTable("campaign_enrollments");
    expect(table.length).toBeGreaterThanOrEqual(1);
    expect(enrollment.leadId).toBe("lead-001");
    expect(enrollment.status).toBe("active");
  });

  test("falls back to in-memory when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    mockDb.queryFn.mockClear();

    const campaign = await createCampaign({
      dealerId: "dealer-001",
      name: "Shadow Campaign",
      trigger: "lead_created",
      steps: [],
    });

    expect(mockDb.queryFn).not.toHaveBeenCalled();
    expect(campaign.name).toBe("Shadow Campaign");
  });
});

/* ================================================================== */
/*  5. Omnichannel — Persistence Round-Trip                            */
/* ================================================================== */

import {
  recordTouchpoint,
  getOmnichannelTimeline,
  createHandoff,
  _resetForTesting as resetOmnichannel,
} from "@/lib/omnichannel";

describe("Omnichannel — DB Persistence", () => {
  beforeEach(() => resetOmnichannel());

  test("recordTouchpoint writes to customer_touchpoints table", async () => {
    const tp = await recordTouchpoint(
      "cust-001", "online", "Viewed inventory page",
      { page: "/inventory" }, "dealer-001",
    );

    expect(mockDb.queryFn).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO customer_touchpoints"),
      expect.arrayContaining(["cust-001", "online", "Viewed inventory page"]),
    );

    const table = mockDb.getTable("customer_touchpoints");
    expect(table).toHaveLength(1);
    expect(table[0].customer_id).toBe("cust-001");
    expect(table[0].channel).toBe("online");
  });

  test("getOmnichannelTimeline reads touchpoints from DB", async () => {
    await recordTouchpoint("cust-002", "online", "Page view", {}, "dealer-001");
    await recordTouchpoint("cust-002", "phone", "Called about F-150", {}, "dealer-001");

    const timeline = await getOmnichannelTimeline("cust-002");
    expect(timeline).toHaveLength(2);
  });

  test("createHandoff persists touchpoint with handoff token", async () => {
    const handoff = await createHandoff("cust-003", "online", "in_store", "dealer-001");

    expect(handoff.token).toBeTruthy();
    expect(handoff.qrUrl).toBeTruthy();

    // Should have written a touchpoint for the handoff
    const tpTable = mockDb.getTable("customer_touchpoints");
    const handoffTp = tpTable.find((r) => r.handoff_token);
    expect(handoffTp).toBeTruthy();
  });

  test("falls back to in-memory when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    mockDb.queryFn.mockClear();

    await recordTouchpoint("cust-004", "email", "Received offer", {});
    expect(mockDb.queryFn).not.toHaveBeenCalled();

    const timeline = await getOmnichannelTimeline("cust-004");
    expect(timeline).toHaveLength(1);
  });
});

/* ================================================================== */
/*  6. Cross-cutting: DB query is called, not just in-memory           */
/* ================================================================== */

describe("DB query verification — no silent data loss", () => {
  test("with DATABASE_URL set, query mock is invoked for every write", async () => {
    resetAnnotations();
    resetTracker();
    resetWalkarounds();
    resetCampaigns();
    resetOmnichannel();
    mockDb.queryFn.mockClear();

    // Perform one write per module
    await createAnnotation({ dashboardId: "d", date: "2026-01-01", text: "t", type: "note" }, "dlr");
    await acquireVehicle("VIN-X", "dlr");
    await createWalkaround("VIN-Y", "dlr");
    await createCampaign({ dealerId: "dlr", name: "c", trigger: "lead_created", steps: [] });
    await recordTouchpoint("cust", "online", "test", {}, "dlr");

    // Each module should have called query at least once (INSERT)
    const insertCalls = mockDb.queryFn.mock.calls.filter(
      (call: unknown[]) => (call[0] as string).toUpperCase().includes("INSERT"),
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(5);
  });

  test("without DATABASE_URL, query mock is never invoked", async () => {
    delete process.env.DATABASE_URL;
    resetAnnotations();
    resetTracker();
    resetWalkarounds();
    resetCampaigns();
    resetOmnichannel();
    mockDb.queryFn.mockClear();

    await createAnnotation({ dashboardId: "d", date: "2026-01-01", text: "t", type: "note" });
    await acquireVehicle("VIN-X", "dlr");
    await createWalkaround("VIN-Y", "dlr");
    await createCampaign({ dealerId: "dlr", name: "c", trigger: "lead_created", steps: [] });
    await recordTouchpoint("cust", "online", "test", {});

    expect(mockDb.queryFn).not.toHaveBeenCalled();
  });
});
