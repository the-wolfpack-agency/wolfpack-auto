"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface DealerDetail {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  leads_count: number;
  inventory_count: number;
  last_activity_at: string | null;
}

interface AuditEntry {
  id: number;
  staff_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function OperatorDealerDetailPage() {
  return (
    <OperatorChrome>
      <DealerDetailView />
    </OperatorChrome>
  );
}

function DealerDetailView() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [dealer, setDealer] = useState<DealerDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/operator/dealers/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { dealer: DealerDetail; recent_audit: AuditEntry[] };
      setDealer(data.dealer);
      setAudit(data.recent_audit ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  async function toggleSuspend() {
    if (!dealer) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/dealers/${dealer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !dealer.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading dealer...</div>;
  if (error)
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (!dealer) return <div className="text-sm text-gray-500">Dealer not found.</div>;

  return (
    <div className="space-y-5" data-testid="operator-dealer-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/operator/dealers" className="text-xs text-brand-600 hover:underline">
            ← All dealers
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">{dealer.name}</h2>
          <p className="text-sm text-gray-500">{dealer.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              dealer.is_active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"
            }`}
            data-testid="dealer-status-badge"
          >
            {dealer.is_active ? "Active" : "Suspended"}
          </span>
          <button
            type="button"
            onClick={toggleSuspend}
            disabled={busy}
            data-testid="toggle-suspend"
            className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-surface-subtle disabled:opacity-60"
          >
            {dealer.is_active ? "Suspend" : "Resume"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Team size" value={dealer.user_count} />
        <Stat label="Leads" value={dealer.leads_count} />
        <Stat label="Inventory" value={dealer.inventory_count} />
        <Stat label="Last activity" value={dealer.last_activity_at ? new Date(dealer.last_activity_at).toLocaleDateString() : "—"} />
      </div>

      <div className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent actions on this dealer</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-500">No actions recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="dealer-audit-list">
            {audit.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-gray-700">{e.action}</span>
                <time className="shrink-0 text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
