"use client";

import { useEffect, useState } from "react";

/**
 * LeadEnrichmentPanel
 *
 * Renders the enriched-data + score breakdown + "why this rep" decision
 * for a single lead. Fetches /api/admin/leads/:id/enrichment.
 *
 * Mobile-first: every panel stacks on narrow screens.
 */

interface EnrichmentResponse {
  lead_id: string;
  dealer_id: string;
  enrichment: {
    enriched_data: Record<string, unknown>;
    confidence: number;
    sources: string[];
    generated_at: string;
  } | null;
  routing: {
    candidate_users: string[];
    chosen_user_id: string | null;
    decision_factors: {
      reason?: string;
      score?: { score: number; tier: string; factors: Array<{ name: string; weight: number; score: number; notes?: string }> };
      factors?: Array<{ user_id: string; total: number; specialization_match: number; load_penalty: number; performance_bonus: number }>;
    };
    created_at: string;
  } | null;
}

export default function LeadEnrichmentPanel({ leadId }: { leadId: string }) {
  const [data, setData] = useState<EnrichmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/leads/${leadId}/enrichment`);
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const json = (await res.json()) as EnrichmentResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div
        data-testid="lead-enrichment-panel-loading"
        className="rounded-lg border border-surface-border bg-white p-4 text-sm text-gray-500 shadow-sm"
      >
        Loading enrichment...
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="lead-enrichment-panel-error"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Unable to load enrichment: {error}
      </div>
    );
  }

  if (!data) return null;

  const enriched = data.enrichment;
  const routing = data.routing;
  const score = routing?.decision_factors?.score;

  return (
    <div
      data-testid="lead-enrichment-panel"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {/* Enriched data panel */}
      <section
        data-testid="enriched-data"
        className="rounded-lg border border-surface-border bg-white p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-gray-900">Enriched data</h3>
        {!enriched ? (
          <p className="mt-2 text-xs text-gray-500">No enrichment yet. Will populate shortly.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-500">
              Confidence: {(enriched.confidence * 100).toFixed(0)}% from {enriched.sources.join(", ") || "none"}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              {Object.entries(enriched.enriched_data ?? {}).map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 border-b border-surface-border pb-1">
                  <dt className="text-gray-500">{k.replace(/_/g, " ")}</dt>
                  <dd className="font-medium text-gray-900">{formatVal(v)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      {/* Score breakdown */}
      <section
        data-testid="score-breakdown"
        className="rounded-lg border border-surface-border bg-white p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-gray-900">Score breakdown</h3>
        {!score ? (
          <p className="mt-2 text-xs text-gray-500">No score available yet.</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {score.score}
              <span className="ml-2 text-xs uppercase tracking-wider text-gray-500">{score.tier}</span>
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {(score.factors ?? []).map((f) => (
                <li key={f.name} className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">{f.name.replace(/_/g, " ")}</span>
                    <span className="text-xs text-gray-500">
                      {Math.round(f.score * 100)}% (w {f.weight})
                    </span>
                  </div>
                  {f.notes && <p className="text-xs text-gray-500">{f.notes}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Why this rep */}
      <section
        data-testid="why-this-rep"
        className="rounded-lg border border-surface-border bg-white p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-gray-900">Why this rep</h3>
        {!routing ? (
          <p className="mt-2 text-xs text-gray-500">No routing decision yet.</p>
        ) : (
          <>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {routing.chosen_user_id ?? "Unassigned"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {routing.decision_factors?.reason ?? "No reason recorded"}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Candidates considered: {routing.candidate_users.length}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "--";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.length === 0 ? "--" : v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
