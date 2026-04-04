/**
 * Vehicle Delivery Tracking Pipeline
 *
 * Tracks vehicles through the full lifecycle from acquisition to
 * customer delivery. Kanban-style pipeline with time-in-stage
 * tracking and slow-mover alerts.
 *
 * Persists to PostgreSQL (vehicle_delivery_tracker from migration 052).
 * Falls back to in-memory Map when DATABASE_URL is not set (shadow mode).
 */

import { query } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DeliveryStage =
  | "acquired"
  | "in_transit"
  | "arrived"
  | "inspection"
  | "reconditioning"
  | "photos"
  | "listed"
  | "sold"
  | "delivered";

export const STAGE_ORDER: DeliveryStage[] = [
  "acquired",
  "in_transit",
  "arrived",
  "inspection",
  "reconditioning",
  "photos",
  "listed",
  "sold",
  "delivered",
];

export interface DeliveryMilestone {
  stage: DeliveryStage;
  timestamp: string;
  notes?: string;
}

export interface VehicleDeliveryStatus {
  vin: string;
  dealerId: string;
  currentStage: DeliveryStage;
  milestones: DeliveryMilestone[];
  acquiredAt: string;
  lastUpdated: string;
  vehicleInfo?: {
    year: number;
    make: string;
    model: string;
    stockNumber?: string;
  };
}

export interface PipelineView {
  dealerId: string;
  stages: Record<DeliveryStage, VehicleDeliveryStatus[]>;
  totalVehicles: number;
  averageTimeToList: number; // days
  averageTimeToDeliver: number; // days
}

export interface SlowMoverAlert {
  vin: string;
  currentStage: DeliveryStage;
  daysInStage: number;
  thresholdDays: number;
  vehicleInfo?: VehicleDeliveryStatus["vehicleInfo"];
}

/* ------------------------------------------------------------------ */
/*  In-memory store (shadow mode fallback)                             */
/* ------------------------------------------------------------------ */

const vehicles = new Map<string, VehicleDeliveryStatus>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function useDb(): boolean {
  return !!process.env.DATABASE_URL;
}

function rowToVehicle(row: Record<string, unknown>): VehicleDeliveryStatus {
  const milestones = typeof row.milestones === "string" ? JSON.parse(row.milestones) : (row.milestones as DeliveryMilestone[]) ?? [];
  const vehicleInfo = typeof row.vehicle_info === "string" ? JSON.parse(row.vehicle_info) : (row.vehicle_info as VehicleDeliveryStatus["vehicleInfo"]) ?? undefined;
  return {
    vin: row.vin as string,
    dealerId: row.dealer_id as string,
    currentStage: row.current_stage as DeliveryStage,
    milestones,
    acquiredAt: typeof row.acquired_at === "string" ? row.acquired_at : (row.acquired_at as Date).toISOString(),
    lastUpdated: typeof row.last_updated === "string" ? row.last_updated : (row.last_updated as Date).toISOString(),
    vehicleInfo: vehicleInfo || undefined,
  };
}

function daysBetween(start: string, end: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / msPerDay,
  );
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a new vehicle in the pipeline at the "acquired" stage.
 */
export async function acquireVehicle(
  vin: string,
  dealerId: string,
  vehicleInfo?: VehicleDeliveryStatus["vehicleInfo"],
): Promise<VehicleDeliveryStatus> {
  const now = new Date().toISOString();
  const status: VehicleDeliveryStatus = {
    vin,
    dealerId,
    currentStage: "acquired",
    milestones: [{ stage: "acquired", timestamp: now }],
    acquiredAt: now,
    lastUpdated: now,
    vehicleInfo,
  };

  if (useDb()) {
    try {
      await query(
        `INSERT INTO vehicle_delivery_tracker (id, dealer_id, vin, current_stage, milestones, vehicle_info, acquired_at, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `vdt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          dealerId,
          vin,
          status.currentStage,
          JSON.stringify(status.milestones),
          vehicleInfo ? JSON.stringify(vehicleInfo) : null,
          status.acquiredAt,
          status.lastUpdated,
        ],
      );
      return status;
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB write failed, using in-memory:", (err as Error).message);
    }
  }

  vehicles.set(vin, status);
  return status;
}

