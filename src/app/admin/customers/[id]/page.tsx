"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PurchaseRecord {
  id: string;
  date: string;
  vehicle: string;
  vin: string;
  sale_price: number;
  deal_type: string;
  salesperson: string;
}

interface ServiceRecord {
  id: string;
  date: string;
  vin: string;
  vehicle: string;
  description: string;
  cost: number;
  status: "completed" | "scheduled" | "in_progress";
}

interface CommRecord {
  id: string;
  date: string;
  channel: "email" | "sms" | "phone" | "in_person";
  subject: string;
  sent_by: string;
  status: string;
}

interface ActivitySignal {
  type: string;
  label: string;
  value: string | number;
  timestamp: string;
}

interface TimelineEntry {
  id: string;
  date: string;
  type: "lead" | "communication" | "appointment" | "purchase" | "service" | "activity";
  title: string;
  description: string;
}

interface Customer360 {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  customer_since: string;
  lead_score: number;
  lifetime_value: number;
  vehicles_purchased: number;
  last_visit: string;
  purchases: PurchaseRecord[];
  service_history: ServiceRecord[];
  communications: CommRecord[];
  activity: ActivitySignal[];
  timeline: TimelineEntry[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const CHANNEL_BADGE: Record<string, string> = {
  email: "bg-brand-100 text-brand-800",
  sms: "bg-green-100 text-green-700",
  phone: "bg-purple-100 text-purple-700",
  in_person: "bg-orange-100 text-orange-700",
};

const SERVICE_STATUS_BADGE: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  scheduled: "bg-brand-100 text-brand-800",
  in_progress: "bg-yellow-100 text-yellow-700",
};

const TIMELINE_COLORS: Record<string, string> = {
  lead: "bg-brand-600",
  communication: "bg-purple-500",
  appointment: "bg-orange-500",
  purchase: "bg-green-500",
  service: "bg-yellow-500",
  activity: "bg-gray-400",
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function Customer360Page() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "deals" | "service" | "communications" | "activity">("overview");

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ customer?: Customer360 | null }>(`/api/admin/customers/${customerId}`);
      setCustomer(data.customer ?? null);
    } catch {
      setError("Failed to load customer data.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading customer profile...</div>;
  }

  if (error || !customer) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-red-600">{error || "Customer not found."}</p>
        <a href="/admin/customers" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          Back to Customers
        </a>
      </div>
    );
  }

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "deals" as const, label: `Deals (${customer.purchases.length})` },
    { key: "service" as const, label: `Service (${customer.service_history.length})` },
    { key: "communications" as const, label: `Comms (${customer.communications.length})` },
    { key: "activity" as const, label: "Activity" },
  ];

  return (
    <div>
      {/* Back link */}
      <a href="/admin/customers" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        &larr; All Customers
      </a>

      {/* Customer Header */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
              {customer.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
              <div className="mt-0.5 flex flex-wrap gap-3 text-sm text-gray-500">
                <span>{customer.email}</span>
                <span>{customer.phone}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">Customer since {formatDate(customer.customer_since)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`mailto:${customer.email}`}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Email
            </a>
            <a
              href={`tel:${customer.phone}`}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Call
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content area */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">Lifetime Value</p>
                  <p className="mt-0.5 text-xl font-bold text-brand-700">{usd(customer.lifetime_value)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">Vehicles Purchased</p>
                  <p className="mt-0.5 text-xl font-bold text-gray-900">{customer.vehicles_purchased}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">Last Visit</p>
                  <p className="mt-0.5 text-xl font-bold text-gray-900">{formatDate(customer.last_visit)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">Lead Score</p>
                  <p className={`mt-0.5 text-xl font-bold ${customer.lead_score >= 80 ? "text-green-600" : customer.lead_score >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {customer.lead_score}
                  </p>
                </div>
              </div>

              {/* Quick summary of recent activity */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Purchases</h3>
                {customer.purchases.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.vehicle}</p>
                      <p className="text-xs text-gray-500">{formatDate(p.date)} &middot; {p.salesperson}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{usd(p.sale_price)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deals Tab */}
          {activeTab === "deals" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">VIN</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Salesperson</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customer.purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(p.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.vehicle}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono hidden sm:table-cell">{p.vin}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{usd(p.sale_price)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{p.salesperson}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Service Tab */}
          {activeTab === "service" && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customer.service_history.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(s.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.vehicle}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell max-w-xs truncate">{s.description}</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                        {s.cost > 0 ? usd(s.cost) : "Free"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SERVICE_STATUS_BADGE[s.status]}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Communications Tab */}
          {activeTab === "communications" && (
            <div className="space-y-2">
              {customer.communications.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                  No communications recorded.
                </div>
              ) : (
                customer.communications.map((comm) => (
                  <div key={comm.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CHANNEL_BADGE[comm.channel]}`}>
                      {comm.channel}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{comm.subject}</p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(comm.date)} &middot; {comm.sent_by} &middot;{" "}
                        <span className="capitalize">{comm.status}</span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <div className="space-y-3">
              {customer.activity.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                  No behavioral data available.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customer.activity.map((signal, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500">{signal.label}</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">{signal.value}</p>
                      <p className="text-[10px] text-gray-400">{formatDateTime(signal.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timeline Sidebar */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm self-start">
          <h2 className="mb-4 text-sm font-semibold text-gray-800">Timeline</h2>
          {customer.timeline.length === 0 ? (
            <p className="text-xs text-gray-400">No timeline events.</p>
          ) : (
            <div className="space-y-4">
              {customer.timeline.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full ${TIMELINE_COLORS[entry.type] ?? "bg-gray-400"}`} />
                    <div className="flex-1 w-px bg-gray-200" />
                  </div>
                  <div className="pb-4">
                    <p className="text-xs text-gray-400">{formatDateTime(entry.date)}</p>
                    <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{entry.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
