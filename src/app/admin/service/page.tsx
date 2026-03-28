"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Appointment {
  id: string;
  customer_name: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  service_type: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_min: number;
  status: string;
  assigned_technician: string | null;
  advisor: string;
}

interface Part {
  id: string;
  name: string;
  qty_on_hand: number;
  reorder_point: number;
}

interface RepairOrder {
  id: string;
  ro_number: string;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  checked_in: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
  no_show: "bg-red-100 text-red-700",
};

const SERVICE_LABELS: Record<string, string> = {
  oil_change: "Oil Change",
  brake_service: "Brake Service",
  tire_rotation: "Tire Rotation",
  diagnostic: "Diagnostic",
  scheduled_maintenance: "Scheduled Maint.",
  repair: "Repair",
  recall: "Recall",
  inspection: "Inspection",
  other: "Other",
};

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ServiceDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [ros, setRos] = useState<RepairOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apptRes, partsRes, roRes] = await Promise.all([
        fetch(`/api/admin/service/appointments?date=${today()}`),
        fetch("/api/admin/service/parts?low_stock=true"),
        fetch("/api/admin/service/repair-orders"),
      ]);

      if (apptRes.ok) {
        const data = await apptRes.json();
        setAppointments(data.appointments ?? []);
      }
      if (partsRes.ok) {
        const data = await partsRes.json();
        setParts(data.parts ?? []);
      }
      if (roRes.ok) {
        const data = await roRes.json();
        setRos(data.repair_orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openROs = ros.filter((ro) =>
    ["open", "in_progress", "waiting_parts", "waiting_approval"].includes(ro.status),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Service Department
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/admin/service/appointments"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Appointment
          </a>
          <a
            href="/admin/service/repair-orders"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            New RO
          </a>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Appointments Today</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">
            {loading ? "..." : appointments.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Open Repair Orders</p>
          <p className="mt-1 text-3xl font-bold text-orange-600">
            {loading ? "..." : openROs.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Parts Low Stock</p>
          <p className="mt-1 text-3xl font-bold text-red-600">
            {loading ? "..." : parts.length}
          </p>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Schedule</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        ) : appointments.length === 0 ? (
          <p className="px-6 py-10 text-center text-gray-500">
            No appointments scheduled for today.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3 hidden sm:table-cell">Vehicle</th>
                  <th className="px-6 py-3 hidden md:table-cell">Service</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 hidden lg:table-cell">Technician</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {appointments
                  .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                  .map((appt) => (
                    <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                        {formatTime(appt.scheduled_time)}
                        <span className="ml-1 text-xs text-gray-400">
                          ({appt.estimated_duration_min}m)
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{appt.customer_name}</td>
                      <td className="hidden px-6 py-4 text-gray-600 sm:table-cell">
                        {appt.vehicle_year} {appt.vehicle_make} {appt.vehicle_model}
                      </td>
                      <td className="hidden px-6 py-4 text-gray-600 md:table-cell">
                        {SERVICE_LABELS[appt.service_type] ?? appt.service_type}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[appt.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {appt.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </td>
                      <td className="hidden px-6 py-4 text-gray-600 lg:table-cell">
                        {appt.assigned_technician ?? "Unassigned"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { href: "/admin/service/appointments", label: "Appointments", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
          { href: "/admin/service/repair-orders", label: "Repair Orders", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
          { href: "/admin/service/parts", label: "Parts Inventory", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
          { href: "/admin/service/technicians", label: "Technicians", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition-all"
          >
            <svg className="h-8 w-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={link.icon} />
            </svg>
            <span className="text-sm font-medium text-gray-700">{link.label}</span>
          </a>
        ))}
      </div>

      {/* Low Stock Alert */}
      {parts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Low Stock Parts ({parts.length})
          </h3>
          <div className="mt-3 space-y-2">
            {parts.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-red-700">{p.name}</span>
                <span className="font-medium text-red-800">
                  {p.qty_on_hand} / {p.reorder_point} min
                </span>
              </div>
            ))}
            {parts.length > 5 && (
              <a
                href="/admin/service/parts?low_stock=true"
                className="block text-sm font-medium text-red-700 underline"
              >
                View all {parts.length} low-stock items
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
