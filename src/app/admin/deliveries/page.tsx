"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DeliveryTracking {
  id: string;
  vehicleVin: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  status: string;
  slotDate: string;
  slotTime: string;
  fee: number;
  distanceMiles: number;
  createdAt: string;
  updatedAt: string;
}

interface DeliverySlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
  maxDeliveries: number;
  currentBookings: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    in_transit: "bg-purple-100 text-purple-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "Requested",
    confirmed: "Confirmed",
    in_transit: "In Transit",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryTracking[]>([]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deliveries");
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/deliveries?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots ?? []);
      }
    } catch {
      // swallow
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const activeCount = deliveries.filter((d) =>
    ["requested", "confirmed", "in_transit"].includes(d.status),
  ).length;
  const completedCount = deliveries.filter((d) => d.status === "delivered").length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store-to-Door Delivery</h1>
          <p className="mt-1 text-sm text-gray-500">
            Schedule and track vehicle deliveries to customer homes.
          </p>
        </div>
        <button
          onClick={() => setShowScheduleForm(!showScheduleForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Schedule Delivery
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Active Deliveries</p>
          <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-green-600">{completedCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{deliveries.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Available Slots Today</p>
          <p className="text-2xl font-bold text-gray-900">
            {slots.filter((s) => s.available).length}/{slots.length}
          </p>
        </div>
      </div>

      {/* Slot availability */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Slots</h2>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={`rounded-lg border p-3 text-center ${
                slot.available
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <p className="font-medium text-gray-900">
                {slot.startTime} - {slot.endTime}
              </p>
              <p className="text-xs text-gray-500">
                {slot.currentBookings}/{slot.maxDeliveries} booked
              </p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  slot.available
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {slot.available ? "Available" : "Full"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery queue */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Queue</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : deliveries.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No deliveries scheduled</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Vehicle</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deliveries.map((del) => (
                  <tr key={del.id} className="text-gray-900">
                    <td className="px-6 py-4">
                      <p className="font-medium">{del.customerName}</p>
                      <p className="text-xs text-gray-500">{del.customerPhone}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{del.vehicleVin}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate">{del.deliveryAddress}</td>
                    <td className="px-6 py-4">{del.slotDate}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(del.status)}`}>
                        {statusLabel(del.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {del.fee === 0 ? (
                        <span className="text-green-600 font-medium">Free</span>
                      ) : (
                        `$${del.fee}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
