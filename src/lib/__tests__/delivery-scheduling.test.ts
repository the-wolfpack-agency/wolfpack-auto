/**
 * Store-to-Door Delivery Scheduling tests.
 */

import {
  isValidTransition,
  calculateDeliveryFee,
  getAvailableSlots,
  scheduleDelivery,
  updateDeliveryStatus,
  getDeliveryHistory,
} from "@/lib/delivery-scheduling";

/* -------------------------------------------------------------------------- */
/*  Status transitions                                                         */
/* -------------------------------------------------------------------------- */

describe("isValidTransition", () => {
  it("allows requested -> confirmed", () => {
    expect(isValidTransition("requested", "confirmed")).toBe(true);
  });

  it("allows requested -> cancelled", () => {
    expect(isValidTransition("requested", "cancelled")).toBe(true);
  });

  it("allows confirmed -> in_transit", () => {
    expect(isValidTransition("confirmed", "in_transit")).toBe(true);
  });

  it("allows in_transit -> delivered", () => {
    expect(isValidTransition("in_transit", "delivered")).toBe(true);
  });

  it("rejects delivered -> anything", () => {
    expect(isValidTransition("delivered", "requested")).toBe(false);
    expect(isValidTransition("delivered", "cancelled")).toBe(false);
  });

  it("rejects cancelled -> anything", () => {
    expect(isValidTransition("cancelled", "requested")).toBe(false);
    expect(isValidTransition("cancelled", "confirmed")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(isValidTransition("requested", "delivered")).toBe(false);
    expect(isValidTransition("requested", "in_transit")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Fee calculation                                                            */
/* -------------------------------------------------------------------------- */

describe("calculateDeliveryFee", () => {
  it("calculates fee based on distance", () => {
    const fee = calculateDeliveryFee(20);
    expect(fee.baseFee).toBe(49);
    expect(fee.perMileFee).toBe(1.5);
    expect(fee.distanceMiles).toBe(20);
    expect(fee.totalFee).toBe(79); // 49 + 20 * 1.5
    expect(fee.freeDeliveryEligible).toBe(false);
  });

  it("provides free delivery for vehicles over $50k", () => {
    const fee = calculateDeliveryFee(30, 55000);
    expect(fee.totalFee).toBe(0);
    expect(fee.freeDeliveryEligible).toBe(true);
  });

  it("charges for vehicles under $50k threshold", () => {
    const fee = calculateDeliveryFee(10, 35000);
    expect(fee.totalFee).toBeGreaterThan(0);
    expect(fee.freeDeliveryEligible).toBe(false);
  });

  it("handles zero distance", () => {
    const fee = calculateDeliveryFee(0);
    expect(fee.totalFee).toBe(49); // base fee only
  });

  it("handles exact threshold", () => {
    const fee = calculateDeliveryFee(10, 50000);
    expect(fee.freeDeliveryEligible).toBe(true);
    expect(fee.totalFee).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Slot availability (shadow mode)                                            */
/* -------------------------------------------------------------------------- */

describe("getAvailableSlots", () => {
  it("returns slots for a date", async () => {
    delete process.env.DATABASE_URL;
    const slots = await getAvailableSlots("dealer-1", "2026-04-05");

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot).toHaveProperty("id");
      expect(slot).toHaveProperty("startTime");
      expect(slot).toHaveProperty("endTime");
      expect(slot).toHaveProperty("available");
      expect(slot).toHaveProperty("maxDeliveries");
    }
  });

  it("has some slots marked as unavailable in shadow mode", async () => {
    delete process.env.DATABASE_URL;
    const slots = await getAvailableSlots("dealer-1", "2026-04-05");
    const unavailable = slots.filter((s) => !s.available);
    expect(unavailable.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Booking (shadow mode)                                                      */
/* -------------------------------------------------------------------------- */

describe("scheduleDelivery", () => {
  it("creates a delivery with requested status", async () => {
    delete process.env.DATABASE_URL;
    const delivery = await scheduleDelivery(
      "dealer-1",
      {
        vehicleVin: "1FTFW1ET5DFC10312",
        customerId: "cust-1",
        customerName: "John Smith",
        customerPhone: "(555) 123-4567",
        deliveryAddress: "123 Oak St, Austin, TX",
        slotId: "2026-04-05-1300",
      },
      20,
    );

    expect(delivery.id).toMatch(/^del_/);
    expect(delivery.status).toBe("requested");
    expect(delivery.vehicleVin).toBe("1FTFW1ET5DFC10312");
    expect(delivery.customerName).toBe("John Smith");
    expect(delivery.fee).toBeGreaterThan(0);
  });

  it("gives free delivery for expensive vehicles", async () => {
    delete process.env.DATABASE_URL;
    const delivery = await scheduleDelivery(
      "dealer-1",
      {
        vehicleVin: "5YJ3E1EA1NF123456",
        customerId: "cust-2",
        customerName: "Jane Doe",
        customerPhone: "(555) 987-6543",
        deliveryAddress: "456 Elm Ave, Round Rock, TX",
        slotId: "2026-04-05-0900",
      },
      15,
      75000,
    );

    expect(delivery.fee).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Status updates                                                             */
/* -------------------------------------------------------------------------- */

describe("updateDeliveryStatus", () => {
  it("allows valid transition", async () => {
    delete process.env.DATABASE_URL;
    const result = await updateDeliveryStatus("del_001", "confirmed", "requested");
    expect(result.success).toBe(true);
  });

  it("rejects invalid transition", async () => {
    const result = await updateDeliveryStatus("del_001", "delivered", "requested");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });
});

/* -------------------------------------------------------------------------- */
/*  Delivery history (shadow mode)                                             */
/* -------------------------------------------------------------------------- */

describe("getDeliveryHistory", () => {
  it("returns demo deliveries when no DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const deliveries = await getDeliveryHistory("dealer-1");

    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0]).toHaveProperty("id");
    expect(deliveries[0]).toHaveProperty("status");
    expect(deliveries[0]).toHaveProperty("customerName");
    expect(deliveries[0]).toHaveProperty("vehicleVin");
  });

  it("has deliveries in various statuses", async () => {
    delete process.env.DATABASE_URL;
    const deliveries = await getDeliveryHistory("dealer-1");
    const statuses = new Set(deliveries.map((d) => d.status));
    expect(statuses.size).toBeGreaterThan(1);
  });
});
