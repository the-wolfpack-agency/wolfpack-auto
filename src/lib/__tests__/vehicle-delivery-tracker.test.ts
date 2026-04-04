/**
 * Vehicle Delivery Tracker — Tests
 *
 * Covers: milestone progression, time calculation, slow mover detection,
 * pipeline view, stage validation.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackVehiclePipeline: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

import {
  acquireVehicle,
  updateMilestone,
  getVehiclePipeline,
  calculateTimeInStage,
  alertSlowMovers,
  getVehicleStatus,
  STAGE_ORDER,
  _resetForTesting,
} from "@/lib/vehicle-delivery-tracker";

beforeEach(() => {
  _resetForTesting();
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/*  Acquisition                                                        */
/* ------------------------------------------------------------------ */

describe("acquireVehicle", () => {
  it("creates vehicle at acquired stage", async () => {
    const v = await acquireVehicle("VIN-001", "dealer-1", { year: 2025, make: "Honda", model: "Accord" });
    expect(v.vin).toBe("VIN-001");
    expect(v.currentStage).toBe("acquired");
    expect(v.milestones).toHaveLength(1);
    expect(v.vehicleInfo?.make).toBe("Honda");
  });
});

/* ------------------------------------------------------------------ */
/*  Milestone progression                                              */
/* ------------------------------------------------------------------ */

describe("updateMilestone", () => {
  it("advances vehicle to next stage", async () => {
    await acquireVehicle("VIN-002", "dealer-1");
    const v = await updateMilestone("VIN-002", "in_transit");
    expect(v).not.toBeNull();
    expect((v as any).currentStage).toBe("in_transit");
    expect((v as any).milestones).toHaveLength(2);
  });

  it("allows skipping stages", async () => {
    await acquireVehicle("VIN-003", "dealer-1");
    const v = await updateMilestone("VIN-003", "inspection");
    expect(v).not.toBeNull();
    expect((v as any).currentStage).toBe("inspection");
    // Should have intermediate milestones filled
    expect((v as any).milestones.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects backward progression", async () => {
    await acquireVehicle("VIN-004", "dealer-1");
    await updateMilestone("VIN-004", "inspection");
    const result = await updateMilestone("VIN-004", "acquired");
    expect(result).toBeNull();
  });

  it("returns null for unknown VIN", async () => {
    expect(await updateMilestone("UNKNOWN", "listed")).toBeNull();
  });

  it("completes full pipeline", async () => {
    await acquireVehicle("VIN-005", "dealer-1");
    for (const stage of STAGE_ORDER.slice(1)) {
      const result = await updateMilestone("VIN-005", stage);
      expect(result).not.toBeNull();
    }
    const v = await getVehicleStatus("VIN-005");
    expect((v as any).currentStage).toBe("delivered");
  });
});

/* ------------------------------------------------------------------ */
/*  Time in stage                                                      */
/* ------------------------------------------------------------------ */

describe("calculateTimeInStage", () => {
  it("returns 0 for unknown VIN", async () => {
    expect(await calculateTimeInStage("UNKNOWN")).toBe(0);
  });

  it("calculates days since milestone was set", async () => {
    await acquireVehicle("VIN-TIME", "dealer-1");
    // Just acquired, so should be 0 days
    const days = await calculateTimeInStage("VIN-TIME");
    expect(days).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Pipeline view                                                      */
/* ------------------------------------------------------------------ */

describe("getVehiclePipeline", () => {
  it("groups vehicles by stage", async () => {
    await acquireVehicle("VIN-P1", "dealer-1");
    await acquireVehicle("VIN-P2", "dealer-1");
    await updateMilestone("VIN-P2", "inspection");
    await acquireVehicle("VIN-P3", "dealer-2"); // Different dealer

    const pipeline = await getVehiclePipeline("dealer-1");
    expect(pipeline.totalVehicles).toBe(2);
    expect(pipeline.stages.acquired).toHaveLength(1);
    expect(pipeline.stages.inspection).toHaveLength(1);
  });

  it("calculates average time to list", async () => {
    await acquireVehicle("VIN-AVG", "dealer-1");
    await updateMilestone("VIN-AVG", "listed", "2026-04-10T10:00:00Z");
    const pipeline = await getVehiclePipeline("dealer-1");
    expect(pipeline.averageTimeToList).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Slow mover detection                                               */
/* ------------------------------------------------------------------ */

describe("alertSlowMovers", () => {
  it("returns empty for fresh vehicles", async () => {
    await acquireVehicle("VIN-FRESH", "dealer-1");
    const alerts = await alertSlowMovers("dealer-1", 7);
    expect(alerts).toHaveLength(0);
  });

  it("skips delivered vehicles", async () => {
    await acquireVehicle("VIN-DONE", "dealer-1");
    await updateMilestone("VIN-DONE", "delivered");
    const alerts = await alertSlowMovers("dealer-1", 0); // threshold=0
    expect(alerts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/vehicle-pipeline/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/vehicle-pipeline/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/vehicle-pipeline");
  });
});
