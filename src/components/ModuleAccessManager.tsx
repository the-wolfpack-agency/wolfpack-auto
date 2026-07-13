"use client";

/**
 * Module Access — the agency admin scales a dealer's dashboard up or down by
 * toggling which modules are enabled. Writes dealers.enabled_modules via
 * PUT /api/admin/modules (owner/admin only; the API re-enforces the role).
 *
 * "Limit this dealer to selected modules" OFF = all modules (enabled_modules NULL,
 * the default). ON = only the checked modules (+ always-on CORE) are visible to the
 * dealer's own users (manager / staff / sub_dealer). Agency roles always see all.
 */
import { useEffect, useMemo, useState } from "react";
import {
  MODULE_CATALOG,
  modulesBySection,
  CORE_MODULE_KEYS,
  canSeeAllModules,
} from "@/lib/admin-modules";

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  sales: "Sales",
  inventory: "Inventory",
  finance: "Finance",
  service: "Service",
  customers: "Customers",
  operations: "Operations",
  admin: "Admin",
};

export default function ModuleAccessManager() {
  const [role, setRole] = useState<string | null>(null);
  const [limited, setLimited] = useState(false); // true = enforce an allow-list
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const sections = useMemo(() => modulesBySection(), []);
  const canEdit = canSeeAllModules(role); // owner/admin (+ wolfpack_*); matches the API gate

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/modules");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { role: string; enabled: string[] | null };
        if (cancelled) return;
        setRole(json.role);
        if (Array.isArray(json.enabled)) {
          setLimited(true);
          setSelected(new Set(json.enabled));
        } else {
          setLimited(false);
          // Pre-select everything so turning the limit ON starts from "all", then deselect.
          setSelected(new Set(MODULE_CATALOG.map((m) => m.key)));
        }
      } catch {
        /* leave defaults */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(key: string) {
    if (CORE_MODULE_KEYS.has(key)) return; // core is always on
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body = limited
        ? { modules: Array.from(new Set([...selected, ...CORE_MODULE_KEYS])) }
        : { modules: null };
      const res = await fetch("/api/admin/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "err", text: err.error ?? `Save failed (${res.status})` });
        return;
      }
      setMessage({
        kind: "ok",
        text: limited
          ? `Saved. Dealer users now see ${selected.size + (selected.has("dashboard") ? 0 : 1)} modules.`
          : "Saved. All modules enabled for this dealer.",
      });
    } catch {
      setMessage({ kind: "err", text: "Save failed. Please retry." });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-gray-500" data-testid="modules-loading">Loading modules…</p>;
  }

  if (!canEdit) {
    return (
      <p className="text-sm text-gray-500" data-testid="modules-readonly">
        Only an agency administrator can change which modules are enabled for this dealer.
      </p>
    );
  }

  return (
    <div data-testid="module-access-manager">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={limited}
          onChange={(e) => setLimited(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          data-testid="modules-limit-toggle"
        />
        <span className="text-sm font-medium text-gray-900">
          Limit this dealer to selected modules
        </span>
      </label>
      <p className="mt-1 text-xs text-gray-500">
        Off = the dealer sees every module (default). On = the dealer&apos;s own users see only
        the modules you check below. You (agency) always see everything.
      </p>

      <fieldset
        disabled={!limited}
        className={`mt-5 grid gap-6 sm:grid-cols-2 ${limited ? "" : "opacity-50"}`}
        data-testid="modules-fieldset"
      >
        {Object.entries(sections).map(([sectionId, mods]) => (
          <div key={sectionId}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {SECTION_LABELS[sectionId] ?? sectionId}
            </h3>
            <ul className="space-y-1.5" role="list">
              {mods.map((m) => {
                const isCore = CORE_MODULE_KEYS.has(m.key);
                const checked = isCore || selected.has(m.key);
                return (
                  <li key={m.key}>
                    <label className="flex items-center gap-2.5 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isCore}
                        onChange={() => toggle(m.key)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-60"
                        data-testid={`module-toggle-${m.key}`}
                      />
                      <span>{m.label}</span>
                      {isCore && <span className="text-xs text-gray-400">(always on)</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </fieldset>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          data-testid="modules-save"
        >
          {saving ? "Saving…" : "Save module access"}
        </button>
        {message && (
          <span
            className={`text-sm ${message.kind === "ok" ? "text-green-600" : "text-red-600"}`}
            data-testid="modules-message"
            role="status"
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