/**
 * Advance a vehicle to the next milestone in the pipeline.
 * Validates that the milestone is a valid forward progression.
 */
export async function updateMilestone(
  vin: string,
  milestone: DeliveryStage,
  timestamp?: string,
  notes?: string,
): Promise<VehicleDeliveryStatus | null> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM vehicle_delivery_tracker WHERE vin = $1`,
        [vin],
      );
      if (result.rows.length === 0) {
        // Fall through to in-memory
        const memVehicle = vehicles.get(vin);
        if (!memVehicle) return null;
        return updateMilestoneInMemory(memVehicle, milestone, timestamp, notes);
      }

      const vehicle = rowToVehicle(result.rows[0]);
      const currentIdx = STAGE_ORDER.indexOf(vehicle.currentStage);
      const targetIdx = STAGE_ORDER.indexOf(milestone);

      if (targetIdx < currentIdx) return null;

      const ts = timestamp ?? new Date().toISOString();

      // Add intermediate milestones
      for (let i = currentIdx + 1; i <= targetIdx; i++) {
        const existingMilestone = vehicle.milestones.find(
          (m) => m.stage === STAGE_ORDER[i],
        );
        if (!existingMilestone) {
          vehicle.milestones.push({
            stage: STAGE_ORDER[i],
            timestamp: ts,
            notes: i === targetIdx ? notes : undefined,
          });
        }
      }

      vehicle.currentStage = milestone;
      vehicle.lastUpdated = ts;

      await query(
        `UPDATE vehicle_delivery_tracker SET current_stage = $1, milestones = $2, last_updated = $3 WHERE vin = $4`,
        [vehicle.currentStage, JSON.stringify(vehicle.milestones), vehicle.lastUpdated, vin],
      );

      return vehicle;
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB update failed, using in-memory:", (err as Error).message);
    }
  }

  const vehicle = vehicles.get(vin);
  if (!vehicle) return null;
  return updateMilestoneInMemory(vehicle, milestone, timestamp, notes);
}

function updateMilestoneInMemory(
  vehicle: VehicleDeliveryStatus,
  milestone: DeliveryStage,
  timestamp?: string,
  notes?: string,
): VehicleDeliveryStatus | null {
  const currentIdx = STAGE_ORDER.indexOf(vehicle.currentStage);
  const targetIdx = STAGE_ORDER.indexOf(milestone);

  if (targetIdx < currentIdx) return null;

  const ts = timestamp ?? new Date().toISOString();

  for (let i = currentIdx + 1; i <= targetIdx; i++) {
    const existingMilestone = vehicle.milestones.find(
      (m) => m.stage === STAGE_ORDER[i],
    );
    if (!existingMilestone) {
      vehicle.milestones.push({
        stage: STAGE_ORDER[i],
        timestamp: i === targetIdx ? ts : ts,
        notes: i === targetIdx ? notes : undefined,
      });
    }
  }

  vehicle.currentStage = milestone;
  vehicle.lastUpdated = ts;

  return vehicle;
}

/**
 * Get the full pipeline view — all vehicles grouped by stage.
 */
export async function getVehiclePipeline(dealerId: string): Promise<PipelineView> {
  const stages: Record<DeliveryStage, VehicleDeliveryStatus[]> = {
    acquired: [],
    in_transit: [],
    arrived: [],
    inspection: [],
    reconditioning: [],
    photos: [],
    listed: [],
    sold: [],
    delivered: [],
  };

  let allVehicles: VehicleDeliveryStatus[];

  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM vehicle_delivery_tracker WHERE dealer_id = $1`,
        [dealerId],
      );
      allVehicles = result.rows.map(rowToVehicle);
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB read failed, using in-memory:", (err as Error).message);
      allVehicles = [...vehicles.values()].filter((v) => v.dealerId === dealerId);
    }
  } else {
    allVehicles = [...vehicles.values()].filter((v) => v.dealerId === dealerId);
  }

  let totalVehicles = 0;
  let totalTimeToList = 0;
  let listedCount = 0;
  let totalTimeToDeliver = 0;
  let deliveredCount = 0;

  for (const v of allVehicles) {
    stages[v.currentStage].push(v);
    totalVehicles++;

    const listedMilestone = v.milestones.find((m) => m.stage === "listed");
    if (listedMilestone) {
      const days = daysBetween(v.acquiredAt, listedMilestone.timestamp);
      totalTimeToList += days;
      listedCount++;
    }

    const deliveredMilestone = v.milestones.find((m) => m.stage === "delivered");
    if (deliveredMilestone) {
      const days = daysBetween(v.acquiredAt, deliveredMilestone.timestamp);
      totalTimeToDeliver += days;
      deliveredCount++;
    }
  }

  return {
    dealerId,
    stages,
    totalVehicles,
    averageTimeToList: listedCount > 0 ? Math.round(totalTimeToList / listedCount) : 0,
    averageTimeToDeliver: deliveredCount > 0 ? Math.round(totalTimeToDeliver / deliveredCount) : 0,
  };
}

