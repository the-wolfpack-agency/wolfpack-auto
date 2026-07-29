"use client";

/**
 * LenderContactsPanel -- manage the dealer's prequal lender contact list.
 *
 * Stream B (migration 070). Backs `/admin/settings/lenders`.
 *
 *   - Lists active + inactive routes
 *   - Add a new contact (POST /api/admin/dealer/lenders)
 *   - Edit a contact (PATCH /api/admin/dealer/lenders/[id])
 *   - Remove a contact (DELETE /api/admin/dealer/lenders/[id])
 *
 * All fetches go through the dealer-scoped admin API; route handlers handle
 * tenant isolation. This panel never accepts a dealer_id from user input.
 */

import { useCallback, useEffect, useState } from "react";

type LenderType = "prime" | "sub_prime" | "captive" | "credit_union" | "other";

interface LenderRoute {
  id: string;
  dealerId: string;
  lenderName: string;
  contactEmail: string;
  contactName: string | null;
  sortOrder: number;
  active: boolean;
  lenderType: LenderType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const LENDER_TYPE_LABELS: Record<LenderType, string> = {
  prime: "Prime",
  sub_prime: "Sub-prime",
  captive: "Captive",
  credit_union: "Credit Union",
  other: "Other",
};

export default function LenderContactsPanel() {
  const [routes, setRoutes] = useState<LenderRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [lenderType, setLenderType] = useState<LenderType>("other");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/dealer/lenders", { credentials: "include" });
      if (r.status === 401) {
        if (typeof window !== "undefined")
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!r.ok) {
        setErr(`Failed to load (HTTP ${r.status})`);
        return;
      }
      const data = (await r.json()) as { routes?: LenderRoute[] };
      setRoutes(data.routes ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setErr("Lender name + contact email required");
      return;
    }
    setAdding(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/dealer/lenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lender_name: name.trim(),
          contact_email: email.trim(),
          contact_name: contactName.trim() || null,
          lender_type: lenderType,
          notes: notes.trim() || null,
        }),
      });
      if (r.status === 401) {
        if (typeof window !== "undefined")
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Failed to add (HTTP ${r.status})`);
        return;
      }
      setName("");
      setEmail("");
      setContactName("");
      setLenderType("other");
      setNotes("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (route: LenderRoute) => {
    try {
      const r = await fetch(`/api/admin/dealer/lenders/${route.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !route.active }),
      });
      if (r.ok) await load();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (route: LenderRoute) => {
    if (typeof window !== "undefined" && !window.confirm(`Remove ${route.lenderName}?`))
      return;
    try {
      const r = await fetch(`/api/admin/dealer/lenders/${route.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div data-testid="lender-contacts-panel" className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold mb-1">Lender contacts</h2>
        <p className="text-sm text-gray-600 mb-4">
          When a customer pre-qualifies, their lender packet goes to every active
          contact below. Add at least one before routing prequals.
        </p>

        <form
          onSubmit={handleAdd}
          data-testid="lender-contact-form"
          className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border rounded bg-white"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lender name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ACME Credit Union"
              className="border rounded px-2 py-1.5"
              data-testid="lender-name-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Contact email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dealer-desk@acmecu.example"
              className="border rounded px-2 py-1.5"
              data-testid="lender-email-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Contact name (optional)</span>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jane Smith"
              className="border rounded px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lender type</span>
            <select
              value={lenderType}
              onChange={(e) => setLenderType(e.target.value as LenderType)}
              className="border rounded px-2 py-1.5"
            >
              {(Object.keys(LENDER_TYPE_LABELS) as LenderType[]).map((t) => (
                <option key={t} value={t}>
                  {LENDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm font-medium">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Buy rates, special programs, anything the desk should know."
              rows={2}
              className="border rounded px-2 py-1.5"
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={adding}
              data-testid="lender-add-submit"
              className="px-4 py-2 bg-brand-700 text-white rounded disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add lender contact"}
            </button>
          </div>
        </form>
      </section>

      {err && (
        <div
          role="alert"
          data-testid="lender-panel-error"
          className="text-sm p-3 border border-red-300 bg-red-50 text-red-900 rounded"
        >
          {err}
        </div>
      )}

      <section data-testid="lender-contacts-list">
        <h3 className="text-lg font-semibold mb-2">Current contacts</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : routes.length === 0 ? (
          <p
            data-testid="lender-contacts-empty"
            className="text-sm text-gray-600 border rounded p-4 bg-white"
          >
            No lender contacts yet. Add one above so prequals can route to a real lender.
          </p>
        ) : (
          <ul className="space-y-2">
            {routes.map((r) => (
              <li
                key={r.id}
                data-testid={`lender-contact-row-${r.id}`}
                className="flex items-center justify-between border rounded p-3 bg-white"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {r.lenderName}{" "}
                    <span className="text-xs text-gray-500">
                      ({LENDER_TYPE_LABELS[r.lenderType]})
                    </span>{" "}
                    {!r.active && (
                      <span className="text-xs text-yellow-700 bg-yellow-100 rounded px-2 py-0.5 ml-1">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600">
                    {r.contactEmail}
                    {r.contactName ? ` -- ${r.contactName}` : ""}
                  </div>
                  {r.notes && (
                    <div className="text-xs text-gray-500 mt-1">{r.notes}</div>
                  )}
                </div>
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(r)}
                    className="px-2 py-1 border rounded"
                    data-testid={`lender-toggle-${r.id}`}
                  >
                    {r.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    className="px-2 py-1 border rounded text-red-700"
                    data-testid={`lender-delete-${r.id}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
