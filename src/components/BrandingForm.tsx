"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Lato",
  "Poppins",
  "Source Sans Pro",
  "Nunito",
];

interface BrandingFormProps {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
}

export default function BrandingForm({
  primaryColor: initialPrimary,
  secondaryColor: initialSecondary,
  fontFamily: initialFont,
}: BrandingFormProps) {
  const router = useRouter();
  const [primaryColor, setPrimaryColor] = useState(initialPrimary);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondary);
  const [fontFamily, setFontFamily] = useState(initialFont);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          font_family: fontFamily,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Save failed" }));
        setError(body.error ?? `Save failed (${res.status})`);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      router.refresh();
    } catch {
      setError("Network error — could not save branding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label
            htmlFor="primary-color"
            className="block text-sm font-medium text-gray-700"
          >
            Primary Color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="primary-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-surface-border"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="flex-1 rounded-lg border border-surface-border px-4 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              aria-label="Primary color hex value"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="secondary-color"
            className="block text-sm font-medium text-gray-700"
          >
            Secondary Color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="secondary-color"
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-surface-border"
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="flex-1 rounded-lg border border-surface-border px-4 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              aria-label="Secondary color hex value"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="font-family"
            className="block text-sm font-medium text-gray-700"
          >
            Font Family
          </label>
          <select
            id="font-family"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-green-600">Branding saved successfully.</p>}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Branding"}
        </button>
      </div>
    </form>
  );
}