/**
 * Calculate how many days a vehicle has been in its current stage.
 */
export async function calculateTimeInStage(vin: string): Promise<number> {
  let vehicle: VehicleDeliveryStatus | null = null;

  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM vehicle_delivery_tracker WHERE vin = $1`,
        [vin],
      );
      if (result.rows.length > 0) vehicle = rowToVehicle(result.rows[0]);
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  if (!vehicle) vehicle = vehicles.get(vin) ?? null;
  if (!vehicle) return 0;

  const currentMilestone = vehicle.milestones.find(
    (m) => m.stage === vehicle!.currentStage,
  );
  if (!currentMilestone) return 0;

  return daysBetween(currentMilestone.timestamp, new Date().toISOString());
}

/**
 * Flag vehicles stuck in a stage longer than the threshold.
 */
export async function alertSlowMovers(
  dealerId: string,
  thresholdDays: number = 7,
): Promise<SlowMoverAlert[]> {
  const alerts: SlowMoverAlert[] = [];

  let allVehicles: VehicleDeliveryStatus[];

  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM vehicle_delivery_tracker WHERE dealer_id = $1`,
        [dealerId],
      );
      allVehicles = result.rows.map(rowToVehicle);
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB read failed, using in-memory:", (err as Error).message);
      allVehicles = [...vehicles.values()].filter((v) => v.dealerId === dealerId);
    }
  } else {
    allVehicles = [...vehicles.values()].filter((v) => v.dealerId === dealerId);
  }

  for (const v of allVehicles) {
    if (v.currentStage === "delivered" || v.currentStage === "sold") continue;

    const currentMilestone = v.milestones.find((m) => m.stage === v.currentStage);
    if (!currentMilestone) continue;

    const daysInStage = daysBetween(currentMilestone.timestamp, new Date().toISOString());
    if (daysInStage >= thresholdDays) {
      alerts.push({
        vin: v.vin,
        currentStage: v.currentStage,
        daysInStage,
        thresholdDays,
        vehicleInfo: v.vehicleInfo,
      });
    }
  }

  return alerts.sort((a, b) => b.daysInStage - a.daysInStage);
}

/**
 * Get a single vehicle's delivery status.
 */
export async function getVehicleStatus(vin: string): Promise<VehicleDeliveryStatus | null> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM vehicle_delivery_tracker WHERE vin = $1`,
        [vin],
      );
      if (result.rows.length > 0) return rowToVehicle(result.rows[0]);
    } catch (err: unknown) {
      console.warn("[vehicle-delivery] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return vehicles.get(vin) ?? null;
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  vehicles.clear();
}
