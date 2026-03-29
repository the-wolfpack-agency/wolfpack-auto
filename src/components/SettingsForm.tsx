"use client";

import { useState, type FormEvent, type ReactNode } from "react";

interface SettingsFormProps {
  children: ReactNode;
  buttonLabel: string;
  /** Map form field names to the API field names for PUT /api/admin/settings */
  fieldMap?: Record<string, string>;
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

    formData.forEach((value, key) => {
      // Skip checkbox fields that are unchecked (they won't be in FormData)
      // Map field names if a mapping is provided
      const apiKey = fieldMap?.[key] ?? key;
      payload[apiKey] = value;
    });

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
