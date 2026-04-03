/**
 * Store-to-Door Delivery Scheduling — Book, track, and manage vehicle deliveries.
 *
 * Handles delivery slot availability, booking, status tracking, and
 * distance-based fee calculation for home delivery service.
 */

import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DeliveryStatus =
  | "requested"
  | "confirmed"
  | "in_transit"
  | "delivered"
  | "cancelled";

export interface DeliverySlot {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  available: boolean;
  maxDeliveries: number;
  currentBookings: number;
}

export interface DeliveryRequest {
  vehicleVin: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  slotId: string;
  notes?: string;
}

export interface DeliveryTracking {
  id: string;
  dealerId: string;
  vehicleVin: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  status: DeliveryStatus;
  slotDate: string;
  slotTime: string;
  fee: number;
  distanceMiles: number;
  createdAt: string;
  updatedAt: string;
  statusHistory: { status: DeliveryStatus; timestamp: string; note?: string }[];
}

export interface DeliveryFee {
  baseFee: number;
  perMileFee: number;
  distanceMiles: number;
  totalFee: number;
  freeDeliveryEligible: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Status transition validation                                               */
/* -------------------------------------------------------------------------- */

const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/* -------------------------------------------------------------------------- */
/*  Fee calculation                                                            */
/* -------------------------------------------------------------------------- */

const BASE_FEE = 49;
const PER_MILE_FEE = 1.5;
const FREE_DELIVERY_THRESHOLD = 50_000; // vehicle price threshold for free delivery

/**
 * Calculate delivery fee based on distance.
 * Vehicles over $50k get free delivery.
 */
export function calculateDeliveryFee(
  distanceMiles: number,
  vehiclePrice = 0,
): DeliveryFee {
  const freeDeliveryEligible = vehiclePrice >= FREE_DELIVERY_THRESHOLD;

  if (freeDeliveryEligible) {
    return {
      baseFee: 0,
      perMileFee: 0,
      distanceMiles,
      totalFee: 0,
      freeDeliveryEligible: true,
    };
  }

  const totalFee = Math.round((BASE_FEE + distanceMiles * PER_MILE_FEE) * 100) / 100;

  return {
    baseFee: BASE_FEE,
    perMileFee: PER_MILE_FEE,
    distanceMiles,
    totalFee,
    freeDeliveryEligible: false,
  };
}

/* -------------------------------------------------------------------------- */
/*  Slot availability                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generate available delivery slots for a given date.
 * In production, this queries the database for existing bookings.
 */
export async function getAvailableSlots(
  dealerId: string,
  date: string,
): Promise<DeliverySlot[]> {
  trackSystem("system.vehicle_updated" as any, dealerId, {
    action: "delivery_slots_checked",
    date,
  });

  const slots: DeliverySlot[] = [
    { id: `${date}-0900`, date, startTime: "09:00", endTime: "11:00", available: true, maxDeliveries: 3, currentBookings: 0 },
    { id: `${date}-1100`, date, startTime: "11:00", endTime: "13:00", available: true, maxDeliveries: 3, currentBookings: 0 },
    { id: `${date}-1300`, date, startTime: "13:00", endTime: "15:00", available: true, maxDeliveries: 3, currentBookings: 0 },
    { id: `${date}-1500`, date, startTime: "15:00", endTime: "17:00", available: true, maxDeliveries: 3, currentBookings: 0 },
    { id: `${date}-1700`, date, startTime: "17:00", endTime: "19:00", available: true, maxDeliveries: 2, currentBookings: 0 },
  ];

  if (!process.env.DATABASE_URL) {
    // Shadow mode — mark some slots as partially booked
    slots[1].currentBookings = 2;
    slots[3].currentBookings = 3;
    slots[3].available = false;
    return slots;
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT slot_id, COUNT(*) AS bookings
     FROM deliveries
     WHERE dealer_id = $1 AND slot_date = $2 AND status != 'cancelled'
     GROUP BY slot_id`,
    [dealerId, date],
  );

  for (const row of result.rows as { slot_id: string; bookings: string }[]) {
    const slot = slots.find((s) => s.id === row.slot_id);
    if (slot) {
      slot.currentBookings = Number(row.bookings);
      slot.available = slot.currentBookings < slot.maxDeliveries;
    }
  }

  return slots;
}

/* -------------------------------------------------------------------------- */
/*  Booking                                                                    */
/* -------------------------------------------------------------------------- */

export async function scheduleDelivery(
  dealerId: string,
  request: DeliveryRequest,
  distanceMiles: number,
  vehiclePrice = 0,
): Promise<DeliveryTracking> {
  const fee = calculateDeliveryFee(distanceMiles, vehiclePrice);
  const now = new Date().toISOString();

  const delivery: DeliveryTracking = {
    id: `del_${Date.now()}`,
    dealerId,
    vehicleVin: request.vehicleVin,
    customerId: request.customerId,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    deliveryAddress: request.deliveryAddress,
    status: "requested",
    slotDate: request.slotId.split("-").slice(0, 3).join("-"),
    slotTime: request.slotId.split("-").pop() ?? "0900",
    fee: fee.totalFee,
    distanceMiles,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "requested", timestamp: now }],
  };

  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO deliveries (id, dealer_id, vehicle_vin, customer_id, customer_name, customer_phone,
         delivery_address, status, slot_date, slot_time, fee, distance_miles, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        delivery.id, dealerId, request.vehicleVin, request.customerId,
        request.customerName, request.customerPhone, request.deliveryAddress,
        "requested", delivery.slotDate, delivery.slotTime, fee.totalFee,
        distanceMiles, now, now,
      ],
    );
  }

  return delivery;
}

/* -------------------------------------------------------------------------- */
/*  Status updates                                                             */
/* -------------------------------------------------------------------------- */

export async function updateDeliveryStatus(
  deliveryId: string,
  newStatus: DeliveryStatus,
  currentStatus: DeliveryStatus,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidTransition(currentStatus, newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
    };
  }

  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE deliveries SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, deliveryId],
    );
  }

  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*  Delivery history                                                           */
/* -------------------------------------------------------------------------- */

export async function getDeliveryHistory(
  dealerId: string,
): Promise<DeliveryTracking[]> {
  if (!process.env.DATABASE_URL) {
    const now = Date.now();
    return [
      {
        id: "del_001",
        dealerId,
        vehicleVin: "1FTFW1ET5DFC10312",
        customerId: "cust_001",
        customerName: "John Smith",
        customerPhone: "(555) 123-4567",
        deliveryAddress: "123 Oak Street, Austin, TX 78701",
        status: "delivered",
        slotDate: new Date(now - 172800_000).toISOString().split("T")[0],
        slotTime: "1300",
        fee: 79,
        distanceMiles: 20,
        createdAt: new Date(now - 259200_000).toISOString(),
        updatedAt: new Date(now - 172800_000).toISOString(),
        statusHistory: [
          { status: "requested", timestamp: new Date(now - 259200_000).toISOString() },
          { status: "confirmed", timestamp: new Date(now - 230400_000).toISOString() },
          { status: "in_transit", timestamp: new Date(now - 176400_000).toISOString() },
          { status: "delivered", timestamp: new Date(now - 172800_000).toISOString() },
        ],
      },
      {
        id: "del_002",
        dealerId,
        vehicleVin: "5YJ3E1EA1NF123456",
        customerId: "cust_002",
        customerName: "Sarah Johnson",
        customerPhone: "(555) 987-6543",
        deliveryAddress: "456 Elm Ave, Round Rock, TX 78664",
        status: "in_transit",
        slotDate: new Date(now).toISOString().split("T")[0],
        slotTime: "1100",
        fee: 0,
        distanceMiles: 15,
        createdAt: new Date(now - 86400_000).toISOString(),
        updatedAt: new Date(now - 3600_000).toISOString(),
        statusHistory: [
          { status: "requested", timestamp: new Date(now - 86400_000).toISOString() },
          { status: "confirmed", timestamp: new Date(now - 43200_000).toISOString() },
          { status: "in_transit", timestamp: new Date(now - 3600_000).toISOString() },
        ],
      },
      {
        id: "del_003",
        dealerId,
        vehicleVin: "WBAPH5C55BA271232",
        customerId: "cust_003",
        customerName: "Mike Davis",
        customerPhone: "(555) 456-7890",
        deliveryAddress: "789 Pine Rd, Cedar Park, TX 78613",
        status: "confirmed",
        slotDate: new Date(now + 86400_000).toISOString().split("T")[0],
        slotTime: "0900",
        fee: 94,
        distanceMiles: 30,
        createdAt: new Date(now - 43200_000).toISOString(),
        updatedAt: new Date(now - 21600_000).toISOString(),
        statusHistory: [
          { status: "requested", timestamp: new Date(now - 43200_000).toISOString() },
          { status: "confirmed", timestamp: new Date(now - 21600_000).toISOString() },
        ],
      },
    ];
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT * FROM deliveries WHERE dealer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [dealerId],
  );

  return result.rows as DeliveryTracking[];
}
