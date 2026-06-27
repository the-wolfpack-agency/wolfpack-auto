export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import type { Dealer, DealerHours } from "@/types/dealer";
import LogoUploader from "@/components/LogoUploader";
import BrandingForm from "@/components/BrandingForm";
import SettingsForm from "@/components/SettingsForm";
import { getServerDealerId } from "@/lib/server-dealer";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage dealership settings, branding, and SEO.",
};

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
  try {
    const dealerId = await getServerDealerId();
    const result = await query(
      `SELECT * FROM dealers WHERE id = $1 LIMIT 1`,
      [dealerId],
    );
    return (result.rows as any[])[0] ?? null;
  } catch {
    // DB unavailable — render page with empty defaults
    return null;
  }
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
          className="overflow-hidden rounded-card border border-surface-border bg-white px-4 py-5 shadow-card sm:p-6"
        >
          <h2
            id="dealer-info-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Dealer Information
          </h2>

          <SettingsForm buttonLabel="Save Dealer Info" fieldMap={{ street: "address" }}>
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
              <div className="mt-3 divide-y divide-gray-100 sm:divide-y-0 sm:space-y-2">
                {DAYS.map((day) => {
                  const hours = dealer?.sales_hours?.find(
                    (h) => h.day === day,
                  );
                  return (
                    <div key={day} className="py-3 text-sm first:pt-0 sm:py-0">
                      {/* Mobile: stacked layout */}
                      <div className="sm:hidden">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium capitalize text-gray-700">{day}</span>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              name={`hours_${day}_closed`}
                              defaultChecked={hours?.closed}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            Closed
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <label htmlFor={`hours-${day}-open-m`} className="sr-only">{day} open</label>
                          <input
                            id={`hours-${day}-open-m`}
                            name={`hours_${day}_open`}
                            type="time"
                            defaultValue={hours?.open ?? "09:00"}
                            disabled={hours?.closed}
                            className="block w-full rounded-lg border border-surface-border py-2 text-center text-sm shadow-sm disabled:bg-surface-subtle disabled:text-gray-400"
                          />
                          <span className="shrink-0 text-gray-400">to</span>
                          <label htmlFor={`hours-${day}-close-m`} className="sr-only">{day} close</label>
                          <input
                            id={`hours-${day}-close-m`}
                            name={`hours_${day}_close`}
                            type="time"
                            defaultValue={hours?.close ?? "18:00"}
                            disabled={hours?.closed}
                            className="block w-full rounded-lg border border-surface-border py-2 text-center text-sm shadow-sm disabled:bg-surface-subtle disabled:text-gray-400"
                          />
                        </div>
                      </div>
                      {/* Desktop: single row */}
                      <div className="hidden items-center gap-3 sm:flex">
                        <span className="w-24 capitalize text-gray-700">{day}</span>
                        <label htmlFor={`hours-${day}-open`} className="sr-only">{day} open</label>
                        <input
                          id={`hours-${day}-open`}
                          name={`hours_${day}_open`}
                          type="time"
                          defaultValue={hours?.open ?? "09:00"}
                          disabled={hours?.closed}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm shadow-sm disabled:bg-surface-subtle disabled:text-gray-400"
                        />
                        <span className="text-gray-400">to</span>
                        <label htmlFor={`hours-${day}-close`} className="sr-only">{day} close</label>
                        <input
                          id={`hours-${day}-close`}
                          name={`hours_${day}_close`}
                          type="time"
                          defaultValue={hours?.close ?? "18:00"}
                          disabled={hours?.closed}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm shadow-sm disabled:bg-surface-subtle disabled:text-gray-400"
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
                    </div>
                  );
                })}
              </div>
            </fieldset>

          </SettingsForm>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Branding                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="branding-heading"
          className="overflow-hidden rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="branding-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Branding
          </h2>

          <div className="space-y-6">
            {/* Logo upload — client component with preview, drag-drop, and API upload */}
            <div className="grid gap-6 sm:grid-cols-2">
              <LogoUploader currentLogoUrl={dealer?.branding?.logo_url ?? (dealer as any)?.logo_url ?? null} />
            </div>

            {/* Colors & font — client component that PUTs to /api/admin/settings */}
            <BrandingForm
              primaryColor={dealer?.branding?.primary_color ?? "#0070c7"}
              secondaryColor={dealer?.branding?.secondary_color ?? "#f97316"}
              fontFamily={dealer?.branding?.font_family ?? "Inter"}
            />
          </div>
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

          <SettingsForm buttonLabel="Save SEO Settings">
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
                  /* Prefer the persisted value; only fall back to a
                     templated default when the dealer hasn't saved
                     one yet. Without this the form regenerated the
                     default from dealer.name on every render and the
                     operator's custom value appeared to "not persist". */
                  defaultValue={
                    (dealer as any)?.title_template ??
                    `%s | ${dealer?.name ?? "Admin Portal"}`
                  }
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
                    (dealer as any)?.meta_description ??
                    (dealer
                      ? `Shop new and used vehicles at ${dealer.name}. Located in ${dealer.address?.city ?? ""}, ${dealer.address?.state ?? ""}.`
                      : "")
                  }
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Max 160 characters. This appears in search engine results.
                </p>
              </div>
            </div>

          </SettingsForm>
        </section>
        {/* ---------------------------------------------------------------- */}
        {/* Integrations / Webhooks                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="integrations-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="integrations-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Integrations
          </h2>

          <SettingsForm buttonLabel="Save Webhook" fieldMap={{ events: "webhook_events" }}>
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="webhook-url"
                  className="block text-sm font-medium text-gray-700"
                >
                  Webhook URL
                </label>
                <input
                  id="webhook-url"
                  name="webhook_url"
                  type="url"
                  placeholder="https://your-crm.com/webhooks/wolfpack"
                  className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <p className="mt-1 text-xs text-gray-500">
                  We&apos;ll send real-time POST requests to this URL when events occur.
                </p>
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-gray-900">
                  Event Types
                </legend>
                <p className="mt-1 text-xs text-gray-500">
                  Select which events should trigger webhook deliveries.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "lead.created", label: "Lead Created" },
                    { value: "lead.updated", label: "Lead Updated" },
                    { value: "deal.funded", label: "Deal Funded" },
                    { value: "deal.status_changed", label: "Deal Status Changed" },
                    { value: "vehicle.added", label: "Vehicle Added" },
                    { value: "vehicle.sold", label: "Vehicle Sold" },
                    { value: "service.appointment_created", label: "Service Appointment Created" },
                    { value: "service.repair_completed", label: "Repair Order Completed" },
                    { value: "customer.created", label: "Customer Created" },
                    { value: "review.submitted", label: "Review Submitted" },
                  ].map((evt) => (
                    <label
                      key={evt.value}
                      className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm transition-colors hover:bg-surface-subtle"
                    >
                      <input
                        type="checkbox"
                        name="events"
                        value={evt.value}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-gray-700">{evt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Webhook status display */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Webhook Status</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      No webhook configured yet. Add a URL and save to activate.
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    Inactive
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <span>Last delivery: --</span>
                  <span className="text-gray-300">|</span>
                  <span>Last status: --</span>
                </div>
              </div>
            </div>

          </SettingsForm>
        </section>
      </div>
    </>
  );
}
