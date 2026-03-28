"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Technician {
  id: string;
  name: string;
  employee_id: string;
  specialties: string[];
  certifications: string[];
  hourly_rate: number;
  status: "available" | "busy" | "off";
  phone: string;
  hire_date: string;
  active_ro_count: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  busy: "bg-yellow-100 text-yellow-800",
  off: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  busy: "Busy",
  off: "Off",
};

const STATUS_OPTIONS: Array<"available" | "busy" | "off"> = ["available", "busy", "off"];

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    employee_id: "",
    specialties: "",
    certifications: "",
    hourly_rate: "100.00",
    phone: "",
    hire_date: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/service/technicians");
      if (res.ok) {
        const data = await res.json();
        setTechnicians(data.technicians ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/service/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          employee_id: form.employee_id,
          specialties: form.specialties.split(",").map((s) => s.trim()).filter(Boolean),
          certifications: form.certifications.split(",").map((s) => s.trim()).filter(Boolean),
          hourly_rate: parseFloat(form.hourly_rate),
          phone: form.phone,
          hire_date: form.hire_date || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({
          name: "", employee_id: "", specialties: "", certifications: "",
          hourly_rate: "100.00", phone: "", hire_date: "",
        });
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(tech: Technician, newStatus: "available" | "busy" | "off") {
    setTogglingId(tech.id);
    try {
      const res = await fetch("/api/admin/service/technicians", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tech.id, status: newStatus }),
      });
      if (res.ok) {
        setTechnicians((prev) =>
          prev.map((t) => (t.id === tech.id ? { ...t, status: newStatus } : t)),
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Technicians</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage service technicians, certifications, and availability
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Technician
        </button>
      </div>

      {/* Add Technician Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Add New Technician</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name *</label>
              <input
                required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Employee ID</label>
              <input
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                placeholder="e.g. EMP-250"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Hourly Rate</label>
              <input
                type="number" step="0.01" value={form.hourly_rate}
                onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Hire Date</label>
              <input
                type="date" value={form.hire_date}
                onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Specialties <span className="text-gray-400 font-normal">(comma separated)</span>
            </label>
            <input
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              placeholder="e.g. Engine Diagnostics, Brakes, Electrical"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Certifications <span className="text-gray-400 font-normal">(comma separated)</span>
            </label>
            <input
              value={form.certifications}
              onChange={(e) => setForm({ ...form, certifications: e.target.value })}
              placeholder="e.g. ASE Master Technician, ASE A5 Brakes"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit" disabled={saving}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Add Technician"}
            </button>
            <button
              type="button" onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Technician List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : technicians.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">No technicians found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {technicians.map((tech) => (
            <div
              key={tech.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{tech.name}</h3>
                  <p className="text-sm text-gray-500">{tech.employee_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[tech.status]}`}
                  >
                    {STATUS_LABEL[tech.status]}
                  </span>
                  <select
                    value={tech.status}
                    onChange={(e) => toggleStatus(tech, e.target.value as "available" | "busy" | "off")}
                    disabled={togglingId === tech.id}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Specialties</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tech.specialties.map((s) => (
                      <span
                        key={s}
                        className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Certifications</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tech.certifications.map((c) => (
                      <span
                        key={c}
                        className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div className="text-sm text-gray-600">
                    Rate: <span className="font-semibold text-gray-900">{fmtCurrency(tech.hourly_rate)}/hr</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Active ROs: <span className="font-semibold text-gray-900">{tech.active_ro_count}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
