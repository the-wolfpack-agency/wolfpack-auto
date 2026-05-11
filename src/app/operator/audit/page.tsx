"use client";

import { useEffect, useState } from "react";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface AuditRow {
  id: number;
  staff_name: string | null;
  staff_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export default function OperatorAuditPage() {
  return (
    <OperatorChrome>
      <AuditView />
    </OperatorChrome>
  );
}

function AuditView() {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/operator/audit")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { events: AuditRow[] }) => setEvents(data.events))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5" data-testid="operator-audit-page">
      <h2 className="text-2xl font-bold text-gray-900">Audit log</h2>
      <p className="text-sm text-gray-600">
        Every operator action is recorded here. Append-only — entries cannot be edited.
      </p>

      {loading && <div className="text-sm text-gray-500">Loading...</div>}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {e.staff_name ?? "—"}
                      {e.staff_email && <div className="text-xs text-gray-400">{e.staff_email}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{e.action}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.target_type ? `${e.target_type}:${e.target_id ?? "-"}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
