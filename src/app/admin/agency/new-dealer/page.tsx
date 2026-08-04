"use client";

import { useCallback, useState } from "react";
import { redirectToLoginIfUnauthenticated } from "@/lib/auth-redirect";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DayHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

interface CreatedDealer {
  id: string;
  name: string;
  slug: string;
  public_url: string;
  admin_url: string;
  admin_credentials?: { email: string; temp_password: string };
  invite?: { email: string; accept_url: string; delivered: boolean; reason?: string };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

/** Same limits the server enforces in create-dealer.ts and the logo endpoint. */
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const LABEL_CLASS = "block text-sm font-medium text-gray-700";

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function NewDealerPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0070c7");
  const [secondaryColor, setSecondaryColor] = useState("#f97316");

  const [hours, setHours] = useState<DayHours[]>(
    DAYS.map((day) => ({
      day,
      open: day === "sunday" ? "10:00" : "09:00",
      close: day === "sunday" ? "17:00" : "18:00",
      closed: false,
    })),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDealer | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  /**
   * Read the chosen file into a base64 data URL.
   *
   * That is exactly how /api/admin/settings/logo already stores a logo in
   * dealers.logo_url, so this reuses the existing convention instead of adding
   * a second one. It also has to be a data URL here: the file is chosen before
   * the dealer exists, so there is no row yet to attach an upload to.
   *
   * The server validates type and size again; these checks are so the person
   * gets told immediately rather than after a failed submit.
   */
  const handleLogoChange = useCallback((file: File | null) => {
    setLogoError(null);
    if (!file) {
      setLogoUrl(null);
      setLogoName(null);
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Only PNG, JPG, or SVG files are accepted.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("File must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result as string);
      setLogoName(file.name);
    };
    reader.onerror = () => setLogoError("Could not read that file. Try another.");
    reader.readAsDataURL(file);
  }, []);

  const handleNameChange = useCallback((val: string) => {
    setName(val);
    setSlug(slugify(val));
  }, []);

  const updateHour = useCallback(
    (index: number, field: keyof DayHours, value: string | boolean) => {
      setHours((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          phone,
          email,
          address: { street, city, state, zip },
          branding: { primary_color: primaryColor, secondary_color: secondaryColor },
          logo_url: logoUrl,
          sales_hours: hours.filter((h) => !h.closed).map((h) => ({
            day: h.day,
            open: h.open,
            close: h.close,
          })),
        }),
      });

      /* A 401 means the session is gone. Showing "Authentication required"
         above a filled-in form leaves somebody typing into a page that can
         never save, with no way out. Send them to sign in and bring them back. */
      if (redirectToLoginIfUnauthenticated(res)) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to create dealer (${res.status})`);
        return;
      }

      const data = await res.json();
      setCreated({
        id: data.id,
        name: data.name,
        slug: data.slug,
        public_url: data.public_url ?? `/dealers/${data.slug}`,
        admin_url: `/admin?dealer=${data.slug}`,
        admin_credentials: data.admin_credentials,
        invite: data.invite,
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Success state                                                          */
  /* ---------------------------------------------------------------------- */

  if (created) {
    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-8">
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h1 className="text-xl font-bold text-green-800">Dealer Created</h1>
          <p className="mt-2 text-sm text-green-700">
            <strong>{created.name}</strong> has been set up and is ready to go.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase text-green-600">Public URL</p>
              <a
                href={created.public_url}
                className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
              >
                {created.public_url}
              </a>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-green-600">Admin Link</p>
              <a
                href={created.admin_url}
                className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
              >
                {created.admin_url}
              </a>
            </div>

            {/* The invite, not a password to read out over the phone. The
                dealer's admin sets their own at /admin/accept-invite, the same
                way Instinct and the Porsche Experience OS onboard people. */}
            {created.invite && (
              created.invite.delivered ? (
                <div
                  data-testid="invite-sent"
                  className="mt-4 rounded-lg border border-green-300 bg-green-50 p-4"
                >
                  <p className="text-sm font-medium text-green-800">Invite sent</p>
                  <p className="mt-1 text-sm text-green-700">
                    We emailed <code className="rounded bg-green-100 px-1">{created.invite.email}</code>{" "}
                    a link to set their password. It expires in 7 days.
                  </p>
                </div>
              ) : (
                <div
                  data-testid="invite-not-sent"
                  className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4"
                >
                  {/* Say plainly that nothing was sent, rather than implying it
                      was. The link still works, so the dealer is not blocked. */}
                  <p className="text-sm font-medium text-yellow-800">
                    {created.invite.reason === "account_exists"
                      ? "That email already has an account"
                      : `Invite not emailed${created.invite.reason ? ` (${created.invite.reason})` : ""}`}
                  </p>
                  {created.invite.reason === "account_exists" ? (
                    <p className="mt-1 text-sm text-yellow-700">
                      The dealer was created. <code className="rounded bg-yellow-100 px-1">{created.invite.email}</code>{" "}
                      already belongs to someone, so their account was left exactly as it was and no
                      invite was sent. Add them from the Team page if they should have access here.
                    </p>
                  ) : (
                  <p className="mt-1 text-sm text-yellow-700">
                    Send this link to{" "}
                    <code className="rounded bg-yellow-100 px-1">{created.invite.email}</code> so they
                    can set a password:
                  </p>
                  )}
                  {created.invite.accept_url && (
                    <p className="mt-2 break-all text-sm">
                      <a
                        href={created.invite.accept_url}
                        className="font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        {created.invite.accept_url}
                      </a>
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/admin/agency"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              Back to Agency
            </a>
            <button
              onClick={() => {
                setCreated(null);
                setName("");
                setSlug("");
                setPhone("");
                setEmail("");
                setStreet("");
                setCity("");
                setState("");
                setZip("");
              }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Form                                                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <div className="mb-6">
        <a
          href="/admin/agency"
          className="text-sm text-brand-700 hover:text-brand-900"
        >
          &larr; Back to Agency
        </a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add New Dealer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill out the form below to onboard a new dealership.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Dealer Info */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Dealer Information</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="dealer-name" className={LABEL_CLASS}>
                Dealership Name *
              </label>
              <input
                id="dealer-name"
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Wolfpack Motors"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="dealer-slug" className={LABEL_CLASS}>
                URL Slug
              </label>
              <input
                id="dealer-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto-generated"
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-gray-400">
                Used in URLs: {slug ? `${slug}.wolfpackauto.com` : "..."}
              </p>
            </div>
            <div>
              <label htmlFor="dealer-phone" className={LABEL_CLASS}>
                Phone
              </label>
              <input
                id="dealer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="dealer-email" className={LABEL_CLASS}>
                Email *
              </label>
              <input
                id="dealer-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@dealership.com"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Address</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="dealer-street" className={LABEL_CLASS}>
                Street Address
              </label>
              <input
                id="dealer-street"
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="123 Main St"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="dealer-city" className={LABEL_CLASS}>
                City
              </label>
              <input
                id="dealer-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dealer-state" className={LABEL_CLASS}>
                  State
                </label>
                <input
                  id="dealer-state"
                  type="text"
                  maxLength={2}
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  placeholder="NC"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="dealer-zip" className={LABEL_CLASS}>
                  ZIP Code
                </label>
                <input
                  id="dealer-zip"
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="27601"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Branding */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Branding</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="primary-color" className={LABEL_CLASS}>
                Primary Color
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  maxLength={7}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                />
              </div>
            </div>
            <div>
              <label htmlFor="secondary-color" className={LABEL_CLASS}>
                Secondary Color
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="secondary-color"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  pattern="^#[0-9a-fA-F]{6}$"
                  maxLength={7}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="dealer-logo" className={LABEL_CLASS}>Logo</label>
              {/* This was a bare <div> with cursor-pointer and no input: it looked
                  clickable and did nothing at all. It is a real file control now,
                  and the label wraps it so the whole area is the click target. */}
              <label
                htmlFor="dealer-logo"
                className="mt-2 flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 transition-colors hover:border-brand-600 hover:text-brand-700 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100 text-xs text-gray-400">
                  {logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logoUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    "?"
                  )}
                </div>
                <div>
                  <span className="block font-medium text-gray-700">
                    {logoName ? `Selected: ${logoName}` : "Click to upload logo"}
                  </span>
                  <span className="text-xs text-gray-400">PNG, JPG, or SVG up to 2MB</span>
                </div>
                <input
                  id="dealer-logo"
                  data-testid="dealer-logo-input"
                  type="file"
                  accept={LOGO_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {logoError && (
                <p data-testid="dealer-logo-error" className="mt-2 text-sm text-red-600">
                  {logoError}
                </p>
              )}
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => handleLogoChange(null)}
                  className="mt-2 text-sm text-gray-500 underline hover:text-gray-700"
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Sales Hours */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Sales Hours</h2>
          <div className="space-y-3">
            {hours.map((h, i) => (
              <div key={h.day} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-24 text-sm font-medium capitalize text-gray-700">
                  {h.day}
                </span>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="time"
                    value={h.open}
                    disabled={h.closed}
                    onChange={(e) => updateHour(i, "open", e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <span className="text-sm text-gray-400">to</span>
                  <input
                    type="time"
                    value={h.close}
                    disabled={h.closed}
                    onChange={(e) => updateHour(i, "close", e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-gray-500">
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={(e) => updateHour(i, "closed", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-700"
                    />
                    Closed
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !name}
            className="rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create Dealer"}
          </button>
        </div>
      </form>
    </div>
  );
}
