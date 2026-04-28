"use client";

import { useState, type FormEvent, type ReactNode } from "react";

interface SettingsFormProps {
  children: ReactNode;
  buttonLabel: string;
  /** Map form field names to the API field names for PUT /api/admin/settings */
  fieldMap?: Record<string, string>;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * Group flat `hours_<day>_open|close|closed` form fields into the
 * structured `business_hours` array the API expects. Without this the
 * checkbox/time fields are sent as scalar keys like `hours_sunday_closed`
 * which the route handler doesn't recognise → checkboxes never persist.
 *
 * Critical detail: HTML form checkboxes are ONLY submitted when CHECKED.
 * Unchecked days are absent from the FormData entirely, so we have to
 * derive a `closed: false` for any day where the open/close inputs ARE
 * present but the closed checkbox is missing.
 */
function buildBusinessHours(formData: FormData): Array<{
  day: string;
  open: string;
  close: string;
  closed: boolean;
}> | null {
  const entries: Array<{ day: string; open: string; close: string; closed: boolean }> = [];
  for (const day of DAYS) {
    const open = formData.get(`hours_${day}_open`);
    const close = formData.get(`hours_${day}_close`);
    if (typeof open !== "string" && typeof close !== "string") continue;
    entries.push({
      day,
      open: typeof open === "string" ? open : "09:00",
      close: typeof close === "string" ? close : "18:00",
      closed: formData.getAll(`hours_${day}_closed`).length > 0,
    });
  }
  return entries.length > 0 ? entries : null;
}

/**
 * Client wrapper for settings forms. Intercepts submit, collects form data,
 * and PUTs to /api/admin/settings. Prevents 404s from old static form actions.
 */
export default function SettingsForm({ children, buttonLabel, fieldMap }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};

    // Collect unique field names, then resolve values.
    const fieldNames = new Set<string>();
    formData.forEach((_, key) => fieldNames.add(key));

    for (const key of fieldNames) {
      // Skip flat hours_* fields — handled separately below.
      if (/^hours_/.test(key)) continue;
      const apiKey = fieldMap?.[key] ?? key;
      const values = formData.getAll(key);
      /* The settings page renders BOTH a mobile (`sm:hidden`) and a
         desktop (`hidden sm:flex`) version of some fields with the
         SAME `name`. FormData collects both regardless of CSS
         visibility, so we'd end up posting `["foo","foo"]` instead
         of `"foo"`. Dedupe identical adjacent values; preserve the
         array shape only when values genuinely differ (e.g. multi-
         select). */
      const unique = Array.from(new Set(values.map(String)));
      payload[apiKey] = unique.length > 1 ? unique : unique[0];
    }

    // Pack hours_* into business_hours[]
    const businessHours = buildBusinessHours(formData);
    if (businessHours) payload.business_hours = businessHours;

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Save failed" }));
        setError(body.error ?? `Save failed (${res.status})`);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Network error — could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {children}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-600">Saved successfully.</p>}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : buttonLabel}
        </button>
      </div>
    </form>
  );
}
