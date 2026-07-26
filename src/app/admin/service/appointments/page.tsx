"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string;
  service_type: string;
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_min: number;
  status: string;
  assigned_technician: string | null;
  advisor: string;
  notes: string;
}

interface Technician {
  id: string;
  name: string;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-brand-100 text-brand-900",
  checked_in: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
  no_show: "bg-red-100 text-red-700",
};

const SERVICE_TYPES = [
  { value: "oil_change", label: "Oil Change" },
  { value: "brake_service", label: "Brake Service" },
  { value: "tire_rotation", label: "Tire Rotation" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "scheduled_maintenance", label: "Scheduled Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "recall", label: "Recall" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
];

const STATUSES = ["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"];

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [techFilter, setTechFilter] = useState("");

  // Form state
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    vehicle_year: "",
    vehicle_make: "",
    vehicle_model: "",
    vin: "",
    service_type: "oil_change",
    description: "",
    scheduled_date: "",
    scheduled_time: "09:00",
    estimated_duration_min: "60",
    assigned_technician: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (techFilter) params.set("technician", techFilter);

      const [apptRes, techRes] = await Promise.all([
        fetch(`/api/admin/service/appointments?${params}`),
        fetch("/api/admin/service/technicians"),
      ]);

      if (apptRes.ok) {
        const data = await apptRes.json();
        setAppointments(data.appointments ?? []);
      }
      if (techRes.ok) {
        const data = await techRes.json();
        setTechnicians(data.technicians ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFilter, techFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/service/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year, 10) : null,
          estimated_duration_min: parseInt(form.estimated_duration_min, 10),
          assigned_technician: form.assigned_technician || null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({
          customer_name: "", customer_phone: "", customer_email: "",
          vehicle_year: "", vehicle_make: "", vehicle_model: "", vin: "",
          service_type: "oil_change", description: "",
          scheduled_date: "", scheduled_time: "09:00",
          estimated_duration_min: "60", assigned_technician: "", notes: "",
        });
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  // Group by date
  const grouped = appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
    const d = appt.scheduled_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(appt);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage service appointments and scheduling
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Appointment
        </button>
      </div>

      {/* New Appointment Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
        >
          <h2 className="text-lg font-semibold text-gray-900">New Appointment</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
              <input
                required value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email" value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Vehicle Year</label>
              <input
                type="number" value={form.vehicle_year}
                onChange={(e) => setForm({ ...form, vehicle_year: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Vehicle Make</label>
              <input
                value={form.vehicle_make}
                onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Vehicle Model</label>
              <input
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">VIN</label>
              <input
                value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                maxLength={17}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Service Type</label>
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {SERVICE_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Date *</label>
              <input
                type="date" required value={form.scheduled_date}
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Time *</label>
              <input
                type="time" required value={form.scheduled_time}
                onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Duration (min)</label>
              <input
                type="number" value={form.estimated_duration_min}
                onChange={(e) => setForm({ ...form, estimated_duration_min: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Assign Technician</label>
              <select
                value={form.assigned_technician}
                onChange={(e) => setForm({ ...form, assigned_technician: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Create Appointment"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <input
          type="date" value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          placeholder="Filter by date"
        />
        <select
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Technicians</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
        {(statusFilter || dateFilter || techFilter) && (
          <button
            onClick={() => { setStatusFilter(""); setDateFilter(""); setTechFilter(""); }}
            className="text-sm text-brand-600 hover:text-brand-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Appointment List — grouped by date */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">No appointments found matching your filters.</p>
        </div>
      ) : (
        sortedDates.map((date) => (
          <div key={date} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              {formatDate(date)}
            </h3>
            <div className="space-y-3">
              {grouped[date]
                .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                .map((appt) => (
                  <div
                    key={appt.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-semibold text-gray-900">
                            {formatTime(appt.scheduled_time)}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[appt.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {appt.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          <span className="text-xs text-gray-400">
                            {appt.estimated_duration_min} min
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-800">
                          {appt.customer_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {appt.vehicle_year} {appt.vehicle_make} {appt.vehicle_model}
                          {appt.vin && (
                            <span className="ml-2 font-mono text-xs text-gray-400">{appt.vin}</span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {SERVICE_TYPES.find((s) => s.value === appt.service_type)?.label ?? appt.service_type}
                          {appt.description && ` — ${appt.description}`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-sm text-gray-500 shrink-0">
                        <span>Tech: {appt.assigned_technician ?? "Unassigned"}</span>
                        <span>Advisor: {appt.advisor}</span>
                      </div>
                    </div>
                    {appt.notes && (
                      <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        {appt.notes}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
