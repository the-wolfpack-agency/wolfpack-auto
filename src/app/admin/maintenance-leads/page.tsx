"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Lead {
  id: string;
  vin: string;
  customer_id: string;
  lead_type: string;
  urgency: "immediate" | "soon" | "scheduled" | "monitoring";
  confidence: number;
  evidence_event_ids: string[];
  suggested_action: string;
  estimated_revenue_cents: number;
  status: "open" | "contacted" | "scheduled" | "completed" | "dismissed";
  created_at: string;
}

const URGENCY_GROUPS: Array<{
  key: Lead["urgency"];
  title: string;
  blurb: string;
}> = [
  { key: "immediate", title: "Right now", blurb: "Reach out today." },
  { key: "soon", title: "This week", blurb: "Schedule a service visit." },
  {
    key: "scheduled",
    title: "Already on the books",
    blurb: "Visit confirmed.",
  },
  {
    key: "monitoring",
    title: "Keep an eye on these",
    blurb: "No action yet — alert if it gets worse.",
  },
];

const LEAD_TYPE_LABEL: Record<string, string> = {
  oil_change: "Oil change",
  brake_service: "Brake service",
  tire_replacement: "Tire replacement",
  battery_replacement: "Battery replacement",
  recall: "Open recall",
  general_dtc: "Check-engine light",
  mileage_milestone: "Mileage milestone",
};

function formatRevenue(cents: number): string {
  if (cents <= 0) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export default function MaintenanceLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/maintenance-leads?status=open");
      if (!r.ok) {
        setError("Couldn't load leads — check your connection.");
        setLeads([]);
        return;
      }
      const data = (await r.json()) as { leads?: Lead[] };
      setLeads(data.leads ?? []);
      setError(null);
    } catch {
      setError("Couldn't load leads — check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAction = useCallback(
    async (
      leadId: string,
      action: "complete" | "dismiss",
      payload: Record<string, string>,
    ) => {
      setWorking(leadId);
      try {
        const r = await fetch(
          `/api/admin/maintenance-leads/${leadId}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (r.ok) {
          // Optimistically remove from the open list.
          setLeads((prev) => prev.filter((l) => l.id !== leadId));
        }
      } finally {
        setWorking(null);
      }
    },
    [],
  );

  const grouped = useMemo(() => {
    const out: Record<Lead["urgency"], Lead[]> = {
      immediate: [],
      soon: [],
      scheduled: [],
      monitoring: [],
    };
    for (const l of leads) out[l.urgency]?.push(l);
    return out;
  }, [leads]);

  if (loading) {
    return (
      <main className="p-6" data-testid="maintenance-leads-page">
        <h1 className="text-2xl font-semibold">Predictive maintenance</h1>
        <p className="mt-4 text-sm text-gray-500">Loading leads...</p>
      </main>
    );
  }

  return (
    <main
      className="p-4 sm:p-6 max-w-6xl mx-auto"
      data-testid="maintenance-leads-page"
    >
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold">
          Predictive maintenance
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600">
          Cars on the road are telling us when they need service. Reach out
          before the customer notices.
        </p>
      </header>

      {error && (
        <div
          className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {leads.length === 0 && (
        <div
          data-testid="maintenance-leads-empty"
          className="rounded border border-gray-200 bg-gray-50 p-6 text-center"
        >
          <h2 className="text-lg font-medium">No leads to act on right now</h2>
          <p className="mt-1 text-sm text-gray-600">
            Connected vehicles are quiet. We&apos;ll let you know when one needs
            attention.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {URGENCY_GROUPS.map((g) => {
          const items = grouped[g.key];
          if (!items || items.length === 0) return null;
          return (
            <section key={g.key} data-testid={`urgency-group-${g.key}`}>
              <h2 className="text-lg font-semibold flex items-baseline gap-2">
                <span>{g.title}</span>
                <span className="text-xs font-normal text-gray-500">
                  {items.length} car{items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mb-3">{g.blurb}</p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="pb-2 pr-4">VIN</th>
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">What we recommend</th>
                      <th className="pb-2 pr-4">Estimated value</th>
                      <th className="pb-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr
                        key={l.id}
                        className="border-t border-gray-100"
                        data-testid={`lead-row-${l.id}`}
                      >
                        <td className="py-3 pr-4 font-mono text-xs">
                          {l.vin}
                        </td>
                        <td className="py-3 pr-4 text-gray-700">
                          {l.customer_id.slice(0, 8)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">
                            {LEAD_TYPE_LABEL[l.lead_type] ?? l.lead_type}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {l.suggested_action}
                          </div>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {formatRevenue(l.estimated_revenue_cents)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              disabled={working === l.id}
                              data-testid={`lead-complete-${l.id}`}
                              onClick={() =>
                                handleAction(l.id, "complete", {
                                  outcome: "service_scheduled",
                                })
                              }
                              className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                            >
                              Mark complete
                            </button>
                            <button
                              type="button"
                              disabled={working === l.id}
                              data-testid={`lead-dismiss-${l.id}`}
                              onClick={() =>
                                handleAction(l.id, "dismiss", {
                                  reason: "not_relevant",
                                })
                              }
                              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
