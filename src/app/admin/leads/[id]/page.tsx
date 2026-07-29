"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import LeadEnrichmentPanel from "@/components/LeadEnrichmentPanel";

/**
 * Lead detail page — extends the list view with the modern intake
 * enrichment + score breakdown + "why this rep" panels.
 *
 * Mobile-first: stacks on narrow screens, side-by-side on desktop.
 */

interface LeadSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  status: string;
  temperature: string;
  assigned_to: string | null;
}

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      try {
        const res = await fetch(`/api/admin/leads/${id}`);
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setLead(json.lead ?? json);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div data-testid="lead-detail-page" className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/leads" className="text-sm text-brand-700 hover:underline">
            Back to leads
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {loading ? "Loading..." : lead ? `${lead.first_name} ${lead.last_name}` : "Lead"}
          </h1>
          {lead && (
            <p className="text-sm text-gray-500">
              {lead.email}
              {lead.phone ? ` . ${lead.phone}` : ""}
            </p>
          )}
        </div>
        {lead && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand-800 ring-1 ring-brand-700/20">
              {lead.status}
            </span>
            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 font-medium text-orange-700 ring-1 ring-orange-600/20">
              {lead.temperature}
            </span>
            {lead.assigned_to && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
                Assigned: {lead.assigned_to}
              </span>
            )}
          </div>
        )}
      </header>

      {lead && (
        <section className="rounded-lg border border-surface-border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Vehicle of interest</h2>
          <p className="mt-1 text-sm text-gray-700">{lead.vehicle_interest}</p>
        </section>
      )}

      <LeadEnrichmentPanel leadId={id} />
    </div>
  );
}
