"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface WebhookConfigWithStats {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  created_at: string;
  stats: {
    total_deliveries: number;
    delivered: number;
    failed: number;
    success_rate: number;
    last_delivery: string | null;
    last_status: string | null;
  };
}

interface WebhookDelivery {
  id: string;
  webhook_config_id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  status_code: number | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Event catalog                                                              */
/* -------------------------------------------------------------------------- */

const AVAILABLE_EVENTS = [
  "lead.created",
  "lead.duplicate_detected",
  "deal.created",
  "deal.presented",
  "deal.accepted",
  "deal.funded",
  "service.appointment_created",
  "service.appointment_completed",
  "service.ro_completed",
  "review.received",
  "comms.message_sent",
  "document.uploaded",
  "credit.pulled",
  "compliance.check_run",
];

/* -------------------------------------------------------------------------- */
/* Style helpers                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  delivered: "bg-green-100 text-green-800 ring-green-500/30",
  failed: "bg-red-100 text-red-800 ring-red-500/30",
  pending: "bg-yellow-100 text-yellow-800 ring-yellow-500/30",
};

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfigWithStats[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const [configsRes, deliveriesRes] = await Promise.all([
        fetch("/api/admin/webhooks"),
        fetch(`/api/admin/webhooks/deliveries${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
      ]);
      if (configsRes.ok) {
        const data = await configsRes.json();
        setConfigs(data.configs ?? []);
      }
      if (deliveriesRes.ok) {
        const data = await deliveriesRes.json();
        setDeliveries(data.deliveries ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    const events = selectAll ? ["*"] : Array.from(selectedEvents);
    if (!newUrl || events.length === 0) return;

    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          events,
          description: newDescription || undefined,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewUrl("");
        setNewDescription("");
        setSelectedEvents(new Set());
        setSelectAll(false);
        fetchData();
      }
    } catch {
      // swallow
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/admin/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      fetchData();
    } catch {
      // swallow
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook config?")) return;
    try {
      await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      fetchData();
    } catch {
      // swallow
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await fetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
      setTimeout(() => fetchData(), 1000);
    } catch {
      // swallow
    } finally {
      setTestingId(null);
    }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  const totalDelivered = configs.reduce((s, c) => s + c.stats.delivered, 0);
  const totalFailed = configs.reduce((s, c) => s + c.stats.failed, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Push real-time platform events to your CRM, accounting, or any external system.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showAddForm ? "Cancel" : "Add Webhook"}
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Active Configs" value={configs.filter((c) => c.active).length} />
        <StatCard label="Total Configs" value={configs.length} />
        <StatCard label="Delivered" value={totalDelivered} color="text-green-600" />
        <StatCard label="Failed" value={totalFailed} color={totalFailed > 0 ? "text-red-600" : "text-gray-900"} />
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">New Webhook</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">URL</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://your-crm.com/webhooks"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="CRM lead sync"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Events</label>
              <div className="mt-2 space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={(e) => {
                      setSelectAll(e.target.checked);
                      if (e.target.checked) setSelectedEvents(new Set());
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="font-medium">All events (*)</span>
                </label>
                {!selectAll && (
                  <div className="ml-4 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {AVAILABLE_EVENTS.map((evt) => (
                      <label key={evt} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(evt)}
                          onChange={() => toggleEvent(evt)}
                          className="rounded border-gray-300"
                        />
                        {evt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!newUrl || (!selectAll && selectedEvents.size === 0)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Create Webhook
            </button>
          </div>
        </div>
      )}

      {/* Configs list */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Webhook Configurations</h2>
        {configs.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No webhook configs yet. Add one to start receiving events.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${config.active ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {config.url}
                      </p>
                    </div>
                    {config.description && (
                      <p className="mt-1 text-xs text-gray-500">{config.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {config.events.map((evt) => (
                        <span
                          key={evt}
                          className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      {config.stats.total_deliveries} deliveries | {config.stats.success_rate}% success
                      {config.stats.last_delivery && ` | Last: ${formatDate(config.stats.last_delivery)}`}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <button
                      onClick={() => handleTest(config.id)}
                      disabled={testingId === config.id}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testingId === config.id ? "Sending..." : "Test"}
                    </button>
                    <button
                      onClick={() => handleToggle(config.id, config.active)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                        config.active
                          ? "border border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                          : "border border-green-300 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {config.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deliveries */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Deliveries</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        {deliveries.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No deliveries yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Event</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Attempts</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{d.event}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[d.status] ?? ""}`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{d.status_code ?? "--"}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{d.attempts}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{formatDate(d.created_at)}</td>
                    <td className="px-4 py-2 text-sm text-red-600 truncate max-w-[200px]">
                      {d.error_message ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Event catalog reference */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Available Events</h2>
        <p className="mt-1 text-sm text-gray-500">
          Subscribe to any of these events. Use &quot;*&quot; to receive all events.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Event</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">When it fires</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Payload includes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { event: "lead.created", when: "New lead submitted", payload: "first_name, last_name, email, phone, vehicle_interest, source" },
                { event: "lead.duplicate_detected", when: "Duplicate lead blocked", payload: "original_lead_id, email" },
                { event: "deal.created", when: "New deal worksheet", payload: "vehicle_vin, selling_price, deal_type" },
                { event: "deal.presented", when: "Deal presented to customer", payload: "deal_id, monthly_payment" },
                { event: "deal.accepted", when: "Customer accepted deal", payload: "deal_id, total_gross" },
                { event: "deal.funded", when: "Deal funded by lender", payload: "deal_id, funded_amount" },
                { event: "service.appointment_created", when: "New service booking", payload: "customer_name, vehicle, service_type, scheduled_at" },
                { event: "service.appointment_completed", when: "Service completed", payload: "appointment_id, duration" },
                { event: "service.ro_completed", when: "Repair order completed", payload: "ro_number, grand_total" },
                { event: "review.received", when: "New review posted", payload: "platform, rating, reviewer_name" },
                { event: "comms.message_sent", when: "Message sent", payload: "channel, recipient, template" },
                { event: "document.uploaded", when: "Document uploaded", payload: "doc_type, name" },
                { event: "credit.pulled", when: "Credit report pulled", payload: "bureau, score" },
                { event: "compliance.check_run", when: "Compliance check executed", payload: "check_type, result" },
              ].map((row) => (
                <tr key={row.event} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-blue-700">{row.event}</td>
                  <td className="px-3 py-2 text-gray-600">{row.when}</td>
                  <td className="px-3 py-2 text-gray-500">{row.payload}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
