/**
 * Vehicle Delivery Tracking Pipeline
 *
 * Tracks vehicles through the full lifecycle from acquisition to
 * customer delivery. Kanban-style pipeline with time-in-stage
 * tracking and slow-mover alerts.
 */

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
/*  In-memory store (shadow mode)                                      */
/* ------------------------------------------------------------------ */

const vehicles = new Map<string, VehicleDeliveryStatus>();

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a new vehicle in the pipeline at the "acquired" stage.
 */
export function acquireVehicle(
  vin: string,
  dealerId: string,
  vehicleInfo?: VehicleDeliveryStatus["vehicleInfo"],
): VehicleDeliveryStatus {
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
  vehicles.set(vin, status);
  return status;
}

/**
 * Advance a vehicle to the next milestone in the pipeline.
 * Validates that the milestone is a valid forward progression.
 */
export function updateMilestone(
  vin: string,
  milestone: DeliveryStage,
  timestamp?: string,
  notes?: string,
): VehicleDeliveryStatus | null {
  const vehicle = vehicles.get(vin);
  if (!vehicle) return null;

  const currentIdx = STAGE_ORDER.indexOf(vehicle.currentStage);
  const targetIdx = STAGE_ORDER.indexOf(milestone);

  // Must move forward (or stay same to update notes)
  if (targetIdx < currentIdx) return null;

  const ts = timestamp ?? new Date().toISOString();

  // If jumping stages, add intermediate milestones
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
export function getVehiclePipeline(dealerId: string): PipelineView {
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

  let totalVehicles = 0;
  let totalTimeToList = 0;
  let listedCount = 0;
  let totalTimeToDeliver = 0;
  let deliveredCount = 0;

  for (const v of vehicles.values()) {
    if (v.dealerId !== dealerId) continue;
    stages[v.currentStage].push(v);
    totalVehicles++;

    // Calculate time metrics
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
export function calculateTimeInStage(vin: string): number {
  const vehicle = vehicles.get(vin);
  if (!vehicle) return 0;

  const currentMilestone = vehicle.milestones.find(
    (m) => m.stage === vehicle.currentStage,
  );
  if (!currentMilestone) return 0;

  return daysBetween(currentMilestone.timestamp, new Date().toISOString());
}

/**
 * Flag vehicles stuck in a stage longer than the threshold.
 */
export function alertSlowMovers(
  dealerId: string,
  thresholdDays: number = 7,
): SlowMoverAlert[] {
  const alerts: SlowMoverAlert[] = [];

  for (const v of vehicles.values()) {
    if (v.dealerId !== dealerId) continue;
    // Skip terminal stages
    if (v.currentStage === "delivered" || v.currentStage === "sold") continue;

    const daysInStage = calculateTimeInStage(v.vin);
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
export function getVehicleStatus(vin: string): VehicleDeliveryStatus | null {
  return vehicles.get(vin) ?? null;
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  vehicles.clear();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysBetween(start: string, end: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / msPerDay,
  );
}
