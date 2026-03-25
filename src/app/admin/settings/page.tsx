export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import type { Dealer, DealerHours } from "@/types/dealer";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage dealership settings, branding, and SEO.",
};

const DEALER_ID = process.env.DEALER_ID ?? "default";

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

const DAYS: DealerHours["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

async function getDealer(): Promise<Dealer | null> {
  const result = await query(
    `SELECT * FROM dealers WHERE id = $1 LIMIT 1`,
    [DEALER_ID],
  );
  return (result.rows as any[])[0] ?? null;
}

export default async function SettingsPage() {
  const dealer = await getDealer();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your dealership information, branding, and SEO settings.
        </p>
      </div>

      <div className="space-y-8">
        {/* ---------------------------------------------------------------- */}
        {/* Dealer Information                                               */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="dealer-info-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="dealer-info-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Dealer Information
          </h2>

          <form action="/api/admin/settings/dealer" method="POST">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="dealer-name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Dealership Name
                </label>
                <input
                  id="dealer-name"
                  name="name"
                  type="text"
                  defaultValue={dealer?.name ?? ""}
                  required
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="dealer-phone"
                  className="block text-sm font-medium text-gray-700"
                >
                  Phone
                </label>
                <input
                  id="dealer-phone"
                  name="phone"
                  type="tel"
                  defaultValue={dealer?.phone ?? ""}
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="dealer-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  id="dealer-email"
                  name="email"
                  type="email"
                  defaultValue={dealer?.email ?? ""}
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="dealer-website"
                  className="block text-sm font-medium text-gray-700"
                >
                  Website URL
                </label>
                <input
                  id="dealer-website"
                  name="website_url"
                  type="url"
                  defaultValue={dealer?.website_url ?? ""}
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="dealer-street"
                  className="block text-sm font-medium text-gray-700"
                >
                  Street Address
                </label>
                <input
                  id="dealer-street"
                  name="street"
                  type="text"
                  defaultValue={dealer?.address?.street ?? ""}
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="dealer-city"
                  className="block text-sm font-medium text-gray-700"
                >
                  City
                </label>
                <input
                  id="dealer-city"
                  name="city"
                  type="text"
                  defaultValue={dealer?.address?.city ?? ""}
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="dealer-state"
                    className="block text-sm font-medium text-gray-700"
                  >
                    State
                  </label>
                  <input
                    id="dealer-state"
                    name="state"
                    type="text"
                    maxLength={2}
                    defaultValue={dealer?.address?.state ?? ""}
                    className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="dealer-zip"
                    className="block text-sm font-medium text-gray-700"
                  >
                    ZIP Code
                  </label>
                  <input
                    id="dealer-zip"
                    name="zip"
                    type="text"
                    defaultValue={dealer?.address?.zip ?? ""}
                    className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Business hours */}
            <fieldset className="mt-8">
              <legend className="text-sm font-semibold text-gray-900">
                Sales Hours
              </legend>
              <div className="mt-3 space-y-2">
                {DAYS.map((day) => {
                  const hours = dealer?.sales_hours?.find(
                    (h) => h.day === day,
                  );
                  return (
                    <div
                      key={day}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-24 capitalize text-gray-700">
                        {day}
                      </span>
                      <label
                        htmlFor={`hours-${day}-open`}
                        className="sr-only"
                      >
                        {day} opening time
                      </label>
                      <input
                        id={`hours-${day}-open`}
                        name={`hours_${day}_open`}
                        type="time"
                        defaultValue={hours?.open ?? "09:00"}
                        disabled={hours?.closed}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-subtle disabled:text-gray-400"
                      />
                      <span className="text-gray-400">to</span>
                      <label
                        htmlFor={`hours-${day}-close`}
                        className="sr-only"
                      >
                        {day} closing time
                      </label>
                      <input
                        id={`hours-${day}-close`}
                        name={`hours_${day}_close`}
                        type="time"
                        defaultValue={hours?.close ?? "18:00"}
                        disabled={hours?.closed}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-subtle disabled:text-gray-400"
                      />
                      <label className="flex items-center gap-1.5 text-sm text-gray-500">
                        <input
                          type="checkbox"
                          name={`hours_${day}_closed`}
                          defaultChecked={hours?.closed}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        Closed
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Save Dealer Info
              </button>
            </div>
          </form>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Branding                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="branding-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="branding-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Branding
          </h2>

          <form action="/api/admin/settings/branding" method="POST">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Logo upload placeholder */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Logo
                </label>
                <div className="mt-1 flex items-center gap-4">
                  {dealer?.branding?.logo_url ? (
                    <img
                      src={dealer.branding.logo_url}
                      alt="Current dealer logo"
                      className="h-12 w-auto rounded"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-surface-subtle text-sm text-gray-400">
                      Logo
                    </div>
                  )}
                  <div className="flex-1">
                    <label
                      htmlFor="logo-upload"
                      className="cursor-pointer rounded-lg border border-dashed border-surface-border px-4 py-3 text-center text-sm text-gray-500 transition-colors hover:border-brand-500 hover:text-brand-600"
                    >
                      <span className="block font-medium">
                        Click to upload logo
                      </span>
                      <span className="text-xs">
                        PNG, JPG, or SVG up to 2MB
                      </span>
                    </label>
                    <input
                      id="logo-upload"
                      name="logo"
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="sr-only"
                    />
                  </div>
                </div>
              </div>

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
                    name="primary_color"
                    type="color"
                    defaultValue={dealer?.branding?.primary_color ?? "#0070c7"}
                    className="h-10 w-10 cursor-pointer rounded border border-surface-border"
                  />
                  <input
                    name="primary_color_hex"
                    type="text"
                    defaultValue={dealer?.branding?.primary_color ?? "#0070c7"}
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
                    name="secondary_color"
                    type="color"
                    defaultValue={
                      dealer?.branding?.secondary_color ?? "#f97316"
                    }
                    className="h-10 w-10 cursor-pointer rounded border border-surface-border"
                  />
                  <input
                    name="secondary_color_hex"
                    type="text"
                    defaultValue={
                      dealer?.branding?.secondary_color ?? "#f97316"
                    }
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
                  name="font_family"
                  defaultValue={dealer?.branding?.font_family ?? "Inter"}
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

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Save Branding
              </button>
            </div>
          </form>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* SEO Settings                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="seo-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="seo-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            SEO Settings
          </h2>

          <form action="/api/admin/settings/seo" method="POST">
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="seo-title"
                  className="block text-sm font-medium text-gray-700"
                >
                  Default Title Template
                </label>
                <input
                  id="seo-title"
                  name="title_template"
                  type="text"
                  defaultValue={`%s | ${dealer?.name ?? "Wolfpack Auto"}`}
                  placeholder="%s | Dealer Name"
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use %s as a placeholder for the page title.
                </p>
              </div>

              <div>
                <label
                  htmlFor="seo-description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Default Meta Description
                </label>
                <textarea
                  id="seo-description"
                  name="meta_description"
                  rows={3}
                  maxLength={160}
                  defaultValue={
                    dealer
                      ? `Shop new and used vehicles at ${dealer.name}. Located in ${dealer.address?.city ?? ""}, ${dealer.address?.state ?? ""}.`
                      : ""
                  }
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Max 160 characters. This appears in search engine results.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Save SEO Settings
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
