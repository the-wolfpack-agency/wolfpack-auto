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
    confirmed: "bg-brand-100 text-brand-900",
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleVin: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
    slotId: "",
    distanceMiles: "",
    vehiclePrice: "",
    notes: "",
  });

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

  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!form.vehicleVin || !form.customerId || !form.customerName || !form.deliveryAddress || !form.slotId) {
      setSubmitError("VIN, customer ID, customer name, address, and slot are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleVin: form.vehicleVin,
          customerId: form.customerId,
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          deliveryAddress: form.deliveryAddress,
          slotId: form.slotId,
          distanceMiles: form.distanceMiles ? Number(form.distanceMiles) : undefined,
          vehiclePrice: form.vehiclePrice ? Number(form.vehiclePrice) : undefined,
          notes: form.notes || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body.error ?? `Failed (${res.status})`);
        return;
      }
      setShowScheduleForm(false);
      setForm({
        vehicleVin: "",
        customerId: "",
        customerName: "",
        customerPhone: "",
        deliveryAddress: "",
        slotId: "",
        distanceMiles: "",
        vehiclePrice: "",
        notes: "",
      });
      await Promise.all([fetchDeliveries(), fetchSlots()]);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

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
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          Schedule Delivery
        </button>
      </div>

      {/* Schedule form (toggled by the header button) */}
      {showScheduleForm && (
        <form
          onSubmit={submitSchedule}
          className="rounded-lg border border-gray-200 bg-white p-6 space-y-4"
          data-testid="schedule-delivery-form"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">New Delivery</h2>
            <button
              type="button"
              onClick={() => setShowScheduleForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Vehicle VIN *</span>
              <input
                type="text"
                value={form.vehicleVin}
                onChange={(e) => setForm({ ...form, vehicleVin: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Customer ID *</span>
              <input
                type="text"
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Customer Name *</span>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Customer Phone</span>
              <input
                type="tel"
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block font-medium text-gray-700 mb-1">Delivery Address *</span>
              <input
                type="text"
                value={form.deliveryAddress}
                onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Delivery Slot *</span>
              <select
                value={form.slotId}
                onChange={(e) => setForm({ ...form, slotId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Choose a slot…</option>
                {slots.filter((s) => s.available).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.startTime} – {s.endTime} ({s.maxDeliveries - s.currentBookings} open)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Distance (mi)</span>
              <input
                type="number"
                min="0"
                value={form.distanceMiles}
                onChange={(e) => setForm({ ...form, distanceMiles: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium text-gray-700 mb-1">Vehicle Price ($)</span>
              <input
                type="number"
                min="0"
                value={form.vehiclePrice}
                onChange={(e) => setForm({ ...form, vehiclePrice: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block font-medium text-gray-700 mb-1">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {submitting ? "Scheduling…" : "Confirm Delivery"}
          </button>
        </form>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Active Deliveries</p>
          <p className="text-2xl font-bold text-brand-700">{activeCount}</p>
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
